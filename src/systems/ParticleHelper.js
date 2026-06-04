import Phaser from 'phaser';

/**
 * ParticleHelper — stateless burst utilities.
 *
 * All graphics objects created here:
 *  - Register a shutdown listener so they self-destroy on scene transition
 *  - Are destroyed in their tween's onComplete — no persistent live graphics
 *  - Never use repeat: -1 tweens
 */

/**
 * Generic rectangle-fragment burst.
 * @param {Phaser.Scene} scene
 * @param {number} x  World X origin
 * @param {number} y  World Y origin
 * @param {object} opts
 *   color    {number}  Fill color hex         default 0xffffff
 *   count    {number}  Fragment count         default 10
 *   minDist  {number}  Min scatter distance   default 30
 *   maxDist  {number}  Max scatter distance   default 80
 *   minSize  {number}  Min fragment size px   default 4
 *   maxSize  {number}  Max fragment size px   default 10
 *   duration {number}  Tween duration ms      default 400
 *   alpha    {number}  Starting alpha         default 1.0
 *   depth    {number}  Display depth          default 20
 */
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

/**
 * Quick small impact-spark burst — subtle & snappy.
 * Use for per-hit feedback (boss taking damage, projectile impact, player hit).
 */
export function spawnImpactSparks(scene, x, y, color, count = 12) {
  spawnBurst(scene, x, y, {
    color,
    count,
    minDist:  28,
    maxDist:  70,
    minSize:  5,
    maxSize:  12,
    duration: 350,
    depth:    21,
  });
}

/**
 * Ground dust burst — used for slam landings and heavy impacts.
 * Sandy/stone color, wider spread, slightly transparent.
 */
export function spawnDust(scene, x, y, count = 10) {
  spawnBurst(scene, x, y, {
    color:    0xb8a880,
    count,
    minDist:  20,
    maxDist:  55,
    minSize:  3,
    maxSize:  8,
    duration: 320,
    alpha:    0.75,
    depth:    8,   // below entities — dust settles on the floor
  });
}
