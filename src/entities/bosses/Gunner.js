import Phaser from 'phaser';
import BossBase from './BossBase.js';
import { BOSS_CONFIGS } from '../../config/bossConfig.js';

export default class Gunner extends BossBase {
  constructor(scene, x, y, level) {
    super(scene, x, y, BOSS_CONFIGS.gunner, level);
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

  // ─── Rift telegraph helpers ──────────────────────────────────────────────────

  /** World position just beyond the boss outline in the given direction. */
  _riftPos(angle) {
    const r = this.size + 18;
    return { x: this.x + Math.cos(angle) * r, y: this.y + Math.sin(angle) * r };
  }

  /**
   * Open a rift tear at world position (x, y), oriented perpendicular to angle.
   * Returns the graphics object — caller must call _closeRift() when done.
   */
  _spawnRiftTelegraph(x, y, angle, duration, color = 0xaa44ff) {
    const g = this.scene.add.graphics();
    g.x = x; g.y = y;
    g.angle = Phaser.Math.RadToDeg(angle) + 90; // perpendicular slit
    g.setDepth(6).setScale(0);

    // Stacked ellipses drawn once; scale tween animates open/close
    g.fillStyle(color, 0.20); g.fillEllipse(0, 0, 56, 16);
    g.fillStyle(color, 0.50); g.fillEllipse(0, 0, 38, 10);
    g.fillStyle(0xffffff, 0.90); g.fillEllipse(0, 0, 22, 5);
    g.lineStyle(1, 0xffffff, 0.70); g.strokeEllipse(0, 0, 22, 5);

    // Snap open
    this.scene.tweens.add({
      targets: g, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut',
    });
    // Waiting pulse
    this.scene.tweens.add({
      targets: g, alpha: { from: 0.75, to: 1.0 },
      duration: 160, yoyo: true, repeat: Math.ceil(duration / 320),
      delay: 200, ease: 'Sine.easeInOut',
    });

    this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    return g;
  }

  /** Snap a rift closed, destroy it, then call onClosed. */
  _closeRift(g, onClosed) {
    if (!g || !g.active) { onClosed?.(); return; }
    this.scene.tweens.killTweensOf(g);
    this.scene.tweens.add({
      targets: g, scaleX: 0, scaleY: 0, duration: 80, ease: 'Quad.easeIn',
      onComplete: () => { if (g.active) g.destroy(); onClosed?.(); },
    });
  }

  // ─── Attacks ─────────────────────────────────────────────────────────────────

  _attackAimedShot() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    // Capture angle and rift position at telegraph time (honest telegraph)
    const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const rp    = this._riftPos(angle);
    const rift  = this._spawnRiftTelegraph(rp.x, rp.y, angle, this._telegraphDuration, this.accentColor);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      this._closeRift(rift, () => {
        if (!this.alive) return;
        this._spawnProjectile(angle, 480, 0xffcc00, 10, this.damage, false, 560, rp.x, rp.y);
        this._endAttack();
      });
    });
  }

  _attackSpreadBurst() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const baseA   = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const offsets = [-0.35, 0, 0.35];

    // Open all 3 rifts simultaneously
    const rifts = offsets.map(off => {
      const a  = baseA + off;
      const rp = this._riftPos(a);
      return { rift: this._spawnRiftTelegraph(rp.x, rp.y, a, this._telegraphDuration, this.accentColor), a, rp };
    });

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) { rifts.forEach(r => { if (r.rift.active) r.rift.destroy(); }); return; }
      // Close all 3 and fire simultaneously
      let closed = 0;
      rifts.forEach(({ rift, a, rp }) => {
        this._closeRift(rift, () => {
          this._spawnProjectile(a, 360, 0xffcc00, 9, this.damage * 0.75, false, 440, rp.x, rp.y);
          if (++closed === rifts.length) this._endAttack();
        });
      });
    });
  }

  _attackFullRotation() {
    // Open 8 rifts simultaneously in evenly-spaced directions
    const rifts = Array.from({ length: 8 }, (_, i) => {
      const a  = (i / 8) * Math.PI * 2;
      const rp = this._riftPos(a);
      return { rift: this._spawnRiftTelegraph(rp.x, rp.y, a, this._telegraphDuration, 0xff44ff), a, rp };
    });

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) { rifts.forEach(r => { if (r.rift.active) r.rift.destroy(); }); return; }
      let closed = 0;
      rifts.forEach(({ rift, a, rp }) => {
        this._closeRift(rift, () => {
          this._spawnProjectile(a, 300, 0xff44ff, 8, this.damage * 0.65, false, 400, rp.x, rp.y);
          if (++closed === rifts.length) this._endAttack();
        });
      });
    });
  }

  _attackBarrage() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    // Rift opens toward player's current position and stays open for all shots
    const initAngle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const rp        = this._riftPos(initAngle);
    const rift      = this._spawnRiftTelegraph(rp.x, rp.y, initAngle, 99999, 0xff88ff);

    const maxShots = this.enraged ? 6 : 4;
    let   shots    = 0;

    const fireShot = () => {
      if (!this.alive || !p.alive || shots >= maxShots) {
        // Last shot done — close the rift and end
        this._closeRift(rift, () => this._endAttack());
        return;
      }

      // Pulse the rift on each shot
      this.scene.tweens.add({
        targets: rift, alpha: { from: 1, to: 0.35 },
        duration: 60, yoyo: true, ease: 'Quad.easeOut',
      });

      // Each shot re-aims at player's current position, fires from the fixed rift
      const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      this._spawnProjectile(angle, 440, 0xff88ff, 10, this.damage, false, 520, rp.x, rp.y);
      shots++;
      this.scene.time.delayedCall(280, fireShot);
    };

    // Brief pause after rift opens before first shot
    this.scene.time.delayedCall(400, fireShot);
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
