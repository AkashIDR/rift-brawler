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
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const dist  = Phaser.Math.Between(minDist, maxDist);
    const size  = Phaser.Math.Between(minSize, maxSize);

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
      duration: Phaser.Math.Between(Math.floor(duration * 0.7), duration),
      ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}

// ─── Spark streaks ────────────────────────────────────────────────────────────
// Thin elongated rectangles rotated to face their travel direction.
// White hot core layered over the base color. Taper as they fly outward.
// Use for: projectile impacts on boss, projectile impacts on obstacles.
export function spawnSparks(scene, x, y, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const dist  = Phaser.Math.Between(30, 75);
    const len   = Phaser.Math.Between(8, 14);   // long axis
    const wid   = Phaser.Math.Between(2, 3);    // short axis

    const g = scene.add.graphics();
    // Colored outer spark body
    g.fillStyle(color, 1);
    g.fillRect(-wid / 2, -len / 2, wid, len);
    // White-hot inner core highlight
    g.fillStyle(0xffffff, 0.70);
    g.fillRect(-1, -len * 0.4, 2, len * 0.4);
    g.setPosition(x, y);
    g.setRotation(angle);   // orient along travel direction
    g.setDepth(22);

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scaleX: 0.3,   // taper to a point as they travel
      duration: Phaser.Math.Between(180, 320),
      ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}

// ─── Dust puffs ───────────────────────────────────────────────────────────────
// Soft expanding circles in a stone/sand palette.
// Set depth below entities so dust appears to settle on the ground.
// Use for: ground slam landings, obstacle impacts.
export function spawnDust(scene, x, y, count = 10) {
  const PALETTE = [0xb8a880, 0xa09070, 0xc8b898, 0x907858];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist  = Phaser.Math.Between(15, 50);
    const size  = Phaser.Math.Between(4, 10);
    const col   = PALETTE[Math.floor(Math.random() * PALETTE.length)];

    const g = scene.add.graphics();
    g.fillStyle(col, 0.72);
    g.fillCircle(0, 0, size);
    g.setPosition(x, y);
    g.setDepth(8);   // below entities — dust settles on the floor

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scaleX: 1.8,   // billow outward as they travel
      scaleY: 1.8,
      duration: Phaser.Math.Between(280, 420),
      ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}

// ─── Blood drops ──────────────────────────────────────────────────────────────
// Filled circles that splatter outward with a simulated gravity drip.
// Mix of bright red and dark red for depth. Elongate slightly as they fall.
// Use for: player taking damage, boss taking damage.
export function spawnBlood(scene, x, y, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle   = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
    const dist    = Phaser.Math.Between(20, 65);
    const size    = Phaser.Math.Between(3, 8);
    const col     = Math.random() < 0.5 ? 0xdd0011 : 0x8b0000;
    const gravity = Phaser.Math.Between(10, 30);   // extra downward drip

    const g = scene.add.graphics();
    g.fillStyle(col, 1);
    g.fillCircle(0, 0, size);
    g.setPosition(x, y);
    g.setDepth(22);

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist + gravity,   // drip downward
      alpha: 0,
      scaleX: 0.5,
      scaleY: 1.4,   // elongate into a teardrop as they fall
      duration: Phaser.Math.Between(300, 500),
      ease: 'Quad.easeOut',
      onComplete: () => { if (g.active) g.destroy(); },
    });
  }
}
