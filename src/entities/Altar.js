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
    this.label = this.scene.add.text(0, -52, 'Summon Boss', {
      fontFamily: "'Nunito', sans-serif",
      fontSize: '16px',
      color: '#ffcc88',
      stroke: '#442200',
      strokeThickness: 3,
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
      y: -58, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  _draw(phase) {
    this.g.clear();
    const glow = 0.3 + Math.sin(phase) * 0.2;

    // Base platform
    this.g.fillStyle(0x4a3010, 1);
    this.g.fillRoundedRect(-28, 8, 56, 18, 4);
    this.g.lineStyle(2, 0x8b5a00, 1);
    this.g.strokeRoundedRect(-28, 8, 56, 18, 4);

    // Glow halo
    this.g.fillStyle(COLORS.ALTAR, glow);
    this.g.fillCircle(0, 0, 38);

    // Main altar stone
    this.g.fillStyle(0x6b4a1f, 1);
    this.g.fillRoundedRect(-22, -20, 44, 30, 6);
    this.g.lineStyle(2, 0xaa7733, 1);
    this.g.strokeRoundedRect(-22, -20, 44, 30, 6);

    // Top slab
    this.g.fillStyle(0x8b6030, 1);
    this.g.fillRoundedRect(-24, -28, 48, 14, 4);
    this.g.lineStyle(2, 0xcc9944, 1);
    this.g.strokeRoundedRect(-24, -28, 48, 14, 4);

    // Rune symbols (simple cross + circle)
    this.g.lineStyle(2, COLORS.ALTAR, 0.6 + glow);
    this.g.strokeCircle(0, -12, 8);
    this.g.lineBetween(-8, -12, 8, -12);
    this.g.lineBetween(0, -20, 0, -4);

    // Flame particles (simple triangles)
    this.g.fillStyle(0xff8800, 0.7 + glow * 0.3);
    this.g.fillTriangle(-4, -28, 4, -28, 0, -42);
    this.g.fillStyle(0xffdd00, 0.5);
    this.g.fillTriangle(-2, -28, 2, -28, 0, -38);
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
