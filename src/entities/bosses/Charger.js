import Phaser from 'phaser';
import BossBase from './BossBase.js';

export default class Charger extends BossBase {
  constructor(scene, x, y, level) {
    const config = {
      name: 'The Charger',
      baseHp: 200, baseDamage: 15, baseSpeed: 160,
      size: 38, color: 0xff4500, accentColor: 0xff8800,
      enrageThresholds: [0.5, 0.25],
    };
    super(scene, x, y, config, level);
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

  _attackDashCharge() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    // Telegraph: wind-up arrow toward player
    const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const arrowG = this.scene.add.graphics();
    arrowG.setDepth(6);
    arrowG.lineStyle(4, 0xff4400, 0.9);
    const tdur = this._telegraphDuration;

    this.scene.tweens.addCounter({
      from: 0, to: tdur, duration: tdur,
      onUpdate: (tw) => {
        const t = tw.getValue() / tdur;
        arrowG.clear();
        arrowG.lineStyle(3 + t * 2, 0xff4400, 0.5 + t * 0.5);
        const len = 30 + t * 40;
        arrowG.lineBetween(
          this.x, this.y,
          this.x + Math.cos(angle) * len, this.y + Math.sin(angle) * len
        );
      },
      onComplete: () => {
        arrowG.destroy();
        this._doCharge(p.x, p.y, 1);
      }
    });
  }

  _doCharge(tx, ty, count) {
    if (!this.alive) return;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
    const speed = 5600 + this.level * 80;
    const duration = (dist / speed) * 1000 + 200;

    this._charging = true;
    // Rotate to face charge direction
    this.container.setAngle(Phaser.Math.RadToDeg(angle));

    this.scene.tweens.add({
      targets: this.container,
      x: tx, y: ty,
      duration, ease: 'Quad.easeIn',
      onUpdate: () => {
        this.x = this.container.x;
        this.y = this.container.y;
        // Damage player if contact
        const pl = this.scene.player;
        if (pl && pl.alive && !pl.invincible) {
          const d = Phaser.Math.Distance.Between(this.x, this.y, pl.x, pl.y);
          if (d < this.size + 16) pl.takeDamage(this.damage);
        }
      },
      onComplete: () => {
        this._charging = false;
        this.container.setAngle(0);
        if (count >= 3 || !this.alive) {
          this._endAttack();
        } else {
          this.scene.time.delayedCall(300, () => {
            if (this.scene.player && this.scene.player.alive) {
              this._doCharge(this.scene.player.x, this.scene.player.y, count + 1);
            } else this._endAttack();
          });
        }
      }
    });
  }

  _attackSpinCrash() {
    // Telegraph: expanding ring
    this._drawTelegraphZone(this.x, this.y, this.size * 4.4, this._telegraphDuration, 0xff4400);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      // Shockwave
      const ring = this.scene.add.graphics();
      ring.x = this.x;
      ring.y = this.y;
      ring.setDepth(9);
      const maxR = this.size * 5.0;

      this.scene.tweens.addCounter({
        from: 0, to: maxR, duration: 350,
        onUpdate: (tw) => {
          const r = tw.getValue();
          ring.clear();
          ring.lineStyle(6, this.color, 1 - r / maxR);
          ring.strokeCircle(0, 0, r);

          // Damage player if in ring's expanding zone
          const p = this.scene.player;
          if (p && p.alive && !p.invincible) {
            const d = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
            if (d < r + 10 && d > r - 20) p.takeDamage(this.damage * 0.8);
          }
        },
        onComplete: () => { ring.destroy(); this._endAttack(); }
      });

      this.scene.cameras.main.shake(200, 0.003);
    });
  }

  _attackTripleCharge() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }
    const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const arrowG = this.scene.add.graphics();
    arrowG.setDepth(6);
    const tdur = this._telegraphDuration;

    this.scene.tweens.addCounter({
      from: 0, to: tdur, duration: tdur,
      onUpdate: (tw) => {
        const t = tw.getValue() / tdur;
        arrowG.clear();
        // Three arrow lines
        [-0.25, 0, 0.25].forEach(offset => {
          const a = angle + offset;
          arrowG.lineStyle(2, 0xff8800, 0.4 + t * 0.6);
          arrowG.lineBetween(this.x, this.y,
            this.x + Math.cos(a) * (40 + t * 60), this.y + Math.sin(a) * (40 + t * 60));
        });
      },
      onComplete: () => { arrowG.destroy(); this._doCharge(p.x, p.y, 0); }
    });
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.alive) return;

    // Slowly orbit the player when idle
    if (this._state === 'idle' && !this._charging) {
      const p = this.scene.player;
      if (p && p.alive) {
        this._orbitAngle += (delta / 1000) * 1.2;
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
