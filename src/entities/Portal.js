import Phaser from 'phaser';
import { COLORS } from '../config/gameConfig.js';
import { FONT, LETTER_SPACING } from '../ui/StoneStyle.js';

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
    this.container.setDepth(1000);
    this.container.setAlpha(0);

    // Bake portal background: tight outer glow + connected void-to-rim gradient (once per session)
    const PORTAL_BG_KEY = 'fx-portal-bg-v2';
    if (!this.scene.textures.exists(PORTAL_BG_KEY)) {
      // Outer glow uses radius RW*1.5=63 in local space; vertical extent = 63*(RH/RW)=105px
      const CW = 150, CH = 240;
      const canvas = document.createElement('canvas');
      canvas.width = CW; canvas.height = CH;
      const ctx = canvas.getContext('2d');
      const cx = CW / 2, cy = CH / 2;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, RH / RW); // squash circles into portal oval aspect (×1.667 tall)

      // Single unified gradient: void → rim → glow halo — no gap possible between two gradients
      // Radius stops in units of RW (portal half-width):
      //   0.71 → RW*0.994 ≈ RW  bright rim at the exact portal edge
      //   0.79 → RW*1.106        glow peak just outside portal
      const unified = ctx.createRadialGradient(-RW * 0.08, -RW * 0.08, 0, 0, 0, RW * 1.4);
      unified.addColorStop(0.00, 'rgba(2,0,10,1.00)');
      unified.addColorStop(0.50, 'rgba(5,0,22,1.00)');
      unified.addColorStop(0.63, 'rgba(18,0,60,0.98)');
      unified.addColorStop(0.71, 'rgba(140,0,255,0.95)');
      unified.addColorStop(0.79, 'rgba(200,80,255,0.60)');
      unified.addColorStop(0.90, 'rgba(130,15,220,0.22)');
      unified.addColorStop(1.00, 'rgba(70,0,160,0.00)');
      ctx.fillStyle = unified;
      ctx.beginPath(); ctx.arc(0, 0, RW * 1.4, 0, Math.PI * 2); ctx.fill();

      ctx.restore();
      this.scene.textures.addCanvas(PORTAL_BG_KEY, canvas);
    }

    this._bgImg = this.scene.add.image(0, 0, PORTAL_BG_KEY).setOrigin(0.5, 0.5);
    this.container.add(this._bgImg); // behind this.g

    this.g = this.scene.add.graphics();
    this.container.add(this.g);

    // Label
    this.label = this.scene.add.text(0, -RH - 22, 'Enter Portal', {
      fontFamily: FONT,
      fontSize: '19px',
      letterSpacing: LETTER_SPACING,
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

    // Pulse the baked background gently
    this._bgImg.alpha = 0.85 + pulse * 0.15;

    // 5 rings continuously travelling from border inward → fade + shrink as they go
    const t = ph / (Math.PI * 2); // 0→1 over 1800ms
    const RING_COUNT = 5;
    for (let r = 0; r < RING_COUNT; r++) {
      const ringT = (t + r / RING_COUNT) % 1; // 0=at border, 1=at center
      const scale = 1 - ringT;
      const alpha = Math.pow(1 - ringT, 1.4) * 0.82;
      this.g.lineStyle(1.5, 0xcc66ff, alpha);
      this.g.strokeEllipse(0, 0, RW * 2 * scale, RH * 2 * scale);
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
