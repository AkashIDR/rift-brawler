import Phaser from 'phaser';
import BossBase from './BossBase.js';

export default class Stomper extends BossBase {
  constructor(scene, x, y, level) {
    const config = {
      name: 'The Stomper',
      baseHp: 260, baseDamage: 20, baseSpeed: 80,
      size: 48, color: 0x27ae60, accentColor: 0x1abc9c,
      enrageThresholds: [0.5, 0.25],
    };
    super(scene, x, y, config, level);
    this._bobPhase = 0;
  }

  _buildGraphics() {
    this.g = this.scene.add.graphics();
    this.container.add(this.g);
    this._redraw(0);
  }

  _redraw(squish = 0) {
    this.g.clear();
    const s = this.size;
    const sq = squish; // squish on stomp (positive = shorter/wider)

    // Shadow
    this.g.fillStyle(0x000000, 0.2);
    this.g.fillEllipse(5, s - 6 + sq, s * 2.2, 14 + sq * 2);

    // Rocky crown spikes
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r1 = s * 1.05, r2 = s * 1.4;
      const ax = Math.cos(a) * r1, ay = Math.sin(a) * r1;
      const bx = Math.cos(a + 0.3) * r2, by = Math.sin(a + 0.3) * r2;
      const cx2 = Math.cos(a + 0.6) * r1, cy2 = Math.sin(a + 0.6) * r1;
      this.g.fillStyle(0x1a6b40, 1);
      this.g.fillTriangle(ax, ay - sq * 0.3, bx, by - sq * 0.3, cx2, cy2 - sq * 0.3);
    }

    // Main body (circle, slightly squished on stomp)
    this.g.fillStyle(this.color, 1);
    this.g.fillEllipse(0, sq * 0.3, s * 2, s * 2 - sq * 0.6);
    this.g.lineStyle(4, 0x145a32, 1);
    this.g.strokeEllipse(0, sq * 0.3, s * 2, s * 2 - sq * 0.6);

    // Rock texture patches
    this.g.fillStyle(0x1e8449, 1);
    this.g.fillRoundedRect(-s * 0.5, -s * 0.4, s * 0.4, s * 0.3, 3);
    this.g.fillRoundedRect(s * 0.1, -s * 0.2, s * 0.35, s * 0.25, 3);

    // Face: two small angry eyes + furrowed brow
    this.g.fillStyle(0xffff00, 1);
    this.g.fillRect(-s * 0.35, -s * 0.15, s * 0.25, s * 0.18);
    this.g.fillRect(s * 0.1, -s * 0.15, s * 0.25, s * 0.18);
    // Brow
    this.g.lineStyle(4, 0x0a3d20, 1);
    this.g.lineBetween(-s * 0.4, -s * 0.28, -s * 0.1, -s * 0.2);
    this.g.lineBetween(s * 0.4, -s * 0.28, s * 0.1, -s * 0.2);

    if (this.enraged) {
      this.g.lineStyle(4, 0x00ff77, 0.4);
      this.g.strokeCircle(0, 0, s + 8);
    }
  }

  _getAttackPool() { return ['bigStomp', 'quakeLine']; }
  _getEnrageAttacks() { return ['tremorField', 'leapSlam']; }

  _runAttack(name) {
    switch (name) {
      case 'bigStomp': this._attackBigStomp(); break;
      case 'quakeLine': this._attackQuakeLine(); break;
      case 'tremorField': this._attackTremorField(); break;
      case 'leapSlam': this._attackLeapSlam(); break;
      default: this._endAttack();
    }
  }

  _attackBigStomp() {
    const radius = this.size * 2.2;
    this._drawTelegraphZone(this.x, this.y, radius, this._telegraphDuration, 0x00ff77);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      // Squish animation
      this.scene.tweens.addCounter({
        from: 0, to: 18, duration: 120, yoyo: true,
        onUpdate: (tw) => this._redraw(tw.getValue())
      });
      this.scene.cameras.main.shake(250, 0.0042);

      const p = this.scene.player;
      if (p && p.alive && !p.invincible) {
        if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < radius + 16)
          p.takeDamage(this.damage);
      }
      this._endAttack();
    });
  }

  _attackQuakeLine() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const lineLen = 420;
    const ex = this.x + Math.cos(angle) * lineLen;
    const ey = this.y + Math.sin(angle) * lineLen;

    // Telegraph line
    this._drawTelegraphLine(this.x, this.y, ex, ey, this._telegraphDuration, 0x00ff77);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      this.scene.cameras.main.shake(180, 0.0027);

      // Crack visual
      const crack = this.scene.add.graphics();
      crack.lineStyle(6, 0x00ff77, 0.9);
      crack.lineBetween(this.x, this.y, ex, ey);
      crack.setDepth(6);
      this.scene.tweens.add({ targets: crack, alpha: 0, duration: 400, onComplete: () => crack.destroy() });

      // Check player hit — point-to-line-segment distance, blocked by obstacles
      if (p.alive && !p.invincible) {
        const dx = ex - this.x, dy = ey - this.y;
        const lenSq = dx * dx + dy * dy;

        // If any obstacle's base intersects the quake line, it blocks the crack
        const blocked = this.scene.obstacles?.some(obs => {
          const t2 = lenSq > 0 ? Math.max(0, Math.min(1, ((obs.x - this.x) * dx + (obs.y - this.y) * dy) / lenSq)) : 0;
          return Phaser.Math.Distance.Between(obs.x, obs.y, this.x + t2 * dx, this.y + t2 * dy) < obs.baseRadius;
        });

        if (!blocked) {
          const t = lenSq > 0 ? Math.max(0, Math.min(1, ((p.x - this.x) * dx + (p.y - this.y) * dy) / lenSq)) : 0;
          const nearX = this.x + t * dx, nearY = this.y + t * dy;
          if (Phaser.Math.Distance.Between(p.x, p.y, nearX, nearY) < 36)
            p.takeDamage(this.damage * 0.9);
        }
      }
      this._endAttack();
    });
  }

  _attackTremorField() {
    const arena = this.scene.arena;
    if (!arena) { this._endAttack(); return; }
    const b = arena.shape.bounds;
    const tdur = this._telegraphDuration * 1.4;
    const count = this.enraged ? 6 : 4;
    const zones = [];

    // Place random AoE zones across arena, validating each point is inside the shape
    for (let i = 0; i < count; i++) {
      let zx = this.x, zy = this.y;
      for (let tries = 0; tries < 20; tries++) {
        const tx = Phaser.Math.Between(b.x + 60, b.x + b.w - 60);
        const ty = Phaser.Math.Between(b.y + 60, b.y + b.h - 60);
        if (arena.containsPoint(tx, ty, 60)) { zx = tx; zy = ty; break; }
      }
      const r = Phaser.Math.Between(55, 90);
      const zone = this._drawTelegraphZone(zx, zy, r, tdur, 0x00ff77);
      zones.push({ x: zx, y: zy, r });
    }

    this.scene.time.delayedCall(tdur, () => {
      if (!this.alive) return;
      this.scene.cameras.main.shake(300, 0.0036);
      const p = this.scene.player;
      zones.forEach(z => {
        if (p && p.alive && !p.invincible) {
          if (Phaser.Math.Distance.Between(p.x, p.y, z.x, z.y) < z.r + 16)
            p.takeDamage(this.damage * 0.7);
        }
      });
      this._endAttack();
    });
  }

  _attackLeapSlam() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    // Telegraph
    this._drawTelegraphZone(p.x, p.y, 100, this._telegraphDuration, 0x00ff77);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      // Leap
      this.scene.tweens.add({
        targets: this.container,
        x: p.x, y: p.y,
        duration: 400, ease: 'Quad.easeIn',
        onUpdate: () => { this.x = this.container.x; this.y = this.container.y; },
        onComplete: () => {
          // Slam
          this.scene.cameras.main.shake(350, 0.0054);
          this.scene.tweens.addCounter({
            from: 0, to: 20, duration: 150, yoyo: true,
            onUpdate: (tw) => this._redraw(tw.getValue())
          });
          if (p.alive && !p.invincible) {
            if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < 120)
              p.takeDamage(this.damage * 1.4);
          }
          this._endAttack();
        }
      });
    });
  }

  update(time, delta) {
    super.update(time, delta);
    if (!this.alive) return;
    this._bobPhase += delta / 1000;

    // Slow plod toward player
    const p = this.scene.player;
    if (p && p.alive && this._state === 'idle') {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (dist > 120) {
        this._moveToward(p.x, p.y, this.moveSpeed, delta / 1000);
      }
    }

    const bob = this._state === 'idle' ? Math.sin(this._bobPhase * 1.5) * 2 : 0;
    this.container.y = this.y + bob;
    this._redraw(0);
  }
}
