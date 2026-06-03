import Phaser from 'phaser';
import { COLORS } from '../config/gameConfig.js';

export default class Altar {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.onInteract = null;
    this._interacted = false;

    this._build();
  }

  _build() {
    this.container = this.scene.add.container(this.x, this.y);
    this.container.setDepth(5);

    this.g = this.scene.add.graphics();
    this._draw(0);
    this.container.add(this.g);

    // Floating label — upgraded to Fredoka One parchment
    this.label = this.scene.add.text(0, -58, 'Summon Boss', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '18px',
      color: '#ffe8c0',
      stroke: '#2a0000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.container.add(this.label);

    // Pulsing glow animation
    this.scene.tweens.addCounter({
      from: 0, to: Math.PI * 2, duration: 2000,
      repeat: -1,
      onUpdate: (tw) => {
        if (!this.g || !this.g.active) return;
        this._draw(tw.getValue());
      }
    });

    // Floating label bob
    this.scene.tweens.add({
      targets: this.label,
      y: -64, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _draw(phase) {
    this.g.clear();

    const glow    = 0.30 + Math.sin(phase) * 0.20;        // 0.10–0.50
    const flicker  = Math.sin(phase * 1.7) * 2;            // ±2px left flame sway
    const flicker2 = Math.sin(phase * 1.7 + 1.2) * 1.5;   // offset right flame

    // ── 1. Ground shadow ────────────────────────────────────────────────────
    this.g.fillStyle(0x000000, 0.35);
    this.g.fillEllipse(0, 22, 80, 16);

    // ── 2. Base step (bottom, widest) ───────────────────────────────────────
    this.g.fillStyle(0x2a1a08, 1);
    this.g.fillRoundedRect(-30, 14, 60, 14, 3);
    this.g.lineStyle(1.5, 0x5a3a14, 0.85);
    this.g.strokeRoundedRect(-30, 14, 60, 14, 3);
    // Top-edge highlight
    this.g.fillStyle(0x4a2a10, 0.60);
    this.g.fillRoundedRect(-29, 14, 58, 5, { tl: 3, tr: 3, bl: 0, br: 0 });

    // ── 3. Upper step (mid tier) ────────────────────────────────────────────
    this.g.fillStyle(0x3a2210, 1);
    this.g.fillRoundedRect(-24, 4, 48, 12, 3);
    this.g.lineStyle(1.5, 0x6b4020, 0.80);
    this.g.strokeRoundedRect(-24, 4, 48, 12, 3);
    this.g.fillStyle(0x5a3418, 0.55);
    this.g.fillRoundedRect(-23, 4, 46, 4, { tl: 3, tr: 3, bl: 0, br: 0 });

    // ── 4. Pulsing glow halo ────────────────────────────────────────────────
    this.g.fillStyle(COLORS.ALTAR, glow * 0.55);
    this.g.fillEllipse(0, -5, 72, 44);

    // ── 5. Main altar block ──────────────────────────────────────────────────
    // Dark stone body
    this.g.fillStyle(0x3d2610, 1);
    this.g.fillRoundedRect(-22, -18, 44, 24, 5);
    // Lighter top-face (2-tone depth illusion)
    this.g.fillStyle(0x5a3820, 0.70);
    this.g.fillRoundedRect(-22, -18, 44, 10, { tl: 5, tr: 5, bl: 0, br: 0 });
    // Carved horizontal groove lines
    this.g.lineStyle(1, 0x1a0a04, 0.55);
    this.g.lineBetween(-19, -8, 19, -8);
    this.g.lineBetween(-19, -2, 19, -2);
    // Gold trim on top edge
    this.g.lineStyle(2, 0xd4a96a, 0.75);
    this.g.lineBetween(-22, -18, 22, -18);
    // Stone border
    this.g.lineStyle(1.5, 0x7a4a20, 0.80);
    this.g.strokeRoundedRect(-22, -18, 44, 24, 5);

    // ── 6. Glowing rune — diamond motif ─────────────────────────────────────
    const rGlow = 0.55 + glow * 0.55;   // 0.55–1.05
    // Rotated diamond outline
    const dPts = [
      { x: 0, y: -15 }, { x: 10, y: -6 }, { x: 0, y: 3 }, { x: -10, y: -6 }
    ];
    this.g.lineStyle(1.5, COLORS.ALTAR, rGlow * 0.80);
    this.g.strokePoints(dPts, true);
    // Inner cross
    this.g.lineStyle(1, COLORS.ALTAR, rGlow);
    this.g.lineBetween(-7, -6, 7, -6);
    this.g.lineBetween(0, -14, 0, 2);
    // Center glow dot
    this.g.fillStyle(COLORS.ALTAR, Math.min(1, rGlow));
    this.g.fillCircle(0, -6, 2.5);

    // ── 7. Sacrificial slab (top — slightly overhangs block) ─────────────────
    this.g.fillStyle(0x4a2e14, 1);
    this.g.fillRoundedRect(-26, -26, 52, 10, 4);
    // Slab top highlight
    this.g.fillStyle(0x7a5028, 0.55);
    this.g.fillRoundedRect(-25, -26, 50, 4, { tl: 4, tr: 4, bl: 0, br: 0 });
    // Slab border with gold accent
    this.g.lineStyle(2, 0xd4a96a, 0.60);
    this.g.strokeRoundedRect(-26, -26, 52, 10, 4);

    // ── 8. Twin flame columns ────────────────────────────────────────────────
    [
      { bx: -8 + flicker,  baseY: -26 },
      { bx:  8 + flicker2, baseY: -26 },
    ].forEach(({ bx, baseY }) => {
      // Layer 1 — dark orange base (widest)
      this.g.fillStyle(0xcc4400, 0.65 + glow * 0.15);
      this.g.fillTriangle(bx - 5, baseY, bx + 5, baseY, bx, baseY - 14);
      // Layer 2 — orange mid
      this.g.fillStyle(0xff7700, 0.70 + glow * 0.10);
      this.g.fillTriangle(bx - 3.5, baseY, bx + 3.5, baseY, bx, baseY - 11);
      // Layer 3 — yellow upper
      this.g.fillStyle(0xffcc00, 0.60);
      this.g.fillTriangle(bx - 2, baseY - 2, bx + 2, baseY - 2, bx, baseY - 9);
      // Layer 4 — near-white hot core
      this.g.fillStyle(0xfff5c0, 0.45 + glow * 0.20);
      this.g.fillTriangle(bx - 1, baseY - 4, bx + 1, baseY - 4, bx, baseY - 7);
    });
  }

  interact() {
    if (this._interacted) return;
    this._interacted = true;
    if (this.onInteract) this.onInteract();
  }

  destroy() {
    if (!this.container) return;
    this.scene.tweens.add({
      targets: this.container, alpha: 0, duration: 300,
      onComplete: () => { this.container.destroy(true); this.container = null; }
    });
  }
}
