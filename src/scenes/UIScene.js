import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, SKILLS } from '../config/gameConfig.js';

const HUD_H = 72;
const HUD_Y = GAME_HEIGHT - HUD_H;
const BAR_W = 200;
const BAR_H = 18;

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.arenaScene = data.arenaScene;
    this.level = data.level;
    this.score = data.score;
    this.bossName = '';
    this.bossMaxHp = 1;
    this.bossHp = 0;
    this.isPaused = false;
  }

  create() {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this._buildHUD();
    this._buildBossBar();
    this._buildPauseMenu();
    this._listenToArena();

    // ESC lives here — UIScene stays active while ArenaScene is natively paused
    this.input.keyboard.on('keydown-ESC', () => this.arenaScene._togglePause());
  }

  update() {
    const arena = this.arenaScene;
    if (!arena || !arena.player) return;
    const p = arena.player;

    this._updateBar(this.hpBarFill, Math.max(0, p.hp / p.maxHp), false);
    this._updateBar(this.stBarFill, Math.max(0, p.stamina / p.staminaMax), true);
    this._updateSkillCooldowns(p);
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  _buildHUD() {
    // Panel drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.55);
    shadow.fillRect(0, HUD_Y - 2, GAME_WIDTH, HUD_H + 4);

    const g = this.add.graphics();
    g.fillStyle(0x07070f, 0.94);
    g.fillRect(0, HUD_Y, GAME_WIDTH, HUD_H);
    // Top edge glow
    g.lineStyle(2, 0xaa44ff, 0.55);
    g.lineBetween(0, HUD_Y, GAME_WIDTH, HUD_Y);
    // Inner highlight stripe
    g.lineStyle(1, 0xffffff, 0.05);
    g.lineBetween(0, HUD_Y + 1, GAME_WIDTH, HUD_Y + 1);

    const ly = HUD_Y + 14;

    // HP bar
    this.add.text(16, ly, '♥', { fontSize: '22px', color: '#e74c3c', fontFamily: 'Nunito' });
    this._drawBarTrack(48, ly, BAR_W, BAR_H);
    this.hpBarFill = this._drawBarFill(48, ly, BAR_W, BAR_H);

    // Stamina bar
    this.add.text(16, ly + 26, '⚡', { fontSize: '19px', color: '#f1c40f', fontFamily: 'Nunito' });
    this._drawBarTrack(48, ly + 26, BAR_W, BAR_H);
    this.stBarFill = this._drawBarFill(48, ly + 26, BAR_W, BAR_H);

    // Skill bar
    const skillX = GAME_WIDTH / 2 - 110;
    const skillY = HUD_Y + 10;
    this.skillSlots = [];
    [
      { key: 'Q', color: COLORS.PORTAL },
      { key: 'W', color: 0x44aaff },
      { key: 'E', color: 0xff6600 },
      { key: '⎵', color: 0x44cc88 },
    ].forEach((sk, i) => {
      this.skillSlots.push(this._buildSkillSlot(skillX + i * 60, skillY, sk.key, sk.color));
    });

    // Score + Level
    this.scoreText = this.add.text(GAME_WIDTH - 200, HUD_Y + 8, `Score: ${this.score}`, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    });
    this.levelText = this.add.text(GAME_WIDTH - 200, HUD_Y + 34, `Level: ${this.level}`, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px', color: '#ccaaff',
      stroke: '#000000', strokeThickness: 2,
    });

    // Pause button
    this._buildIconButton(GAME_WIDTH - 54, HUD_Y + HUD_H / 2, '⏸', () => {
      this.arenaScene._togglePause();
    });
  }

  _drawBarTrack(x, y, w, h) {
    const g = this.add.graphics();
    // Outer shadow
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(x + 2, y + 2, w, h, 4);
    // Track
    g.fillStyle(0x0e0e1e, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    // Border
    g.lineStyle(1, 0x333355, 0.9);
    g.strokeRoundedRect(x, y, w, h, 4);
    // Inner top shadow
    g.lineStyle(1, 0x000000, 0.5);
    g.lineBetween(x + 4, y + 1, x + w - 4, y + 1);
    return g;
  }

  _drawBarFill(x, y, w, h) {
    const g = this.add.graphics();
    g.x = x + 2;
    g.y = y + 2;
    g._maxFillW = w - 4;
    g._fillH = h - 4;
    return g;
  }

  _updateBar(g, ratio, isStamina) {
    g.clear();
    const fillW = Math.max(0, g._maxFillW * ratio);
    const h = g._fillH;
    if (fillW < 1) return;

    const color = isStamina
      ? COLORS.STAMINA
      : (ratio < 0.25 ? COLORS.HP_LOW : COLORS.HP_FULL);

    // Base fill
    g.fillStyle(color, 1);
    g.fillRoundedRect(0, 0, fillW, h, 3);
    // Top shine
    g.fillStyle(0xffffff, 0.28);
    g.fillRoundedRect(1, 0, fillW - 2, Math.floor(h * 0.42), { tl: 3, tr: 3, bl: 0, br: 0 });
    // Bottom shadow
    g.fillStyle(0x000000, 0.22);
    g.fillRoundedRect(0, Math.floor(h * 0.6), fillW, Math.floor(h * 0.4), { tl: 0, tr: 0, bl: 3, br: 3 });
  }

  _buildSkillSlot(x, y, keyLabel, color) {
    const size = 50;

    // Drop shadow
    const shad = this.add.graphics();
    shad.fillStyle(0x000000, 0.45);
    shad.fillRoundedRect(x + 3, y + 3, size, size, 8);

    const bg = this.add.graphics();
    bg.fillStyle(0x0b0b1c, 1);
    bg.fillRoundedRect(x, y, size, size, 8);
    // Bottom-half darkening (depth illusion)
    bg.fillStyle(0x000000, 0.25);
    bg.fillRoundedRect(x, y + size / 2, size, size / 2, { tl: 0, tr: 0, bl: 8, br: 8 });
    // Colored border
    bg.lineStyle(2, color, 0.85);
    bg.strokeRoundedRect(x, y, size, size, 8);
    // Inner top highlight
    bg.lineStyle(1, 0xffffff, 0.1);
    bg.lineBetween(x + 8, y + 1, x + size - 8, y + 1);

    const text = this.add.text(x + size / 2, y + size / 2, keyLabel, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    const cooldownOverlay = this.add.graphics();
    cooldownOverlay.setDepth(5);

    return { bg, shad, text, cooldownOverlay, x, y, size };
  }

  _updateSkillCooldowns(player) {
    // Use ArenaScene's clock — it freezes when the scene is natively paused,
    // so cooldown overlays correctly stay in place during pause.
    const now = this.arenaScene.time.now;
    const skillKeys = ['Q', 'W', 'E', 'SPACE'];
    skillKeys.forEach((k, i) => {
      const slot = this.skillSlots[i];
      if (!slot) return;
      const cdEnd = player.skillCooldowns?.[k] ?? 0;
      const cdTotal = player.skillCooldownDurations?.[k] ?? 1;
      const ratio = Math.max(0, cdEnd - now) / cdTotal;
      slot.cooldownOverlay.clear();
      if (ratio > 0.02) {
        slot.cooldownOverlay.fillStyle(0x000000, 0.68);
        slot.cooldownOverlay.fillRoundedRect(
          slot.x, slot.y, slot.size, slot.size * ratio,
          { tl: 0, tr: 0, bl: 8, br: 8 }
        );
      }
    });
  }

  _buildIconButton(x, y, icon, onClick) {
    const btn = this.add.text(x, y, icon, {
      fontFamily: 'Nunito', fontSize: '28px', color: '#8888aa',
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    btn.on('pointerover', () => { btn.setColor('#ccaaff'); btn.setScale(1.15); });
    btn.on('pointerout',  () => { btn.setColor('#8888aa'); btn.setScale(1); });
    btn.on('pointerdown', onClick);
    return btn;
  }

  // ─── Boss Bar ────────────────────────────────────────────────────────────────

  _buildBossBar() {
    const bw = 520, bh = 26;
    const bx = (GAME_WIDTH - bw) / 2, by = 14;
    const pad = 14;

    this.bossBarContainer = this.add.container(0, 0);
    this.bossBarContainer.setVisible(false);

    // Panel drop shadow
    const panelShadow = this.add.graphics();
    panelShadow.fillStyle(0x000000, 0.55);
    panelShadow.fillRoundedRect(bx - pad + 5, by - 10 + 5, bw + pad * 2, bh + 54, 14);

    // Panel background
    const bg = this.add.graphics();
    bg.fillStyle(0x090407, 0.97);
    bg.fillRoundedRect(bx - pad, by - 10, bw + pad * 2, bh + 54, 12);
    // Outer glow border
    bg.lineStyle(2, 0xcc2200, 0.9);
    bg.strokeRoundedRect(bx - pad, by - 10, bw + pad * 2, bh + 54, 12);
    // Inner highlight
    bg.lineStyle(1, 0xff5533, 0.2);
    bg.strokeRoundedRect(bx - pad + 2, by - 8, bw + pad * 2 - 4, bh + 50, 10);
    // Top interior shine strip
    bg.fillStyle(0xffffff, 0.03);
    bg.fillRoundedRect(bx - pad + 2, by - 8, bw + pad * 2 - 4, 12, { tl: 10, tr: 10, bl: 0, br: 0 });

    // Boss name
    this.bossNameText = this.add.text(GAME_WIDTH / 2, by + 2, '', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '22px',
      color: '#ffdddd',
      stroke: '#3d0000',
      strokeThickness: 5,
    }).setOrigin(0.5, 0);

    // Bar track
    const barTrack = this.add.graphics();
    barTrack.fillStyle(0x000000, 0.5);
    barTrack.fillRoundedRect(bx + 2, by + 32, bw, bh, 5); // shadow
    barTrack.fillStyle(0x130304, 1);
    barTrack.fillRoundedRect(bx, by + 30, bw, bh, 5);
    barTrack.lineStyle(1, 0x000000, 0.8);
    barTrack.strokeRoundedRect(bx, by + 30, bw, bh, 5);

    // HP fill (redrawn dynamically)
    this.bossHpFill = this.add.graphics();
    this._redrawBossBar(1);

    // Static shine overlay
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.1);
    shine.fillRoundedRect(bx + 2, by + 31, bw - 4, Math.floor(bh * 0.38), { tl: 4, tr: 4, bl: 0, br: 0 });

    // Segment tick marks at 25%, 50%, 75%
    const ticks = this.add.graphics();
    ticks.lineStyle(2, 0x000000, 0.55);
    [0.25, 0.5, 0.75].forEach(pct => {
      const sx = bx + bw * pct;
      ticks.lineBetween(sx, by + 31, sx, by + 30 + bh - 1);
    });
    // Tick labels — added to container so they hide/show with it
    const tickLabels = [0.25, 0.5, 0.75].map(pct =>
      this.add.text(bx + bw * pct, by + 30 + bh + 3, `${pct * 100 | 0}%`, {
        fontFamily: 'Nunito', fontSize: '10px', color: '#774444'
      }).setOrigin(0.5, 0)
    );

    // Skull icon
    const skull = this.add.text(bx - 4, by + 30 + bh / 2, '☠', {
      fontFamily: 'Nunito', fontSize: '15px', color: '#aa3333'
    }).setOrigin(1, 0.5);

    this.bossBarContainer.add([panelShadow, bg, barTrack, this.bossHpFill, shine, ticks, ...tickLabels, this.bossNameText, skull]);
  }

  _redrawBossBar(ratio) {
    const bw = 520, bh = 26;
    const bx = (GAME_WIDTH - bw) / 2, by = 14;
    this.bossHpFill.clear();
    const fillW = Math.max(0, bw * ratio);
    if (fillW < 3) return;

    const col = ratio > 0.5 ? COLORS.BOSS_HP : ratio > 0.25 ? COLORS.BOSS_HP_MID : COLORS.BOSS_HP_LOW;
    // Main fill
    this.bossHpFill.fillStyle(col, 1);
    this.bossHpFill.fillRoundedRect(bx + 2, by + 32, fillW - 4, bh - 4, 4);
    // Top shine
    this.bossHpFill.fillStyle(0xffffff, 0.25);
    this.bossHpFill.fillRoundedRect(bx + 2, by + 32, fillW - 4, Math.floor((bh - 4) * 0.38), { tl: 4, tr: 4, bl: 0, br: 0 });
    // Bottom shadow
    this.bossHpFill.fillStyle(0x000000, 0.25);
    this.bossHpFill.fillRoundedRect(
      bx + 2, by + 32 + Math.floor((bh - 4) * 0.62),
      fillW - 4, Math.floor((bh - 4) * 0.38),
      { tl: 0, tr: 0, bl: 4, br: 4 }
    );
  }

  // ─── Pause Menu ──────────────────────────────────────────────────────────────

  _buildPauseMenu() {
    const w = 330, h = 290, r = 16;
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    this.pauseContainer = this.add.container(cx, cy);
    this.pauseContainer.setVisible(false).setDepth(200);

    // Drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.6);
    shadow.fillRoundedRect(-w / 2 + 7, -h / 2 + 7, w, h, r);

    const bg = this.add.graphics();
    bg.fillStyle(0x07071a, 0.97);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(2, 0xaa44ff, 0.88);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(1, 0xcc88ff, 0.15);
    bg.strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, r - 1);
    // Top shine
    bg.fillStyle(0xffffff, 0.04);
    bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, 20, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    const title = this.add.text(0, -h / 2 + 38, 'PAUSED', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '36px', color: '#ccaaff',
      stroke: '#1a0033', strokeThickness: 5,
    }).setOrigin(0.5);

    const div = this.add.graphics();
    div.lineStyle(1, 0xaa44ff, 0.35);
    div.lineBetween(-w / 2 + 28, -h / 2 + 64, w / 2 - 28, -h / 2 + 64);

    this.pauseContainer.add([shadow, bg, title, div]);
    this._addPauseBtn('RESUME', 0, 18, () => this.arenaScene._togglePause());
    this._addPauseBtn('MAIN MENU', 0, 88, () => {
      this.scene.stop();
      this.arenaScene.scene.start('StartScene');
    });
  }

  _addPauseBtn(label, x, y, fn) {
    const bw = 220, bh = 46, r = 10;

    // Drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.45);
    shadow.fillRoundedRect(x - bw / 2 + 3, y - bh / 2 + 3, bw, bh, r);

    const bg = this.add.graphics();
    bg.fillStyle(0x1e1e44, 1);
    bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);
    bg.fillStyle(0xffffff, 0.07);
    bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh / 2, { tl: r, tr: r, bl: 0, br: 0 });
    bg.lineStyle(1.5, 0xaa44ff, 0.6);
    bg.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);

    // Hover overlay
    const hoverG = this.add.graphics();
    hoverG.fillStyle(0xaa44ff, 0.18);
    hoverG.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);
    hoverG.setAlpha(0);

    const txt = this.add.text(x, y, label, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '24px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5);

    const hit = this.add.rectangle(x, y, bw, bh).setInteractive({ cursor: 'pointer' });
    hit.on('pointerover', () => {
      this.tweens.add({ targets: hoverG, alpha: 1, duration: 110 });
      this.tweens.add({ targets: txt, scaleX: 1.05, scaleY: 1.05, duration: 110 });
    });
    hit.on('pointerout', () => {
      this.tweens.add({ targets: hoverG, alpha: 0, duration: 110 });
      this.tweens.add({ targets: txt, scaleX: 1, scaleY: 1, duration: 110 });
    });
    hit.on('pointerdown', fn);
    this.pauseContainer.add([shadow, bg, hoverG, txt, hit]);
  }

  // ─── Arena event listeners ───────────────────────────────────────────────────

  _listenToArena() {
    const a = this.arenaScene;

    a.events.on('bossSpawned', ({ name, maxHp }) => {
      this.bossMaxHp = maxHp;
      this.bossHp = maxHp;
      this.bossNameText.setText(name);
      this.bossBarContainer.setVisible(true);
      this._redrawBossBar(1);
    });

    a.events.on('bossHpChanged', (hp) => {
      this.bossHp = hp;
      this._redrawBossBar(hp / this.bossMaxHp);
    });

    a.events.on('bossDefeated', () => {
      this.tweens.add({
        targets: this.bossBarContainer, alpha: 0, duration: 600,
        onComplete: () => this.bossBarContainer.setVisible(false).setAlpha(1),
      });
    });

    a.events.on('scoreChanged', (score) => {
      this.score = score;
      this.scoreText.setText(`Score: ${score}`);
    });

    a.events.on('pauseToggled', (paused) => {
      this.isPaused = paused;
      this.pauseContainer.setVisible(paused);
    });
  }
}
