import Phaser from 'phaser';
import BossBase from './BossBase.js';
import { BOSS_CONFIGS } from '../../config/bossConfig.js';

export default class Charger extends BossBase {
  constructor(scene, x, y, level) {
    super(scene, x, y, BOSS_CONFIGS.charger, level);
    this._charging = false;
    this._orbitAngle = 0;
  }

  _buildGraphics() {
    this.g = this.scene.add.graphics();
    this.container.add(this.g);
    this._redraw();
  }

  _redraw(eyeOffset = 0) {
    this.g.clear();
    const s = this.size;

    // Shadow
    this.g.fillStyle(0x000000, 0.2);
    this.g.fillEllipse(4, s - 4, s * 1.6, 12);

    // Body: chunky rounded triangle with spike at front
    this.g.fillStyle(this.color, 1);
    // Main body
    this.g.fillRoundedRect(-s * 0.7, -s * 0.5, s * 1.4, s * 1.1, 10);
    // Front spike
    this.g.fillTriangle(s * 0.5, -s * 0.3, s * 0.5, s * 0.3, s * 1.2, 0);

    // Armor plates (accent)
    this.g.fillStyle(this.accentColor, 0.8);
    this.g.fillRoundedRect(-s * 0.5, -s * 0.3, s * 0.6, s * 0.5, 4);

    // Outline
    this.g.lineStyle(3, 0x1a0800, 1);
    this.g.strokeRoundedRect(-s * 0.7, -s * 0.5, s * 1.4, s * 1.1, 10);

    // Eyes (two angry slits)
    this.g.fillStyle(0xffff00, 1);
    this.g.fillRect(s * 0.1, -s * 0.2 + eyeOffset, s * 0.25, s * 0.12);
    this.g.fillRect(s * 0.1, s * 0.05 + eyeOffset, s * 0.25, s * 0.12);

    // Enrage glow
    if (this.enraged) {
      this.g.lineStyle(4, 0xff0000, 0.5);
      this.g.strokeRoundedRect(-s * 0.7 - 4, -s * 0.5 - 4, s * 1.4 + 8, s * 1.1 + 8, 12);
    }
  }

  _getAttackPool() { return ['dashCharge', 'spinCrash']; }
  _getEnrageAttacks() { return ['tripleCharge']; }

  _runAttack(name) {
    switch (name) {
      case 'dashCharge': this._attackDashCharge(); break;
      case 'spinCrash': this._attackSpinCrash(); break;
      case 'tripleCharge': this._attackTripleCharge(); break;
      default: this._endAttack();
    }
  }

  /**
   * Walk from (startX, startY) toward (endX, endY) in 24 steps and return the
   * last point that sits inside the arena (with boss-radius clearance).
   * Used to clamp any charge destination to valid arena space.
   */
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

  /**
   * Calculate where the boss will land after overshooting through the player.
   * First charge overshoots 350–550px (dramatic long pass).
   * Repeat charges overshoot only 80–180px (short corrective burst).
   * Result is clamped to arena bounds.
   */
  _calcChargeDestination(playerX, playerY, isFirst) {
    const overshoot = isFirst
      ? Phaser.Math.Between(300, 400)
      : Phaser.Math.Between(100, 200);

    const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
    const endX  = playerX + Math.cos(angle) * overshoot;
    const endY  = playerY + Math.sin(angle) * overshoot;

    // Walk the overshoot segment from the player outward, stop at last valid point
    return this._clampPathToArena(playerX, playerY, endX, endY);
  }

  _attackDashCharge() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    // Calculate full overshoot destination — telegraph shows the true travel path
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

    this._charging = true;
    this.container.setAngle(Phaser.Math.RadToDeg(angle));

    let chargeHitLanded = false;
    let obstaclesHit    = 0;

    // Extracted so the tween's onComplete and the early obstacle-stop both call the same logic
    const afterCharge = () => {
      this._charging = false;
      this.container.setAngle(0);
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

        // Obstacle breaking — first hit shatters, second stops the charge dead
        if (this.scene.obstacles) {
          for (const obs of this.scene.obstacles) {
            if (obs.broken) continue;
            if (Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y)
                < this.size * 0.6 + obs.baseRadius) {
              obs.break();
              obstaclesHit++;
              if (obstaclesHit >= 2) { tween.stop(); afterCharge(); return; }
              break; // one obstacle per frame is enough
            }
          }
        }

        // One player hit per charge pass
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
    // Telegraph: expanding ring showing the shockwave radius
    this._drawTelegraphZone(this.x, this.y, this.size * 4.4, this._telegraphDuration, 0xff4400);

    // Capture boss position at cast time — ring origin is honest even if boss moves
    const bossX = this.x, bossY = this.y;

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      // Shockwave ring
      const ring = this.scene.add.graphics();
      ring.x = bossX;
      ring.y = bossY;
      ring.setDepth(9);
      const maxR = this.size * 5.0;

      // One player hit as the ring passes through
      let ringHitLanded = false;

      // Per-ring obstacle tracking for angular-sector blocking:
      // ringBrokenObs = obstacles already shattered by this ring expansion.
      // A second obstacle in the same ~29° sector survives and stops the ring there.
      const ringBrokenObs = [];

      this.scene.tweens.addCounter({
        from: 0, to: maxR, duration: 350,
        onUpdate: (tw) => {
          const r = tw.getValue();
          ring.clear();
          ring.lineStyle(6, this.color, 1 - r / maxR);
          ring.strokeCircle(0, 0, r);

          // Obstacle interaction — angular-sector logic
          this.scene.obstacles?.forEach(obs => {
            if (obs.broken) return;
            const d = Phaser.Math.Distance.Between(bossX, bossY, obs.x, obs.y);
            // Is the ring wavefront currently passing through this obstacle?
            if (d > r + 10 || d < r - obs._origBaseRadius - 10) return;

            const obsAngle = Math.atan2(obs.y - bossY, obs.x - bossX);
            const blocked  = ringBrokenObs.some(prev => {
              const prevAngle = Math.atan2(prev.y - bossY, prev.x - bossX);
              return Math.abs(Phaser.Math.Angle.Wrap(obsAngle - prevAngle)) < 0.5; // ~29°
            });

            if (!blocked) {
              obs.break();
              ringBrokenObs.push(obs); // mark this sector as "first hit"
            }
            // if blocked: second obstacle in sector — ring stops here, obs survives
          });

          // Player hit
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
   * Draw a translucent ghost Charger silhouette at world position (x, y),
   * rotated to face the given angle (radians). Starts invisible (alpha 0)
   * so the caller can tween it in. Returns the graphics object.
   */
  _createGhostCharger(x, y, angle) {
    const g = this.scene.add.graphics();
    const s = this.size;
    // Body + spike (no accent plates — keeps it read as a "shadow")
    g.fillStyle(this.color, 1);
    g.fillRoundedRect(-s * 0.7, -s * 0.5, s * 1.4, s * 1.1, 10);
    g.fillTriangle(s * 0.5, -s * 0.3, s * 0.5, s * 0.3, s * 1.2, 0);
    // Thin outline
    g.lineStyle(2, 0x1a0800, 0.8);
    g.strokeRoundedRect(-s * 0.7, -s * 0.5, s * 1.4, s * 1.1, 10);

    g.x = x;
    g.y = y;
    g.angle = Phaser.Math.RadToDeg(angle);
    g.alpha = 0;
    g.setDepth(9);

    // Guaranteed cleanup if the scene shuts down mid-attack
    this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    return g;
  }

  /**
   * Single charge for the triple sequence — no repeat logic.
   * damageMult scales the damage dealt (1.0 = full, 0.6 = ghost flanks).
   * Calls onComplete when the tween finishes (or immediately if boss is dead).
   */
  _doTripleCharge(dest, onComplete, damageMult = 1.0) {
    if (!this.alive) { onComplete?.(); return; }

    const angle    = Phaser.Math.Angle.Between(this.x, this.y, dest.x, dest.y);
    const dist     = Phaser.Math.Distance.Between(this.x, this.y, dest.x, dest.y);
    const speed    = 5600 + this.level * 80;
    const duration = (dist / speed) * 1000 + 200;

    this._charging = true;
    this.container.setAngle(Phaser.Math.RadToDeg(angle));

    let hitLanded    = false;
    let obstaclesHit = 0;

    const afterCharge = () => {
      this._charging = false;
      this.container.setAngle(0);
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

        // Obstacle breaking — first hit shatters, second stops the charge dead
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

  /**
   * Animate a ghost graphic along a charge path without moving the boss body.
   * Used for the simultaneous flanking charges in tripleCharge.
   * damageMult: damage fraction (0.6 for ghost flanks).
   * onComplete: called when the tween finishes or is stopped early.
   */
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
        // Obstacle breaking — same rule as the real charge
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
    const reach     = dist + 200; // flanking charges reach this far from the boss

    // ── Pre-calculate all 3 clamped destinations at telegraph time ───────────
    // Center: full overshoot past the player
    const dest0 = this._calcChargeDestination(p.x, p.y, true);

    // Left flank: –0.30 rad off center, reaching `reach` px from boss
    const leftAngle  = baseAngle - 0.30;
    const dest1 = this._clampPathToArena(
      this.x, this.y,
      this.x + Math.cos(leftAngle)  * reach,
      this.y + Math.sin(leftAngle)  * reach
    );

    // Right flank: +0.30 rad off center
    const rightAngle = baseAngle + 0.30;
    const dest2 = this._clampPathToArena(
      this.x, this.y,
      this.x + Math.cos(rightAngle) * reach,
      this.y + Math.sin(rightAngle) * reach
    );

    // ── Three honest rectangle telegraphs ────────────────────────────────────
    this._drawTelegraphRect(this.x, this.y, dest0.x, dest0.y, this.size + 16, this._telegraphDuration, 0xff8800);
    this._drawTelegraphRect(this.x, this.y, dest1.x, dest1.y, this.size + 16, this._telegraphDuration, 0xff8800);
    this._drawTelegraphRect(this.x, this.y, dest2.x, dest2.y, this.size + 16, this._telegraphDuration, 0xff8800);

    // ── Ghost copies at 40% along each flanking path ─────────────────────────
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

    // Fade ghosts in over the telegraph window
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

    const MINI_TEL = 300; // ms gap + re-confirmation telegraph between each charge

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

      // ── Charge 1: center (real boss) — full damage ──────────────────────────
      this._doTripleCharge(dest0, () => {
        if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

        // ── Both flanking mini-telegraphs fire simultaneously from ghost positions
        this._drawTelegraphRect(ghost1.x, ghost1.y, dest1.x, dest1.y, this.size + 16, MINI_TEL, 0xff8800);
        this._drawTelegraphRect(ghost2.x, ghost2.y, dest2.x, dest2.y, this.size + 16, MINI_TEL, 0xff8800);

        this.scene.time.delayedCall(MINI_TEL, () => {
          if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

          // ── Charges 2 & 3: left and right ghosts fire simultaneously ──────
          let remaining = 2;
          const checkDone = () => { if (--remaining === 0) this._endAttack(); };

          this._doGhostCharge(ghost1, dest1, 0.6, checkDone);
          this._doGhostCharge(ghost2, dest2, 0.6, checkDone);
        });
      });
    });
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.alive) return;

    // Slowly orbit the player when idle
    if (this._state === 'idle' && !this._charging) {
      const p = this.scene.player;
      if (p && p.alive) {
        this._orbitAngle += (delta / 1000) * 1.7;
        const orbitDist = 200;
        const tx = p.x + Math.cos(this._orbitAngle) * orbitDist;
        const ty = p.y + Math.sin(this._orbitAngle) * orbitDist;
        this._moveToward(tx, ty, this.moveSpeed * 0.5, delta / 1000);
      }
    }

    // Eye animation based on state
    const eyeOff = this._charging ? -3 : Math.sin(time * 0.004) * 1.5;
    this._redraw(eyeOff);
  }
}
