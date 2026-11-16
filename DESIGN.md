# NIGHTSHIFT — best-game-01 entry (v2)

A round-based tactical FPS in a container terminal at night. ORBIT (you + 3
bots) attacks; UMBRA (4–5 bots) defends two charge sites. First to 5 rounds
wins (max 9). Plant the charge at A (Crane Bay) or B (Fuel Pier); if it
detonates ORBIT takes the round, if it is defused UMBRA does.

## v2 changes (over the submitted v1)

v1's dev grade was 71.65% (6W/2D/4L). A full CDP playtest of v1 found the
objective loop could break: on round 1 the player AND a bot were both
flagged as carrying the charge, so the first bot death dropped a bomb the
player still "held" and the player could never plant. v2 fixes that and
the other gaps the playtest exposed:

- **Bomb ownership is single-source.** Round 1 the player carries and no
  bot is flagged; a bot only drops the charge if it is the bomb's actual
  carrier. If the player dies carrying, the charge drops where they fell
  instead of vanishing with them, and the round-end check runs on player
  death (v1 could sit out the clock with a dead team).
- **Bot bomb pickup.** When the charge is dropped, the nearest alive ORBIT
  bot fetches it and pushes to its site; if the player grabs it first, the
  bot rejoins the push instead of stealing it back.
- **Committed objective work.** A bot planting, defusing, or rotating to
  the charge no longer stops to fight when it spots an enemy — it finishes
  the job or dies trying — so a plant or defuse can never stall forever.
  The carrier likewise pushes to its site without stopping to fight (its
  teammates cover it); v1's carrier fought every defender it saw and
  never planted at all.
- **Team play on a plant.** Defenders converge on the planted site from
  two doors (every other bot flanks via the far door) while the other
  attackers push up to cover the plant; the nearest defender is sent to
  defuse, as before.
- **Retreat.** A hurt (≤35 HP), outnumbered bot falls back to regroup
  (defenders behind their site, attackers at spawn), then pushes again.
  Never while working the charge.
- **Bots can finally hurt the player.** v1's bot shooting only registered
  a hit when the ray struck a bot mesh — and the player has no mesh — so
  no bot could ever damage the player: the player was invincible and
  rounds stalled to the clock when the bomb broke. Bot shots at the player
  are now tested against head/body spheres (a wall or another bot closer
  than the player still blocks the shot).
- **Waypoint graph rebuilt — bots can actually walk the map.** v1's graph
  had 20 links whose straight lines crossed walls or containers, and the
  divider wall has no door on the Long A/B lanes: a bot carrier walking
  to its site wedged against the x=-12 corridor wall forever (verified
  live: stuck at (-11.4, 7.6) for 90+ s), so no bot ever planted
  unassisted. The graph now routes the lanes through the corridor-wall
  gaps, the side doors through perpendicular approach waypoints, and the
  sites through their open south side only; the containers that sat
  inside the side-door waypoints and on the Long lanes were moved clear,
  and two crates that sat on waypoints were moved. A stuck-recovery
  (skip to the next path node after 3 s without moving) guards the
  remaining corner grazes. Verified by audit-waypoints.mjs: every link
  is a clear straight line.
- **Carrier beacon fixed.** v1's `spawnRound` never set `carriesBomb` on
  defenders, so it stayed `undefined` and `marker.visible = alive &&
  undefined` left every defender's diamond showing (THREE.js only hides
  an object when `visible` is exactly `false`). `carriesBomb` is now
  initialised to `false` for every bot and the beacon assignment is an
  explicit boolean, so only the real carrier wears the diamond.
- **Feel.** A bot that takes damage flashes white; the carrier wears a
  spinning cyan diamond so the player can find and escort it; floating
  A/B letters mark the sites; buy phase is 12 s instead of 15 s.

## What it is

- **Complete game:** title screen with rules and controls, buy phase,
  round timer, team scores, HUD (health, money, ammo, compass to the
  objective, kill feed, hitmarker, damage flash), plant/defuse progress,
  round-end and match-end screens with stats and restart.
- **Depth:** an economy (round win/loss bonuses with a loss streak, kill and
  plant rewards), four weapons plus grenades and armour to buy, and a
  **growing challenge** — from round 3 a 5th defender joins, defender
  reaction time shrinks ~4% per round (floor 70%), skill rises ~0.02 per
  round (cap 0.95), and every 3rd round is a SURGE round (defenders 15%
  faster).
- **Feel:** kill-streak feedback (DOUBLE KILL / TRIPLE KILL / RAMPAGE with a
  $150 bonus per streak kill), tracers, muzzle flash, recoil, movement-based
  spread that shrinks when still or aiming, sniper zoom, synthesized WebAudio
  SFX (no files, no network), spectate on death.
- **Look:** night palette (navy/teal + amber floodlights + cyan site glow),
  moonlight with shadows, a crane over site A, fuel tanks at site B.
- **Structure:** one job per file — `palette`, `util`, `economy`, `rounds`,
  `bomb`, `input`, `player`, `weapons`, `world`, `bots`, `audio`, `hud`,
  `main`.

## Controls

W A S D move · mouse aim · click shoot · right mouse zoom (sniper) ·
R reload · E plant / defuse / pick up · G grenade · Q switch weapon ·
B buy · Space jump · Ctrl crouch · M mute.

## Files

- `game/index.html` — canvas + HUD (DOM) + import map for three.js.
- `game/src/*.js` — the game, ES modules, no build step.
- `game/vendor/three.module.min.js` — three.js 0.187.0 (MIT), vendored.
- `main.ts` — copies game/ + screenshots/ to /output and writes
  dossier.json with the vendored make.fun library.
- `vendor/makefun-game.ts` — the kit's library, unchanged.
- `screenshots/` — 1-start, 2-play, 3-buy, 4-end (real renders of this code).
- `serve.ts` — local dev server (`node serve.ts`, http://localhost:8080).
- `shots.json` — the four screenshot modes (`?shot=` + seed).

## Run

```
node serve.ts        # play at http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # build /output + dossier.json
```
