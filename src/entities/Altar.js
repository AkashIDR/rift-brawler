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

    this.label = this.scene.add.text(0, -67, 'Summon Boss', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '18px',
      color: '#ffe8c0',
      stroke: '#2a0000',
      strokeThickness: 4,
    }).setOrigin(0.5);
    this.container.add(this.label);

    this.scene.tweens.addCounter({
      from: 0, to: Math.PI * 2, duration: 2000,
      repeat: -1,
      onUpdate: (tw) => {
        if (!this.g || !this.g.active) return;
        this._draw(tw.getValue());
      }
    });

    this.scene.tweens.add({
      targets: this.label,
      y: -73, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _draw(phase) {
    this.g.clear();

    const glow  = 0.30 + Math.sin(phase) * 0.20;

    const h1 = 15 + Math.sin(phase*2.6)*4.5 + Math.sin(phase*5.3)*3.0 + Math.sin(phase*8.7)*1.5;
    const h2 = 15 + Math.sin(phase*2.6+1.2)*4.0 + Math.sin(phase*4.9+0.6)*2.8 + Math.sin(phase*7.9+2.1)*1.5;
    const w1 =  5 + Math.sin(phase*4.1)*1.2 + Math.sin(phase*7.3)*0.7;
    const w2 =  5 + Math.sin(phase*4.1+0.7)*1.0 + Math.sin(phase*6.9+1.1)*0.6;
    const s1 = Math.sin(phase*1.9)*1.2 + Math.sin(phase*4.3)*0.6;
    const s2 = Math.sin(phase*1.9+0.9)*1.0 + Math.sin(phase*3.8+0.4)*0.5;
    const rGlow = 0.55 + glow * 0.55;

    const STONE_DARK  = 0x3c3835;
    const STONE_MID   = 0x5a5450;
    const STONE_LIGHT = 0x7a7068;
    const STONE_EDGE  = 0x252220;

    // ── 1. Ground shadow ─────────────────────────────────────────────────────
    this.g.fillStyle(0x000000, 0.35);
    this.g.fillEllipse(0, 26, 130, 22);

    // ── 2. Front steps ───────────────────────────────────────────────────────
    [
      { x: -38, y: 22, w: 76 },
      { x: -30, y: 13, w: 60 },
      { x: -22, y:  4, w: 44 },
    ].forEach(({ x, y, w }) => {
      this.g.fillStyle(STONE_DARK, 1);
      this.g.fillRoundedRect(x, y, w, 11, 3);
      this.g.lineStyle(1, STONE_EDGE, 0.80);
      this.g.strokeRoundedRect(x, y, w, 11, 3);
      this.g.fillStyle(STONE_MID, 0.50);
      this.g.fillRoundedRect(x + 1, y, w - 2, 4, { tl: 3, tr: 3, bl: 0, br: 0 });
    });

    // ── 3. Platform oval ─────────────────────────────────────────────────────
    this.g.fillStyle(STONE_DARK, 1);
    this.g.fillEllipse(0, 2, 106, 40);
    this.g.fillStyle(STONE_MID, 0.45);
    this.g.fillEllipse(0, 0, 104, 30);
    this.g.lineStyle(1, STONE_EDGE, 0.45);
    this.g.strokeEllipse(0, 2, 90, 32);
    this.g.lineStyle(2, STONE_EDGE, 0.85);
    this.g.strokeEllipse(0, 2, 106, 40);

    // ── 4. Glow halo ─────────────────────────────────────────────────────────
    this.g.fillStyle(COLORS.ALTAR, glow * 0.45);
    this.g.fillEllipse(0, -2, 64, 30);

    // ── 5. Central raised dais + rune ────────────────────────────────────────
    this.g.fillStyle(0x302c2a, 1);
    this.g.fillEllipse(0, -2, 50, 24);
    this.g.fillStyle(0x504844, 0.65);
    this.g.fillEllipse(0, -4, 46, 20);
    this.g.lineStyle(1.5, STONE_EDGE, 0.80);
    this.g.strokeEllipse(0, -2, 50, 24);

    this.g.lineStyle(1.5, COLORS.ALTAR, rGlow * 0.55);
    this.g.strokeEllipse(0, -4, 38, 16);
    this.g.lineStyle(1, COLORS.ALTAR, rGlow * 0.70);
    this.g.lineBetween(-16, -4, 16, -4);
    this.g.lineBetween(0, -12, 0, 4);
    this.g.fillStyle(COLORS.ALTAR, Math.min(1, rGlow));
    this.g.fillCircle(0, -4, 3);

    // ── 6. Pillars — drawn AFTER platform, midpoint between top and center ───
    //   py_top=-43, ph=44 → center at y=-21, bottom at y=1 (inside disc y=-18..22)
    const py_top = -43, pw = 18, ph = 44;

    [{ px: -46 }, { px: 30 }].forEach(({ px }) => {
      // Drop shadow
      this.g.fillStyle(0x000000, 0.28);
      this.g.fillRoundedRect(px + 2, py_top + 2, pw, ph, 3);

      // Pillar body
      this.g.fillStyle(STONE_DARK, 1);
      this.g.fillRoundedRect(px, py_top, pw, ph, 3);

      // Lit centre strip
      this.g.fillStyle(STONE_MID, 0.35);
      this.g.fillRoundedRect(px + 3, py_top, pw - 6, ph, 2);

      // Carved groove
      this.g.lineStyle(1, STONE_EDGE, 0.50);
      this.g.lineBetween(px + 2, -26, px + pw - 2, -26);
      this.g.lineBetween(px + 2, -12, px + pw - 2, -12);

      // Top cap
      this.g.fillStyle(STONE_LIGHT, 1);
      this.g.fillRoundedRect(px - 1, py_top, pw + 2, 9, { tl: 4, tr: 4, bl: 0, br: 0 });
      this.g.lineStyle(1.5, STONE_EDGE, 0.70);
      this.g.strokeRoundedRect(px - 1, py_top, pw + 2, 9, { tl: 4, tr: 4, bl: 0, br: 0 });

      // Pillar border
      this.g.lineStyle(1.5, STONE_EDGE, 0.70);
      this.g.strokeRoundedRect(px, py_top, pw, ph, 3);
    });

    // ── 7. Oval lintel slab — caps pillar tops at y=-38 ──────────────────────
    this.g.fillStyle(STONE_DARK, 1);
    this.g.fillEllipse(0, -40, 112, 20);
    this.g.fillStyle(STONE_MID, 1);
    this.g.fillEllipse(0, -43, 110, 16);
    this.g.fillStyle(STONE_LIGHT, 0.65);
    this.g.fillEllipse(0, -44, 100, 10);
    this.g.lineStyle(2, STONE_EDGE, 0.85);
    this.g.strokeEllipse(0, -40, 112, 20);
    this.g.lineStyle(1, STONE_EDGE, 0.55);
    this.g.strokeEllipse(0, -43, 110, 16);

    // ── 8. Twin flames — centred on disc ─────────────────────────────────────
    const daisTop = -6;
    [
      { bx: -7, h: h1, w: w1, sw: s1 },
      { bx:  7, h: h2, w: w2, sw: s2 },
    ].forEach(({ bx, h, w, sw }) => {
      const tip = daisTop - h;
      this.g.fillStyle(0xcc4400, 0.70 + glow * 0.10);
      this.g.fillTriangle(bx - w, daisTop, bx + w, daisTop, bx + sw, tip);
      this.g.fillStyle(0xff7700, 0.75);
      this.g.fillTriangle(bx - w*0.7, daisTop, bx + w*0.7, daisTop, bx + sw*0.6, tip + h*0.2);
      this.g.fillStyle(0xffcc00, 0.65);
      this.g.fillTriangle(bx - w*0.4, daisTop, bx + w*0.4, daisTop, bx + sw*0.3, tip + h*0.4);
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
