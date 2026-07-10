# Rift Brawler — Project-Specific Rules

Universal coding practices are in `Claude_Code/CLAUDE.md`. This file covers only
rules specific to this project's architecture.

---

## 2.5D perspective governs every orbit/rotation

This game is viewed from a top-down angle with a squash factor (~0.4-0.55) applied to
circles that should read as "flat" in world-space — shadows, rings, orbit paths, all of it.
**Any element that moves in a circle/orbit around a fixed point must trace a horizontally
squashed ELLIPSE, never a true circle.**

The trap: using `scene.tweens.add({ targets: img, angle: 360, repeat: -1 })` to spin a baked
image LOOKS like it's orbiting, but it's a flat 2D rotation in the screen plane — any point
at distance `d` from the image's pivot traces a perfect circle as the image rotates,
regardless of where that point started. If the point was originally placed on a squashed
ellipse (to look "flat"), the rotation immediately breaks that illusion, since a rotating
image doesn't preserve an ellipse's squash — it sweeps the point through a true circle.

**Correct technique** (same one used for the celestial spire's orbiting stars, in
`Obstacle.js`): drive position directly with per-frame math, not image rotation —
```js
// x = full radius, y = squashed radius — this is what actually reads as "flat"
sprite.x = centerX + Math.cos(angle) * radiusX;
sprite.y = centerY + Math.sin(angle) * radiusX * squashFactor; // squashFactor ~0.4-0.55
```
Compute `angle` from a real elapsed-time accumulator via `scene.events.on('update', (time,
delta) => { elapsed += delta; ... })` — not a tween's `angle` property, and not a
`repeat: -1` tween on a proxy value either (both are the wrong tool for open-ended
orbital motion; see the celestial spire's implementation history for why).

Apply this any time a new orbiting/rotating visual is requested — do not wait to be told
"make it an oval, not a circle" a second time.

---

## Slow, small per-frame motion gets pixel-quantized — keep it above ~1px/frame

A sprite animated via per-frame position math (the technique above) can look like it
"moves, pauses for a split second, then jumps" instead of sliding smoothly — even at a
locked 60fps with no dropped frames. Root cause: if the computed per-frame displacement is
sub-pixel (e.g. an orbit radius of `~0.3r` completing one lap every 3000ms can work out to
well under 0.2px of movement per frame), the render pipeline's pixel-rounding doesn't
register any change for several consecutive frames, then snaps a whole pixel once the
accumulated sub-pixel offset crosses a boundary. This reads as stutter, not smoothness,
regardless of actual frame rate — confirmed by testing (see the Chaos spire's floating
debris orbit in `Obstacle.js`, which stuttered at `radius=0.30r/0.13r, 3000ms/lap` and was
buttery-smooth at `radius=1.2r/0.5r, 1200ms/lap`).

**Rule of thumb: size and time any per-frame-animated orbit/drift so it moves at least
~1px per frame at 60fps** (`circumference / lapDurationMs ≳ 0.06 px/ms`). If the desired
visual calls for a slow, small motion, prefer a LARGER radius at the SAME slow angular
speed over a small radius — angular speed alone doesn't determine smoothness, the actual
pixel displacement per frame does.

**This is a starting estimate, not a hard cutoff — verify by eye, not just by the math.**
The celestial spire's orbiting stars (small radius, ~7s/lap) sit noticeably below the ~1px
threshold on paper, yet read as smooth in practice; a much slower cycle (22-30s) at that
same radius was visibly stuttery, and a much faster one (~1.5s) felt like "zooming" instead
of floating. Use the formula to get in the right neighborhood quickly, then tune the actual
speed/size by watching it run — how close to the floor is "close enough" varies by how
small/bright/fast the element is, and pushing well past the floor for "safety" can just
make something that was supposed to be slow and graceful look frantic instead.

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

---

## Stylized obstacle art — canvas-bake recipe & pitfalls

All obstacle visuals are baked once into Phaser **canvas textures** (`scene.textures.createCanvas`
→ 2D context with real gradients → `add.image`), see `src/entities/obstacleArt.js`. Phaser
`Graphics` can't gradient-fill; canvas 2D can. Per-instance keys are tracked in `Obstacle._texKeys`
and freed on break/destroy/shutdown.

### Stylized foliage (tree canopy) — the recipe that worked
Build the crown FROM opaque shingled clump-domes — never paint soft texture onto a smooth mass.
Separate the three concerns:
- **Crown shape** = a vertical rib **width profile** `halfWidthAt(y)` per style (round / teardrop /
  broad). Teardrop = narrow rounded top, widest lower. Use a continuous arc — an ellipse that holds
  max width across a long mid-section looks boxy.
- **Edge silhouette** = a dedicated **edge ring**: clumps at EVEN arc-length spacing along the
  contour, near-uniform radius → a clean rhythmic cauliflower edge. (Letting interior grid clumps
  poke out = chaotic random edge.)
- **Interior texture** = jittered grid clumps kept WELL INSIDE (scale ~0.82) + ~15% larger
  "feature" clumps for size variation. Clumps are smoothed lumpy blobs (12-pt, ±10% radius wobble,
  quadratic-midpoint smoothing) — gentle, not amoeba.

Fill order (all clipped to the clump union):
1. **Solid backstop**: fill the crown PROFILE solid (vertical gradient) UNDER the clumps so gaps
   never show holes. Fill the profile and the clump-union as **separate `fill()` calls** — mixing
   the CCW profile + CW clump blobs in one path under nonzero winding CANCELS and punches holes.
2. **Per-clump domes**, drawn **back-to-front (top→bottom)**: each an opaque blob with a VERTICAL
   gradient (light top → tone → slightly dark bottom). Low blend factors = tight value range.
3. Global vertical tone ramp `canopyC(top) → canopyB → canopyA(bottom)` = darkest at the bottom.
4. **Rim shadow** = an **elliptical radial sized to the tree's actual W×H** (adapts per-tree),
   dark at the rim → clear center, centered slightly ABOVE the middle so the top rim is lighter and
   the bottom heavier. Keep it a THIN band (large inner radius ~`W*0.70`) + gentle alpha (~0.26).
   Its beyond-outer dark is clipped to the CLUMPS so it shades the real bumpy edge, not the profile.
5. Upper-left **light bloom** (`canopyD`) for the lit cheek; soft **bottom band** for trunk contact.
6. 2.5D read: the very top tilts away → it's not the brightest; the lit area sits just below the top.

### Dead-ends — do NOT repeat
- Per-lobe radial gradients → billiard balls / overlap rings.
- Soft highlight smears on a smooth dome → "plastic balloon" (and invisible if alpha too low).
- Grid of uniform circles each with a contact-shadow ring → bubble-wrap.
- Strong wobble + nestled satellite clumps → noisy amoeba mess.
- Inner-shadow via nested annulus **fills** (even-odd OR reversed-winding) → silently did NOT punch
  holes in the Phaser CanvasTexture context → filled discs → center-dark (reversed).
- Inner-shadow via **stroking** inset contours → visible concentric "boxes".
- Rim shadow keyed to the smooth profile (it sits inside the bumpy clump silhouette) → leaves
  bump-tips lit, reads as "inner shading." Use the clump-clipped radial instead.
- General: when a fill looks wrong/inverted, suspect winding/fill-rule before geometry; prefer
  radial gradients (unambiguous direction) over hand-rolled annuli in this canvas context.

### Other obstacle gradients (same file)
- **Rocks**: directional FACET gradient (not a smooth dome) — keeps the jagged read; hard-edged
  shade/highlight sub-polygons; cracks only for volcanic.
- **Pillars / stumps / tree trunks**: CYLINDER gradient across the width (dark rim → lit core →
  dark shadow edge) + a domed top cap (radial, top-lit). Stump/trunk bottom uses an elliptical arc,
  not a flat line, for cylinder perspective.
- Soft contact shadows = 3 layered ellipses (wide+faint → narrow+dark), baked into the texture.
