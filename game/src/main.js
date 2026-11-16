// NIGHTSHIFT — a round-based tactical FPS. ORBIT (you + 3 bots) attacks a
// container terminal at night; UMBRA (4–5 bots) defends two charge sites.
// First to 5 rounds wins. The charge is planted at A (Crane Bay) or B (Fuel
// Pier); if it detonates ORBIT takes the round, if it is defused UMBRA does.
// Everything is local: three.js for rendering, WebAudio for sound, no network.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { clamp, formatTimer, mulberry32 } from './util.js';
import {
  ROUND_WIN, ROUND_LOSS_BASE, ROUND_LOSS_STEP, ROUND_LOSS_MAX,
  KILL_REWARD, PLANT_REWARD, STREAK_BONUS, START_MONEY,
} from './economy.js';
import { BUY_TIME, ROUND_TIME, WIN_ROUNDS, MAX_ROUNDS, difficultyFor } from './rounds.js';

// The economy and round constants, grouped so the game logic below reads
// ECONOMY.START_MONEY, ECONOMY.ROUND_WIN, and so on.
const ECONOMY = {
  START_MONEY, ROUND_WIN, ROUND_LOSS_BASE, ROUND_LOSS_STEP, ROUND_LOSS_MAX,
  KILL_REWARD, PLANT_REWARD, STREAK_BONUS,
  BUY_TIME, ROUND_TIME, WIN_ROUNDS, MAX_ROUNDS,
};
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE, createWeapons } from './weapons.js';
import { createBomb, PLANT_TIME, DEFUSE_TIME, BOMB_TIMER } from './bomb.js';
import { createBotManager } from './bots.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const params = new URLSearchParams(location.search);
const shotMode = params.get('shot'); // start | play | buy | end | null
const seed = parseInt(params.get('seed') || '1337', 10);
const HEADLESS = shotMode !== null;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 80);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 120);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const player = createPlayer(world.colliders);
const weapons = createWeapons(camera);
const bomb = createBomb(scene);
const hud = createHud(document, {
  onStart: () => startMatch(),
  onRestart: () => startMatch(),
  onBuy: (id, kind) => buyItem(id, kind),
});

// --- Game state ------------------------------------------------------------
const S = {
  phase: 'title', // title | buy | play | roundEnd | matchEnd
  round: 1,
  orbitScore: 0,
  umbraScore: 0,
  money: ECONOMY.START_MONEY,
  health: 100,
  consecutiveLosses: 0,
  roundTime: ECONOMY.BUY_TIME,
  buyTimeLeft: ECONOMY.BUY_TIME,
  bombTimer: BOMB_TIMER,
  carryingBomb: false,
  plantProgress: 0,
  defuseProgress: 0,
  streak: 0,
  bestStreak: 0,
  kills: 0,
  deaths: 0,
  plants: 0,
  defuses: 0,
  damageDealt: 0,
  paused: false,
  spectating: null,
  roundEndAt: 0,
  grenades: [],
  tracers: [],
  muzzleAt: 0,
};
let now = 0;
let lastFrame = performance.now();
let frameCount = 0;

// --- Bot context -----------------------------------------------------------
const shootables = [];
const raycaster = new THREE.Raycaster();
const tmpVec = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function raycast(from, dir, maxDist) {
  raycaster.set(from, dir);
  raycaster.far = maxDist;
  const botHits = raycaster.intersectObjects(shootables, false);
  const wallHits = raycaster.intersectObjects(world.meshes, false);
  const botHit = botHits.length > 0 ? botHits[0] : null;
  const wallHit = wallHits.length > 0 ? wallHits[0] : null;
  if (botHit && (!wallHit || botHit.distance < wallHit.distance)) {
    return {
      botName: botHit.object.userData.botName,
      objectName: botHit.object.name,
      distance: botHit.distance,
      point: botHit.point,
    };
  }
  if (wallHit) {
    return { botName: null, objectName: null, distance: wallHit.distance, point: wallHit.point };
  }
  return null;
}

function hasLineOfSight(from, to) {
  tmpDir.copy(to).sub(from);
  const dist = tmpDir.length();
  tmpDir.normalize();
  raycaster.set(from, tmpDir);
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(world.meshes, false);
  return hits.length === 0;
}

// The player as seen by bots: a position, an alive flag, and a speed.
const playerProxy = {
  pos: player.state.position,
  isPlayer: true,
  alive: true,
  name: 'YOU',
};

const botCtx = {
  seed,
  get now() {
    return now;
  },
  get playerSpeed() {
    return player.groundSpeed();
  },
  registerShootable(mesh) {
    shootables.push(mesh);
  },
  unregisterShootable(mesh) {
    const i = shootables.indexOf(mesh);
    if (i >= 0) shootables.splice(i, 1);
  },
  hasLineOfSight,
  raycast,
  onStep(pos, speed) {
    audio.step(pos, player.state.yaw, player.state.position, speed, now);
  },
  onBotShot(bot, muzzle, dir, dist) {
    audio.shot(bot.weapon.kind, bot.pos, player.state.yaw, player.state.position, now);
    spawnTracer(muzzle, dir, dist);
    bots.hearNoise(bot.pos, bot.team);
  },
  onDamage(target, damage, headshot, shooter) {
    applyDamage(target, damage, headshot, shooter);
  },
  onPlant(bot) {
    // A bot planted the charge.
    bomb.plantAt(bot.site, bot.pos);
    audio.plantDone();
    hud.setObjective(`CHARGE PLANTED AT ${bot.site} — DEFEND IT`, true);
    // Defenders converge on the site (from two doors), attackers push up
    // to cover the plant, and the nearest defender is sent to defuse.
    bots.rotateToSite(bot.site);
    bots.coverSite(bot.site, bot);
    bots.sendDefuser(bomb.state.pos);
  },
  onPickup(bot) {
    // A bot picked up the dropped charge — unless someone else grabbed it
    // first, in which case it just rejoins the push.
    if (bomb.state.mode === 'dropped') {
      bomb.giveTo(bot);
      bots.giveBomb(bot);
      hud.setObjective(`CHARGE RECOVERED BY ${bot.name} — ESCORT TO A OR B`, false);
    } else {
      bot.state = 'advance';
      const site = world.sites[bot.site];
      bots.setPath(bot, site.x, site.z);
    }
  },
  onDefuse(bot) {
    bomb.state.mode = 'defused';
    endRound('UMBRA', `Charge defused by ${bot.name}`);
  },
};

const bots = createBotManager(scene, world, botCtx);

// --- Tracers ---------------------------------------------------------------
function spawnTracer(muzzle, dir, dist) {
  const end = tmpVec.copy(muzzle).addScaledVector(dir, Math.min(dist, 60)).clone();
  const geo = new THREE.BufferGeometry().setFromPoints([muzzle.clone(), end]);
  const mat = new THREE.LineBasicMaterial({
    color: new THREE.Color(PALETTE.accent),
    transparent: true,
    opacity: 0.7,
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  S.tracers.push({ line, life: 0.07 });
}

// --- Damage ----------------------------------------------------------------
function applyDamage(target, damage, headshot, shooter) {
  if (target.isPlayer) {
    if (!playerProxy.alive || S.phase !== 'play') return;
    const dealt = weapons.state.armor ? Math.round(damage * 0.5) : damage;
    S.health = Math.max(0, S.health - dealt);
    hud.setHealth(S.health, weapons.state.armor, S.money);
    hud.flashDamage();
    audio.hurt();
    if (S.health <= 0) {
      playerProxy.alive = false;
      S.deaths += 1;
      S.streak = 0;
      // The charge must not die with the player: drop it where they fell
      // so a teammate can pick it up and the round can still be won.
      if (S.carryingBomb) {
        S.carryingBomb = false;
        bomb.dropAt(player.state.position);
        hud.setObjective('CHARGE DROPPED — PICK IT UP (E)', true);
        bots.sendCarrier(bomb.state.pos);
      }
      const killer = shooter ? shooter.name : 'UMBRA';
      hud.killFeed(killer, 'YOU', headshot, false, true);
      audio.roundLose();
      enterSpectate();
      checkRoundEnd();
    }
    return;
  }
  // A bot.
  const bot = bots.bots.find((b) => b.name === target.name);
  if (!bot || !bot.alive) return;
  bot.health -= damage;
  bot.flashUntil = now + 0.12;
  const shooterIsPlayer = shooter && shooter.isPlayer;
  if (shooterIsPlayer) {
    S.damageDealt += damage;
    const killed = bot.health <= 0;
    hud.showHitmarker(killed);
    audio.hitmarker(killed);
  }
  if (bot.health <= 0) {
    killBot(bot, shooter, headshot);
  }
}

function killBot(bot, shooter, headshot) {
  bots.kill(bot);
  const shooterIsPlayer = shooter && shooter.isPlayer;
  const killerName = shooterIsPlayer ? 'YOU' : shooter ? shooter.name : 'ORBIT';
  hud.killFeed(killerName, bot.name, headshot, shooterIsPlayer, false);
  // Only the bot that actually holds the charge drops it. (On round 1 the
  // player carries it, so a flagged bot dying must not yank it away.)
  if (bot.carriesBomb && bomb.state.carrier === bot) {
    bots.dropBomb(bot);
    bomb.dropAt(bot.pos);
    hud.setObjective('CHARGE DROPPED — PICK IT UP (E)', true);
    bots.sendCarrier(bomb.state.pos);
  }
  if (shooterIsPlayer) {
    S.kills += 1;
    S.money += ECONOMY.KILL_REWARD;
    S.streak += 1;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    if (S.streak === 2) {
      hud.showStreak('DOUBLE KILL', ECONOMY.STREAK_BONUS);
      audio.streak(2);
      S.money += ECONOMY.STREAK_BONUS;
    } else if (S.streak === 3) {
      hud.showStreak('TRIPLE KILL', ECONOMY.STREAK_BONUS);
      audio.streak(3);
      S.money += ECONOMY.STREAK_BONUS;
    } else if (S.streak >= 4) {
      hud.showStreak('RAMPAGE', ECONOMY.STREAK_BONUS);
      audio.streak(4);
      S.money += ECONOMY.STREAK_BONUS;
    }
    hud.setMoney(S.money);
  }
  checkRoundEnd();
}

function checkRoundEnd() {
  if (S.phase !== 'play') return;
  const orbitAlive = bots.aliveCount('ORBIT') + (playerProxy.alive ? 1 : 0);
  const umbraAlive = bots.aliveCount('UMBRA');
  if (umbraAlive === 0) {
    endRound('ORBIT', 'UMBRA team eliminated');
  } else if (orbitAlive === 0 && bomb.state.mode !== 'planted') {
    endRound('UMBRA', 'ORBIT team eliminated');
  }
}

function enterSpectate() {
  // Follow the first alive ORBIT bot; if none, orbit the map centre.
  const alive = bots.bots.find((b) => b.team === 'ORBIT' && b.alive);
  S.spectating = alive || null;
  hud.setObjective('YOU ARE DOWN — SPECTATING', true);
}

// --- Shooting --------------------------------------------------------------
function playerShoot() {
  if (S.phase !== 'play' || !playerProxy.alive) return;
  if (!weapons.ready()) {
    if (weapons.state.mag === 0 && weapons.state.cooldown === 0) audio.dryFire();
    return;
  }
  const def = weapons.def();
  weapons.pullTrigger();
  weapons.takeRound();
  const spread = weapons.spread(player.groundSpeed(), inputState.aiming);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.x += (Math.random() - 0.5) * 2 * spread;
  dir.y += (Math.random() - 0.5) * 2 * spread;
  dir.z += (Math.random() - 0.5) * 2 * spread;
  dir.normalize();
  const muzzle = new THREE.Vector3();
  camera.getWorldPosition(muzzle);
  audio.shot(def.kind, player.state.position, player.state.yaw, player.state.position, now);
  const hit = raycast(muzzle, dir, 80);
  if (hit) {
    spawnTracer(muzzle, dir, hit.distance);
    if (hit.botName) {
      const bot = bots.bots.find((b) => b.name === hit.botName);
      if (bot) {
        const headshot = hit.objectName.startsWith('head:');
        const damage = headshot ? def.headDamage : def.damage;
        applyDamage(bot, damage, headshot, playerProxy);
      }
    }
  } else {
    spawnTracer(muzzle, dir, 80);
  }
  // Recoil: a small kick up and to a random side.
  player.recoil(def.id === 'sniper' ? 0.028 : 0.011, (Math.random() - 0.5) * 0.006);
  bots.hearNoise(player.state.position, 'ORBIT');
}

// --- Grenades --------------------------------------------------------------
function throwGrenade() {
  if (S.phase !== 'play' || !playerProxy.alive) return;
  if (weapons.state.grenades <= 0) {
    audio.denied();
    return;
  }
  weapons.state.grenades -= 1;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const pos = new THREE.Vector3();
  camera.getWorldPosition(pos);
  S.grenades.push({
    pos: pos.clone().addScaledVector(dir, 0.5),
    vel: dir.clone().multiplyScalar(16).add(new THREE.Vector3(0, 4, 0)),
    fuse: 1.6,
    bounced: false,
  });
  audio.grenadeThrow();
  hud.setAmmo(weapons.def().name, weapons.state.mag, weapons.state.reserve, weapons.state.grenades);
}

function updateGrenades(dt) {
  for (let i = S.grenades.length - 1; i >= 0; i -= 1) {
    const g = S.grenades[i];
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    g.pos.addScaledVector(g.vel, dt);
    // Ground bounce.
    if (g.pos.y < 0.3) {
      g.pos.y = 0.3;
      g.vel.y = Math.abs(g.vel.y) * 0.45;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
      if (!g.bounced) {
        g.bounced = true;
        audio.grenadeBounce();
      }
    }
    // Wall push-out (a grenade never passes through a box).
    for (const box of world.colliders) {
      if (box.max.y <= 0.05) continue;
      if (
        g.pos.x > box.min.x - 0.15 && g.pos.x < box.max.x + 0.15 &&
        g.pos.y > box.min.y && g.pos.y < box.max.y &&
        g.pos.z > box.min.z - 0.15 && g.pos.z < box.max.z + 0.15
      ) {
        const pushL = g.pos.x - (box.min.x - 0.15);
        const pushR = box.max.x + 0.15 - g.pos.x;
        const pushB = g.pos.z - (box.min.z - 0.15);
        const pushF = box.max.z + 0.15 - g.pos.z;
        const m = Math.min(pushL, pushR, pushB, pushF);
        if (m === pushL) { g.pos.x = box.min.x - 0.15; g.vel.x = -Math.abs(g.vel.x) * 0.5; }
        else if (m === pushR) { g.pos.x = box.max.x + 0.15; g.vel.x = Math.abs(g.vel.x) * 0.5; }
        else if (m === pushB) { g.pos.z = box.min.z - 0.15; g.vel.z = -Math.abs(g.vel.z) * 0.5; }
        else { g.pos.z = box.max.z + 0.15; g.vel.z = Math.abs(g.vel.z) * 0.5; }
      }
    }
    g.pos.x = clamp(g.pos.x, -21.8, 21.8);
    g.pos.z = clamp(g.pos.z, -17.8, 17.8);
    if (g.fuse <= 0) {
      explodeGrenade(g.pos);
      S.grenades.splice(i, 1);
    }
  }
}

function explodeGrenade(pos) {
  audio.explosion();
  const flash = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 14);
  flash.position.copy(pos);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 120);
  const victims = [...bots.bots, playerProxy];
  for (const victim of victims) {
    if (!victim.alive) continue;
    const d = Math.hypot(victim.pos.x - pos.x, victim.pos.z - pos.z);
    if (d > 6) continue;
    // Line of sight matters: a wall between the blast and the victim shields them.
    const from = new THREE.Vector3(pos.x, pos.y + 0.3, pos.z);
    const to = new THREE.Vector3(victim.pos.x, victim.pos.y + 1.2, victim.pos.z);
    if (!hasLineOfSight(from, to)) continue;
    const damage = Math.round(120 * (1 - d / 6));
    applyDamage(victim, damage, false, playerProxy);
  }
}

// --- Rounds ----------------------------------------------------------------
const ATTACKER_NAMES = ['NOVA', 'LYRA', 'ORION'];
const DEFENDER_NAMES = ['SHADE', 'GHOST', 'WRAITH', 'ECLIPSE', 'VOID'];
const ATTACKER_SITES = ['A', 'A', 'B'];

function startMatch() {
  S.round = 1;
  S.orbitScore = 0;
  S.umbraScore = 0;
  S.money = ECONOMY.START_MONEY;
  S.health = 100;
  S.consecutiveLosses = 0;
  S.streak = 0;
  S.bestStreak = 0;
  S.kills = 0;
  S.deaths = 0;
  S.plants = 0;
  S.defuses = 0;
  S.damageDealt = 0;
  S.spectating = null;
  playerProxy.alive = true;
  weapons.resetMatch();
  hud.hideOverlay();
  hud.hideBuy();
  startRound();
}

function startRound() {
  const diff = difficultyFor(S.round);
  const rng = mulberry32(seed + S.round * 7919);
  // Attackers: 3 bots, split across the two sites (2 A, 1 B).
  const attackers = ATTACKER_NAMES.map((name, i) => ({
    name,
    spawn: world.attackerSpawns[i + 1],
    site: ATTACKER_SITES[i],
  }));
  // Defenders: 4, a 5th joins from round 3.
  const defenderCount = diff.defenderCount;
  const defenders = DEFENDER_NAMES.slice(0, defenderCount).map((name, i) => ({
    name,
    spawn: world.defenderSpawns[i],
    site: world.defenderSpawns[i].site,
  }));
  const carrier = ATTACKER_NAMES[Math.floor(rng() * ATTACKER_NAMES.length)];
  // Round 1 the player carries the charge, so no bot is flagged as carrier
  // — otherwise the first bot death would drop a bomb the player still holds.
  bots.spawnRound(attackers, defenders, S.round === 1 ? null : carrier, diff);
  bomb.reset();
  // The player carries the charge on rounds where no bot does — simpler: the
  // player always starts with the charge on round 1, bots carry it after.
  S.carryingBomb = S.round === 1;
  if (S.carryingBomb) {
    bomb.giveTo('player');
  } else {
    const carrierBot = bots.bots.find((b) => b.name === carrier);
    if (carrierBot) bomb.giveTo(carrierBot);
  }
  player.state.position.set(0, 0, 14);
  player.state.velocity.set(0, 0, 0);
  player.state.yaw = 0;
  player.state.pitch = 0;
  playerProxy.alive = true;
  S.health = 100;
  S.spectating = null;
  weapons.refillRound();
  S.grenades.length = 0;
  S.tracers.forEach((t) => scene.remove(t.line));
  S.tracers.length = 0;
  S.phase = 'buy';
  S.buyTimeLeft = ECONOMY.BUY_TIME;
  S.roundTime = ECONOMY.BUY_TIME + ECONOMY.ROUND_TIME;
  S.plantProgress = 0;
  S.defuseProgress = 0;
  S.streak = 0;
  audio.roundStart();
  hud.setObjective(S.carryingBomb ? 'CARRY THE CHARGE TO A OR B — PLANT IT (E)' : 'ESCORT THE CARRIER — PLANT AT A OR B', false);
  hud.setTeams(bots.aliveCount('ORBIT') + 1, bots.aliveCount('UMBRA'), S.orbitScore, S.umbraScore);
  hud.setHealth(S.health, weapons.state.armor, S.money);
  hud.setAmmo(weapons.def().name, weapons.state.mag, weapons.state.reserve, weapons.state.grenades);
  hud.setTimer(formatTimer(S.buyTimeLeft), S.buyTimeLeft, 'buy');
  updateBuyMenu();
}

function endRound(winner, reason) {
  if (S.phase !== 'play' && S.phase !== 'buy') return;
  S.phase = 'roundEnd';
  S.roundEndAt = now;
  if (winner === 'ORBIT') {
    S.orbitScore += 1;
    S.money += ECONOMY.ROUND_WIN;
    S.consecutiveLosses = 0;
    audio.roundWin();
  } else {
    S.umbraScore += 1;
    S.consecutiveLosses += 1;
    const lossBonus = Math.min(
      ECONOMY.ROUND_LOSS_MAX,
      ECONOMY.ROUND_LOSS_BASE + ECONOMY.ROUND_LOSS_STEP * (S.consecutiveLosses - 1),
    );
    S.money += lossBonus;
    audio.roundLose();
  }
  hud.hideBuy();
  hud.setTeams(bots.aliveCount('ORBIT') + (playerProxy.alive ? 1 : 0), bots.aliveCount('UMBRA'), S.orbitScore, S.umbraScore);
  hud.setMoney(S.money);
  const scoreLine = `ORBIT ${S.orbitScore} — ${S.umbraScore} UMBRA`;
  if (S.orbitScore >= ECONOMY.WIN_ROUNDS || S.umbraScore >= ECONOMY.WIN_ROUNDS || S.round >= ECONOMY.MAX_ROUNDS) {
    endMatch(winner === 'ORBIT');
    return;
  }
  hud.showRoundEnd(`${winner} TAKES ROUND ${S.round}`, `${reason} · ${scoreLine}`);
  setTimeout(() => {
    if (S.phase === 'roundEnd') {
      S.round += 1;
      hud.hideOverlay();
      startRound();
    }
  }, 2600);
}

function endMatch(won) {
  S.phase = 'matchEnd';
  hud.showMatchEnd(won, S.orbitScore, S.umbraScore, {
    kills: S.kills,
    deaths: S.deaths,
    plants: S.plants,
    defuses: S.defuses,
    bestStreak: S.bestStreak,
    damage: S.damageDealt,
  });
}

// --- Buy -------------------------------------------------------------------
function updateBuyMenu() {
  if (S.phase !== 'buy') {
    hud.hideBuy();
    return;
  }
  const items = [
    { id: 'rifle', kind: 'weapon', name: 'AR-90', desc: 'Assault rifle · 30 rounds · auto', price: WEAPONS.rifle.price, owned: weapons.state.owned.rifle },
    { id: 'smg', kind: 'weapon', name: 'RAPTOR-9', desc: 'SMG · 30 rounds · fast, close range', price: WEAPONS.smg.price, owned: weapons.state.owned.smg },
    { id: 'sniper', kind: 'weapon', name: 'HAWKEYE', desc: 'Sniper · 5 rounds · right-click zoom', price: WEAPONS.sniper.price, owned: weapons.state.owned.sniper },
    { id: 'grenade', kind: 'grenade', name: 'HE GRENADE', desc: 'Explosive · 1.6s fuse · up to 2', price: GRENADE_PRICE, owned: false },
    { id: 'armor', kind: 'armor', name: 'KEVLAR VEST', desc: 'Halves incoming damage this round', price: ARMOR_PRICE, owned: weapons.state.armor },
  ];
  hud.showBuy(items, S.money);
}

function buyItem(id, kind) {
  if (S.phase !== 'buy') return;
  let cost = -1;
  if (kind === 'weapon') cost = weapons.buy(id, S.money);
  else if (kind === 'grenade') cost = weapons.buyGrenade(S.money);
  else if (kind === 'armor') cost = weapons.buyArmor(S.money);
  if (cost < 0) {
    audio.denied();
    return;
  }
  S.money -= cost;
  if (kind === 'weapon') weapons.switchTo(id);
  audio.buy();
  hud.setMoney(S.money);
  hud.setAmmo(weapons.def().name, weapons.state.mag, weapons.state.reserve, weapons.state.grenades);
  hud.setHealth(S.health, weapons.state.armor, S.money);
  updateBuyMenu();
}

// --- Input -----------------------------------------------------------------
const inputApi = createInput(canvas, (locked) => {
  hud.setCrosshair(locked && playerProxy.alive && S.phase === 'play');
  if (!locked && S.phase === 'play' && !HEADLESS && playerProxy.alive && !S.paused) {
    S.paused = true;
    hud.showPause();
  } else if (locked && S.paused) {
    S.paused = false;
    hud.hideOverlay();
  }
});
const inputState = inputApi.state;

canvas.addEventListener('click', () => {
  if (S.phase === 'title' || S.phase === 'matchEnd' || S.phase === 'roundEnd') return;
  if (!inputState.locked) {
    audio.unlock();
    inputApi.requestLock();
  }
});
window.addEventListener('keydown', (event) => {
  if (event.code === 'KeyM') {
    const muted = audio.toggleMute();
    hud.setObjective(muted ? 'SOUND MUTED (M to unmute)' : 'SOUND ON', false);
  }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Plant / defuse / pickup -----------------------------------------------
function nearestSite(pos) {
  let best = null;
  let bestD = Infinity;
  for (const [key, site] of Object.entries(world.sites)) {
    const d = Math.hypot(pos.x - site.x, pos.z - site.z);
    if (d < bestD) {
      bestD = d;
      best = { key, ...site, dist: d };
    }
  }
  return best;
}

function updateInteract(dt, keys) {
  const holdingE = keys.has('KeyE');
  // Pick up a dropped charge.
  if (bomb.state.mode === 'dropped' && playerProxy.alive) {
    const d = Math.hypot(
      player.state.position.x - bomb.state.pos.x,
      player.state.position.z - bomb.state.pos.z,
    );
    if (d < 1.6) {
      if (holdingE) {
        S.carryingBomb = true;
        bomb.giveTo('player');
        hud.setObjective('CHARGE SECURED — PLANT IT AT A OR B', false);
        audio.click();
      } else {
        hud.setProgress(0, 'Hold E to pick up the charge');
      }
      return;
    }
  }
  // Plant the charge.
  if (S.carryingBomb && bomb.state.mode === 'carried' && playerProxy.alive) {
    const site = nearestSite(player.state.position);
    if (site && site.dist < 4) {
      if (holdingE) {
        S.plantProgress += dt;
        hud.setProgress(S.plantProgress / PLANT_TIME, `PLANTING AT ${site.key}…`);
        if (S.plantProgress >= PLANT_TIME) {
          S.carryingBomb = false;
          S.plants += 1;
          S.money += ECONOMY.PLANT_REWARD;
          bomb.plantAt(site.key, player.state.position);
          audio.plantDone();
          hud.setObjective(`CHARGE PLANTED AT ${site.key} — DEFEND IT`, true);
          hud.setMoney(S.money);
          bots.rotateToSite(site.key);
          bots.coverSite(site.key, null);
          bots.sendDefuser(bomb.state.pos);
          S.plantProgress = 0;
          hud.setProgress(0, null);
        }
      } else {
        S.plantProgress = Math.max(0, S.plantProgress - dt * 2);
        hud.setProgress(0, `Hold E to plant at ${site.key}`);
      }
      return;
    }
    S.plantProgress = 0;
  }
  // Defuse a planted charge.
  if (bomb.state.mode === 'planted' && playerProxy.alive) {
    const d = Math.hypot(
      player.state.position.x - bomb.state.pos.x,
      player.state.position.z - bomb.state.pos.z,
    );
    if (d < 2) {
      if (holdingE) {
        S.defuseProgress += dt;
        hud.setProgress(S.defuseProgress / DEFUSE_TIME, 'DEFUSING…');
        if (S.defuseProgress >= DEFUSE_TIME) {
          S.defuses += 1;
          bomb.state.mode = 'defused';
          audio.plantDone();
          endRound('UMBRA', 'Charge defused by YOU');
          S.defuseProgress = 0;
          hud.setProgress(0, null);
        }
      } else {
        S.defuseProgress = Math.max(0, S.defuseProgress - dt * 2);
        hud.setProgress(0, 'Hold E to defuse');
      }
      return;
    }
    S.defuseProgress = 0;
  }
  hud.setProgress(0, null);
}

// --- HUD refresh -----------------------------------------------------------
function refreshHud() {
  hud.setHealth(S.health, weapons.state.armor, S.money);
  hud.setAmmo(weapons.def().name, weapons.state.mag, weapons.state.reserve, weapons.state.grenades);
  hud.setTeams(
    bots.aliveCount('ORBIT') + (playerProxy.alive ? 1 : 0),
    bots.aliveCount('UMBRA'),
    S.orbitScore,
    S.umbraScore,
  );
  if (S.phase === 'buy') {
    hud.setTimer(`BUY ${formatTimer(S.buyTimeLeft)}`, S.buyTimeLeft, 'buy');
  } else if (S.phase === 'play') {
    if (bomb.state.mode === 'planted') {
      hud.setTimer(`💥 ${formatTimer(bomb.state.timer)}`, bomb.state.timer, 'play');
    } else {
      hud.setTimer(formatTimer(S.roundTime), S.roundTime, 'play');
    }
  }
  // Compass to the nearest objective.
  if (S.phase === 'play' && playerProxy.alive) {
    if (bomb.state.mode === 'planted') {
      const site = world.sites[bomb.state.site];
      hud.setCompass(
        { name: `CHARGE ${bomb.state.site}`, x: site.x - player.state.position.x, z: site.z - player.state.position.z, dist: Math.hypot(site.x - player.state.position.x, site.z - player.state.position.z) },
        player.state.yaw,
      );
    } else if (S.carryingBomb || bomb.state.mode === 'dropped') {
      const site = nearestSite(player.state.position);
      if (site) {
        hud.setCompass(
          { name: `SITE ${site.key}`, x: site.x - player.state.position.x, z: site.z - player.state.position.z, dist: site.dist },
          player.state.yaw,
        );
      }
    } else {
      hud.setCompass(null, player.state.yaw);
    }
  } else {
    hud.setCompass(null, player.state.yaw);
  }
}

// --- Main loop -------------------------------------------------------------
function frame() {
  requestAnimationFrame(frame);
  frameCount += 1;
  const t = performance.now();
  const dt = Math.min(0.05, (t - lastFrame) / 1000);
  lastFrame = t;
  now += dt;

  // Look.
  if (inputState.locked && playerProxy.alive && (S.phase === 'play' || S.phase === 'buy')) {
    const look = inputApi.takeLook();
    player.look(look.x, look.y);
  }

  // Queued key actions.
  for (const action of inputApi.takePressed()) {
    if (action === 'reload' && S.phase === 'play' && playerProxy.alive) {
      if (weapons.reload()) audio.reload();
    } else if (action === 'grenade' && S.phase === 'play') {
      throwGrenade();
    } else if (action === 'buy') {
      if (S.phase === 'buy') {
        const open = document.querySelector('.buy-menu.open');
        if (open) hud.hideBuy();
        else updateBuyMenu();
      }
    } else if (action === 'cycle' && S.phase === 'play' && playerProxy.alive) {
      const ids = ['pistol', 'rifle', 'smg', 'sniper'];
      const owned = ids.filter((id) => weapons.state.owned[id]);
      const idx = owned.indexOf(weapons.state.current);
      const next = owned[(idx + 1) % owned.length];
      if (weapons.switchTo(next)) audio.click();
    } else if (action.startsWith('slot') && S.phase === 'play' && playerProxy.alive) {
      const ids = ['pistol', 'rifle', 'smg', 'sniper'];
      const id = ids[parseInt(action.slice(4), 10) - 1];
      if (id && weapons.switchTo(id)) audio.click();
    }
  }

  // Phases.
  if (S.phase === 'buy') {
    S.buyTimeLeft -= dt;
    if (S.buyTimeLeft <= 0) {
      S.phase = 'play';
      S.roundTime = ECONOMY.ROUND_TIME;
      hud.hideBuy();
      hud.setObjective(
        bomb.state.mode === 'planted'
          ? `CHARGE PLANTED AT ${bomb.state.site} — DEFEND IT`
          : S.carryingBomb
            ? 'CARRY THE CHARGE TO A OR B — PLANT IT (E)'
            : 'ESCORT THE CARRIER — PLANT AT A OR B',
        bomb.state.mode === 'planted',
      );
    }
  } else if (S.phase === 'play' && !S.paused) {
    if (bomb.state.mode === 'planted') {
      bomb.step(dt, now, (urgent) => audio.beep(urgent));
      if (bomb.state.timer <= 0) {
        bomb.state.mode = 'exploded';
        audio.explosion();
        endRound('ORBIT', `Charge detonated at ${bomb.state.site}`);
      }
    } else {
      S.roundTime -= dt;
      if (S.roundTime <= 0) {
        endRound('UMBRA', 'Time expired — charge never planted');
      }
    }
    if (playerProxy.alive) {
      player.step(dt, inputState.keys);
      updateInteract(dt, inputState.keys);
      if (inputState.firing) playerShoot();
      weapons.step(dt);
    }
    updateGrenades(dt);
    bots.update(dt, playerProxy);
    // A bot that is planting/defusing while the player watches needs the
    // charge state kept in sync; the bot module calls onPlant/onDefuse.
  } else if (S.phase === 'roundEnd') {
    updateGrenades(dt);
    bots.update(dt, playerProxy);
  }

  // Tracers fade.
  for (let i = S.tracers.length - 1; i >= 0; i -= 1) {
    const tr = S.tracers[i];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / 0.07) * 0.7;
    if (tr.life <= 0) {
      scene.remove(tr.line);
      S.tracers.splice(i, 1);
    }
  }

  // Camera.
  if (playerProxy.alive) {
    const zoom = inputState.aiming && weapons.def().zoom > 1 ? weapons.def().zoom : 1;
    camera.fov += ((75 / zoom) - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    camera.position.set(
      player.state.position.x,
      player.state.position.y + player.state.eye,
      player.state.position.z,
    );
    camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
  } else if (S.spectating) {
    const target = S.spectating;
    camera.position.set(
      target.pos.x - Math.sin(target.yaw) * 3,
      target.pos.y + 2.2,
      target.pos.z - Math.cos(target.yaw) * 3,
    );
    camera.lookAt(target.pos.x, target.pos.y + 1.2, target.pos.z);
  } else {
    // No one left to follow: a slow orbit over the terminal.
    const a = now * 0.12;
    camera.position.set(Math.sin(a) * 16, 12, Math.cos(a) * 16);
    camera.lookAt(0, 0, -4);
  }

  refreshHud();
  renderer.render(scene, camera);
}

// --- Screenshot modes ------------------------------------------------------
function setupShot(mode) {
  if (mode === 'start') {
    hud.showTitle();
    return;
  }
  if (mode === 'end') {
    S.phase = 'matchEnd';
    S.orbitScore = 5;
    S.umbraScore = 3;
    S.kills = 14;
    S.deaths = 6;
    S.plants = 2;
    S.defuses = 1;
    S.bestStreak = 3;
    S.damageDealt = 1840;
    hud.showMatchEnd(true, S.orbitScore, S.umbraScore, {
      kills: S.kills,
      deaths: S.deaths,
      plants: S.plants,
      defuses: S.defuses,
      bestStreak: S.bestStreak,
      damage: S.damageDealt,
    });
    return;
  }
  // play / buy: run a real round, then freeze the camera at a good vantage.
  startMatch();
  if (mode === 'buy') {
    // Stay in the buy phase with the menu open.
    player.state.position.set(0, 0, 14);
    player.state.yaw = 0;
    player.state.pitch = 0;
    updateBuyMenu();
    return;
  }
  // play: jump straight into the round, mid-fight.
  S.phase = 'play';
  S.roundTime = 62;
  hud.hideBuy();
  hud.setCrosshair(true); // headless has no pointer lock; show it for the shot
  player.state.position.set(2, 0, 6);
  player.state.yaw = 0.35;
  player.state.pitch = -0.02;
  // Put a defender in view down mid.
  const defender = bots.bots.find((b) => b.team === 'UMBRA');
  if (defender) {
    defender.pos.set(0, 0, -2);
    defender.yaw = Math.PI;
    defender.group.position.copy(defender.pos);
    defender.group.rotation.y = defender.yaw;
  }
  hud.setObjective('CARRY THE CHARGE TO A OR B — PLANT IT (E)', false);
}

// --- Boot ------------------------------------------------------------------
if (HEADLESS) {
  setupShot(shotMode);
} else {
  hud.showTitle();
}
hud.showLockHint(!HEADLESS);
frame();

// Debug / test hook for the kit's play-test.
window.__game = {
  get state() {
    return S;
  },
  get player() {
    return player.state;
  },
  get bots() {
    return bots.bots;
  },
  get frame() {
    return frameCount;
  },
  get weapons() {
    return weapons.state;
  },
  get bomb() {
    return bomb.state;
  },
  get weaponReady() {
    return weapons.ready();
  },
  reload() {
    return weapons.reload();
  },
  get camera() {
    return camera;
  },
  startMatch,
  startRound,
  endRound,
  playerShoot,
  throwGrenade,
};
