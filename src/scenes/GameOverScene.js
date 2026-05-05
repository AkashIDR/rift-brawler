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
    this.cameras.main.setBackgroundColor('#0a0a0f');
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Background
    const g = this.add.graphics();
    g.lineStyle(1, 0x330000, 0.5);
    for (let x = 0; x < GAME_WIDTH; x += 60) g.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y < GAME_HEIGHT; y += 60) g.lineBetween(0, y, GAME_WIDTH, y);

    // Panel
    const pw = 520, ph = 380;
    const px = (GAME_WIDTH - pw) / 2, py = (GAME_HEIGHT - ph) / 2;
    // Drop shadow
    const panelShadow = this.add.graphics();
    panelShadow.fillStyle(0x000000, 0.55);
    panelShadow.fillRoundedRect(px + 7, py + 7, pw, ph, 20);
    const panel = this.add.graphics();
    panel.fillStyle(0x0b0808, 0.97);
    panel.fillRoundedRect(px, py, pw, ph, 20);
    panel.lineStyle(3, 0xcc2200, 0.9);
    panel.strokeRoundedRect(px, py, pw, ph, 20);
    panel.lineStyle(1, 0xff5544, 0.2);
    panel.strokeRoundedRect(px + 2, py + 2, pw - 4, ph - 4, 18);
    // Top shine
    panel.fillStyle(0xffffff, 0.04);
    panel.fillRoundedRect(px + 2, py + 2, pw - 4, 18, { tl: 18, tr: 18, bl: 0, br: 0 });

    const cx = GAME_WIDTH / 2;

    this.add.text(cx, py + 56, 'GAME OVER', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '64px',
      color: '#ff4444',
      stroke: '#330000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(cx, py + 148, `Levels Completed: ${this.finalLevel - 1}`, {
      fontFamily: "'Nunito', sans-serif",
      fontSize: '26px',
      color: '#ccaaff',
    }).setOrigin(0.5);

    this.add.text(cx, py + 190, `Final Score: ${this.finalScore}`, {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '32px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this._makeButton(cx - 100, py + ph - 64, 'RESTART', 0xaa44ff, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('ArenaScene', { level: 1, score: 0, playerHp: null });
      });
    });

    this._makeButton(cx + 100, py + ph - 64, 'MENU', 0x333355, () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('StartScene');
      });
    });
  }

  _makeButton(x, y, label, color, onClick) {
    const w = 160, h = 50, r = 12;
    const container = this.add.container(x, y);

    // Drop shadow drawn relative to container center
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.45);
    shadow.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w, h, r);

    const bg = this.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.fillStyle(0xffffff, 0.1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h / 2, { tl: r, tr: r, bl: 0, br: 0 });
    bg.lineStyle(1.5, 0xffffff, 0.18);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    const hoverG = this.add.graphics();
    hoverG.fillStyle(0xffffff, 0.18);
    hoverG.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    hoverG.setAlpha(0);

    const txt = this.add.text(0, 0, label, {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '26px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2,
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
