# Rift Brawler — Coding Practices

These rules apply to all future feature work and bug fixes in this project.

---

## 1. No hardcoded values in entity or scene files
All numeric constants (HP, damage, speed, radius, cooldown durations, etc.) must live in
`src/config/gameConfig.js` or `src/config/bossConfig.js`. Entity files (bosses, player,
obstacles) import from config — they never define magic numbers inline.

**Why:** Charger/Gunner/Stomper each had their own hardcoded config objects with
pre-tuning values (200/180/260 HP) that were never updated after the balance pass.
`bossConfig.js` had the correct numbers but was never read, so all tuning was dead code.

---

## 2. Multi-frame attacks require an explicit hit count or a one-shot flag
Any attack whose damage check runs inside a tween `onUpdate`, a scene `events.on('update')`
callback, or any other per-frame loop **must** carry one of:
- A boolean flag that flips after the first hit (e.g. `dashHitLanded`)
- An explicit remaining-ticks counter that decrements and stops at zero

Never allow open-ended per-frame damage without a defined limit.

**Why:** The W (Shield Dash) skill called `_checkContactDamage()` every frame of its
267 ms tween — ~16 frames × 300 damage = ~4 800 effective damage per cast, reliably
one-shotting every boss.

---

## 3. Clean up event listeners when a scene or entity is destroyed
Any `scene.events.on('update', handler)` registration must be paired with a matching
`scene.events.off('update', handler)` (or `once`) when the entity/projectile is done.
Also register a one-time `scene.events.once('shutdown', destroy)` as a safety net.

**Why:** Leaked listeners accumulate across level transitions and cause ghost behavior —
destroyed projectiles that keep ticking, bosses that keep attacking after death, etc.

---

## 4. Separate concerns — stats in config, visuals in entity, logic in systems
- **`src/config/`** — all numbers, thresholds, and tuning values
- **`src/entities/`** — rendering, animation, and per-entity behavior only
- **`src/systems/`** / **`src/scenes/`** — orchestration, spawning, camera, UI

If a number appears inline in an entity file that isn't a locally-computed derived value,
it belongs in config instead.

---

## 5. Pause strategy must match cooldown implementation
Cooldowns are stored as future timestamps (`time.now + duration`). This only freezes
correctly during pause if the scene's native clock is also frozen.

- Use `this.scene.pause()` / `this.scene.resume()` for gameplay pause (ESC) — freezes
  `scene.time.now`, so timestamp cooldowns cannot expire during pause.
- Do **not** use the manual `this.paused` flag for ESC pause — it skips `update()` but
  leaves the clock running, letting cooldowns expire silently.
- The manual flag is still valid for death sequences where tweens and camera effects
  must keep running (native pause would freeze those too).
- UIScene (always active) owns the ESC key handler; ArenaScene exposes `_togglePause()`.
- Cooldown display in UIScene reads `arenaScene.time.now`, not `this.time.now`, so the
  overlay freezes correctly when ArenaScene is paused.
