# NIGHTSHIFT — best-game-01 entry

A round-based tactical FPS in a container terminal at night. ORBIT (you + 3
bots) attacks; UMBRA (4–5 bots) defends two charge sites. First to 5 rounds
wins (max 9). Plant the charge at A (Crane Bay) or B (Fuel Pier); if it
detonates ORBIT takes the round, if it is defused UMBRA does.

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
