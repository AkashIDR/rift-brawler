import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/gameConfig.js';

// ─── Stat panel (bottom-left floating) ──────────────────────────────────────
const STAT_PX = 14;
const STAT_PY = GAME_HEIGHT - 98;
const STAT_PW = 244;
const STAT_PH = 84;
const BAR_W   = 188;
const BAR_H   = 16;

// ─── Circular skill slots ────────────────────────────────────────────────────
const SLOT_R   = 32;   // outer radius
const SLOT_GAP = 10;
const SLOT_CY  = GAME_HEIGHT - 46;   // slot center Y

// ─── Boss bar ────────────────────────────────────────────────────────────────
const BOSS_BW = 540;
const BOSS_BH = 24;
const BOSS_BY = 44;

// ─── Comical High Fantasy palette ───────────────────────────────────────────
const PANEL_BG    = 0x1a0a08;
const PANEL_SHINE = 0xfff5d0;
const HP_FILL     = 0xc0392b;
const HP_SHINE    = 0xff8080;
const HP_LOW_FILL = 0xff0000;
const STAM_FILL   = 0x1a6ba0;
const STAM_SHINE  = 0x74d0ff;
const BOSS_BORDER = 0xaa0000;
const GOLD        = 0xd4a96a;
const PARCHMENT   = '#ffe8c0';

export default class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  init(data) {
    this.arenaScene = data.arenaScene;
    this.level      = data.level;
    this.score      = data.score;
    this.bossName   = '';
    this.bossMaxHp  = 1;
    this.bossHp     = 0;
    this.isPaused   = false;
  }

  create() {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this._buildIconTextures();
    this._buildHUD();
    this._buildBossBar();
    this._buildPauseMenu();
    this._listenToArena();

    this.input.keyboard.on('keydown-ESC', () => this.arenaScene._togglePause());
  }

  update() {
    const arena = this.arenaScene;
    if (!arena || !arena.player) return;
    const p = arena.player;

    const hpRatio = Math.max(0, p.hp / p.maxHp);
    const stRatio = Math.max(0, p.stamina / p.staminaMax);

    this._updateBar(this.hpBarFill, hpRatio, false);
    this._updateBar(this.stBarFill, stRatio, true);

    if (this.hpNumText) this.hpNumText.setText(`${Math.ceil(p.hp)} / ${p.maxHp}`);
    if (this.stNumText) this.stNumText.setText(`${Math.ceil(p.stamina)} / ${p.staminaMax}`);

    this._updateSkillCooldowns(p);
  }

  // ─── Icon textures ──────────────────────────────────────────────────────────

  _buildIconTextures() {
    this._bakeHeartIcon();
    this._bakeBoltIcon();
    this._bakeBossCapTexture();
    this._bakeSkillIcon('skill-q-strike',    0xffdd44, this._drawStrikeIcon);
    this._bakeSkillIcon('skill-w-shield',    0x44aaff, this._drawShieldIcon);
    this._bakeSkillIcon('skill-e-slam',      0xff6600, this._drawSlamIcon);
    this._bakeSkillIcon('skill-space-dodge', 0x44cc88, this._drawDodgeIcon);
  }

  _bakeHeartIcon() {
    const key = 'ui-heart';
    if (this.textures.exists(key)) return;
    const w = 26, h = 24;
    const tex = this.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    ctx.fillStyle = '#3a0606';
    this._heartPath(ctx, w / 2, h / 2 + 1, 11);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    this._heartPath(ctx, w / 2, h / 2, 9.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,170,170,0.85)';
    ctx.beginPath();
    ctx.ellipse(w / 2 - 3, h / 2 - 4, 2.5, 1.7, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(w / 2 - 3.5, h / 2 - 4.5, 0.9, 0, Math.PI * 2);
    ctx.fill();
    tex.refresh();
  }

  _heartPath(ctx, cx, cy, s) {
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
    const pts = [[10,1],[3,12],[8,12],[5,23],[15,10],[9,10],[13,1]];
    ctx.fillStyle = '#3a3000';
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff080';
    ctx.beginPath();
    pts.forEach(([x, y], i) => {
      const ix = x + (x < 8 ? 0.6 : -0.6);
      const iy = y + (y < 12 ? 0.6 : -0.6);
      if (i === 0) ctx.moveTo(ix, iy); else ctx.lineTo(ix, iy);
    });
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(9.5, 3); ctx.lineTo(6.5, 11); ctx.lineTo(8, 11); ctx.lineTo(10.5, 3);
    ctx.closePath();
    ctx.fill();
    tex.refresh();
  }

  // Boss bar spear-tip end-cap — bronze/gold elongated diamond
  _bakeBossCapTexture() {
    const key = 'ui-boss-cap';
    if (this.textures.exists(key)) return;
    const w = 44, h = 36;
    const tex = this.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    const tip = 0, cy = h / 2, joinX = w - 2;

    // Outer dark bronze body
    ctx.fillStyle = '#4a2808';
    ctx.beginPath();
    ctx.moveTo(tip, cy);
    ctx.lineTo(14, cy - 14);
    ctx.lineTo(joinX, cy - 6);
    ctx.lineTo(joinX, cy + 6);
    ctx.lineTo(14, cy + 14);
    ctx.closePath();
    ctx.fill();

    // Inner warm gold face
    ctx.fillStyle = '#c8861a';
    ctx.beginPath();
    ctx.moveTo(tip + 3, cy);
    ctx.lineTo(15, cy - 11);
    ctx.lineTo(joinX, cy - 4);
    ctx.lineTo(joinX, cy + 4);
    ctx.lineTo(15, cy + 11);
    ctx.closePath();
    ctx.fill();

    // Raised ridge line down center
    ctx.strokeStyle = '#e8a030';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(tip + 4, cy);
    ctx.lineTo(joinX - 1, cy);
    ctx.stroke();

    // Center medallion circle
    ctx.fillStyle = '#d4a96a';
    ctx.beginPath();
    ctx.arc(29, cy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7a4f1e';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(29, cy, 6, 0, Math.PI * 2);
    ctx.stroke();

    // Specular dot on medallion
    ctx.fillStyle = 'rgba(255,245,208,0.85)';
    ctx.beginPath();
    ctx.arc(27, cy - 2, 2, 0, Math.PI * 2);
    ctx.fill();

    // Dark outline
    ctx.strokeStyle = '#1a0800';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(tip, cy);
    ctx.lineTo(14, cy - 14);
    ctx.lineTo(joinX, cy - 6);
    ctx.lineTo(joinX, cy + 6);
    ctx.lineTo(14, cy + 14);
    ctx.closePath();
    ctx.stroke();

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

  _drawStrikeIcon(ctx, s, color) {
    const cx = s / 2, cy = s / 2;
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.strokeStyle = hex; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.globalAlpha = 0.65;
    [[-6,-5],[-9,0],[-6,5]].forEach(([dx,dy]) => {
      ctx.beginPath(); ctx.moveTo(cx+dx-4, cy+dy); ctx.lineTo(cx+dx, cy+dy); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.fillStyle = hex;
    ctx.beginPath(); ctx.ellipse(cx+2, cy, 9, 5, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffffee';
    ctx.beginPath(); ctx.ellipse(cx+4, cy-1, 3.5, 1.8, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#332200'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(cx+2, cy, 9, 5, 0, 0, Math.PI*2); ctx.stroke();
  }

  _drawShieldIcon(ctx, s, color) {
    const cx = s/2, cy = s/2;
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.fillStyle = '#0a2540';
    ctx.beginPath();
    ctx.moveTo(cx, cy-12); ctx.lineTo(cx+9.5, cy-9); ctx.lineTo(cx+9.5, cy+2);
    ctx.bezierCurveTo(cx+9.5, cy+8, cx+4, cy+12, cx, cy+13);
    ctx.bezierCurveTo(cx-4, cy+12, cx-9.5, cy+8, cx-9.5, cy+2);
    ctx.lineTo(cx-9.5, cy-9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.moveTo(cx, cy-10); ctx.lineTo(cx+7.8, cy-7.5); ctx.lineTo(cx+7.8, cy+2);
    ctx.bezierCurveTo(cx+7.8, cy+7, cx+3.3, cy+10.5, cx, cy+11.5);
    ctx.bezierCurveTo(cx-3.3, cy+10.5, cx-7.8, cy+7, cx-7.8, cy+2);
    ctx.lineTo(cx-7.8, cy-7.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx-4, cy-5); ctx.lineTo(cx+4, cy); ctx.lineTo(cx-4, cy+5);
    ctx.lineTo(cx-2, cy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx-7, cy-7); ctx.lineTo(cx, cy-9.5); ctx.lineTo(cx+7, cy-7); ctx.stroke();
  }

  _drawSlamIcon(ctx, s, color) {
    const cx = s/2, cy = s/2;
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.fillStyle = hex;
    const spikes = 6;
    for (let i = 0; i < spikes; i++) {
      const a = (i / spikes) * Math.PI * 2 - Math.PI / 2;
      const r1 = 4, r2 = 13, perp = a + Math.PI / 2, w = 2.2;
      const tipX = cx+Math.cos(a)*r2, tipY = cy+Math.sin(a)*r2;
      const b1X = cx+Math.cos(a)*r1+Math.cos(perp)*w, b1Y = cy+Math.sin(a)*r1+Math.sin(perp)*w;
      const b2X = cx+Math.cos(a)*r1-Math.cos(perp)*w, b2Y = cy+Math.sin(a)*r1-Math.sin(perp)*w;
      ctx.beginPath(); ctx.moveTo(tipX,tipY); ctx.lineTo(b1X,b1Y); ctx.lineTo(b2X,b2Y); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#3a1600';
    ctx.beginPath(); ctx.arc(cx, cy, 4.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff0c0';
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx-0.8, cy-0.8, 0.9, 0, Math.PI*2); ctx.fill();
  }

  _drawDodgeIcon(ctx, s, color) {
    const cx = s/2, cy = s/2;
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.strokeStyle = hex; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.globalAlpha = 0.50;
    [-7,-4,-1].forEach(off => {
      ctx.beginPath(); ctx.moveTo(cx-13, cy+off); ctx.lineTo(cx-6, cy+off); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    ctx.strokeStyle = hex; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy+1, 9, Math.PI*0.95, Math.PI*1.85, false); ctx.stroke();
    const tipX = cx + Math.cos(Math.PI*1.85)*9;
    const tipY = cy + 1 + Math.sin(Math.PI*1.85)*9;
    ctx.fillStyle = hex;
    ctx.beginPath();
    ctx.moveTo(tipX+5, tipY-2); ctx.lineTo(tipX-4, tipY-5); ctx.lineTo(tipX-1, tipY+3);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy+1, 9, Math.PI*1.05, Math.PI*1.5, false); ctx.stroke();
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  _buildHUD() {
    // ── Stat panel — small floating panel at bottom-left ──────────────────────
    const spx = STAT_PX, spy = STAT_PY, spw = STAT_PW, sph = STAT_PH;

    const panelShadow = this.add.graphics();
    panelShadow.fillStyle(0x000000, 0.60);
    panelShadow.fillRoundedRect(spx + 4, spy + 4, spw, sph, 10);

    const panelBg = this.add.graphics();
    panelBg.fillStyle(PANEL_BG, 0.95);
    panelBg.fillRoundedRect(spx, spy, spw, sph, 10);
    panelBg.lineStyle(2, GOLD, 0.78);
    panelBg.strokeRoundedRect(spx, spy, spw, sph, 10);
    // Subtle warm top shine
    panelBg.fillStyle(PANEL_SHINE, 0.06);
    panelBg.fillRoundedRect(spx + 2, spy + 2, spw - 4, 14, { tl: 9, tr: 9, bl: 0, br: 0 });

    const barX = spx + 36;

    // HP row
    const hpY = spy + 14;
    this.hpIcon = this.add.image(spx + 18, hpY + BAR_H / 2, 'ui-heart').setOrigin(0.5);
    this._drawBarTrack(barX, hpY, BAR_W, BAR_H, true);
    this.hpBarFill = this._makeBarFillG(barX, hpY, BAR_W, BAR_H);
    this.hpNumText = this.add.text(barX + BAR_W - 3, hpY + BAR_H / 2, '', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '10px',
      color: PARCHMENT, stroke: '#080000', strokeThickness: 2,
    }).setOrigin(1, 0.5).setDepth(2);

    // Stamina row
    const stY = hpY + 36;
    this.add.image(spx + 18, stY + BAR_H / 2, 'ui-bolt').setOrigin(0.5);
    this._drawBarTrack(barX, stY, BAR_W, BAR_H, false);
    this.stBarFill = this._makeBarFillG(barX, stY, BAR_W, BAR_H);
    this.stNumText = this.add.text(barX + BAR_W - 3, stY + BAR_H / 2, '', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '10px',
      color: PARCHMENT, stroke: '#00080a', strokeThickness: 2,
    }).setOrigin(1, 0.5).setDepth(2);

    // ── Circular skill slots — bottom-center, no panel ─────────────────────────
    const slotDiam   = SLOT_R * 2;
    const totalSlotW = 4 * slotDiam + 3 * SLOT_GAP;
    const firstCX    = (GAME_WIDTH - totalSlotW) / 2 + SLOT_R;
    this.skillSlots  = [];

    [
      { key: 'Q', color: 0xffdd44, icon: 'skill-q-strike'    },
      { key: 'W', color: 0x44aaff, icon: 'skill-w-shield'    },
      { key: 'E', color: 0xff6600, icon: 'skill-e-slam'      },
      { key: '␣', color: 0x44cc88, icon: 'skill-space-dodge' },
    ].forEach((sk, i) => {
      const cx = firstCX + i * (slotDiam + SLOT_GAP);
      this.skillSlots.push(this._buildSkillSlot(cx, SLOT_CY, sk.key, sk.color, sk.icon));
    });

    // ── Score / Level — floating bottom-right ─────────────────────────────────
    this.scoreText = this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 68, `Score: ${this.score}`, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px',
      color: '#d4a96a', stroke: '#1a0a08', strokeThickness: 3,
    }).setOrigin(1, 0);

    this.levelText = this.add.text(GAME_WIDTH - 20, GAME_HEIGHT - 42, `Level: ${this.level}`, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px',
      color: PARCHMENT, stroke: '#1a0a08', strokeThickness: 3,
    }).setOrigin(1, 0);

    // ── Pause button ──────────────────────────────────────────────────────────
    this._buildIconButton(GAME_WIDTH - 54, GAME_HEIGHT - 54, '⏸', () => {
      this.arenaScene._togglePause();
    });
  }

  _drawBarTrack(x, y, w, h, isHp) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.50);
    g.fillRoundedRect(x + 2, y + 2, w, h, 4);
    g.fillStyle(isHp ? 0x0d0505 : 0x05050d, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1.5, isHp ? 0x5a1a1a : 0x1a3a5a, 0.90);
    g.strokeRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, 0x000000, 0.45);
    g.lineBetween(x + 4, y + 1, x + w - 4, y + 1);
  }

  _makeBarFillG(x, y, w, h) {
    const g = this.add.graphics();
    g.x = x + 2;
    g.y = y + 2;
    g._maxFillW = w - 4;
    g._fillH    = h - 4;
    return g;
  }

  _updateBar(g, ratio, isStamina) {
    g.clear();
    const fillW = Math.max(0, g._maxFillW * ratio);
    const h     = g._fillH;
    if (fillW < 1) return;

    const baseColor  = isStamina ? STAM_FILL  : (ratio < 0.25 ? HP_LOW_FILL : HP_FILL);
    const shineColor = isStamina ? STAM_SHINE : HP_SHINE;

    g.fillStyle(baseColor, 1);
    g.fillRoundedRect(0, 0, fillW, h, 3);
    g.fillStyle(shineColor, 0.32);
    g.fillRoundedRect(1, 0, Math.max(1, fillW - 2), Math.floor(h * 0.42), { tl: 3, tr: 3, bl: 0, br: 0 });
    g.fillStyle(0x000000, 0.25);
    g.fillRoundedRect(0, Math.floor(h * 0.60), fillW, Math.floor(h * 0.40), { tl: 0, tr: 0, bl: 3, br: 3 });

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

  // ─── Circular skill slots ───────────────────────────────────────────────────

  _buildSkillSlot(cx, cy, keyLabel, color, iconKey) {
    const g = this.add.graphics();

    // Drop shadow
    g.fillStyle(0x000000, 0.55);
    g.fillCircle(cx + 3, cy + 3, SLOT_R);

    // Outer stone ring — dark charcoal
    g.fillStyle(0x1c1a18, 1);
    g.fillCircle(cx, cy, SLOT_R);

    // Stone rim highlight (lighter stroke)
    g.lineStyle(2, 0x5a5550, 0.65);
    g.strokeCircle(cx, cy, SLOT_R - 1);

    // Bottom-shadow arc baked into the ring
    g.lineStyle(3, 0x080706, 0.55);
    g.strokeCircle(cx, cy + 3, SLOT_R - 2);

    // Inner recess
    g.fillStyle(0x0f0c09, 1);
    g.fillCircle(cx, cy, 25);

    // Skill-color glow ring
    g.lineStyle(2, color, 0.70);
    g.strokeCircle(cx, cy, 24);

    // Icon
    const icon = this.add.image(cx, cy, iconKey).setOrigin(0.5);

    // Key label inside bottom of slot
    const text = this.add.text(cx, cy + 19, keyLabel, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '12px',
      color: '#d4a96a', stroke: '#0a0600', strokeThickness: 3,
    }).setOrigin(0.5, 0.5);

    // Cooldown overlay — live, redrawn each frame
    const cooldownOverlay = this.add.graphics().setDepth(5);

    return { cx, cy, g, icon, text, cooldownOverlay };
  }

  _updateSkillCooldowns(player) {
    const now = this.arenaScene.time.now;
    ['Q', 'W', 'E', 'SPACE'].forEach((k, i) => {
      const slot = this.skillSlots[i];
      if (!slot) return;
      const cdEnd   = player.skillCooldowns?.[k]         ?? 0;
      const cdTotal = player.skillCooldownDurations?.[k] ?? 1;
      const ratio   = Math.max(0, Math.min(1, (cdEnd - now) / cdTotal));
      slot.cooldownOverlay.clear();
      if (ratio > 0.02) {
        const { cx, cy } = slot;
        const r      = 23;
        const pts    = [{ x: cx, y: cy }];
        const segs   = 32;
        const startA = -Math.PI / 2;
        const endA   = startA + ratio * Math.PI * 2;
        for (let j = 0; j <= segs; j++) {
          const a = startA + (endA - startA) * (j / segs);
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        slot.cooldownOverlay.fillStyle(0x000000, 0.72);
        slot.cooldownOverlay.fillPoints(pts, true);
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
    const bw = BOSS_BW, bh = BOSS_BH, by = BOSS_BY;
    const bx = (GAME_WIDTH - bw) / 2;

    this.bossBarContainer = this.add.container(0, 0);
    this.bossBarContainer.setVisible(false);

    // 1. Assembly drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.65);
    shadow.fillRoundedRect(bx - 12 + 4, by - 8 + 4, bw + 24, bh + 16, 8);

    // 2. Outer housing beam (dark warm wood — the "mount")
    const housing = this.add.graphics();
    housing.fillStyle(0x1a0d05, 1);
    housing.fillRoundedRect(bx - 8, by - 6, bw + 16, bh + 12, 6);
    housing.lineStyle(2.5, 0x6b3a1f, 0.90);
    housing.strokeRoundedRect(bx - 8, by - 6, bw + 16, bh + 12, 6);
    // Inner highlight stripe on housing
    housing.lineStyle(1, 0x8b5e3c, 0.28);
    housing.strokeRoundedRect(bx - 6, by - 4, bw + 12, bh + 8, 5);

    // 3. Inner bar track (recessed)
    const barTrack = this.add.graphics();
    barTrack.fillStyle(0x050101, 1);
    barTrack.fillRoundedRect(bx, by, bw, bh, 5);
    barTrack.lineStyle(1.5, BOSS_BORDER, 0.85);
    barTrack.strokeRoundedRect(bx, by, bw, bh, 5);

    // 4. HP fill (redrawn dynamically)
    this.bossHpFill = this.add.graphics();
    this._redrawBossBar(1);

    // 5. Static shine overlay on track
    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.07);
    shine.fillRoundedRect(bx + 2, by + 2, bw - 4, Math.floor(bh * 0.38), { tl: 4, tr: 4, bl: 0, br: 0 });

    // 6. Decorative spear-tip end-caps
    const leftCap = this.add.image(bx - 10, by + bh / 2, 'ui-boss-cap')
      .setOrigin(1, 0.5).setScale(1.15);
    const rightCap = this.add.image(bx + bw + 10, by + bh / 2, 'ui-boss-cap')
      .setOrigin(0, 0.5).setScale(1.15).setFlipX(true);

    // 7. Boss name — warm parchment, floating above bar
    this.bossNameText = this.add.text(GAME_WIDTH / 2, 12, '', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '26px',
      color: PARCHMENT,
      stroke: '#2a0000',
      strokeThickness: 6,
    }).setOrigin(0.5, 0);

    // 8. ENRAGED! flash text (hidden by default)
    this.enragedText = this.add.text(GAME_WIDTH / 2, by + bh + 10, 'ENRAGED!', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '28px',
      color: '#ff4400',
      stroke: '#220000',
      strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setScale(0);

    this.bossBarContainer.add([
      shadow, housing, barTrack, this.bossHpFill, shine,
      leftCap, rightCap, this.bossNameText, this.enragedText,
    ]);
  }

  _redrawBossBar(ratio) {
    const bw = BOSS_BW, bh = BOSS_BH, by = BOSS_BY;
    const bx = (GAME_WIDTH - bw) / 2;
    this.bossHpFill.clear();
    const fillW = Math.max(0, bw * ratio);
    if (fillW < 3) return;

    const col = ratio > 0.5 ? COLORS.BOSS_HP : ratio > 0.25 ? COLORS.BOSS_HP_MID : COLORS.BOSS_HP_LOW;
    this.bossHpFill.fillStyle(col, 1);
    this.bossHpFill.fillRoundedRect(bx + 2, by + 2, fillW - 4, bh - 4, 4);
    // Top shine
    this.bossHpFill.fillStyle(0xffffff, 0.28);
    this.bossHpFill.fillRoundedRect(bx + 2, by + 2, fillW - 4, Math.floor((bh - 4) * 0.38), { tl: 4, tr: 4, bl: 0, br: 0 });
    // Bottom shadow
    this.bossHpFill.fillStyle(0x000000, 0.28);
    this.bossHpFill.fillRoundedRect(
      bx + 2, by + 2 + Math.floor((bh - 4) * 0.62),
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
          targets: this.enragedText, alpha: 0, duration: 550, ease: 'Quad.easeIn',
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

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.70);
    shadow.fillRoundedRect(-w / 2 + 7, -h / 2 + 7, w, h, r);

    const bg = this.add.graphics();
    bg.fillStyle(0x140c06, 0.97);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(2.5, GOLD, 0.88);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(1, 0x8b5e3c, 0.40);
    bg.strokeRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, r - 2);
    bg.fillStyle(0xffffff, 0.05);
    bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, 20, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    const title = this.add.text(0, -h / 2 + 38, 'PAUSED', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '36px',
      color: PARCHMENT, stroke: '#4a2800', strokeThickness: 4,
    }).setOrigin(0.5);

    const div = this.add.graphics();
    div.lineStyle(1, GOLD, 0.45);
    div.lineBetween(-w / 2 + 28, -h / 2 + 64, w / 2 - 28, -h / 2 + 64);

    this.pauseContainer.add([shadow, bg, title, div]);
    this._addPauseBtn('RESUME',    0,  18, () => this.arenaScene._togglePause());
    this._addPauseBtn('MAIN MENU', 0,  88, () => {
      this.scene.stop();
      this.arenaScene.scene.start('StartScene');
    });
  }

  _addPauseBtn(label, x, y, fn) {
    const bw = 220, bh = 46, r = 10;

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.50);
    shadow.fillRoundedRect(x - bw / 2 + 3, y - bh / 2 + 3, bw, bh, r);

    const bg = this.add.graphics();
    bg.fillStyle(0x2a1508, 1);
    bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);
    bg.fillStyle(PANEL_SHINE, 0.09);
    bg.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh / 2, { tl: r, tr: r, bl: 0, br: 0 });
    bg.lineStyle(1.5, GOLD, 0.75);
    bg.strokeRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);

    const hoverG = this.add.graphics();
    hoverG.fillStyle(GOLD, 0.18);
    hoverG.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);
    hoverG.setAlpha(0);

    const txt = this.add.text(x, y, label, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '24px',
      color: PARCHMENT, stroke: '#1a0a08', strokeThickness: 3,
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
      this.bossHp    = maxHp;
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
