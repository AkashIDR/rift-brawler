import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    this.finalScore = data.score || 0;
    this.finalLevel = data.level || 1;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0a0505');
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Background grid — dark red tint
    const g = this.add.graphics();
    g.lineStyle(1, 0x3d0a00, 0.55);
    for (let x = 0; x < GAME_WIDTH; x += 60) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 60) g.lineBetween(0, y, GAME_WIDTH, y);

    // Panel
    const pw = 520, ph = 380;
    const px = (GAME_WIDTH - pw) / 2, py = (GAME_HEIGHT - ph) / 2;
    // Drop shadow
    const panelShadow = this.add.graphics();
    panelShadow.fillStyle(0x000000, 0.65);
    panelShadow.fillRoundedRect(px + 7, py + 7, pw, ph, 20);
    const panel = this.add.graphics();
    // Warm near-black panel
    panel.fillStyle(0x100504, 0.98);
    panel.fillRoundedRect(px, py, pw, ph, 20);
    // Blood-red outer border
    panel.lineStyle(3, 0xaa0000, 0.93);
    panel.strokeRoundedRect(px, py, pw, ph, 20);
    // Ember inner glow
    panel.lineStyle(1, 0xff4422, 0.25);
    panel.strokeRoundedRect(px + 2, py + 2, pw - 4, ph - 4, 18);
    // Top shine
    panel.fillStyle(0xffffff, 0.05);
    panel.fillRoundedRect(px + 2, py + 2, pw - 4, 18, { tl: 18, tr: 18, bl: 0, br: 0 });

    const cx = GAME_WIDTH / 2;

    // GAME OVER title — bigger and bolder
    const title = this.add.text(cx, py + 64, 'GAME OVER', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '72px',
      color: '#ff4444',
      stroke: '#2a0000',
      strokeThickness: 7,
    }).setOrigin(0.5);

    // Blood drip effect below the title — 4 dripping triangles in different sizes
    const drips = this.add.graphics();
    drips.fillStyle(0xff2200, 0.95);
    const dripSpecs = [
      { x: cx - 90, h: 14, w: 5 },
      { x: cx - 30, h: 22, w: 6 },
      { x: cx + 20, h: 11, w: 4 },
      { x: cx + 75, h: 18, w: 5.5 },
    ];
    const dripBaseY = py + 98;
    dripSpecs.forEach(d => {
      // Drip body — elongated triangle
      drips.fillStyle(0xcc1100, 1);
      drips.fillTriangle(d.x - d.w, dripBaseY, d.x + d.w, dripBaseY, d.x, dripBaseY + d.h);
      // Inner highlight
      drips.fillStyle(0xff4422, 0.85);
      drips.fillTriangle(d.x - d.w * 0.55, dripBaseY + 1, d.x + d.w * 0.55, dripBaseY + 1, d.x, dripBaseY + d.h * 0.85);
      // Tiny round head where the drip starts
      drips.fillStyle(0xcc1100, 1);
      drips.fillCircle(d.x, dripBaseY - 1, d.w * 0.7);
    });

    // Stats — warm parchment text
    this.add.text(cx, py + 168, `Levels Completed: ${this.finalLevel - 1}`, {
      fontFamily: "'Nunito', sans-serif",
      fontSize: '26px',
      color: '#ffe8c0',
      stroke: '#1a0a08',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(cx, py + 212, `Final Score: ${this.finalScore}`, {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '34px',
      color: '#d4a96a',
      stroke: '#1a0a08',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this._makeButton(cx - 100, py + ph - 64, 'RESTART', 0x2a0808, 0xaa0000, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('ArenaScene', { level: 1, score: 0, playerHp: null });
      });
    });

    this._makeButton(cx + 100, py + ph - 64, 'MENU', 0x1a1208, 0x8b5e3c, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('StartScene');
      });
    });
  }

  _makeButton(x, y, label, bgColor, borderColor, onClick) {
    const w = 160, h = 50, r = 12;
    const container = this.add.container(x, y);

    // Drop shadow drawn relative to container center
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.55);
    shadow.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w, h, r);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.fillStyle(0xfff5d0, 0.08);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h / 2, { tl: r, tr: r, bl: 0, br: 0 });
    bg.lineStyle(2, borderColor, 0.85);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    const hoverG = this.add.graphics();
    hoverG.fillStyle(borderColor, 0.22);
    hoverG.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    hoverG.setAlpha(0);

    const txt = this.add.text(0, 0, label, {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '26px',
      color: '#ffe8c0',
      stroke: '#1a0a08',
      strokeThickness: 3,
    }).setOrigin(0.5);

    container.add([shadow, bg, hoverG, txt]);
    container.setSize(w, h);
    container.setInteractive({ cursor: 'pointer' });

    container.on('pointerover', () => {
      this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, duration: 110 });
      this.tweens.add({ targets: hoverG, alpha: 1, duration: 110 });
    });
    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 110 });
      this.tweens.add({ targets: hoverG, alpha: 0, duration: 110 });
    });
    container.on('pointerdown', onClick);
  }
}
