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
  // Center flash — tight bright pop, not a large circle
  const flash = scene.add.graphics();
  flash.fillStyle(0xffffff, 0.95);
  flash.fillCircle(0, 0, 3 + Math.random() * 2);   // 3–5px — stays small
  flash.fillStyle(color, 0.8);
  flash.fillCircle(0, 0, 2 + Math.random() * 1.5);
  flash.setPosition(x, y);
  flash.setDepth(23);
  scene.events.once('shutdown', () => { if (flash.active) flash.destroy(); });
  scene.tweens.add({
    targets: flash,
    scaleX: 1.3, scaleY: 1.3,   // barely expands — no soap bubble
    alpha: 0,
    duration: 80,
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
    // Draw HORIZONTALLY in local space so setRotation(angle) aligns the long axis
    // with the travel direction (perpendicular out from impact center)
    g.fillStyle(color, 1);
    g.fillRect(-len / 2, -wid / 2, len, wid);
    g.fillStyle(0xffffff, 0.70);
    g.fillRect(-len * 0.45, -0.8, len * 0.45, 1.6);   // white-hot core, also horizontal
    g.setPosition(x, y);
    g.setRotation(angle);
    g.setDepth(22);

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    scene.tweens.add({
      targets: g,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scaleY: 0.2,    // narrow the WIDTH as it travels (tapers to a streak)
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
// Each drop has an initial velocity and real gravity, producing parabolic arcs.
// The onUpdate counter runs only for the tween's lifetime (fire-and-forget, not
// repeat:-1). Mix of bright red and dark red; elongates into a teardrop as it falls.
// Use for: player taking damage, boss taking damage.
const BLOOD_GRAVITY = 260;   // px/s² downward acceleration

export function spawnBlood(scene, x, y, count = 10) {
  for (let i = 0; i < count; i++) {
    const angle    = Math.random() * Math.PI * 2;
    const speed    = 80 + Math.random() * 140;   // 80–220 px/s launch speed
    const size     = 2.5 + Math.random() * 5.5;  // 2.5–8px radius
    const col      = Math.random() < 0.55 ? 0xdd0011 : 0x8b0000;
    const duration = 320 + Math.random() * 240;  // 320–560ms flight time
    const secs     = duration / 1000;

    // Initial velocity components. Subtract a small upward bias so even
    // downward-aimed drops arc before gravity pulls them to the ground.
    const vx =  Math.cos(angle) * speed;
    const vy =  Math.sin(angle) * speed - 40;   // -40 = slight upward nudge

    const g = scene.add.graphics();
    g.fillStyle(col, 1);
    g.fillCircle(0, 0, size);
    g.setPosition(x, y);
    g.setDepth(22);

    scene.events.once('shutdown', () => { if (g.active) g.destroy(); });

    // Physics simulation via addCounter — single-shot, self-destroying tween.
    scene.tweens.addCounter({
      from: 0, to: secs,
      duration,
      onUpdate: (tween) => {
        if (!g.active) return;
        const t = tween.getValue();
        g.x = x + vx * t;
        g.y = y + vy * t + 0.5 * BLOOD_GRAVITY * t * t;   // s = v₀t + ½at²
        // Fade out over last 40 % of flight
        g.alpha = t < secs * 0.60 ? 1 : 1 - (t - secs * 0.60) / (secs * 0.40);
        // Elongate drop as it picks up downward speed (teardrop effect)
        const fallSpeed = vy + BLOOD_GRAVITY * t;   // current vertical velocity
        const stretch   = 1 + Math.max(0, fallSpeed) / 300;
        g.scaleX = 1 / Math.max(stretch, 0.5);   // pinch width as height grows
        g.scaleY = Math.min(stretch, 2.2);
      },
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
