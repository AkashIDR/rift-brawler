import Phaser from 'phaser';
import BossBase from './BossBase.js';
import { BOSS_CONFIGS } from '../../config/bossConfig.js';

export default class Stomper extends BossBase {
  constructor(scene, x, y, level) {
    super(scene, x, y, BOSS_CONFIGS.stomper, level);
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
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const radius = this.size * 2.53;

    // Only commit if the player is actually within stomp range.
    // If not, slip back to idle immediately (no cooldown) so the boss
    // keeps walking toward the player instead of standing frozen.
    if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) > radius) {
      this._state = 'idle';
      this._stateTimer = 300;
      return;
    }

    this._drawTelegraphZone(this.x, this.y, radius, this._telegraphDuration, 0x00ff77);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      // Squish animation
      this.scene.tweens.addCounter({
        from: 0, to: 18, duration: 120, yoyo: true,
        onUpdate: (tw) => this._redraw(tw.getValue())
      });
      this.scene.cameras.main.shake(250, 0.0042);

      // Break all obstacles inside the stomp radius
      this.scene.obstacles?.forEach(obs => {
        if (!obs.broken &&
            Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y) < radius + obs.baseRadius)
          obs.break();
      });

      const p = this.scene.player;
      if (p && p.alive && !p.invincible) {
        if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < radius + 16)
          p.takeDamage(this.damage);
      }

      // Radial ground cracks — 8 fissures radiating outward from stomp center
      const crackG = this.scene.add.graphics();
      crackG.setDepth(6);
      for (let i = 0; i < 8; i++) {
        const a   = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const len = radius * (0.72 + Math.random() * 0.32);
        const perp = a + Math.PI / 2;
        const pts = [{ x: this.x, y: this.y }];
        for (let s = 1; s <= 5; s++) {
          const t = s / 5;
          const jitter = (Math.random() - 0.5) * 18;
          pts.push({ x: this.x + Math.cos(a) * t * len + Math.cos(perp) * jitter,
                     y: this.y + Math.sin(a) * t * len + Math.sin(perp) * jitter });
        }
        [{ w: 16, al: 0.12, c: 0x00ff77 }, { w: 6, al: 0.42, c: 0x00ff77 }, { w: 2, al: 0.88, c: 0xaaffcc }]
          .forEach(({ w, al, c }) => {
            crackG.lineStyle(w, c, al);
            for (let k = 0; k < pts.length - 1; k++) crackG.lineBetween(pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y);
          });
        if (Math.random() < 0.55) {
          const bt = 0.45 + Math.random() * 0.3;
          const bx = this.x + Math.cos(a) * bt * len, by = this.y + Math.sin(a) * bt * len;
          const bAng = a + (Math.random() - 0.5) * 1.1;
          const bLen = len * 0.28;
          crackG.lineStyle(5, 0x00ff77, 0.28); crackG.lineBetween(bx, by, bx + Math.cos(bAng) * bLen, by + Math.sin(bAng) * bLen);
          crackG.lineStyle(1.5, 0xaaffcc, 0.62); crackG.lineBetween(bx, by, bx + Math.cos(bAng) * bLen, by + Math.sin(bAng) * bLen);
        }
      }
      this.scene.tweens.add({ targets: crackG, alpha: 0, duration: 350, delay: 950, onComplete: () => crackG.destroy() });
      this.scene.events.once('shutdown', () => { if (crackG.active) crackG.destroy(); });

      this._endAttack();
    });
  }

  _attackQuakeLine() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const lineLen = 400;
    const halfWidth = 100;
    const sx = this.x, sy = this.y;
    const ex = sx + Math.cos(angle) * lineLen;
    const ey = sy + Math.sin(angle) * lineLen;

    // Honest rectangle telegraph — shows full 200px width
    this._drawTelegraphRect(sx, sy, ex, ey, halfWidth, this._telegraphDuration, 0x00ff77);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      this.scene.cameras.main.shake(180, 0.0027);

      // Fissure crack visual — jagged main crack + branching fissures
      const g = this.scene.add.graphics();
      g.setDepth(6);

      const cos = Math.cos(angle), sin = Math.sin(angle);
      const px = Math.cos(angle + Math.PI / 2), py = Math.sin(angle + Math.PI / 2);

      // Main crack — 10-segment zigzag along the line
      const pts = [];
      const SEG = 10;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const jitter = (i === 0 || i === SEG) ? 0 : (Math.random() - 0.5) * 22;
        pts.push({ x: sx + cos * t * lineLen + px * jitter, y: sy + sin * t * lineLen + py * jitter });
      }

      // Glow layers for main crack
      [{ w: 24, a: 0.12, c: 0x00ff77 }, { w: 10, a: 0.45, c: 0x00ff77 }, { w: 2.5, a: 0.95, c: 0xaaffcc }]
        .forEach(({ w, a, c }) => {
          g.lineStyle(w, c, a);
          for (let i = 0; i < pts.length - 1; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        });

      // Branch fissures — 8 cracks spreading sideways off the main line
      for (let b = 0; b < 8; b++) {
        const t  = (b + 0.5) / 8;
        const bx = sx + cos * t * lineLen;
        const by = sy + sin * t * lineLen;
        const side  = b % 2 === 0 ? 1 : -1;
        const bLen  = 30 + Math.random() * 55;
        const bAng  = angle + side * (0.35 + Math.random() * 0.55);
        const bex   = bx + Math.cos(bAng) * bLen;
        const bey   = by + Math.sin(bAng) * bLen;

        g.lineStyle(7, 0x00ff77, 0.28); g.lineBetween(bx, by, bex, bey);
        g.lineStyle(2, 0xaaffcc, 0.75); g.lineBetween(bx, by, bex, bey);

        // Occasional secondary split off the branch
        if (Math.random() < 0.5) {
          const bLen2 = bLen * 0.5;
          const bAng2 = bAng + (Math.random() - 0.5) * 0.6;
          g.lineStyle(4, 0x00ff77, 0.18); g.lineBetween(bex, bey, bex + Math.cos(bAng2) * bLen2, bey + Math.sin(bAng2) * bLen2);
          g.lineStyle(1.5, 0xaaffcc, 0.55); g.lineBetween(bex, bey, bex + Math.cos(bAng2) * bLen2, bey + Math.sin(bAng2) * bLen2);
        }
      }

      // Linger then fade
      this.scene.tweens.add({ targets: g, alpha: 0, duration: 350, delay: 950, onComplete: () => g.destroy() });
      this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });

      // Hit detection — 200px wide (halfWidth = 100)
      const dx = ex - sx, dy = ey - sy;
      const lenSq = dx * dx + dy * dy;

      this.scene.obstacles?.forEach(obs => {
        if (obs.broken) return;
        const t2 = lenSq > 0
          ? Math.max(0, Math.min(1, ((obs.x - sx) * dx + (obs.y - sy) * dy) / lenSq))
          : 0;
        if (Phaser.Math.Distance.Between(obs.x, obs.y, sx + t2 * dx, sy + t2 * dy) < obs.baseRadius + halfWidth)
          obs.break();
      });

      if (p.alive && !p.invincible) {
        const t = lenSq > 0
          ? Math.max(0, Math.min(1, ((p.x - sx) * dx + (p.y - sy) * dy) / lenSq))
          : 0;
        const nearX = sx + t * dx, nearY = sy + t * dy;
        if (Phaser.Math.Distance.Between(p.x, p.y, nearX, nearY) < halfWidth)
          p.takeDamage(this.damage * 0.9);
      }
      this._endAttack();
    });
  }

  _attackTremorField() {
    const arena = this.scene.arena;
    if (!arena) { this._endAttack(); return; }
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const tdur = this._telegraphDuration * 1.4;
    const count = this.enraged ? 6 : 4;
    const zones = [];

    // Scatter zones within 320px of the player — all guaranteed on-screen.
    // Min distance 60px from player center so they're never spawned underfoot.
    const SCATTER_MAX = 320;
    const SCATTER_MIN = 60;

    for (let i = 0; i < count; i++) {
      let zx = p.x, zy = p.y;
      for (let tries = 0; tries < 30; tries++) {
        const a = Math.random() * Math.PI * 2;
        const d = SCATTER_MIN + Math.random() * (SCATTER_MAX - SCATTER_MIN);
        const tx = p.x + Math.cos(a) * d;
        const ty = p.y + Math.sin(a) * d;
        if (arena.containsPoint(tx, ty, 60)) { zx = tx; zy = ty; break; }
      }
      const r = Phaser.Math.Between(55, 90);
      this._drawTelegraphZone(zx, zy, r, tdur, 0x00ff77);
      zones.push({ x: zx, y: zy, r });
    }

    this.scene.time.delayedCall(tdur, () => {
      if (!this.alive) return;
      this.scene.cameras.main.shake(300, 0.0036);
      const p = this.scene.player;
      zones.forEach(z => {
        // Break obstacles inside this tremor zone
        this.scene.obstacles?.forEach(obs => {
          if (!obs.broken &&
              Phaser.Math.Distance.Between(obs.x, obs.y, z.x, z.y) < z.r + obs.baseRadius)
            obs.break();
        });

        if (p && p.alive && !p.invincible) {
          if (Phaser.Math.Distance.Between(p.x, p.y, z.x, z.y) < z.r + 16)
            p.takeDamage(this.damage * 0.7);
        }

        // Staggered seismic rings — 3 rings per zone, each thicker as it expands outward
        for (let ri = 0; ri < 3; ri++) {
          const ring = this.scene.add.graphics();
          ring.setDepth(7);
          this.scene.events.once('shutdown', () => { if (ring.active) ring.destroy(); });
          this.scene.time.delayedCall(ri * 120, () => {
            if (!this.alive && ring.active) { ring.destroy(); return; }
            this.scene.tweens.addCounter({
              from: 0, to: 1, duration: 380, ease: 'Quad.easeOut',
              onUpdate: (tw) => {
                const t = tw.getValue();
                ring.clear();
                ring.lineStyle(1.5 + t * 12.5, 0x00ff77, (1 - t) * 0.85);
                ring.strokeCircle(z.x, z.y, z.r * (0.15 + t * 0.85));
              },
              onComplete: () => { if (ring.active) ring.destroy(); },
            });
          });
        }
      });
      this._endAttack();
    });
  }

  _attackLeapSlam() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    // Telegraph at player's current position
    this._drawTelegraphZone(p.x, p.y, 100, this._telegraphDuration, 0x00ff77);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;

      // Capture positions at leap start — arc is committed here
      const startX = this.x, startY = this.y;
      const targetX = p.x, targetY = p.y;
      const ARC_HEIGHT = 200; // peak height above the midpoint

      // Parabolic arc leap — addCounter drives the position manually
      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: 420, ease: 'Sine.easeIn',
        onUpdate: (tw) => {
          const t = tw.getValue();
          this.x = startX + (targetX - startX) * t;
          this.y = startY + (targetY - startY) * t - ARC_HEIGHT * 4 * t * (1 - t);
          this.container.x = this.x;
          this.container.y = this.y;
        },
        onComplete: () => {
          const slamRadius = 120;
          this.scene.cameras.main.shake(350, 0.0054);
          this.scene.tweens.addCounter({
            from: 0, to: 20, duration: 150, yoyo: true,
            onUpdate: (tw) => this._redraw(tw.getValue()),
          });

          // Crater visual
          this._spawnCrater(this.x, this.y, slamRadius);

          // Break obstacles inside the slam radius
          this.scene.obstacles?.forEach(obs => {
            if (!obs.broken &&
                Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y) < slamRadius + obs.baseRadius)
              obs.break();
          });

          if (p.alive && !p.invincible) {
            if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < slamRadius)
              p.takeDamage(this.damage * 1.2);
          }
          this._endAttack();
        },
      });
    });
  }

  _spawnCrater(cx, cy, radius) {
    const g = this.scene.add.graphics();
    g.setDepth(6);
    g.setScale(0);

    // Outer ring — two glow layers + bright rim
    g.lineStyle(20, 0x00ff77, 0.18); g.strokeCircle(cx, cy, radius);
    g.lineStyle(9,  0x00ff77, 0.55); g.strokeCircle(cx, cy, radius);
    g.lineStyle(3,  0xaaffcc, 0.90); g.strokeCircle(cx, cy, radius);
    // Inner ring
    g.lineStyle(5,  0x00ff77, 0.35); g.strokeCircle(cx, cy, radius * 0.52);
    g.lineStyle(1.5,0xaaffcc, 0.60); g.strokeCircle(cx, cy, radius * 0.52);

    // Radial cracks from inner ring outward to crater edge
    for (let i = 0; i < 7; i++) {
      const a  = (i / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const r1 = radius * 0.45;
      const r2 = radius * (0.88 + Math.random() * 0.18);
      g.lineStyle(6,   0x00ff77, 0.30); g.lineBetween(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.lineStyle(1.5, 0xaaffcc, 0.72); g.lineBetween(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    }

    // Stamp open with slight overshoot, then linger and fade
    this.scene.tweens.add({ targets: g, scaleX: 1, scaleY: 1, duration: 90, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 400, delay: 900, onComplete: () => g.destroy() });

    // Debris chunks flying outward
    for (let i = 0; i < 9; i++) {
      const a    = (i / 9) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const frag = this.scene.add.graphics();
      frag.fillStyle(0x1a6b40, 1);
      const sz = 4 + Math.random() * 9;
      frag.fillRect(-sz / 2, -sz / 2, sz, sz);
      frag.x = cx + Math.cos(a) * radius * 0.25;
      frag.y = cy + Math.sin(a) * radius * 0.25;
      frag.setDepth(7);
      const dist = radius * (0.6 + Math.random() * 0.8);
      this.scene.tweens.add({
        targets: frag,
        x: cx + Math.cos(a) * (radius + dist),
        y: cy + Math.sin(a) * (radius + dist),
        alpha: 0, angle: Phaser.Math.Between(-200, 200),
        duration: 380 + Math.random() * 180, ease: 'Quad.easeOut',
        onComplete: () => frag.destroy(),
      });
      this.scene.events.once('shutdown', () => { if (frag.active) frag.destroy(); });
    }

    this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
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
