# Rift Brawler

A top-down arcade boss-battler roguelite built with **Phaser 3** and **Vite**.

Fight your way through procedurally generated arenas, defeat increasingly
difficult bosses, and survive as long as you can. Each boss has a unique
attack pattern and enters an enrage phase at low HP — no two runs play
the same.

---

## Gameplay

- **Right-click + hold** — move toward cursor (continuous)
- **Left-click** — basic ranged attack
- **Q** — Power Strike (heavy projectile)
- **W** — Shield Dash (dash + i-frames + contact damage)
- **E** — Ground Slam (AoE burst around player)
- **Space** — Dodge roll (i-frames + ghost trail)
- **ESC** — Pause
- Reach the **altar** at the center of each arena and interact with it to summon the boss
- Step through the **portal** after defeating the boss to advance to the next level

---

## Bosses

| Boss | Signature moves |
|---|---|
| **The Charger** | Dash charge, spin crash, enrage triple charge |
| **The Gunner** | Aimed shot, spread burst, enrage full rotation + barrage |
| **The Stomper** | Big stomp, quake line, enrage tremor field + leap slam |

All bosses scale in HP, damage, and speed with level. Defeated bosses are
tracked per run so the same boss won't repeat within the same level bracket.

---

## Arena shapes (unlocked by level)

`RECT` · `WIDE` · `TALL` · `OVAL` · `CIRCLE` · `BLOB` · `L_SHAPE` ·
`TWO_ROOMS` · `T_SHAPE` · `CROSS` · `FIGURE_8` · `STAR_BLOB`

Arenas range from 2 600 × 2 000 px up to 4 400 × 3 400 px with a
camera that follows the player and clamps to world bounds.

---

## Tech stack

| | |
|---|---|
| Engine | [Phaser 3](https://phaser.io/) |
| Bundler | [Vite](https://vitejs.dev/) |
| Language | JavaScript (ES modules) |
| Rendering | Phaser Graphics API (all procedural, no sprites yet) |

---

## Running locally

### Option A — double-click (recommended on Windows)

Double-click **`dev.bat`** in the project root. It opens a CMD window,
starts the Vite dev server, and prints the local URL.

### Option B — terminal

```bash
npm install      # first time only
npm run dev
```

> **PowerShell note:** Windows PowerShell blocks `.ps1` scripts by default,
> which prevents `npm` from running. Either use **CMD**, run `dev.bat`, or
> fix it once with:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```

Then open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Project structure

```
src/
├── arenas/
│   ├── ArenaGenerator.js   # Procedural arena layout & obstacle placement
│   └── ArenaShapes.js      # Shape classes (Rect, Ellipse, Blob, Composite)
├── config/
│   ├── bossConfig.js       # Boss roster & level-bracket mapping
│   └── gameConfig.js       # Global constants (player stats, scaling, themes)
├── entities/
│   ├── Player.js           # Player movement, skills, projectiles
│   ├── Altar.js            # Boss-summon interactable
│   ├── Portal.js           # Level-advance interactable
│   ├── Obstacle.js         # Rock / stump / tree / pillar rendering & occlusion
│   └── bosses/
│       ├── BossBase.js     # Shared AI, attack state machine, projectile system
│       ├── BossFactory.js  # Instantiates boss by key
│       ├── Charger.js
│       ├── Gunner.js
│       └── Stomper.js
├── scenes/
│   ├── BootScene.js
│   ├── StartScene.js
│   ├── ArenaScene.js       # Main game loop, world build, entity orchestration
│   ├── UIScene.js          # HUD overlay (HP, stamina, skills, score)
│   └── GameOverScene.js
└── systems/
    └── CameraController.js # Camera follow, bounds, multiplayer-ready hook
```

---

## Current state & roadmap

### Done
- [x] Core game loop (summon → fight → portal → next level)
- [x] Player movement with wall-slide, obstacle push-out, arena containment
- [x] Dodge and skill dash (no movement pause / rubber-band)
- [x] Three fully implemented bosses with enrage phases
- [x] Procedural large-world arena generation (12 shape types)
- [x] Obstacle system with Y-depth sorting and tree canopy occlusion
- [x] Camera follow with world-bound clamping
- [x] Level-bracketed theme palettes
- [x] Score tracking and game-over screen

### Pending — Boss behaviour & balance
- [ ] Damage, cooldown, and telegraph timing tuning past level 5–6
- [ ] Per-boss enrage attack selection weights
- [ ] Homing projectile feel (Charger spin-crash) at high levels
- [ ] Stomper leap-slam landing radius tightening
- [ ] Boss move-speed scaling curve past level 10

### Pending — Visual & art overhaul
- [ ] Sprite sheets for player, bosses, obstacles, altar, portal
- [ ] Full particle / VFX system for hits, deaths, skill impacts
- [ ] Real tilemap art to replace tile-grid floor overlays
- [ ] UI graphic design pass (HUD, start screen, game-over screen)
- [ ] Sound design and music

---

## License

Personal / educational project — no license applied yet.
