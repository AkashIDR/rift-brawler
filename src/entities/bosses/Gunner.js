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
   * projDiameter sets the long axis of the slit — matches the projectile width so
   * the player can read the incoming projectile size from the telegraph.
   * Returns the graphics object — caller manages lifetime via _closeRift().
   */
  _spawnRiftTelegraph(x, y, angle, duration, color = 0xaa44ff, projDiameter = 22) {
    const g = this.scene.add.graphics();
    g.x = x; g.y = y;
    g.angle = Phaser.Math.RadToDeg(angle) + 90; // perpendicular slit
    g.setDepth(6).setScale(0);

    // Height scales with width to keep an oval shape (never circular)
    const w = projDiameter;
    const h = Math.max(8, Math.round(w * 0.22));

    g.fillStyle(color, 0.20); g.fillEllipse(0, 0, w + 24, h + 10);
    g.fillStyle(color, 0.50); g.fillEllipse(0, 0, w + 10, h + 5);
    g.fillStyle(0xffffff, 0.90); g.fillEllipse(0, 0, w, h);
    g.lineStyle(1, 0xffffff, 0.70); g.strokeEllipse(0, 0, w, h);

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

    const TEL_MS = 700; // fixed telegraph duration for this attack
    let angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    let rp    = this._riftPos(angle);
    const rift = this._spawnRiftTelegraph(rp.x, rp.y, angle, TEL_MS, this.accentColor, 100);

    // Track player — rift follows the player's direction in real time
    const track = () => {
      if (!p.alive || !rift.active) return;
      angle  = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      rp     = this._riftPos(angle);
      rift.x = rp.x; rift.y = rp.y;
      rift.angle = Phaser.Math.RadToDeg(angle) + 90;
    };
    this.scene.events.on('update', track);
    this.scene.events.once('shutdown', () => this.scene.events.off('update', track));

    this.scene.time.delayedCall(TEL_MS, () => {
      this.scene.events.off('update', track);
      this._closeRift(rift, () => {
        if (!this.alive) return;
        this._spawnProjectile(angle, 500, 0xffcc00, 50, this.damage, false, 500, rp.x, rp.y);
        this._endAttack();
      });
    });
  }

  _attackSpreadBurst() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const OFFSETS = [-0.35, 0, 0.35];
    let baseA = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);

    // Open all 3 rifts simultaneously at initial positions
    const rifts = OFFSETS.map(off => {
      const a = baseA + off;
      const rp = this._riftPos(a);
      return { g: this._spawnRiftTelegraph(rp.x, rp.y, a, this._telegraphDuration, this.accentColor, 50), off };
    });

    // Track player — all 3 rifts follow the base angle each frame
    const track = () => {
      if (!p.alive) return;
      baseA = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      rifts.forEach(({ g, off }) => {
        if (!g.active) return;
        const a = baseA + off;
        const rp = this._riftPos(a);
        g.x = rp.x; g.y = rp.y;
        g.angle = Phaser.Math.RadToDeg(a) + 90;
      });
    };
    this.scene.events.on('update', track);
    this.scene.events.once('shutdown', () => this.scene.events.off('update', track));

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      this.scene.events.off('update', track);
      if (!this.alive) { rifts.forEach(({ g }) => { if (g.active) g.destroy(); }); return; }

      // Lock final angles and fire all 3 simultaneously
      const finalAngles = rifts.map(({ off }) => ({ a: baseA + off, rp: this._riftPos(baseA + off) }));
      let closed = 0;
      rifts.forEach(({ g }, i) => {
        const { a, rp } = finalAngles[i];
        this._closeRift(g, () => {
          this._spawnProjectile(a, 400, 0xffcc00, 25, this.damage * 0.8, false, 500, rp.x, rp.y);
          if (++closed === rifts.length) this._endAttack();
        });
      });
    });
  }

  _attackFullRotation() {
    // 8 fixed directions — tracking doesn't apply to omnidirectional attacks
    const rifts = Array.from({ length: 8 }, (_, i) => {
      const a  = (i / 8) * Math.PI * 2;
      const rp = this._riftPos(a);
      return { g: this._spawnRiftTelegraph(rp.x, rp.y, a, this._telegraphDuration, 0xff44ff, 35), a, rp };
    });

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) { rifts.forEach(({ g }) => { if (g.active) g.destroy(); }); return; }
      let closed = 0;
      rifts.forEach(({ g, a, rp }) => {
        this._closeRift(g, () => {
          this._spawnProjectile(a, 400, 0xff44ff, 18, this.damage * 0.8, false, 500, rp.x, rp.y);
          if (++closed === rifts.length) this._endAttack();
        });
      });
    });
  }

  _attackBarrage() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    // Open rift at initial player direction
    let angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    let rp    = this._riftPos(angle);
    const rift = this._spawnRiftTelegraph(rp.x, rp.y, angle, 99999, 0xff88ff, 70);

    const maxShots = this.enraged ? 6 : 4;
    let shots = 0;

    const aimAndFire = () => {
      if (!this.alive || !p.alive || shots >= maxShots) {
        this._closeRift(rift, () => this._endAttack());
        return;
      }

      // Smoothly tween rift to new player direction before firing
      const newAngle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      const newRp    = this._riftPos(newAngle);

      this.scene.tweens.killTweensOf(rift);
      this.scene.tweens.add({
        targets: rift,
        x: newRp.x, y: newRp.y,
        angle: Phaser.Math.RadToDeg(newAngle) + 90,
        duration: 150, ease: 'Quad.easeOut',
        onComplete: () => {
          angle = newAngle; rp = newRp;

          // Flash pulse on fire
          this.scene.tweens.add({
            targets: rift, alpha: { from: 1, to: 0.3 },
            duration: 60, yoyo: true, ease: 'Quad.easeOut',
          });

          this._spawnProjectile(angle, 440, 0xff88ff, 35, this.damage * 0.6, false, 520, rp.x, rp.y);
          shots++;
          this.scene.time.delayedCall(280, aimAndFire);
        },
      });
    };

    // Brief pause after rift opens, then begin tracking + firing
    this.scene.time.delayedCall(400, aimAndFire);
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
