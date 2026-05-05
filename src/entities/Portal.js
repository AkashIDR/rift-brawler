import Phaser from 'phaser';
import { COLORS } from '../config/gameConfig.js';

// Half-dimensions of the portal oval
const RW = 42;   // half-width
const RH = 70;   // half-height (vertical oval, ~1.67 ratio)

export default class Portal {
  constructor(scene, x, y) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.onEnter = null;
    this._entered = false;
    this.enterRadius = 34; // proximity threshold to walk through

    this._build();
  }

  _build() {
    this.container = this.scene.add.container(this.x, this.y);
    this.container.setDepth(5);
    this.container.setAlpha(0);

    this.g = this.scene.add.graphics();
    this.container.add(this.g);

    // Label
    this.label = this.scene.add.text(0, -RH - 22, 'Enter Portal', {
      fontFamily: "'Nunito', sans-serif",
      fontSize: '16px',
      color: '#cc88ff',
      stroke: '#220044',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);
    this.container.add(this.label);

    // Appear animation
    this.scene.tweens.add({
      targets: this.container, alpha: 1, duration: 700, ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({ targets: this.label, alpha: 1, duration: 400 });
      }
    });

    // Pulsing swirl
    this._phase = 0;
    this.scene.tweens.addCounter({
      from: 0, to: Math.PI * 2, duration: 1800,
      repeat: -1,
      onUpdate: (tw) => {
        if (!this.g || !this.g.active) return;
        this._phase = tw.getValue();
        this._draw();
      }
    });

    // Label float
    this.scene.tweens.add({
      targets: this.label, y: -RH - 28, duration: 1000,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _draw() {
    this.g.clear();
    const ph = this._phase;
    const pulse = 0.5 + Math.sin(ph) * 0.2;

    // Outer glow ellipse
    this.g.fillStyle(COLORS.PORTAL, pulse * 0.18);
    this.g.fillEllipse(0, 0, RW * 3.0, RH * 2.6);

    // Second glow layer
    this.g.fillStyle(0xcc66ff, pulse * 0.12);
    this.g.fillEllipse(0, 0, RW * 2.2, RH * 1.9);

    // Main portal frame ring
    this.g.lineStyle(6, COLORS.PORTAL, 0.75 + pulse * 0.25);
    this.g.strokeEllipse(0, 0, RW * 2, RH * 2);

    // Bright inner accent ring
    this.g.lineStyle(2, 0xee99ff, 0.5 + pulse * 0.3);
    this.g.strokeEllipse(0, 0, RW * 1.6, RH * 1.6);

    // Swirling inner ovals (rotating offset)
    for (let r = 0; r < 3; r++) {
      const scale = 0.88 - r * 0.18;
      const alpha = 0.35 + r * 0.15;
      const offset = ph + r * (Math.PI * 2 / 3);
      const cx = Math.cos(offset) * 6;
      const cy = Math.sin(offset) * 4;
      this.g.lineStyle(1.5, 0xdd88ff, alpha);
      this.g.strokeEllipse(cx, cy, RW * 2 * scale, RH * 2 * scale);
    }

    // Center void
    this.g.fillStyle(0x04000e, 1);
    this.g.fillEllipse(0, 0, RW * 0.85, RH * 0.85);

    // Star glints along oval edge
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + ph * 1.4;
      // Parametric oval point
      const sx = Math.cos(a) * RW;
      const sy = Math.sin(a) * RH;
      const brightness = 0.5 + Math.sin(ph * 2 + i) * 0.5;
      this.g.fillStyle(0xffffff, brightness);
      this.g.fillCircle(sx, sy, 2.5);
    }
  }

  enter() {
    if (this._entered) return;
    this._entered = true;
    if (this.onEnter) this.onEnter();
  }

  destroy() {
    if (!this.container) return;
    this.scene.tweens.add({
      targets: this.container, alpha: 0, scaleX: 0, scaleY: 0,
      duration: 300, ease: 'Quad.easeIn',
      onComplete: () => { this.container.destroy(true); this.container = null; }
    });
  }
}
