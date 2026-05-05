import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/gameConfig.js';

export default class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' });
    this.settingsOpen = false;
    this.controlsOpen = false;
  }

  create() {
    this.cameras.main.setBackgroundColor('#0a0a0f');
    this._drawBackground();
    this._drawTitle();
    this._drawButtons();
    this._drawParticles();
  }

  _drawBackground() {
    // Subtle grid pattern
    const g = this.add.graphics();
    g.lineStyle(1, 0x1a1a2e, 0.6);
    for (let x = 0; x < GAME_WIDTH; x += 60) {
      g.lineBetween(x, 0, x, GAME_HEIGHT);
    }
    for (let y = 0; y < GAME_HEIGHT; y += 60) {
      g.lineBetween(0, y, GAME_WIDTH, y);
    }

    // Decorative floating shapes
    const shapes = this.add.graphics();
    const decorColors = [0x3a9ff5, 0xaa44ff, 0xff4500, 0xffd700];
    for (let i = 0; i < 12; i++) {
      const x = Phaser.Math.Between(60, GAME_WIDTH - 60);
      const y = Phaser.Math.Between(60, GAME_HEIGHT - 60);
      const col = decorColors[i % decorColors.length];
      shapes.lineStyle(2, col, 0.18);
      shapes.strokeRect(x - 20, y - 20, 40, 40);
    }
  }

  _drawTitle() {
    // Glow shadow
    this.add.text(GAME_WIDTH / 2 + 3, 148, 'RIFT BRAWLER', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '92px',
      color: '#220033',
      alpha: 0.7,
    }).setOrigin(0.5);

    // Main title
    const title = this.add.text(GAME_WIDTH / 2, 145, 'RIFT BRAWLER', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '92px',
      color: '#ffffff',
      stroke: '#aa44ff',
      strokeThickness: 6,
    }).setOrigin(0.5);

    // Pulsing title animation
    this.tweens.add({
      targets: title,
      scaleX: 1.03,
      scaleY: 1.03,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Subtitle
    this.add.text(GAME_WIDTH / 2, 220, 'Summon. Slay. Survive.', {
      fontFamily: "'Nunito', sans-serif",
      fontSize: '26px',
      color: '#ccaaff',
      fontStyle: 'italic',
    }).setOrigin(0.5);
  }

  _drawButtons() {
    const cx = GAME_WIDTH / 2;
    const startY = 340;
    const gap = 80;

    this._makeButton(cx, startY, 'START', 0xaa44ff, 0xffffff, () => this._startGame());
    this._makeButton(cx, startY + gap, 'CONTROLS', 0x333355, 0xccaaff, () => this._showControls());
    this._makeButton(cx, startY + gap * 2, 'SETTINGS', 0x333355, 0xccaaff, () => this._showSettings());
  }

  _makeButton(x, y, label, bgColor, textColor, onClick) {
    const w = 280, h = 56, r = 14;
    const container = this.add.container(x, y);

    // Drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.45);
    shadow.fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w, h, r);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    // Top half shine
    bg.fillStyle(0xffffff, 0.1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h / 2, { tl: r, tr: r, bl: 0, br: 0 });
    // Border
    bg.lineStyle(1.5, 0xffffff, 0.2);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    // Hover overlay
    const hoverG = this.add.graphics();
    hoverG.fillStyle(0xffffff, 0.16);
    hoverG.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    hoverG.setAlpha(0);

    const text = this.add.text(0, 0, label, {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '28px',
      color: Phaser.Display.Color.IntegerToColor(textColor).rgba,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    container.add([shadow, bg, hoverG, text]);
    container.setSize(w, h);
    container.setInteractive({ cursor: 'pointer' });

    container.on('pointerover', () => {
      this.tweens.add({ targets: container, scaleX: 1.06, scaleY: 1.06, duration: 120, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: hoverG, alpha: 1, duration: 120 });
    });
    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: hoverG, alpha: 0, duration: 120 });
    });
    container.on('pointerdown', onClick);

    return container;
  }

  _drawParticles() {
    // Animated floating dots in the background
    for (let i = 0; i < 20; i++) {
      const dot = this.add.graphics();
      const col = [0x3a9ff5, 0xaa44ff, 0xffd700, 0xff4500][i % 4];
      dot.fillStyle(col, 0.5);
      dot.fillCircle(0, 0, Phaser.Math.Between(2, 5));
      dot.x = Phaser.Math.Between(0, GAME_WIDTH);
      dot.y = Phaser.Math.Between(0, GAME_HEIGHT);

      this.tweens.add({
        targets: dot,
        y: dot.y - Phaser.Math.Between(80, 200),
        alpha: 0,
        duration: Phaser.Math.Between(2500, 5000),
        delay: Phaser.Math.Between(0, 3000),
        repeat: -1,
        onRepeat: () => {
          dot.x = Phaser.Math.Between(0, GAME_WIDTH);
          dot.y = GAME_HEIGHT + 20;
          dot.alpha = 0.5;
        }
      });
    }
  }

  _startGame() {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('ArenaScene', { level: 1, score: 0, playerHp: null });
    });
  }

  _showControls() {
    if (this.controlsOpen) return;
    this.controlsOpen = true;
    this._openOverlay('CONTROLS', [
      ['Right-click', 'Move to position'],
      ['Right-click + Hold', 'Continuous movement'],
      ['Left-click', 'Basic attack'],
      ['Altar', 'Walk up or attack to summon'],
      ['Portal', 'Walk into to advance'],
      ['Spacebar', 'Dodge (i-frames)'],
      ['Q', 'Skill 1 — Power Strike'],
      ['W', 'Skill 2 — Shield Dash'],
      ['E', 'Skill 3 — Ground Slam'],
      ['ESC', 'Pause / Unpause'],
    ], () => { this.controlsOpen = false; });
  }

  _showSettings() {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    this._openOverlay('SETTINGS', [
      ['Master Volume', '— coming soon —'],
      ['Music Volume', '— coming soon —'],
      ['SFX Volume', '— coming soon —'],
    ], () => { this.settingsOpen = false; });
  }

  _openOverlay(title, rows, onClose) {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const rowSpacing = 36;
    const w = 580, r = 20;
    // Auto-size height: title area + rows + close button area
    const h = 86 + rows.length * rowSpacing + 72;

    const container = this.add.container(cx, cy);

    const bg = this.add.graphics();
    bg.fillStyle(0x0d0d1e, 0.97);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(2, 0xaa44ff, 0.8);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    const titleText = this.add.text(0, -h / 2 + 36, title, {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '32px',
      color: '#ccaaff',
    }).setOrigin(0.5);

    // Divider under title
    const divider = this.add.graphics();
    divider.lineStyle(1, 0xaa44ff, 0.35);
    divider.lineBetween(-w / 2 + 30, -h / 2 + 60, w / 2 - 30, -h / 2 + 60);

    container.add([bg, titleText, divider]);

    rows.forEach(([key, val], i) => {
      const y = -h / 2 + 86 + i * rowSpacing;

      // Alternating row tint
      if (i % 2 === 0) {
        const rowBg = this.add.graphics();
        rowBg.fillStyle(0xffffff, 0.03);
        rowBg.fillRoundedRect(-w / 2 + 16, y - rowSpacing / 2 + 2, w - 32, rowSpacing - 4, 4);
        container.add(rowBg);
      }

      container.add(this.add.text(-w / 2 + 28, y, key, {
        fontFamily: "'Nunito', sans-serif", fontSize: '19px', color: '#ffffff', fontStyle: 'bold'
      }).setOrigin(0, 0.5));
      container.add(this.add.text(w / 2 - 28, y, val, {
        fontFamily: "'Nunito', sans-serif", fontSize: '19px', color: '#aa88ff'
      }).setOrigin(1, 0.5));
    });

    // Close button — always below the last row
    const closeBg = this.add.graphics();
    closeBg.fillStyle(0xaa44ff, 1);
    closeBg.fillRoundedRect(-56, -20, 112, 40, 10);
    const closeText = this.add.text(0, 0, 'CLOSE', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px', color: '#ffffff'
    }).setOrigin(0.5);

    const closeBtn = this.add.container(0, h / 2 - 38, [closeBg, closeText]);
    closeBtn.setSize(112, 40);
    closeBtn.setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerover', () => { closeBg.clear(); closeBg.fillStyle(0xcc66ff, 1); closeBg.fillRoundedRect(-56, -20, 112, 40, 10); });
    closeBtn.on('pointerout',  () => { closeBg.clear(); closeBg.fillStyle(0xaa44ff, 1); closeBg.fillRoundedRect(-56, -20, 112, 40, 10); });
    closeBtn.on('pointerdown', () => { container.destroy(true); onClose(); });
    container.add(closeBtn);

    container.setDepth(100);
    container.setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 200 });
  }
}
