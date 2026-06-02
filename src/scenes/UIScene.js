import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS, SKILLS } from '../config/gameConfig.js';

const HUD_H = 72;
const HUD_Y = GAME_HEIGHT - HUD_H;
const BAR_W = 200;
const BAR_H = 18;

// ─── Comical High Fantasy palette ───────────────────────────────────────────
// Warm dark wood/stone with antique gold trim. Replaces the earlier cold
// purple/blue scheme. Bosses use a parchment + blood-red sub-palette.
const PANEL_BG     = 0x1a0a08;   // very dark warm brown
const PANEL_BORDER = 0xd4a96a;   // antique gold trim
const PANEL_INNER  = 0x8b5e3c;   // medium wood brown (secondary border)
const PANEL_SHINE  = 0xfff5d0;   // warm cream highlight
const HP_FILL      = 0xc0392b;
const HP_SHINE     = 0xff8080;
const HP_LOW_FILL  = 0xff0000;
const STAM_FILL    = 0x1a6ba0;
const STAM_SHINE   = 0x74d0ff;
const BOSS_PANEL   = 0x0f0505;
const BOSS_BORDER  = 0xaa0000;
const GOLD         = 0xd4a96a;
const DARK_GOLD    = 0x7a4f1e;
const PARCHMENT    = '#ffe8c0';

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
    this._buildIconTextures();
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

  // ─── Icon textures (drawn once into a canvas, reused as sprites) ────────────

  _buildIconTextures() {
    this._bakeHeartIcon();
    this._bakeBoltIcon();
    this._bakeSkillIcon('skill-q-strike',  0xffdd44, this._drawStrikeIcon);
    this._bakeSkillIcon('skill-w-shield',  0x44aaff, this._drawShieldIcon);
    this._bakeSkillIcon('skill-e-slam',    0xff6600, this._drawSlamIcon);
    this._bakeSkillIcon('skill-space-dodge', 0x44cc88, this._drawDodgeIcon);
  }

  _bakeHeartIcon() {
    const key = 'ui-heart';
    if (this.textures.exists(key)) return;
    const w = 26, h = 24;
    const tex = this.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    // Dark outline pass for chunky comic feel
    ctx.fillStyle = '#3a0606';
    this._heartPath(ctx, w / 2, h / 2 + 1, 11);
    ctx.fill();
    // Main red body
    ctx.fillStyle = '#c0392b';
    this._heartPath(ctx, w / 2, h / 2, 9.5);
    ctx.fill();
    // Pink highlight on top-left lobe
    ctx.fillStyle = 'rgba(255,170,170,0.85)';
    ctx.beginPath();
    ctx.ellipse(w / 2 - 3, h / 2 - 4, 2.5, 1.7, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // Tiny white specular dot
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(w / 2 - 3.5, h / 2 - 4.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
  }

  _heartPath(ctx, cx, cy, s) {
    // Classic heart — two arcs + V tip
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.85);
    ctx.bezierCurveTo(cx - s * 1.45, cy + s * 0.05, cx - s * 1.1, cy - s * 0.95, cx, cy - s * 0.2);
    ctx.bezierCurveTo(cx + s * 1.1, cy - s * 0.95, cx + s * 1.45, cy + s * 0.05, cx, cy + s * 0.85);
    ctx.closePath();
  }

  _bakeBoltIcon() {
    const key = 'ui-bolt';
    if (this.textures.exists(key)) return;
    const w = 18, h = 24;
    const tex = this.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    // Bolt zigzag polygon (in canvas coords)
    const pts = [
      [10,  1], [3, 12], [8, 12], [5, 23], [15, 10], [9, 10], [13, 1],
    ];
    // Outline
    ctx.fillStyle = '#3a3000';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    // Bright yellow body, slightly inset
    ctx.fillStyle = '#fff080';
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const ix = x + (x < 8 ? 0.6 : -0.6);
      const iy = y + (y < 12 ? 0.6 : -0.6);
      if (i === 0) ctx.moveTo(ix, iy);
      else ctx.lineTo(ix, iy);
    });
    ctx.closePath();
    ctx.fill();
    // White specular streak on the upper bolt
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(9.5, 3);
    ctx.lineTo(6.5, 11);
    ctx.lineTo(8, 11);
    ctx.lineTo(10.5, 3);
    ctx.closePath();
    ctx.fill();
    tex.refresh();
  }

  _bakeSkillIcon(key, color, drawFn) {
    if (this.textures.exists(key)) return;
    const size = 36;
    const tex = this.textures.createCanvas(key, size, size);
    const ctx = tex.getContext();
    drawFn.call(this, ctx, size, color);
    tex.refresh();
  }

  // Q — Power Strike: bullet with speed lines radiating backward (left side)
  _drawStrikeIcon(ctx, s, color) {
    const cx = s / 2, cy = s / 2;
    const hex = '#' + color.toString(16).padStart(6, '0');
    // Speed trail lines (behind the bullet)
    ctx.strokeStyle = hex;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.65;
    [[-6, -5], [-9, 0], [-6, 5]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx - 4, cy + dy);
      ctx.lineTo(cx + dx,     cy + dy);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // Bullet body — elongated capsule pointing right
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // White-hot core
    ctx.fillStyle = '#ffffee';
    ctx.beginPath();
    ctx.ellipse(cx + 4, cy - 1, 3.5, 1.8, 0, 0, Math.PI * 2);
    ctx.fill();
    // Outer outline for definition
    ctx.strokeStyle = '#332200';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy, 9, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // W — Shield Dash: kite shield with a right-arrow overlaid
  _drawShieldIcon(ctx, s, color) {
    const cx = s / 2, cy = s / 2;
    const hex = '#' + color.toString(16).padStart(6, '0');
    // Shield outline (dark)
    ctx.fillStyle = '#0a2540';
    ctx.beginPath();
    ctx.moveTo(cx,        cy - 12);
    ctx.lineTo(cx + 9.5,  cy - 9);
    ctx.lineTo(cx + 9.5,  cy + 2);
    ctx.bezierCurveTo(cx + 9.5, cy + 8, cx + 4, cy + 12, cx, cy + 13);
    ctx.bezierCurveTo(cx - 4, cy + 12, cx - 9.5, cy + 8, cx - 9.5, cy + 2);
    ctx.lineTo(cx - 9.5,  cy - 9);
    ctx.closePath();
    ctx.fill();
    // Shield body in skill color (inset by 1.5px)
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.moveTo(cx,        cy - 10);
    ctx.lineTo(cx + 7.8,  cy - 7.5);
    ctx.lineTo(cx + 7.8,  cy + 2);
    ctx.bezierCurveTo(cx + 7.8, cy + 7, cx + 3.3, cy + 10.5, cx, cy + 11.5);
    ctx.bezierCurveTo(cx - 3.3, cy + 10.5, cx - 7.8, cy + 7, cx - 7.8, cy + 2);
    ctx.lineTo(cx - 7.8,  cy - 7.5);
    ctx.closePath();
    ctx.fill();
    // White right-arrow chevron
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 5);
    ctx.lineTo(cx + 4, cy);
    ctx.lineTo(cx - 4, cy + 5);
    ctx.lineTo(cx - 2, cy);
    ctx.closePath();
    ctx.fill();
    // Top highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 7);
    ctx.lineTo(cx, cy - 9.5);
    ctx.lineTo(cx + 7, cy - 7);
    ctx.stroke();
  }

  // E — Ground Slam: impact star burst from a center dot
  _drawSlamIcon(ctx, s, color) {
    const cx = s / 2, cy = s / 2;
    const hex = '#' + color.toString(16).padStart(6, '0');
    // 6 radiating spike triangles
    ctx.fillStyle = hex;
    const spikes = 6;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
      const r1 = 4, r2 = 13;
      const perp = a + Math.PI / 2;
      const w = 2.2;
      const tipX = cx + Math.cos(a) * r2;
      const tipY = cy + Math.sin(a) * r2;
      const base1X = cx + Math.cos(a) * r1 + Math.cos(perp) * w;
      const base1Y = cy + Math.sin(a) * r1 + Math.sin(perp) * w;
      const base2X = cx + Math.cos(a) * r1 - Math.cos(perp) * w;
      const base2Y = cy + Math.sin(a) * r1 - Math.sin(perp) * w;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(base1X, base1Y);
      ctx.lineTo(base2X, base2Y);
      ctx.closePath();
      ctx.fill();
    }
    // Dark inner ring
    ctx.fillStyle = '#3a1600';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    // White-hot center dot
    ctx.fillStyle = '#fff0c0';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    // Highlight glint
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 0.8, cy - 0.8, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }

  // Space — Dodge: curved sweeping arrow with wind blur lines
  _drawDodgeIcon(ctx, s, color) {
    const cx = s / 2, cy = s / 2;
    const hex = '#' + color.toString(16).padStart(6, '0');
    // Wind blur lines (behind arrow)
    ctx.strokeStyle = hex;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.50;
    [-7, -4, -1].forEach(off => {
      ctx.beginPath();
      ctx.moveTo(cx - 13, cy + off);
      ctx.lineTo(cx - 6,  cy + off);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    // Curved arrow shaft — C-shape sweep
    ctx.strokeStyle = hex;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 9, Math.PI * 0.95, Math.PI * 1.85, false);
    ctx.stroke();
    // Arrowhead at the upper-right tip
    const tipX = cx + Math.cos(Math.PI * 1.85) * 9;
    const tipY = cy + 1 + Math.sin(Math.PI * 1.85) * 9;
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.moveTo(tipX + 5, tipY - 2);
    ctx.lineTo(tipX - 4, tipY - 5);
    ctx.lineTo(tipX - 1, tipY + 3);
    ctx.closePath();
    ctx.fill();
    // White highlight on arrow
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 9, Math.PI * 1.05, Math.PI * 1.5, false);
    ctx.stroke();
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  _buildHUD() {
    // Panel drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.70);
    shadow.fillRect(0, HUD_Y - 3, GAME_WIDTH, HUD_H + 6);

    const g = this.add.graphics();
    // Warm dark wood panel
    g.fillStyle(PANEL_BG, 0.97);
    g.fillRect(0, HUD_Y, GAME_WIDTH, HUD_H);
    // Antique gold top border
    g.lineStyle(2, PANEL_BORDER, 0.90);
    g.lineBetween(0, HUD_Y, GAME_WIDTH, HUD_Y);
    // Wood grain secondary line just below
    g.lineStyle(1, PANEL_INNER, 0.40);
    g.lineBetween(0, HUD_Y + 3, GAME_WIDTH, HUD_Y + 3);
    // Subtle warm shine stripe
    g.lineStyle(1, PANEL_SHINE, 0.08);
    g.lineBetween(0, HUD_Y + 5, GAME_WIDTH, HUD_Y + 5);

    // Gold rivet dots at both top corners
    g.fillStyle(PANEL_BORDER, 0.85);
    g.fillCircle(12, HUD_Y + 8, 4.5);
    g.fillCircle(GAME_WIDTH - 12, HUD_Y + 8, 4.5);
    // Inner highlight on the rivets
    g.fillStyle(0xfff5d0, 0.55);
    g.fillCircle(11, HUD_Y + 7, 1.4);
    g.fillCircle(GAME_WIDTH - 13, HUD_Y + 7, 1.4);

    const ly = HUD_Y + 14;

    // HP icon (drawn heart sprite)
    this.hpIcon = this.add.image(28, ly + 9, 'ui-heart').setOrigin(0.5);
    this._drawBarTrack(48, ly, BAR_W, BAR_H, true);
    this.hpBarFill = this._drawBarFill(48, ly, BAR_W, BAR_H);

    // Stamina icon (drawn bolt sprite)
    this.add.image(28, ly + 35, 'ui-bolt').setOrigin(0.5);
    this._drawBarTrack(48, ly + 26, BAR_W, BAR_H, false);
    this.stBarFill = this._drawBarFill(48, ly + 26, BAR_W, BAR_H);

    // Skill bar — 4 slots
    const slotSize = 50;
    const slotGap = 10;
    const totalW = 4 * slotSize + 3 * slotGap;
    const skillX = (GAME_WIDTH - totalW) / 2;
    const skillY = HUD_Y + 10;
    this.skillSlots = [];
    [
      { key: 'Q', color: 0xffdd44, icon: 'skill-q-strike' },
      { key: 'W', color: 0x44aaff, icon: 'skill-w-shield' },
      { key: 'E', color: 0xff6600, icon: 'skill-e-slam' },
      { key: '␣', color: 0x44cc88, icon: 'skill-space-dodge' },
    ].forEach((sk, i) => {
      this.skillSlots.push(
        this._buildSkillSlot(skillX + i * (slotSize + slotGap), skillY, sk.key, sk.color, sk.icon, slotSize)
      );
    });

    // Score + Level — gold for score (parchment), purple-ish for level
    this.scoreText = this.add.text(GAME_WIDTH - 200, HUD_Y + 8, `Score: ${this.score}`, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px', color: '#d4a96a',
      stroke: '#1a0a08', strokeThickness: 3,
    });
    this.levelText = this.add.text(GAME_WIDTH - 200, HUD_Y + 34, `Level: ${this.level}`, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px', color: '#ffe8c0',
      stroke: '#1a0a08', strokeThickness: 3,
    });

    // Pause button
    this._buildIconButton(GAME_WIDTH - 54, HUD_Y + HUD_H / 2, '⏸', () => {
      this.arenaScene._togglePause();
    });
  }

  _drawBarTrack(x, y, w, h, isHp) {
    const g = this.add.graphics();
    // Outer shadow
    g.fillStyle(0x000000, 0.65);
    g.fillRoundedRect(x + 2, y + 2, w, h, 4);
    // Track — warm dark for HP, cold dark for stamina
    g.fillStyle(isHp ? 0x0d0505 : 0x05050d, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    // Gold-ish border
    g.lineStyle(1.5, isHp ? 0x5a1a1a : 0x1a3a5a, 0.95);
    g.strokeRoundedRect(x, y, w, h, 4);
    // Inner top shadow line
    g.lineStyle(1, 0x000000, 0.55);
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

    const baseColor  = isStamina ? STAM_FILL  : (ratio < 0.25 ? HP_LOW_FILL : HP_FILL);
    const shineColor = isStamina ? STAM_SHINE : HP_SHINE;

    // Base fill
    g.fillStyle(baseColor, 1);
    g.fillRoundedRect(0, 0, fillW, h, 3);
    // Top shine
    g.fillStyle(shineColor, 0.35);
    g.fillRoundedRect(1, 0, Math.max(1, fillW - 2), Math.floor(h * 0.42), { tl: 3, tr: 3, bl: 0, br: 0 });
    // Bottom shadow
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(0, Math.floor(h * 0.6), fillW, Math.floor(h * 0.4), { tl: 0, tr: 0, bl: 3, br: 3 });

    // Pulse the HP heart when critical
    if (!isStamina && this.hpIcon) {
      if (ratio < 0.25 && !this._heartPulseTween) {
        this._heartPulseTween = this.tweens.add({
          targets: this.hpIcon, scaleX: 1.18, scaleY: 1.18,
          duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      } else if (ratio >= 0.25 && this._heartPulseTween) {
        this._heartPulseTween.stop();
        this.hpIcon.setScale(1);
        this._heartPulseTween = null;
      }
    }
  }

  _buildSkillSlot(x, y, keyLabel, color, iconKey, size = 50) {
    // Drop shadow
    const shad = this.add.graphics();
    shad.fillStyle(0x000000, 0.55);
    shad.fillRoundedRect(x + 3, y + 3, size, size, 9);

    const bg = this.add.graphics();
    // Warm dark slot background
    bg.fillStyle(0x1a0e08, 1);
    bg.fillRoundedRect(x, y, size, size, 9);
    // Bottom-half darkening (depth illusion)
    bg.fillStyle(0x000000, 0.30);
    bg.fillRoundedRect(x, y + size / 2, size, size / 2, { tl: 0, tr: 0, bl: 9, br: 9 });
    // Gold outer border
    bg.lineStyle(2.5, PANEL_BORDER, 0.85);
    bg.strokeRoundedRect(x, y, size, size, 9);
    // Inner skill-color glow border
    bg.lineStyle(1, color, 0.65);
    bg.strokeRoundedRect(x + 2, y + 2, size - 4, size - 4, 7);
    // Warm cream top shine
    bg.lineStyle(1, PANEL_SHINE, 0.14);
    bg.lineBetween(x + 8, y + 2, x + size - 8, y + 2);

    // Skill icon centered
    const icon = this.add.image(x + size / 2, y + size / 2, iconKey).setOrigin(0.5);

    // Key label in bottom-right corner
    const text = this.add.text(x + size - 3, y + size - 2, keyLabel, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '13px', color: '#ffe8c0',
      stroke: '#1a0a08', strokeThickness: 3,
    }).setOrigin(1, 1);

    const cooldownOverlay = this.add.graphics();
    cooldownOverlay.setDepth(5);

    return { bg, shad, text, icon, cooldownOverlay, x, y, size };
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
        slot.cooldownOverlay.fillStyle(0x000000, 0.72);
        slot.cooldownOverlay.fillRoundedRect(
          slot.x, slot.y, slot.size, slot.size * ratio,
          { tl: 0, tr: 0, bl: 9, br: 9 }
        );
      }
    });
  }

  _buildIconButton(x, y, icon, onClick) {
    const btn = this.add.text(x, y, icon, {
      fontFamily: 'Nunito', fontSize: '28px', color: '#d4a96a',
    }).setOrigin(0.5).setInteractive({ cursor: 'pointer' });
    btn.on('pointerover', () => { btn.setColor('#fff5d0'); btn.setScale(1.15); });
    btn.on('pointerout',  () => { btn.setColor('#d4a96a'); btn.setScale(1); });
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
    panelShadow.fillStyle(0x000000, 0.75);
    panelShadow.fillRoundedRect(bx - pad + 5, by - 10 + 5, bw + pad * 2, bh + 54, 14);

    // Panel background — near-black red-tinted
    const bg = this.add.graphics();
    bg.fillStyle(BOSS_PANEL, 0.98);
    bg.fillRoundedRect(bx - pad, by - 10, bw + pad * 2, bh + 54, 12);
    // Blood-red outer border
    bg.lineStyle(3, BOSS_BORDER, 0.95);
    bg.strokeRoundedRect(bx - pad, by - 10, bw + pad * 2, bh + 54, 12);
    // Ember inner glow
    bg.lineStyle(1, 0xff4422, 0.28);
    bg.strokeRoundedRect(bx - pad + 2, by - 8, bw + pad * 2 - 4, bh + 50, 10);
    // Faint top shine
    bg.fillStyle(0xffffff, 0.04);
    bg.fillRoundedRect(bx - pad + 2, by - 8, bw + pad * 2 - 4, 12, { tl: 10, tr: 10, bl: 0, br: 0 });

    // Boss name — warm parchment
    this.bossNameText = this.add.text(GAME_WIDTH / 2, by + 2, '', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '24px',
      color: PARCHMENT,
      stroke: '#3d0000',
      strokeThickness: 6,
    }).setOrigin(0.5, 0);

    // Bar track
    const barTrack = this.add.graphics();
    barTrack.fillStyle(0x000000, 0.6);
    barTrack.fillRoundedRect(bx + 2, by + 32, bw, bh, 5); // shadow
    barTrack.fillStyle(0x130304, 1);
    barTrack.fillRoundedRect(bx, by + 30, bw, bh, 5);
    barTrack.lineStyle(1.5, 0x4a0000, 0.95);
    barTrack.strokeRoundedRect(bx, by + 30, bw, bh, 5);

    // HP fill (redrawn dynamically)
    this.bossHpFill = this.add.graphics();
    this._redrawBossBar(1);

    // Static shine overlay
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.12);
    shine.fillRoundedRect(bx + 2, by + 31, bw - 4, Math.floor(bh * 0.38), { tl: 4, tr: 4, bl: 0, br: 0 });

    // Jagged crack-style segment ticks at 25%, 50%, 75%
    const ticks = this.add.graphics();
    [0.25, 0.5, 0.75].forEach(pct => {
      const sx = bx + bw * pct;
      // Two offset short lines simulating a chipped crack
      ticks.lineStyle(2, 0x000000, 0.65);
      ticks.lineBetween(sx - 1, by + 31, sx + 1, by + 30 + bh / 2);
      ticks.lineBetween(sx + 1, by + 30 + bh / 2, sx - 1, by + 30 + bh - 1);
      // Bright inner highlight crack
      ticks.lineStyle(1, 0xff8866, 0.30);
      ticks.lineBetween(sx, by + 31, sx, by + 30 + bh - 1);
    });
    // Tick labels — added to container so they hide/show with it
    const tickLabels = [0.25, 0.5, 0.75].map(pct =>
      this.add.text(bx + bw * pct, by + 30 + bh + 4, `${pct * 100 | 0}%`, {
        fontFamily: 'Nunito', fontSize: '10px', color: '#aa5544'
      }).setOrigin(0.5, 0)
    );

    // Skull icon — slightly larger, parchment-red
    const skull = this.add.text(bx - 6, by + 30 + bh / 2, '☠', {
      fontFamily: 'Nunito', fontSize: '20px', color: '#cc4444'
    }).setOrigin(1, 0.5);

    // ENRAGED flash text (hidden by default)
    this.enragedText = this.add.text(GAME_WIDTH / 2, by + 30 + bh / 2, 'ENRAGED!', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '28px',
      color: '#ff4400',
      stroke: '#220000',
      strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setScale(0);

    this.bossBarContainer.add([
      panelShadow, bg, barTrack, this.bossHpFill, shine, ticks,
      ...tickLabels, this.bossNameText, skull, this.enragedText,
    ]);
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
    this.bossHpFill.fillStyle(0xffffff, 0.30);
    this.bossHpFill.fillRoundedRect(bx + 2, by + 32, fillW - 4, Math.floor((bh - 4) * 0.38), { tl: 4, tr: 4, bl: 0, br: 0 });
    // Bottom shadow
    this.bossHpFill.fillStyle(0x000000, 0.30);
    this.bossHpFill.fillRoundedRect(
      bx + 2, by + 32 + Math.floor((bh - 4) * 0.62),
      fillW - 4, Math.floor((bh - 4) * 0.38),
      { tl: 0, tr: 0, bl: 4, br: 4 }
    );
  }

  _flashEnraged() {
    if (!this.enragedText) return;
    this.enragedText.setScale(0).setAlpha(1);
    this.tweens.add({
      targets: this.enragedText, scaleX: 1.3, scaleY: 1.3,
      duration: 250, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.enragedText, alpha: 0,
          duration: 550, ease: 'Quad.easeIn',
        });
      },
    });
  }

  // ─── Pause Menu ──────────────────────────────────────────────────────────────

  _buildPauseMenu() {
    const w = 330, h = 290, r = 16;
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    this.pauseContainer = this.add.container(cx, cy);
    this.pauseContainer.setVisible(false).setDepth(200);

    // Drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.70);
    shadow.fillRoundedRect(-w / 2 + 7, -h / 2 + 7, w, h, r);

    const bg = this.add.graphics();
    // Warm dark wood
    bg.fillStyle(0x140c06, 0.97);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    // Gold border
    bg.lineStyle(2.5, PANEL_BORDER, 0.88);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    // Brown secondary border
    bg.lineStyle(1, PANEL_INNER, 0.40);
    bg.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, r - 2);
    // Top shine
    bg.fillStyle(0xffffff, 0.05);
    bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, 20, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    const title = this.add.text(0, -h / 2 + 38, 'PAUSED', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '36px', color: PARCHMENT,
      stroke: '#4a2800', strokeThickness: 4,
    }).setOrigin(0.5);

    const div = this.add.graphics();
    div.lineStyle(1, PANEL_BORDER, 0.45);
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
    shadow.fillStyle(0x000000, 0.50);
    shadow.fillRoundedRect(x - bw / 2 + 3, y - bh / 2 + 3, bw, bh, r);

    const bg = this.add.graphics();
    // Dark warm brown button
    bg.fillStyle(0x2a1508, 1);
    bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);
    // Warm top shine
    bg.fillStyle(PANEL_SHINE, 0.09);
    bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh / 2, { tl: r, tr: r, bl: 0, br: 0 });
    // Gold border
    bg.lineStyle(1.5, PANEL_BORDER, 0.75);
    bg.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);

    // Hover overlay (gold tint)
    const hoverG = this.add.graphics();
    hoverG.fillStyle(PANEL_BORDER, 0.18);
    hoverG.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);
    hoverG.setAlpha(0);

    const txt = this.add.text(x, y, label, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '24px', color: PARCHMENT,
      stroke: '#1a0a08', strokeThickness: 3,
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

    a.events.on('bossEnraged', () => this._flashEnraged());

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
