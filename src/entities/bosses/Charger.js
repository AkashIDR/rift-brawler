import Phaser from 'phaser';
import BossBase from './BossBase.js';
import { BOSS_CONFIGS } from '../../config/bossConfig.js';

export default class Charger extends BossBase {
  constructor(scene, x, y, level) {
    super(scene, x, y, BOSS_CONFIGS.charger, level);
    this._charging       = false;
    this._orbitAngle     = 0;
    this._facingAngle    = 0;     // radians: 0=right, π/2=down, ±π=left, -π/2=up
    this._isMoving       = false;
    this._takingHit      = false;
    this._currentAnimKey = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Visual setup — sprite-based (all polygon draw methods removed)
  // ─────────────────────────────────────────────────────────────────────────

  _buildGraphics() {
    // Shadow — single static ellipse drawn once, no per-frame redraw
    this.shadowG = this.scene.add.graphics();
    this.shadowG.fillStyle(0x000000, 0.28);
    this.shadowG.fillEllipse(0, 0, this.size * 2.6, this.size * 0.55);
    this.shadowG.y = this.size * 0.45;
    this.container.add(this.shadowG);

    // Sprite
    this._registerAnimations();
    this.sprite = this.scene.add.sprite(0, 0, 'charger_side_idle_0');
    this.sprite.setOrigin(0.5, 0.75);   // feet sit near the bottom of the frame
    this.container.add(this.sprite);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _registerAnimations — creates all AnimationManager entries once.
  // Uses individual texture keys (one PNG per key). Nothing here changes
  // when real art replaces placeholder textures in BootScene.
  // ─────────────────────────────────────────────────────────────────────────
  _registerAnimations() {
    const defs = [
      // [view,    anim,     frameCount, fps,  loop ]
      ['side',  'idle',   2, 4,  true ],
      ['side',  'walk',   4, 8,  true ],
      ['side',  'charge', 2, 12, true ],
      ['side',  'hurt',   1, 8,  false],
      ['side',  'death',  4, 6,  false],
      ['front', 'idle',   2, 4,  true ],
      ['front', 'walk',   4, 8,  true ],
      ['front', 'charge', 2, 12, true ],
      ['front', 'hurt',   1, 8,  false],
      ['front', 'death',  4, 6,  false],
      ['back',  'idle',   2, 4,  true ],
      ['back',  'walk',   4, 8,  true ],
      ['back',  'charge', 2, 12, true ],
      ['back',  'hurt',   1, 8,  false],
      ['back',  'death',  4, 6,  false],
    ];
    for (const [view, anim, count, fps, loop] of defs) {
      const key = `charger_${view}_${anim}`;
      if (this.scene.anims.exists(key)) continue;
      this.scene.anims.create({
        key,
        frames: Array.from({ length: count }, (_, i) => ({
          key: `charger_${view}_${anim}_${i}`,
        })),
        frameRate: fps,
        repeat: loop ? -1 : 0,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // _updateAnimation — picks the correct key each frame and plays only on
  // change (prevents restarting the animation on every tick).
  // ─────────────────────────────────────────────────────────────────────────
  _updateAnimation() {
    const fa  = this._facingAngle;
    const cos = Math.cos(fa);
    const sin = Math.sin(fa);

    let view;
    if (Math.abs(cos) >= Math.abs(sin)) {
      view = 'side';
      this.sprite.setFlipX(cos < 0);   // mirror for left-facing
    } else if (sin > 0) {
      view = 'front';
      this.sprite.setFlipX(false);
    } else {
      view = 'back';
      this.sprite.setFlipX(false);
    }

    let anim;
    if (!this.alive)           anim = 'death';
    else if (this._takingHit)  anim = 'hurt';
    else if (this._charging)   anim = 'charge';
    else if (this._isMoving)   anim = 'walk';
    else                       anim = 'idle';

    const key = `charger_${view}_${anim}`;
    if (this._currentAnimKey !== key) {
      this.sprite.play(key);
      this._currentAnimKey = key;
    }
  }

  // Override takeDamage to set the hurt-animation flag for 250 ms.
  // BossBase still handles HP reduction, enrage check, alpha flash, and death.
  takeDamage(amount) {
    super.takeDamage(amount);
    if (!this.alive) return;
    this._takingHit = true;
    this.scene.time.delayedCall(250, () => { this._takingHit = false; });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Attack routing (unchanged)
  // ─────────────────────────────────────────────────────────────────────────

  _getAttackPool()    { return ['dashCharge', 'spinCrash']; }
  _getEnrageAttacks() { return ['tripleCharge']; }

  _runAttack(name) {
    switch (name) {
      case 'dashCharge':   this._attackDashCharge();  break;
      case 'spinCrash':    this._attackSpinCrash();   break;
      case 'tripleCharge': this._attackTripleCharge(); break;
      default: this._endAttack();
    }
  }

  _clampPathToArena(startX, startY, endX, endY) {
    const arena = this.scene.arena;
    if (!arena) return { x: endX, y: endY };
    const STEPS = 24;
    let lastX = startX, lastY = startY;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const cx = startX + (endX - startX) * t;
      const cy = startY + (endY - startY) * t;
      if (arena.containsPoint(cx, cy, this.size * 0.5)) {
        lastX = cx; lastY = cy;
      } else {
        break;
      }
    }
    return { x: lastX, y: lastY };
  }

  _calcChargeDestination(playerX, playerY, isFirst) {
    const overshoot = isFirst
      ? Phaser.Math.Between(300, 400)
      : Phaser.Math.Between(100, 200);

    const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
    const endX  = playerX + Math.cos(angle) * overshoot;
    const endY  = playerY + Math.sin(angle) * overshoot;

    return this._clampPathToArena(playerX, playerY, endX, endY);
  }

  _attackDashCharge() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const dest = this._calcChargeDestination(p.x, p.y, true);
    this._drawTelegraphRect(this.x, this.y, dest.x, dest.y, this.size + 16, this._telegraphDuration, 0xff4400);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      this._doCharge(dest.x, dest.y, 1);
    });
  }

  _doCharge(tx, ty, count) {
    if (!this.alive) return;
    const angle    = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const dist     = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
    const speed    = 5600 + this.level * 80;
    const duration = (dist / speed) * 1000 + 200;

    this._charging    = true;
    this._facingAngle = angle;   // visual faces the charge direction

    let chargeHitLanded = false;
    let obstaclesHit    = 0;

    const afterCharge = () => {
      this._charging = false;
      if (count >= 3 || !this.alive) {
        this._endAttack();
      } else {
        const pl = this.scene.player;
        if (!pl || !pl.alive) { this._endAttack(); return; }
        const REPEAT_TELEGRAPH_MS = this.level < 10 ? 500 : 300;
        const dest = this._calcChargeDestination(pl.x, pl.y, false);
        this._drawTelegraphRect(this.x, this.y, dest.x, dest.y, this.size + 16, REPEAT_TELEGRAPH_MS, 0xff4400);
        this.scene.time.delayedCall(REPEAT_TELEGRAPH_MS, () => {
          this._doCharge(dest.x, dest.y, count + 1);
        });
      }
    };

    let tween;
    tween = this.scene.tweens.add({
      targets: this.container,
      x: tx, y: ty,
      duration, ease: 'Quad.easeIn',
      onUpdate: () => {
        this.x = this.container.x;
        this.y = this.container.y;

        if (this.scene.obstacles) {
          for (const obs of this.scene.obstacles) {
            if (obs.broken) continue;
            if (Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y)
                < this.size * 0.6 + obs.baseRadius) {
              obs.break();
              obstaclesHit++;
              if (obstaclesHit >= 2) { tween.stop(); afterCharge(); return; }
              break;
            }
          }
        }

        if (chargeHitLanded) return;
        const pl = this.scene.player;
        if (pl && pl.alive && !pl.invincible) {
          if (Phaser.Math.Distance.Between(this.x, this.y, pl.x, pl.y) < this.size + 16) {
            pl.takeDamage(this.damage);
            chargeHitLanded = true;
          }
        }
      },
      onComplete: afterCharge,
    });
  }

  _attackSpinCrash() {
    this._drawTelegraphZone(this.x, this.y, this.size * 4.4, this._telegraphDuration, 0xff4400);

    const bossX = this.x, bossY = this.y;

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      const ring = this.scene.add.graphics();
      ring.x = bossX;
      ring.y = bossY;
      ring.setDepth(9);
      const maxR = this.size * 5.0;

      let ringHitLanded = false;
      const ringBrokenObs = [];

      this.scene.tweens.addCounter({
        from: 0, to: maxR, duration: 350,
        onUpdate: (tw) => {
          const r = tw.getValue();
          ring.clear();
          ring.lineStyle(6, this.color, 1 - r / maxR);
          ring.strokeCircle(0, 0, r);

          this.scene.obstacles?.forEach(obs => {
            if (obs.broken) return;
            const d = Phaser.Math.Distance.Between(bossX, bossY, obs.x, obs.y);
            if (d > r + 10 || d < r - obs._origBaseRadius - 10) return;

            const obsAngle = Math.atan2(obs.y - bossY, obs.x - bossX);
            const blocked  = ringBrokenObs.some(prev => {
              const prevAngle = Math.atan2(prev.y - bossY, prev.x - bossX);
              return Math.abs(Phaser.Math.Angle.Wrap(obsAngle - prevAngle)) < 0.5;
            });

            if (!blocked) {
              obs.break();
              ringBrokenObs.push(obs);
            }
          });

          if (ringHitLanded) return;
          const p = this.scene.player;
          if (p && p.alive && !p.invincible) {
            const d = Phaser.Math.Distance.Between(bossX, bossY, p.x, p.y);
            if (d < r + 10 && d > r - 20) {
              p.takeDamage(this.damage * 0.8);
              ringHitLanded = true;
            }
          }
        },
        onComplete: () => { ring.destroy(); this._endAttack(); }
      });

      this.scene.cameras.main.shake(200, 0.003);
    });
  }

  /**
   * Ghost charger used by tripleCharge — a lightweight Graphics silhouette
   * that fades in during the telegraph, then charges along a side path.
   * Kept as Graphics (not a sprite) because it is a transient attack effect.
   */
  _createGhostCharger(x, y, angle) {
    const g = this.scene.add.graphics();
    const s = this.size;
    g.fillStyle(this.color, 1);
    // Tail
    g.fillTriangle(-s * 0.60, -s * 0.02, -s * 0.80, -s * 0.28, -s * 0.96, s * 0.06);
    // Body
    g.fillPoints([
      { x: -s * 0.58, y: -s * 0.18 },
      { x: -s * 0.20, y: -s * 0.30 },
      { x:  s * 0.28, y: -s * 0.26 },
      { x:  s * 0.58, y: -s * 0.06 },
      { x:  s * 0.44, y:  s * 0.24 },
      { x:  s * 0.00, y:  s * 0.34 },
      { x: -s * 0.44, y:  s * 0.26 },
      { x: -s * 0.64, y:  s * 0.04 },
    ], true);
    // Haunch
    g.fillPoints([
      { x: -s * 0.34, y: -s * 0.26 },
      { x: -s * 0.58, y: -s * 0.18 },
      { x: -s * 0.68, y:  s * 0.04 },
      { x: -s * 0.52, y:  s * 0.26 },
      { x: -s * 0.28, y:  s * 0.22 },
      { x: -s * 0.20, y: -s * 0.06 },
    ], true);
    // Shoulder
    g.fillPoints([
      { x:  s * 0.28, y: -s * 0.26 },
      { x:  s * 0.52, y: -s * 0.14 },
      { x:  s * 0.60, y:  s * 0.10 },
      { x:  s * 0.44, y:  s * 0.24 },
      { x:  s * 0.20, y:  s * 0.20 },
      { x:  s * 0.14, y: -s * 0.04 },
    ], true);
    // Head
    g.fillPoints([
      { x: s * 0.70, y: -s * 0.28 },
      { x: s * 0.92, y: -s * 0.30 },
      { x: s * 1.08, y: -s * 0.16 },
      { x: s * 1.06, y:  s * 0.04 },
      { x: s * 0.88, y:  s * 0.12 },
      { x: s * 0.68, y:  s * 0.02 },
      { x: s * 0.64, y: -s * 0.14 },
    ], true);
    // Snout
    g.fillStyle(0x0e0200, 1);
    g.fillPoints([
      { x: s * 1.06, y:  s * 0.04 },
      { x: s * 1.30, y: -s * 0.02 },
      { x: s * 1.38, y:  s * 0.10 },
      { x: s * 1.26, y:  s * 0.22 },
      { x: s * 1.04, y:  s * 0.18 },
    ], true);

    g.x = x;
    g.y = y;
    g.angle = Phaser.Math.RadToDeg(angle);
    g.alpha = 0;
    g.setDepth(9);

    this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    return g;
  }

  _doTripleCharge(dest, onComplete, damageMult = 1.0) {
    if (!this.alive) { onComplete?.(); return; }

    const angle    = Phaser.Math.Angle.Between(this.x, this.y, dest.x, dest.y);
    const dist     = Phaser.Math.Distance.Between(this.x, this.y, dest.x, dest.y);
    const speed    = 5600 + this.level * 80;
    const duration = (dist / speed) * 1000 + 200;

    this._charging    = true;
    this._facingAngle = angle;

    let hitLanded    = false;
    let obstaclesHit = 0;

    const afterCharge = () => {
      this._charging = false;
      onComplete?.();
    };

    let tween;
    tween = this.scene.tweens.add({
      targets: this.container,
      x: dest.x, y: dest.y,
      duration, ease: 'Quad.easeIn',
      onUpdate: () => {
        this.x = this.container.x;
        this.y = this.container.y;

        if (this.scene.obstacles) {
          for (const obs of this.scene.obstacles) {
            if (obs.broken) continue;
            if (Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y)
                < this.size * 0.6 + obs.baseRadius) {
              obs.break();
              obstaclesHit++;
              if (obstaclesHit >= 2) { tween.stop(); afterCharge(); return; }
              break;
            }
          }
        }

        if (hitLanded) return;
        const pl = this.scene.player;
        if (pl && pl.alive && !pl.invincible) {
          if (Phaser.Math.Distance.Between(this.x, this.y, pl.x, pl.y) < this.size + 16) {
            pl.takeDamage(this.damage * damageMult);
            hitLanded = true;
          }
        }
      },
      onComplete: afterCharge,
    });
  }

  _doGhostCharge(ghost, dest, damageMult, onComplete) {
    if (!this.alive || !ghost.active) { onComplete?.(); return; }

    const angle    = Phaser.Math.Angle.Between(ghost.x, ghost.y, dest.x, dest.y);
    const dist     = Phaser.Math.Distance.Between(ghost.x, ghost.y, dest.x, dest.y);
    const speed    = 5600 + this.level * 80;
    const duration = (dist / speed) * 1000 + 200;

    ghost.angle = Phaser.Math.RadToDeg(angle);

    let hitLanded    = false;
    let obstaclesHit = 0;

    const dissolve = () => {
      if (ghost.active) {
        this.scene.tweens.add({
          targets: ghost, alpha: 0, duration: 150,
          onComplete: () => { if (ghost.active) ghost.destroy(); }
        });
      }
    };

    let ghostTween;
    ghostTween = this.scene.tweens.add({
      targets: ghost,
      x: dest.x, y: dest.y,
      duration, ease: 'Quad.easeIn',
      onUpdate: () => {
        if (this.scene.obstacles) {
          for (const obs of this.scene.obstacles) {
            if (obs.broken) continue;
            if (Phaser.Math.Distance.Between(ghost.x, ghost.y, obs.x, obs.y)
                < this.size * 0.6 + obs.baseRadius) {
              obs.break();
              obstaclesHit++;
              if (obstaclesHit >= 2) { ghostTween.stop(); dissolve(); onComplete?.(); return; }
              break;
            }
          }
        }

        if (hitLanded) return;
        const pl = this.scene.player;
        if (pl && pl.alive && !pl.invincible) {
          if (Phaser.Math.Distance.Between(ghost.x, ghost.y, pl.x, pl.y) < this.size + 16) {
            pl.takeDamage(this.damage * damageMult);
            hitLanded = true;
          }
        }
      },
      onComplete: () => { dissolve(); onComplete?.(); },
    });
  }

  _attackTripleCharge() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const dist      = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
    const reach     = dist + 200;

    const dest0 = this._calcChargeDestination(p.x, p.y, true);

    const leftAngle  = baseAngle - 0.30;
    const dest1 = this._clampPathToArena(
      this.x, this.y,
      this.x + Math.cos(leftAngle)  * reach,
      this.y + Math.sin(leftAngle)  * reach
    );

    const rightAngle = baseAngle + 0.30;
    const dest2 = this._clampPathToArena(
      this.x, this.y,
      this.x + Math.cos(rightAngle) * reach,
      this.y + Math.sin(rightAngle) * reach
    );

    this._drawTelegraphRect(this.x, this.y, dest0.x, dest0.y, this.size + 16, this._telegraphDuration, 0xff8800);
    this._drawTelegraphRect(this.x, this.y, dest1.x, dest1.y, this.size + 16, this._telegraphDuration, 0xff8800);
    this._drawTelegraphRect(this.x, this.y, dest2.x, dest2.y, this.size + 16, this._telegraphDuration, 0xff8800);

    const ghost1 = this._createGhostCharger(
      this.x + (dest1.x - this.x) * 0.4,
      this.y + (dest1.y - this.y) * 0.4,
      leftAngle
    );
    const ghost2 = this._createGhostCharger(
      this.x + (dest2.x - this.x) * 0.4,
      this.y + (dest2.y - this.y) * 0.4,
      rightAngle
    );

    this.scene.tweens.add({ targets: ghost1, alpha: 0.35, duration: this._telegraphDuration, ease: 'Linear' });
    this.scene.tweens.add({ targets: ghost2, alpha: 0.35, duration: this._telegraphDuration, ease: 'Linear' });

    const fadeOut = (ghost) => {
      if (ghost.active) {
        this.scene.tweens.add({
          targets: ghost, alpha: 0, duration: 150,
          onComplete: () => { if (ghost.active) ghost.destroy(); }
        });
      }
    };

    const MINI_TEL = 300;

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

      this._doTripleCharge(dest0, () => {
        if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

        this._drawTelegraphRect(ghost1.x, ghost1.y, dest1.x, dest1.y, this.size + 16, MINI_TEL, 0xff8800);
        this._drawTelegraphRect(ghost2.x, ghost2.y, dest2.x, dest2.y, this.size + 16, MINI_TEL, 0xff8800);

        this.scene.time.delayedCall(MINI_TEL, () => {
          if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

          let remaining = 2;
          const checkDone = () => { if (--remaining === 0) this._endAttack(); };

          this._doGhostCharge(ghost1, dest1, 0.6, checkDone);
          this._doGhostCharge(ghost2, dest2, 0.6, checkDone);
        });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // update — per-frame logic; visual update is now _updateAnimation()
  // ─────────────────────────────────────────────────────────────────────────
  update(time, delta) {
    const prevX = this.x, prevY = this.y;

    super.update(time, delta);
    if (!this.alive) return;

    // Orbit the player when idle — update facing direction from movement
    if (this._state === 'idle' && !this._charging) {
      const p = this.scene.player;
      if (p && p.alive) {
        this._orbitAngle += (delta / 1000) * 1.7;
        const tx = p.x + Math.cos(this._orbitAngle) * 200;
        const ty = p.y + Math.sin(this._orbitAngle) * 200;
        this._moveToward(tx, ty, this.moveSpeed * 0.5, delta / 1000);
        const dx = tx - this.x, dy = ty - this.y;
        if (Math.hypot(dx, dy) > 4) {
          this._facingAngle = Math.atan2(dy, dx);
        }
      }
    }

    // Track whether the boss moved this frame (drives walk vs. idle anim)
    const moved = Math.hypot(this.x - prevX, this.y - prevY);
    this._isMoving = moved > 0.4;

    this._updateAnimation();
  }
}
