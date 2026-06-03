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

    // Floating label
    this.label = this.scene.add.text(0, -72, 'Summon Boss', {
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
      y: -78, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _draw(phase) {
    this.g.clear();

    // ── Animation values ─────────────────────────────────────────────────────
    const glow  = 0.30 + Math.sin(phase) * 0.20;

    // Flame height flickers vertically — the key to realistic fire
    const h1 = 18 + Math.sin(phase * 2.6) * 6;          // 12–24px
    const h2 = 17 + Math.sin(phase * 2.6 + 1.2) * 5;    // 12–22px
    const w1 =  5 + Math.sin(phase * 4.1) * 1.0;         // 4–6px base half-width
    const w2 =  5 + Math.sin(phase * 4.1 + 0.7) * 0.8;
    const s1 = Math.sin(phase * 1.9) * 1.5;              // subtle sway ±1.5px
    const s2 = Math.sin(phase * 1.9 + 0.9) * 1.2;
    const rGlow = 0.55 + glow * 0.55;

    // ── Stone palette ────────────────────────────────────────────────────────
    const STONE_DARK  = 0x3c3835;
    const STONE_MID   = 0x5a5450;
    const STONE_LIGHT = 0x7a7068;
    const STONE_EDGE  = 0x252220;

    // ── 1. Ground shadow ─────────────────────────────────────────────────────
    this.g.fillStyle(0x000000, 0.35);
    this.g.fillEllipse(0, 26, 130, 22);

    // ── 2. Front steps (3 tiers) ─────────────────────────────────────────────
    // Step 1 — bottom / widest
    this.g.fillStyle(STONE_DARK, 1);
    this.g.fillRoundedRect(-38, 22, 76, 11, 3);
    this.g.lineStyle(1, STONE_EDGE, 0.80);
    this.g.strokeRoundedRect(-38, 22, 76, 11, 3);
    this.g.fillStyle(STONE_MID, 0.50);
    this.g.fillRoundedRect(-37, 22, 74, 4, { tl: 3, tr: 3, bl: 0, br: 0 });

    // Step 2
    this.g.fillStyle(STONE_DARK, 1);
    this.g.fillRoundedRect(-30, 13, 60, 11, 3);
    this.g.lineStyle(1, STONE_EDGE, 0.80);
    this.g.strokeRoundedRect(-30, 13, 60, 11, 3);
    this.g.fillStyle(STONE_MID, 0.50);
    this.g.fillRoundedRect(-29, 13, 58, 4, { tl: 3, tr: 3, bl: 0, br: 0 });

    // Step 3 — top / narrowest
    this.g.fillStyle(STONE_DARK, 1);
    this.g.fillRoundedRect(-22, 4, 44, 11, 3);
    this.g.lineStyle(1, STONE_EDGE, 0.80);
    this.g.strokeRoundedRect(-22, 4, 44, 11, 3);
    this.g.fillStyle(STONE_MID, 0.50);
    this.g.fillRoundedRect(-21, 4, 42, 4, { tl: 3, tr: 3, bl: 0, br: 0 });

    // ── 3. Wide stone platform (oval base) ───────────────────────────────────
    this.g.fillStyle(STONE_DARK, 1);
    this.g.fillEllipse(0, 2, 106, 40);
    this.g.fillStyle(STONE_MID, 0.45);
    this.g.fillEllipse(0, 0, 104, 30);
    this.g.lineStyle(1, STONE_EDGE, 0.45);
    this.g.strokeEllipse(0, 2, 90, 32);
    this.g.lineStyle(2, STONE_EDGE, 0.85);
    this.g.strokeEllipse(0, 2, 106, 40);

    // ── 4. Standing stone pillars (left + right) ──────────────────────────────
    [{ px: -46 }, { px: 30 }].forEach(({ px }) => {
      const pw = 18, ph = 52;

      // Drop shadow
      this.g.fillStyle(0x000000, 0.30);
      this.g.fillRoundedRect(px + 2, -38, pw, ph, 3);

      // Pillar body
      this.g.fillStyle(STONE_DARK, 1);
      this.g.fillRoundedRect(px, -40, pw, ph, 3);

      // Lit centre strip (front face)
      this.g.fillStyle(STONE_MID, 0.35);
      this.g.fillRoundedRect(px + 3, -40, pw - 6, ph, 2);

      // Carved groove bands
      this.g.lineStyle(1, STONE_EDGE, 0.50);
      this.g.lineBetween(px + 2, -20, px + pw - 2, -20);
      this.g.lineBetween(px + 2,  -4, px + pw - 2,  -4);

      // Top cap (brighter top face)
      this.g.fillStyle(STONE_LIGHT, 1);
      this.g.fillRoundedRect(px - 1, -40, pw + 2, 9, { tl: 4, tr: 4, bl: 0, br: 0 });
      this.g.lineStyle(1.5, STONE_EDGE, 0.70);
      this.g.strokeRoundedRect(px - 1, -40, pw + 2, 9, { tl: 4, tr: 4, bl: 0, br: 0 });

      // Pillar border
      this.g.lineStyle(1.5, STONE_EDGE, 0.70);
      this.g.strokeRoundedRect(px, -40, pw, ph, 3);
    });

    // ── 5. Lintel / gateway crossbeam ─────────────────────────────────────────
    this.g.fillStyle(STONE_DARK, 1);
    this.g.fillRoundedRect(-48, -50, 100, 13, 3);
    this.g.fillStyle(STONE_LIGHT, 1);
    this.g.fillRoundedRect(-48, -50, 100, 7, { tl: 3, tr: 3, bl: 0, br: 0 });
    this.g.lineStyle(1.5, STONE_EDGE, 0.75);
    this.g.strokeRoundedRect(-48, -50, 100, 13, 3);

    // ── 6. Glow halo ─────────────────────────────────────────────────────────
    this.g.fillStyle(COLORS.ALTAR, glow * 0.45);
    this.g.fillEllipse(0, -2, 64, 30);

    // ── 7. Central raised dais ────────────────────────────────────────────────
    this.g.fillStyle(0x302c2a, 1);
    this.g.fillEllipse(0, -2, 50, 24);
    this.g.fillStyle(0x504844, 0.65);
    this.g.fillEllipse(0, -4, 46, 20);
    this.g.lineStyle(1.5, STONE_EDGE, 0.80);
    this.g.strokeEllipse(0, -2, 50, 24);

    // ── 8. Summoning rune ─────────────────────────────────────────────────────
    this.g.lineStyle(1.5, COLORS.ALTAR, rGlow * 0.55);
    this.g.strokeEllipse(0, -4, 38, 16);
    this.g.lineStyle(1, COLORS.ALTAR, rGlow * 0.70);
    this.g.lineBetween(-16, -4, 16, -4);
    this.g.lineBetween(0, -12, 0, 4);
    this.g.fillStyle(COLORS.ALTAR, Math.min(1, rGlow));
    this.g.fillCircle(0, -4, 3);

    // ── 9. Twin flames (height-flickering) ────────────────────────────────────
    const daisTop = -13;
    [
      { bx: -10, h: h1, w: w1, sw: s1 },
      { bx:  10, h: h2, w: w2, sw: s2 },
    ].forEach(({ bx, h, w, sw }) => {
      const tip = daisTop - h;

      // Dark orange base (widest)
      this.g.fillStyle(0xcc4400, 0.70 + glow * 0.10);
      this.g.fillTriangle(bx - w, daisTop, bx + w, daisTop, bx + sw, tip);

      // Orange mid
      this.g.fillStyle(0xff7700, 0.75);
      this.g.fillTriangle(bx - w*0.7, daisTop, bx + w*0.7, daisTop, bx + sw*0.6, tip + h*0.2);

      // Yellow upper
      this.g.fillStyle(0xffcc00, 0.65);
      this.g.fillTriangle(bx - w*0.4, daisTop, bx + w*0.4, daisTop, bx + sw*0.3, tip + h*0.4);

      // Near-white hot core
      this.g.fillStyle(0xfff5c0, 0.50 + glow * 0.20);
      this.g.fillTriangle(bx - w*0.2, daisTop - h*0.15, bx + w*0.2, daisTop - h*0.15, bx + sw*0.1, tip + h*0.55);
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
