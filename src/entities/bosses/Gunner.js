import Phaser from 'phaser';
import BossBase from './BossBase.js';

export default class Gunner extends BossBase {
  constructor(scene, x, y, level) {
    const config = {
      name: 'The Gunner',
      baseHp: 180, baseDamage: 12, baseSpeed: 100,
      size: 34, color: 0x9b59b6, accentColor: 0xf1c40f,
      enrageThresholds: [0.5, 0.25],
    };
    super(scene, x, y, config, level);
    this._rotationAngle = 0;
  }

  _buildGraphics() {
    this.g = this.scene.add.graphics();
    this.container.add(this.g);
    this._redraw();
  }

  _redraw() {
    this.g.clear();
    const s = this.size;

    // Shadow
    this.g.fillStyle(0x000000, 0.18);
    this.g.fillEllipse(3, s - 2, s * 1.8, 10);

    // Hexagon body
    this.g.fillStyle(this.color, 1);
    this.g.fillCircle(0, 0, s);
    // Hex lines
    this.g.lineStyle(3, 0x6a2a9c, 1);
    this.g.strokeCircle(0, 0, s);

    // Inner hex detail
    this.g.fillStyle(0x6a1e96, 1);
    this.g.fillCircle(0, 0, s * 0.55);

    // Six barrels (gold rectangles around perimeter)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + this._rotationAngle;
      const bx = Math.cos(a) * (s * 0.9);
      const by = Math.sin(a) * (s * 0.9);
      this.g.fillStyle(this.accentColor, 1);
      this.g.fillRect(bx - 4, by - 8, 8, 16);
      this.g.lineStyle(1, 0xaa8800, 1);
      this.g.strokeRect(bx - 4, by - 8, 8, 16);
    }

    // Center eye
    this.g.fillStyle(0xffffff, 1);
    this.g.fillCircle(0, 0, s * 0.22);
    this.g.fillStyle(0xff00ff, 1);
    this.g.fillCircle(0, 0, s * 0.12);

    if (this.enraged) {
      this.g.lineStyle(3, 0xff00ff, 0.5);
      this.g.strokeCircle(0, 0, s + 5);
    }
  }

  _getAttackPool() { return ['aimedShot', 'spreadBurst']; }
  _getEnrageAttacks() { return ['fullRotation', 'barrage']; }

  _runAttack(name) {
    switch (name) {
      case 'aimedShot': this._attackAimedShot(); break;
      case 'spreadBurst': this._attackSpreadBurst(); break;
      case 'fullRotation': this._attackFullRotation(); break;
      case 'barrage': this._attackBarrage(); break;
      default: this._endAttack();
    }
  }

  _attackAimedShot() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    // Telegraph: glow on one barrel
    const glowG = this.scene.add.graphics();
    glowG.setDepth(7);
    const tdur = this._telegraphDuration;

    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: tdur,
      onUpdate: (tw) => {
        const t = tw.getValue();
        glowG.clear();
        glowG.fillStyle(0xffff00, t * 0.7);
        glowG.fillCircle(this.x, this.y, this.size * 0.4 * t);
      },
      onComplete: () => {
        glowG.destroy();
        if (!this.alive) return;
        const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
        this._spawnProjectile(angle, 480, 0xffcc00, 10, this.damage, false, 560);
        this._endAttack();
      }
    });
  }

  _attackSpreadBurst() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const glowG = this.scene.add.graphics();
    glowG.setDepth(7);
    const tdur = this._telegraphDuration;

    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: tdur,
      onUpdate: (tw) => {
        const t = tw.getValue();
        glowG.clear();
        glowG.lineStyle(2 + t * 3, 0xffcc00, t);
        const baseA = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
        [-0.35, 0, 0.35].forEach(off => {
          const a = baseA + off;
          glowG.lineBetween(this.x, this.y,
            this.x + Math.cos(a) * (50 + t * 60), this.y + Math.sin(a) * (50 + t * 60));
        });
      },
      onComplete: () => {
        glowG.destroy();
        if (!this.alive) return;
        const baseA = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
        [-0.35, 0, 0.35].forEach(off => {
          this._spawnProjectile(baseA + off, 360, 0xffcc00, 9, this.damage * 0.75, false, 440);
        });
        this._endAttack();
      }
    });
  }

  _attackFullRotation() {
    // Telegraph
    const tdur = this._telegraphDuration;
    const ringG = this.scene.add.graphics();
    ringG.setDepth(6);

    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: tdur,
      onUpdate: (tw) => {
        ringG.clear();
        ringG.lineStyle(3, 0xff00ff, tw.getValue());
        ringG.strokeCircle(this.x, this.y, this.size + 10);
      },
      onComplete: () => {
        ringG.destroy();
        if (!this.alive) return;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this._spawnProjectile(a, 300, 0xff44ff, 8, this.damage * 0.65, false, 400);
        }
        this._endAttack();
      }
    });
  }

  _attackBarrage() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    let shots = 0;
    const maxShots = this.enraged ? 6 : 4;
    const fireShot = () => {
      if (!this.alive || !p.alive || shots >= maxShots) { this._endAttack(); return; }
      const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      this._spawnProjectile(angle, 440, 0xff88ff, 10, this.damage, false, 520);
      shots++;
      this.scene.time.delayedCall(280, fireShot);
    };

    // Brief wind-up
    this.scene.time.delayedCall(this._telegraphDuration * 0.5, fireShot);
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.alive) return;

    // Slowly rotate body
    this._rotationAngle += (delta / 1000) * (this.enraged ? 2.5 : 1.2);

    // Strafe around the player at mid range
    const p = this.scene.player;
    if (p && p.alive && this._state === 'idle') {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (dist < 160) {
        // Back away
        const a = Phaser.Math.Angle.Between(p.x, p.y, this.x, this.y);
        this._moveToward(this.x + Math.cos(a) * 80, this.y + Math.sin(a) * 80, this.moveSpeed, delta / 1000);
      } else if (dist > 280) {
        this._moveToward(p.x, p.y, this.moveSpeed * 0.6, delta / 1000);
      }
    }

    this._redraw();
  }
}
