import Phaser from 'phaser';

/**
 * ParticleHelper — purpose-built particle effects.
 *
 * All graphics objects created here:
 *  - Register a shutdown listener so they self-destroy on scene transition
 *  - Are destroyed in their tween's onComplete — no persistent live graphics
 *  - Never use repeat: -1 tweens
 *
 * Exported functions:
 *   spawnBurst       — generic chunky shard burst (spawn, enrage, altar, skill flash)
 *   spawnSparks      — thin directional spark streaks (projectile impacts)
 *   spawnDust        — soft expanding circles (ground slam, obstacle hits)
 *   spawnBlood       — red teardrop drops with gravity drip (damage taken / boss hit)
 *   spawnImpactRing  — expanding halo ring (skill/special projectile impacts)
 */

// ─── Generic shard burst ──────────────────────────────────────────────────────
// Used for dramatic moments: boss spawn, enrage, altar summon, Q activation.
export function spawnBurst(scene, x, y, {
  color    = 0xffffff,
  count    = 10,
  minDist  = 30,
  maxDist  = 80,
  minSize  = 4,
  maxSize  = 10,
  duration = 400,
  alpha    = 1.0,
  depth    = 20,
} = {}) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;   // fully random — no gear pattern
    const dist  = minDist + Math.random() * (maxDist - minDist);
    const size  = minSize + Math.random() * (maxSize - minSize);

    const g = scene.add.graphics();
    g.fillStyle(color, alpha);
    g.fillRect(-size / 2, -size / 2, size, size);
    g.setPosition(x, y);
    g.setDepth(depth);

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      angle: Phaser.Math.Between(-220, 220),
      duration: duration * (0.6 + Math.random() * 0.4),
      ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}

// ─── Spark streaks ────────────────────────────────────────────────────────────
// Thin elongated rectangles rotated to face their travel direction.
// White-hot inner core. Random direction chaos — no even spacing.
// Brief bright center flash at impact point.
// Use for: projectile impacts on boss/obstacles.
export function spawnSparks(scene, x, y, color, count = 10) {
  // Center flash — hot white circle that expands and fades
  const flash = scene.add.graphics();
  flash.fillStyle(0xffffff, 0.9);
  flash.fillCircle(0, 0, 6 + Math.random() * 4);
  flash.fillStyle(color, 0.7);
  flash.fillCircle(0, 0, 4 + Math.random() * 3);
  flash.setPosition(x, y);
  flash.setDepth(23);
  scene.events.once('shutdown', () => { if (flash.active) flash.destroy(); });
  scene.tweens.add({
    targets: flash,
    scaleX: 2.5, scaleY: 2.5,
    alpha: 0,
    duration: 120,
    ease: 'Quad.easeOut',
    onComplete: () => { if (flash.active) flash.destroy(); },
  });

  // Spark streaks — each fully random direction
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;   // fully random
    const dist  = 20 + Math.random() * 70;       // 20–90px spread
    const len   = 6 + Math.random() * 12;        // 6–18px length
    const wid   = 1.5 + Math.random() * 1.5;     // 1.5–3px width

    const g = scene.add.graphics();
    g.fillStyle(color, 1);
    g.fillRect(-wid / 2, -len / 2, wid, len);
    g.fillStyle(0xffffff, 0.70);
    g.fillRect(-0.8, -len * 0.45, 1.6, len * 0.45);   // white-hot core
    g.setPosition(x, y);
    g.setRotation(angle);
    g.setDepth(22);

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scaleX: 0.2,    // taper to a point
      duration: 180 + Math.random() * 160,    // 180–340ms
      ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}

// ─── Dust puffs ───────────────────────────────────────────────────────────────
// Soft expanding circles in a stone/sand palette. Fully random scatter.
// Depth-8 — below entities so dust settles on the floor.
// Use for: ground slam landings, obstacle impacts.
export function spawnDust(scene, x, y, count = 10) {
  const PALETTE = [0xb8a880, 0xa09070, 0xc8b898, 0x907858];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;   // fully random
    const dist  = 10 + Math.random() * 50;       // 10–60px
    const size  = 4 + Math.random() * 8;         // 4–12px
    const col   = PALETTE[Math.floor(Math.random() * PALETTE.length)];

    const g = scene.add.graphics();
    g.fillStyle(col, 0.72);
    g.fillCircle(0, 0, size);
    g.setPosition(x, y);
    g.setDepth(8);

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scaleX: 1.8,
      scaleY: 1.8,
      duration: 280 + Math.random() * 160,    // 280–440ms
      ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}

// ─── Blood drops ──────────────────────────────────────────────────────────────
// Filled circles that splatter in chaotic random directions, dripping downward.
// Mix of bright red and dark red. Elongate slightly as they fall.
// Use for: player taking damage, boss taking damage.
export function spawnBlood(scene, x, y, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle   = Math.random() * Math.PI * 2;   // fully random
    const dist    = 15 + Math.random() * 65;        // 15–80px
    const size    = 2.5 + Math.random() * 5.5;      // 2.5–8px
    const col     = Math.random() < 0.5 ? 0xdd0011 : 0x8b0000;
    const gravity = 5 + Math.random() * 35;          // 5–40px downward drip

    const g = scene.add.graphics();
    g.fillStyle(col, 1);
    g.fillCircle(0, 0, size);
    g.setPosition(x, y);
    g.setDepth(22);

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist + gravity,
      alpha: 0,
      scaleX: 0.5,
      scaleY: 1.4,    // elongate into a teardrop
      duration: 300 + Math.random() * 220,    // 300–520ms
      ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}

// ─── Impact ring ─────────────────────────────────────────────────────────────
// Expanding halo ring — marks skill/special projectile impacts.
// Distinguishes power shots from basic attacks.
// Use for: player Q-skill hit on boss, boss large/special projectile hit on player.
export function spawnImpactRing(scene, x, y, color) {
  const g = scene.add.graphics();
  // Inner white core + colored ring
  g.fillStyle(0xffffff, 0.60);
  g.fillCircle(0, 0, 6);
  g.fillStyle(color, 0.55);
  g.fillCircle(0, 0, 9);
  g.lineStyle(3, color, 0.90);
  g.strokeCircle(0, 0, 9);
  g.lineStyle(1.5, 0xffffff, 0.55);
  g.strokeCircle(0, 0, 6);
  g.setPosition(x, y);
  g.setDepth(23);

  scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
  scene.tweens.add({
    targets: g,
    scaleX: 5, scaleY: 5,
    alpha: 0,
    duration: 180,
    ease: 'Quad.easeOut',
    onComplete: () => { if (g.active) g.destroy(); },
  });
}
