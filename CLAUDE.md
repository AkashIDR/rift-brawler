# Rift Brawler — Project-Specific Rules

Universal coding practices are in `Claude_Code/CLAUDE.md`. This file covers only
rules specific to this project's architecture.

---

## Config file ownership
- `src/config/gameConfig.js` — player stats, arena constants, obstacle config, scaling, themes
- `src/config/bossConfig.js` — per-boss base stats (HP, damage, speed, size, colors)
- Boss entity files (`Charger.js`, `Gunner.js`, `Stomper.js`) import `BOSS_CONFIGS` and
  pass the relevant entry to `super()` — they never define their own config objects

---

## Pause implementation
- Gameplay pause (ESC) uses `this.scene.pause()` / `this.scene.resume()` in ArenaScene —
  this freezes `scene.time.now` so timestamp-based cooldowns cannot expire during pause
- ESC key handler lives in UIScene (UIScene stays active while ArenaScene is paused)
- Cooldown display reads `arenaScene.time.now`, not UIScene's own clock
- Death sequences use a manual `this.paused` flag (not native pause) so tweens and
  camera fadeOut keep running

---

## Telegraph rules by attack type

### Melee / charge attacks
Use a **travel-path telegraph** — a rectangle (or arc/cone for non-linear attacks) that
exactly covers the hitbox the attack will sweep through. Width and length must match the
real damage check dimensions. See `BossBase._drawTelegraphRect`.

### Projectile attacks
Use a **spawn-point telegraph** — a visual that appears at the exact world position the
projectile will emerge from, not along its travel path. The player reads "a projectile
is coming from that spot" and repositions accordingly.

**Position & shape**
- Placed at `bossPos + direction * (size + 18)` — just beyond the boss outline at the
  barrel tip or equivalent
- The projectile must spawn from that same world position (pass `spawnX, spawnY` to
  `_spawnProjectile`)
- Oriented **perpendicular** to the fire direction (90° rotation) so it reads as a slit
  opening sideways — never a dot or circle
- **Width = projectile diameter** (not a fixed size). Height = `max(8, round(w × 0.22))`
  to keep an oval slit at all sizes. Never let height exceed ~25% of width (would look
  circular instead of a slit)

**Layers (rift-tear default style)**
```
Outer glow:  fillEllipse(0, 0, w+24, h+10)  — accent color, alpha 0.20
Mid glow:    fillEllipse(0, 0, w+10, h+5 )  — accent color, alpha 0.50
Inner core:  fillEllipse(0, 0, w,    h   )  — 0xffffff,     alpha 0.90
Edge stroke: strokeEllipse(0, 0, w,  h   )  — 0xffffff,     alpha 0.70
```

**Animation lifecycle**
- **Open**: scale 0 → 1 over 200ms, `Back.easeOut` (snap open with slight overshoot)
- **Wait**: alpha 0.75 ↔ 1.0, 160ms yoyo, repeats until fire
- **Close**: scale → 0 over 80ms, `Quad.easeIn` — fires projectile in `onComplete`
- Destroy the graphics object immediately after close; never leave orphaned rifts

**Tracking**
- Aimed / spread attacks: telegraph tracks the player in real time during the wind-up
  via `scene.events.on('update', track)`. Lock the final angle when the timer fires,
  remove the listener, then close the rift and spawn the projectile
- Omnidirectional attacks (e.g. fullRotation): no tracking — positions are fixed at cast time
- Persistent barrages: one rift stays open for the full attack; tween it to the new
  player direction (150ms, `Quad.easeOut`) before each shot, flash alpha on fire,
  close after the final shot

**Multi-projectile**
- Each simultaneous projectile gets its own rift at its own spawn position
- All rifts for a single attack open at the same time and close together before firing

**General**
- The specific visual (rift tear, glow ring, charge spark, etc.) may differ per boss or
  attack theme — the concept is fixed, the art is not. Default to the rift-tear style
  (`Gunner._spawnRiftTelegraph`) unless a different visual is requested
- Always register `scene.events.once('shutdown', () => { if (g.active) g.destroy(); })`
  on every rift graphic to prevent orphaned graphics on scene transition

**Never use a rectangle telegraph for a projectile attack** unless explicitly requested.

### Area-of-effect attacks
Use a **full-area telegraph** — the entire region that can deal damage must be visually
covered. No approximations or decorative hints.

Rules:
- Circle AoE → filled + stroked circle at the exact damage radius (see `BossBase._drawTelegraphZone`)
- Non-circular / amorphous AoE → cover every point that can take damage; use polygon
  fill, multiple overlapping circles, or a custom shape — whatever matches the hitbox
- The telegraph must animate low → high opacity over the duration to signal urgency
- If the AoE moves (e.g. a wave or expanding ring), the telegraph must track it in real time
- Partial coverage is never acceptable — if standing anywhere in the telegraph area
  means taking damage, the entire area must be lit

**Never telegraph only part of an AoE** (e.g. just the center or just an outline)
unless the attack genuinely only damages a sub-region.

---

## Rendering performance — Phaser 3 rules

### Static graphics must be baked into RenderTextures
A Phaser `Graphics` object replays every `fillPoints`, `lineBetween`, `strokeCircle`,
etc. call through WebGL on **every render frame**, even if nothing changed. This is
the single largest source of avoidable GPU overhead in this project.

**Rule: any visual content that does not change at runtime must be drawn once into a
`RenderTexture` at `create()` time, then the source `Graphics` objects destroyed.**

```js
// ✅ Correct — 1 GPU draw call per frame regardless of complexity
const rt = this.add.renderTexture(0, 0, worldW, worldH);
rt.setDepth(0).setOrigin(0, 0);
rt.draw(voidG);
rt.draw(floorG);
// ... stamp remaining static layers ...
voidG.destroy();
floorG.destroy();
// ... destroy all source Graphics ...

// ❌ Wrong — each Graphics re-submits ALL commands to WebGL every frame
const voidG = this.add.graphics().setDepth(0);
voidG.fillRect(0, 0, worldW, worldH);
// (left alive in the scene — replays every frame)
```

### Geometry masks are expensive
`createGeometryMask()` requires a WebGL stencil buffer pass every frame for each
masked object. Before baking masked Graphics into an RT, call `clearMask(destroyMask)`
first — the RT composites the final pixel output and needs no mask at runtime.

### Perpetual tweens cost per-frame JS evaluation
`repeat: -1` tweens run a JS callback every frame. Even lightweight alpha tweens
multiply quickly (98 foliage tweens = ~6000 evaluations/frame at 60 fps). Rules:
- Never attach `repeat: -1` tweens to decorative content that could be baked static
- Ground cover, floor decorations, wall art → bake into RT, no tweens
- Only moving or interactive objects justify live tweens

### Live Graphics count is a budget, not a free resource
Each `Graphics` object in the scene display list = at least 1 GPU draw call/frame.
The total draw call budget for background content (arena, floor, walls, vignette) is
**1** — one baked RenderTexture. Count live Graphics before adding new ones.

### Decision guide

| Content type | Approach |
|---|---|
| Static background art (floor, walls, void, vignette) | Bake into RT at create(), destroy source |
| Many identical decorative items (ground cover) | Bake all into one RT via `rt.draw(tmpG)` loop |
| Y-sorted props that interact with entity depth | Live `Graphics` with `setDepth(y - offset)` |
| Moving entities (player, boss, projectiles) | Live `Graphics` cleared+redrawn each frame |
| Animated effects (telegraphs, particles) | Live `Graphics`, destroyed when done |

---

## Arena system
- Arenas are single organic polygons generated by `ArenaGenerator` (metaball → marching
  squares → Chaikin smoothing). No primitive stacking, no connectors, no seams.
- `OrganicShape.containsPoint(x, y, r)` is the single boundary check for all entities,
  spawns, obstacles, and projectiles
- All spawn positions must be validated with `containsPoint` before placement
