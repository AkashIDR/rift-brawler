import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // ── Charger boss ─────────────────────────────────────────────────────────
    // Real PNG assets go in:  public/assets/bosses/charger/<key>.png
    // Load them here with this.load.image(key, path) BEFORE the placeholder
    // generator runs. Any key already present is skipped by the generator.
    //
    // this.load.image('charger_side_idle_0', 'assets/bosses/charger/charger_side_idle_0.png');
    // ... etc.

    this._generateChargerPlaceholders();
  }

  /**
   * Generates 256×256 canvas textures for every Charger animation key that
   * has not already been loaded as a real PNG. This lets the game run
   * immediately with coloured placeholder sprites so the code path can be
   * tested before any art exists.
   *
   * Delete or comment out a placeholder call once the real PNG is loaded above.
   */
  _generateChargerPlaceholders() {
    const VIEWS = ['side', 'front', 'back'];
    const FRAME_COUNTS = { idle: 2, walk: 4, charge: 2, hurt: 1, death: 4 };
    // Distinct tint per animation state so you can read the state at a glance
    const ANIM_COLORS = {
      idle:   { body: '#1a0500', border: '#ff4500', label: '#ff4500' },
      walk:   { body: '#1a0500', border: '#ff8800', label: '#ff8800' },
      charge: { body: '#2a0000', border: '#ff0000', label: '#ff2200' },
      hurt:   { body: '#300000', border: '#ffffff', label: '#ffffff' },
      death:  { body: '#0a0000', border: '#666666', label: '#888888' },
    };

    for (const view of VIEWS) {
      for (const [anim, count] of Object.entries(FRAME_COUNTS)) {
        for (let i = 0; i < count; i++) {
          const key = `charger_${view}_${anim}_${i}`;
          if (this.textures.exists(key)) continue;   // real asset already loaded

          const col = ANIM_COLORS[anim];
          const ct  = this.textures.createCanvas(key, 256, 256);
          const ctx = ct.getContext();

          // Body fill
          ctx.fillStyle = col.body;
          ctx.fillRect(0, 0, 256, 256);

          // Silhouette — simple beast shape so orientation is readable
          ctx.fillStyle = col.border;
          ctx.globalAlpha = 0.18;
          ctx.fillRect(24, 60, 208, 136);   // body block
          if (view === 'side') {
            ctx.fillRect(180, 30, 52, 80);  // head bump (right side)
          } else if (view === 'front') {
            ctx.fillRect(88, 170, 80, 50);  // snout below centre
          }
          ctx.globalAlpha = 1;

          // Border
          ctx.strokeStyle = col.border;
          ctx.lineWidth   = 5;
          ctx.strokeRect(6, 6, 244, 244);

          // Frame indicator dot (top-left corner)
          ctx.fillStyle = col.label;
          for (let d = 0; d <= i; d++) {
            ctx.beginPath();
            ctx.arc(20 + d * 18, 20, 6, 0, Math.PI * 2);
            ctx.fill();
          }

          // Labels
          ctx.fillStyle   = col.label;
          ctx.font        = 'bold 20px monospace';
          ctx.textAlign   = 'center';
          ctx.fillText(view, 128, 108);
          ctx.font        = '16px monospace';
          ctx.fillText(`${anim}  [${i}]`, 128, 136);

          ct.refresh();
        }
      }
    }
  }

  create() {
    this.scene.start('StartScene');
  }
}
