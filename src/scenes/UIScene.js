import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/gameConfig.js';
import { getSettings, saveSetting, displayKey } from '../config/settings.js';
import { openSettingsOverlay } from '../ui/SettingsOverlay.js';
import { S, stoneTextStyle, makeStoneTexture, makeStoneFrameTexture, FONT, FONT_SYMBOL, LETTER_SPACING } from '../ui/StoneStyle.js';

// ─── Bar layout ──────────────────────────────────────────────────────────────
const LEFT_CAP_CX = 43;           // center X of left icon cap  (×1.2)
const BAR_X       = 68;           // bar track left edge        (×1.2)
const BAR_W       = 386;          //                            (×1.2)
const BAR_H       = 26;           //                            (×1.2)
const HP_BAR_Y    = GAME_HEIGHT - 112;
const ST_BAR_Y    = GAME_HEIGHT - 70;   // gap to HP bar unchanged at 16px

// ─── Circular skill slots ────────────────────────────────────────────────────
const SLOT_R   = 38;              // (×1.2)
const SLOT_GAP = 22;              // (×1.2)
const SLOT_CY  = GAME_HEIGHT - 52;      // keeps same 14px bottom margin

// ─── Boss bar ────────────────────────────────────────────────────────────────
const BOSS_BW = 648;              // (×1.2)
const BOSS_BH = 29;               // (×1.2)
const BOSS_BY = 44;

// ─── Skill tooltip info ──────────────────────────────────────────────────────
const SKILL_INFO = [
  { name: 'Power Strike', desc: 'Launch a piercing energy bolt toward your cursor.' },
  { name: 'Shield Dash',  desc: 'Charge forward dealing damage and gaining brief invincibility.' },
  { name: 'Ground Slam',  desc: 'Slam the ground to unleash a shockwave in a wide area.' },
  { name: 'Dodge Roll',   desc: 'Roll quickly to evade attacks and become briefly invincible.' },
];

// ─── Palette ─────────────────────────────────────────────────────────────────
const PANEL_SHINE = 0xfff5d0;
const HP_FILL     = 0xc0392b;
const HP_SHINE    = 0xff8080;
const HP_LOW_FILL = 0xff0000;
const STAM_FILL   = 0xcf8a00;   // warm golden amber — matches bolt icon energy
const STAM_SHINE  = 0xffe080;   // bright yellow shine
const BOSS_BORDER = 0xaa0000;
const GOLD        = 0xd4a96a;
const PARCHMENT   = '#ffe8c0';

export default class UIScene extends Phaser.Scene {
  constructor() { super({ key: 'UIScene' }); }

  init(data) {
    this.arenaScene = data.arenaScene;
    this.level      = data.level;
    this.score      = data.score;
    this.bossMaxHp  = 1;
    this.bossHp     = 0;
  }

  create() {
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');
    this._buildIconTextures();
    this._buildHUD();
    this._buildBossBar();
    this._buildPauseMenu();
    this._buildEditToolbar();
    this._listenToArena();
    this.input.keyboard.on('keydown-ESC', () => this.arenaScene._togglePause());
    this.refreshPauseKey();
  }

  refreshPauseKey() {
    if (this._pauseKey) { this._pauseKey.destroy(); this._pauseKey = null; }
    const code = getSettings().keys.pause || 'P';
    this._pauseKey = this.input.keyboard.addKey(code);
    this._pauseKey.on('down', () => this.arenaScene._togglePause());
  }

  refreshFpsVisibility() {
    if (this.fpsContainer) this.fpsContainer.setVisible(getSettings().showFps);
  }

  update() {
    if (this.fpsContainer?.visible) {
      this.fpsText.setText(`FPS: ${Math.round(this.game.loop.actualFps)}`);
    }
    const arena = this.arenaScene;
    if (!arena?.player) return;
    const p = arena.player;
    const hpR = Math.max(0, p.hp / p.maxHp);
    const stR = Math.max(0, p.stamina / p.staminaMax);
    this._updateBar(this.hpBarFill, hpR, false);
    this._updateBar(this.stBarFill, stR, true);
    if (this.hpNumText) this.hpNumText.setText(`${Math.ceil(p.hp)} / ${p.maxHp}`);
    if (this.stNumText) this.stNumText.setText(`${Math.ceil(p.stamina)} / ${p.staminaMax}`);
    this._updateSkillCooldowns(p);
    if (!this._editMode) this._checkSkillTooltips();
  }

  // ─── Icon textures ──────────────────────────────────────────────────────────

  _buildIconTextures() {
    this._bakeHeartIcon();
    this._bakeBoltIcon();
    this._bakeHpCap();
    this._bakeStamCap();
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
    ctx.fillStyle = '#3a0606'; this._heartPath(ctx, w/2, h/2+1, 11); ctx.fill();
    ctx.fillStyle = '#c0392b'; this._heartPath(ctx, w/2, h/2, 9.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,170,170,0.85)';
    ctx.beginPath(); ctx.ellipse(w/2-3, h/2-4, 2.5, 1.7, -0.5, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(w/2-3.5, h/2-4.5, 0.9, 0, Math.PI*2); ctx.fill();
    tex.refresh();
  }

  _heartPath(ctx, cx, cy, s) {
    // Classic two-lobe arc construction — clean, symmetric
    const lr = s * 0.52;
    const lx = cx - s * 0.5, ly = cy - s * 0.15;
    const rx = cx + s * 0.5, ry = cy - s * 0.15;
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.90);
    ctx.bezierCurveTo(cx - s*1.15, cy + s*0.35, cx - s*1.05, cy - s*0.55, lx, ly - lr);
    ctx.arc(lx, ly, lr, -Math.PI / 2, 0, false);
    ctx.arc(rx, ry, lr, Math.PI,      -Math.PI / 2, false);
    ctx.bezierCurveTo(cx + s*1.05, cy - s*0.55, cx + s*1.15, cy + s*0.35, cx, cy + s*0.90);
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
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i=1; i<pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff080';
    ctx.beginPath();
    pts.forEach(([x,y],i) => {
      const ix=x+(x<8?0.6:-0.6), iy=y+(y<12?0.6:-0.6);
      if (i===0) ctx.moveTo(ix,iy); else ctx.lineTo(ix,iy);
    });
    ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.moveTo(9.5,3); ctx.lineTo(6.5,11); ctx.lineTo(8,11); ctx.lineTo(10.5,3); ctx.closePath(); ctx.fill();
    tex.refresh();
  }

  // HP cap: heart-shaped housing + heart icon in one baked texture
  _bakeHpCap() {
    const key = 'ui-hp-cap';
    if (this.textures.exists(key)) return;
    const w = 52, h = 50;
    const tex = this.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    const cx = w / 2, cy = h / 2 + 1;

    // Housing drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this._heartPath(ctx, cx + 1, cy + 2, 16); ctx.fill();
    // Housing dark wood base
    ctx.fillStyle = '#1a0d08';
    this._heartPath(ctx, cx, cy, 16); ctx.fill();
    // Sphere-like gradient on housing
    const hg = ctx.createRadialGradient(cx - 6, cy - 7, 0, cx, cy, 20);
    hg.addColorStop(0,    'rgba(255,255,255,0.28)');
    hg.addColorStop(0.42, 'rgba(255,255,255,0.04)');
    hg.addColorStop(0.75, 'rgba(0,0,0,0.00)');
    hg.addColorStop(1.00, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = hg;
    this._heartPath(ctx, cx, cy, 16); ctx.fill();
    // Thin metallic rim
    ctx.strokeStyle = 'rgba(20,8,2,0.80)'; ctx.lineWidth = 1.8;
    this._heartPath(ctx, cx, cy, 16); ctx.stroke();

    // Inner heart icon — thin dark outline (s=14)
    ctx.fillStyle = '#3a0606';
    this._heartPath(ctx, cx, cy + 1, 14); ctx.fill();
    // Main red body (s=13 — fills most of housing, ~3px border)
    ctx.fillStyle = '#c0392b';
    this._heartPath(ctx, cx, cy, 13); ctx.fill();
    // Upper-shine (lighter red across top portion)
    ctx.fillStyle = 'rgba(220,100,100,0.50)';
    this._heartPath(ctx, cx, cy - 2, 9.5); ctx.fill();
    // Pink highlight ellipse on top-left lobe
    ctx.fillStyle = 'rgba(255,160,160,0.72)';
    ctx.beginPath(); ctx.ellipse(cx - 5, cy - 4, 4.0, 2.5, -0.45, 0, Math.PI * 2); ctx.fill();
    // White specular dot
    ctx.fillStyle = 'rgba(255,255,255,0.90)';
    ctx.beginPath(); ctx.arc(cx - 5.5, cy - 5, 1.5, 0, Math.PI * 2); ctx.fill();

    tex.refresh();
  }

  // Stamina cap: bolt-shaped housing + bolt icon in one baked texture
  _bakeStamCap() {
    const key = 'ui-stam-cap';
    if (this.textures.exists(key)) return;
    const w = 46, h = 56;
    const tex = this.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();

    // Scale both bolt shapes from their shared centroid → guaranteed concentric alignment
    const BOLT_CX = 9, BOLT_CY = 9.86;   // polygon centroid
    const makeBolt = (sx, targetX, targetY) =>
      [[10,1],[3,12],[8,12],[5,23],[15,10],[9,10],[13,1]]
        .map(([x, y]) => [(x - BOLT_CX) * sx + targetX, (y - BOLT_CY) * sx + targetY]);

    const bCx = w / 2, bCy = h / 2 + 2;   // canvas center (shift down 2px for visual balance)
    const outerPts = makeBolt(1.85, bCx, bCy);   // outer housing
    const innerPts = makeBolt(1.45, bCx, bCy);   // inner icon (~2-3px gap each side)

    const drawPoly = (pts) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    };

    // Housing shadow
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    drawPoly(outerPts.map(([x, y]) => [x + 1.5, y + 2])); ctx.fill();
    // Housing dark wood base
    ctx.fillStyle = '#1a0d08'; drawPoly(outerPts); ctx.fill();
    // Sphere-like gradient
    const bg = ctx.createRadialGradient(bCx - 8, bCy - 10, 0, bCx, bCy, 28);
    bg.addColorStop(0,    'rgba(255,255,255,0.28)');
    bg.addColorStop(0.40, 'rgba(255,255,255,0.04)');
    bg.addColorStop(0.75, 'rgba(0,0,0,0.00)');
    bg.addColorStop(1.00, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = bg; drawPoly(outerPts); ctx.fill();
    // Metallic rim
    ctx.strokeStyle = 'rgba(20,8,2,0.80)'; ctx.lineWidth = 1.8;
    drawPoly(outerPts); ctx.stroke();

    // Inner bolt icon — dark outline
    ctx.fillStyle = '#3a3000';
    drawPoly(innerPts.map(([x, y]) => [x + 0.5, y + 0.5])); ctx.fill();
    // Yellow body
    ctx.fillStyle = '#ffcc00'; drawPoly(innerPts); ctx.fill();
    // Top-shine
    ctx.fillStyle = 'rgba(255,245,150,0.45)'; drawPoly(innerPts); ctx.fill();
    // White specular streak on upper shaft
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.beginPath();
    ctx.moveTo(innerPts[6][0],     innerPts[6][1]);
    ctx.lineTo(innerPts[5][0] - 1, innerPts[5][1]);
    ctx.lineTo(innerPts[0][0] - 2, innerPts[0][1]);
    ctx.lineTo(innerPts[0][0] + 1, innerPts[0][1]);
    ctx.closePath(); ctx.fill();

    tex.refresh();
  }

  _bakeBossCapTexture() {
    const key = 'ui-boss-cap';
    if (this.textures.exists(key)) return;
    const w = 44, h = 36;
    const tex = this.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    const cy = h/2, tip = 0, joinX = w-2;
    ctx.fillStyle = '#4a2808';
    ctx.beginPath(); ctx.moveTo(tip,cy); ctx.lineTo(14,cy-14); ctx.lineTo(joinX,cy-6); ctx.lineTo(joinX,cy+6); ctx.lineTo(14,cy+14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c8861a';
    ctx.beginPath(); ctx.moveTo(tip+3,cy); ctx.lineTo(15,cy-11); ctx.lineTo(joinX,cy-4); ctx.lineTo(joinX,cy+4); ctx.lineTo(15,cy+11); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#e8a030'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(tip+4,cy); ctx.lineTo(joinX-1,cy); ctx.stroke();
    ctx.fillStyle = '#d4a96a'; ctx.beginPath(); ctx.arc(29,cy,6,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#7a4f1e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(29,cy,6,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,245,208,0.85)'; ctx.beginPath(); ctx.arc(27,cy-2,2,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1a0800'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(tip,cy); ctx.lineTo(14,cy-14); ctx.lineTo(joinX,cy-6); ctx.lineTo(joinX,cy+6); ctx.lineTo(14,cy+14); ctx.closePath(); ctx.stroke();
    tex.refresh();
  }

  _bakeSkillIcon(key, color, drawFn) {
    if (this.textures.exists(key)) return;
    const size = 38;
    const tex = this.textures.createCanvas(key, size, size);
    drawFn.call(this, tex.getContext(), size, color);
    tex.refresh();
  }

  // Q — Power Strike: glowing bullet with aura + speed lines
  _drawStrikeIcon(ctx, s, color) {
    const cx=s/2, cy=s/2, hex='#'+color.toString(16).padStart(6,'0');
    ctx.strokeStyle=hex; ctx.lineWidth=5; ctx.globalAlpha=0.12;
    ctx.beginPath(); ctx.ellipse(cx+2,cy,13,7,0,0,Math.PI*2); ctx.stroke();
    ctx.lineWidth=3; ctx.globalAlpha=0.20;
    ctx.beginPath(); ctx.ellipse(cx+2,cy,11,6,0,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=1;
    ctx.strokeStyle=hex; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.globalAlpha=0.65;
    [[-7,-6],[-10,0],[-7,6]].forEach(([dx,dy]) => {
      ctx.beginPath(); ctx.moveTo(cx+dx-5,cy+dy); ctx.lineTo(cx+dx,cy+dy); ctx.stroke();
    });
    ctx.globalAlpha=1;
    ctx.fillStyle=hex; ctx.beginPath(); ctx.ellipse(cx+2,cy,10,5.5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffffee'; ctx.beginPath(); ctx.ellipse(cx+4,cy-1,4,2,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(cx+11,cy,1.5,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#332200'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.ellipse(cx+2,cy,10,5.5,0,0,Math.PI*2); ctx.stroke();
  }

  // W — Shield Dash: detailed kite shield with embossed center
  _drawShieldIcon(ctx, s, color) {
    const cx=s/2, cy=s/2, hex='#'+color.toString(16).padStart(6,'0');
    ctx.fillStyle='#0a2540';
    ctx.beginPath();
    ctx.moveTo(cx,cy-13); ctx.lineTo(cx+10,cy-9.5); ctx.lineTo(cx+10,cy+2);
    ctx.bezierCurveTo(cx+10,cy+8,cx+4,cy+13,cx,cy+14);
    ctx.bezierCurveTo(cx-4,cy+13,cx-10,cy+8,cx-10,cy+2);
    ctx.lineTo(cx-10,cy-9.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle=hex;
    ctx.beginPath();
    ctx.moveTo(cx,cy-11); ctx.lineTo(cx+8,cy-8); ctx.lineTo(cx+8,cy+2);
    ctx.bezierCurveTo(cx+8,cy+7.5,cx+3.5,cy+11,cx,cy+12);
    ctx.bezierCurveTo(cx-3.5,cy+11,cx-8,cy+7.5,cx-8,cy+2);
    ctx.lineTo(cx-8,cy-8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.30)'; ctx.lineWidth=1.2;
    ctx.beginPath(); ctx.moveTo(cx-7,cy-1); ctx.lineTo(cx+7,cy-1); ctx.stroke();
    ctx.fillStyle='rgba(0,0,0,0.20)';
    ctx.beginPath(); ctx.ellipse(cx,cy+3,3.5,4.5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.ellipse(cx,cy+3,2.5,3.5,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffffff';
    ctx.beginPath(); ctx.moveTo(cx-4,cy-6); ctx.lineTo(cx+4,cy-1); ctx.lineTo(cx-4,cy+4); ctx.lineTo(cx-2,cy-1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.3;
    ctx.beginPath(); ctx.moveTo(cx-7,cy-7); ctx.lineTo(cx,cy-10); ctx.lineTo(cx+7,cy-7); ctx.stroke();
  }

  // E — Ground Slam: 8-spike burst with secondary ring
  _drawSlamIcon(ctx, s, color) {
    const cx=s/2, cy=s/2, hex='#'+color.toString(16).padStart(6,'0');
    ctx.fillStyle=hex; ctx.globalAlpha=0.15;
    ctx.beginPath(); ctx.arc(cx,cy,15,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha=1;
    ctx.fillStyle=hex;
    for (let i=0; i<8; i++) {
      const a=(i/8)*Math.PI*2-Math.PI/2, r1=4, r2=14, perp=a+Math.PI/2, w=2.0;
      ctx.beginPath();
      ctx.moveTo(cx+Math.cos(a)*r2, cy+Math.sin(a)*r2);
      ctx.lineTo(cx+Math.cos(a)*r1+Math.cos(perp)*w, cy+Math.sin(a)*r1+Math.sin(perp)*w);
      ctx.lineTo(cx+Math.cos(a)*r1-Math.cos(perp)*w, cy+Math.sin(a)*r1-Math.sin(perp)*w);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle=hex; ctx.lineWidth=1; ctx.globalAlpha=0.40;
    ctx.beginPath(); ctx.arc(cx,cy,9,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=1;
    ctx.fillStyle='#3a1600'; ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#fff0c0'; ctx.beginPath(); ctx.arc(cx,cy,3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(cx-0.8,cy-0.8,1.2,0,Math.PI*2); ctx.fill();
  }

  // Space — Dodge: bold rightward arrow with motion-ghost trail
  _drawDodgeIcon(ctx, s, color) {
    const cx=s/2, cy=s/2, hex='#'+color.toString(16).padStart(6,'0');
    [{ ox:-13,a:0.15 },{ ox:-8,a:0.32 },{ ox:-3,a:0.52 }].forEach(({ ox,a }) => {
      ctx.globalAlpha=a; ctx.fillStyle=hex;
      const bx=cx+ox;
      ctx.beginPath();
      ctx.moveTo(bx+12,cy); ctx.lineTo(bx+5,cy-7); ctx.lineTo(bx+5,cy-3);
      ctx.lineTo(bx-9,cy-3); ctx.lineTo(bx-9,cy+3); ctx.lineTo(bx+5,cy+3);
      ctx.lineTo(bx+5,cy+7); ctx.closePath(); ctx.fill();
    });
    ctx.globalAlpha=1;
    ctx.fillStyle=hex;
    const tip=cx+14, left=cx-9;
    ctx.beginPath();
    ctx.moveTo(tip,cy); ctx.lineTo(tip-8,cy-9); ctx.lineTo(tip-8,cy-4);
    ctx.lineTo(left,cy-4); ctx.lineTo(left,cy+4); ctx.lineTo(tip-8,cy+4);
    ctx.lineTo(tip-8,cy+9); ctx.closePath(); ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.30)';
    ctx.fillRect(left+1,cy-3,(tip-8)-(left+1),3);
    ctx.fillStyle='rgba(255,255,255,0.82)';
    ctx.beginPath(); ctx.moveTo(tip,cy); ctx.lineTo(tip-6,cy-5); ctx.lineTo(tip-4,cy-1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle='#0a1a10'; ctx.lineWidth=1.3;
    ctx.beginPath();
    ctx.moveTo(tip,cy); ctx.lineTo(tip-8,cy-9); ctx.lineTo(tip-8,cy-4);
    ctx.lineTo(left,cy-4); ctx.lineTo(left,cy+4); ctx.lineTo(tip-8,cy+4);
    ctx.lineTo(tip-8,cy+9); ctx.closePath(); ctx.stroke();
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────

  _buildHUD() {
    const layout = getSettings().uiLayout;

    // ── Resource panel (HP + Stamina bars) ───────────────────────────────────
    const hpMount  = this._buildBarMount(HP_BAR_Y, true);
    const hpTrack  = this._drawBarTrack(BAR_X, HP_BAR_Y, BAR_W, BAR_H, true);
    this.hpBarFill = this._makeBarFillG(BAR_X, HP_BAR_Y, BAR_W, BAR_H);
    this.hpNumText = this.add.text(BAR_X + BAR_W - 4, HP_BAR_Y + BAR_H / 2, '', {
      fontFamily: FONT, fontSize: '16px', letterSpacing: LETTER_SPACING,
      color: PARCHMENT, stroke: '#080000', strokeThickness: 2,
    }).setOrigin(1, 0.5).setDepth(2);

    const stMount  = this._buildBarMount(ST_BAR_Y, false);
    const stTrack  = this._drawBarTrack(BAR_X, ST_BAR_Y, BAR_W, BAR_H, false);
    this.stBarFill = this._makeBarFillG(BAR_X, ST_BAR_Y, BAR_W, BAR_H);
    this.stNumText = this.add.text(BAR_X + BAR_W - 4, ST_BAR_Y + BAR_H / 2, '', {
      fontFamily: FONT, fontSize: '16px', letterSpacing: LETTER_SPACING,
      color: PARCHMENT, stroke: '#00080a', strokeThickness: 2,
    }).setOrigin(1, 0.5).setDepth(2);

    this.resourceContainer = this.add.container(layout.resource.x, layout.resource.y)
      .setScale(layout.resource.scale).setDepth(10);
    this.resourceContainer.add([
      ...hpMount, ...hpTrack, this.hpBarFill, this.hpNumText,
      ...stMount, ...stTrack, this.stBarFill, this.stNumText,
    ]);

    // ── Skill bar ─────────────────────────────────────────────────────────────
    const slotDiam   = SLOT_R * 2;
    const totalSlotW = 4 * slotDiam + 3 * SLOT_GAP;
    const firstCX    = (GAME_WIDTH - totalSlotW) / 2 + SLOT_R;
    this.skillSlots  = [];
    const { keys }   = getSettings();
    const slotObjs   = [];
    [
      { keyLabel: displayKey(keys.skill1), color: 0xffdd44, icon: 'skill-q-strike'    },
      { keyLabel: displayKey(keys.skill2), color: 0x44aaff, icon: 'skill-w-shield'    },
      { keyLabel: displayKey(keys.skill3), color: 0xff6600, icon: 'skill-e-slam'      },
      { keyLabel: keys.dodge === 'SPACE' ? '_' : displayKey(keys.dodge), color: 0x44cc88, icon: 'skill-space-dodge' },
    ].forEach((sk, i) => {
      const cx   = firstCX + i * (slotDiam + SLOT_GAP);
      const slot = this._buildSkillSlot(cx, SLOT_CY, sk.keyLabel, sk.color, sk.icon);
      this.skillSlots.push(slot);
      slotObjs.push(slot.g, slot.icon, slot.text, slot.cooldownOverlay);
    });

    this.skillBarContainer = this.add.container(layout.skillBar.x, layout.skillBar.y)
      .setScale(layout.skillBar.scale).setDepth(10);
    this.skillBarContainer.add(slotObjs);

    // ── Score / Level — top-right text (no backing plaque) ───────────────────
    const scoreBlockW = 240, scoreBlockX = GAME_WIDTH - scoreBlockW - 8, scoreBlockY = 8;
    const scoreCX = scoreBlockX + scoreBlockW / 2;
    this.scoreText = this.add.text(scoreCX, scoreBlockY + 6, `Score: ${this.score}`,
      stoneTextStyle(37, '#c8a060')).setOrigin(0.5, 0);
    this.levelText = this.add.text(scoreCX, scoreBlockY + 52, `Level: ${this.level}`,
      stoneTextStyle(37, '#d0d0e8')).setOrigin(0.5, 0);

    this.scoreContainer = this.add.container(layout.score.x, layout.score.y)
      .setScale(layout.score.scale).setDepth(10);
    this.scoreContainer.add([this.scoreText, this.levelText]);

    // ── FPS counter (top-left, optional via settings) ────────────────────────
    this.fpsText = this.add.text(0, 0, 'FPS: 60', {
      fontFamily: FONT, fontSize: '18px', letterSpacing: LETTER_SPACING,
      color: PARCHMENT, stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0);
    this.fpsContainer = this.add.container(layout.fps.x + 16, layout.fps.y + 16)
      .setScale(layout.fps.scale).setDepth(10);
    this.fpsContainer.add(this.fpsText);
    this.fpsContainer.setVisible(getSettings().showFps);

    // ── Fullscreen + Pause buttons (bottom-right) ─────────────────────────────
    // ⛶ and ✕ have different glyph baselines — compensate with per-icon Y offsets
    const FS_X = GAME_WIDTH - 90;
    const FS_Y_NORMAL = GAME_HEIGHT - 33;   // ⛶ sits visually high → nudge down
    const FS_Y_FULL   = GAME_HEIGHT - 34;   // ✕ glyph baseline nudge
    const fsBtn = this._buildIconButton(FS_X, FS_Y_NORMAL, '⛶', () => {
      if (this.scale.isFullscreen) this.scale.stopFullscreen();
      else this.scale.startFullscreen();
    }).setDepth(15);
    this.scale.on('enterfullscreen', () => { fsBtn.setText('✕'); fsBtn.setY(FS_Y_FULL); fsBtn.setScale(0.95); });
    this.scale.on('leavefullscreen',  () => { fsBtn.setText('⛶'); fsBtn.setY(FS_Y_NORMAL); fsBtn.setScale(1); });

    this._buildIconButton(GAME_WIDTH - 54, GAME_HEIGHT - 36, '⏸', () => {
      this.arenaScene._togglePause();
    }).setDepth(15);
  }

  // Bar mount: dark housing beam with capsule right end + dark circle left cap
  _buildBarMount(barY, isHp) {
    const barCY     = barY + BAR_H / 2;
    const houseX    = BAR_X - 4;
    const houseW    = BAR_W + 8;
    const houseY    = barCY - BAR_H / 2 - 4;
    const houseH    = BAR_H + 8;
    const halfH     = Math.floor(houseH / 2);   // = 15 (used for left cap sizing)
    const capEnd    = 8;                          // right capsule protrusion — narrow
    const borderCol = isHp ? 0x5a2a10 : 0x4a3200;

    const g = this.add.graphics();

    // Housing beam — left: slightly rounded, right: narrow capsule (capEnd radius)
    g.fillStyle(0x1a0d08, 0.88);
    g.fillRoundedRect(houseX, houseY, houseW + capEnd, houseH, {
      tl: 5, tr: capEnd, bl: 5, br: capEnd,
    });
    g.lineStyle(1.5, borderCol, 0.65);
    g.strokeRoundedRect(houseX, houseY, houseW + capEnd, houseH, {
      tl: 5, tr: capEnd, bl: 5, br: capEnd,
    });

    // Housing top-shine — broad lift (top 45%) + 1px gloss edge
    g.fillStyle(0xffffff, 0.07);
    g.fillRoundedRect(houseX + 1, houseY + 1, houseW + capEnd - 2, Math.floor(houseH * 0.45), {
      tl: 4, tr: capEnd - 1, bl: 0, br: 0,
    });
    g.fillStyle(0xfff5d0, 0.18);
    g.fillRect(houseX + 8, houseY + 1, houseW + capEnd - 16, 1);

    // Left cap — combined housing + icon texture (shape matches icon exactly)
    let icon;
    if (isHp) {
      icon = this.add.image(LEFT_CAP_CX, barCY, 'ui-hp-cap').setOrigin(0.5).setScale(1.30);
      this.hpIcon = icon;
    } else {
      icon = this.add.image(LEFT_CAP_CX, barCY, 'ui-stam-cap').setOrigin(0.5).setScale(1.08);
    }
    return [g, icon];
  }

  _drawBarTrack(x, y, w, h, isHp) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.50);
    g.fillRoundedRect(x+2, y+2, w, h, 4);
    g.fillStyle(isHp ? 0x0d0505 : 0x0d0900, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1.5, isHp ? 0x5a1a1a : 0x4a3200, 0.90);
    g.strokeRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, 0x000000, 0.45);
    g.lineBetween(x+4, y+1, x+w-4, y+1);
    return [g];
  }

  _makeBarFillG(x, y, w, h) {
    const g = this.add.graphics();
    g.x = x + 2; g.y = y + 2;
    g._maxFillW = w - 4; g._fillH = h - 4;
    return g;
  }

  _updateBar(g, ratio, isStamina) {
    g.clear();
    const fillW = Math.max(0, g._maxFillW * ratio);
    const h = g._fillH;
    if (fillW < 1) return;
    const baseColor  = isStamina ? STAM_FILL  : (ratio < 0.25 ? HP_LOW_FILL : HP_FILL);
    const shineColor = isStamina ? STAM_SHINE : HP_SHINE;
    // 1. Base fill
    g.fillStyle(baseColor, 1);
    g.fillRoundedRect(0, 0, fillW, h, 3);
    // 2. Broad upper-half catch light
    g.fillStyle(0xffffff, 0.10);
    g.fillRoundedRect(0, 0, fillW, Math.floor(h * 0.55), { tl:3, tr:3, bl:0, br:0 });
    // 3. Upper third — brighter convex peak
    g.fillStyle(0xffffff, 0.14);
    g.fillRoundedRect(1, 0, Math.max(1, fillW-2), Math.floor(h * 0.35), { tl:3, tr:3, bl:0, br:0 });
    // 4. Top quarter — core specular band (hue-tinted shine)
    g.fillStyle(shineColor, 0.35);
    g.fillRoundedRect(2, 0, Math.max(1, fillW-4), Math.floor(h * 0.20), { tl:3, tr:3, bl:0, br:0 });
    // 5. Very top edge — 2px near-white gloss line
    g.fillStyle(0xffffff, 0.40);
    g.fillRect(3, 0, Math.max(1, fillW-6), 2);
    // 6. Bottom shadow
    g.fillStyle(0x000000, 0.32);
    g.fillRoundedRect(0, Math.floor(h*0.60), fillW, Math.floor(h*0.40), { tl:0, tr:0, bl:3, br:3 });

    if (!isStamina && this.hpIcon) {
      if (ratio < 0.25 && !this._heartPulseTween) {
        this._heartPulseTween = this.tweens.add({
          targets: this.hpIcon, scaleX: 1.18, scaleY: 1.18,
          duration: 320, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      } else if (ratio >= 0.25 && this._heartPulseTween) {
        this._heartPulseTween.stop(); this.hpIcon.setScale(1); this._heartPulseTween = null;
      }
    }
  }

  // ─── Circular skill slots ───────────────────────────────────────────────────

  _buildSkillSlot(cx, cy, keyLabel, color, iconKey) {
    // Canvas-baked round stone casing — same gradient bevel as the menu buttons, with the
    // per-slot colored gem ring baked in. One cached texture per color (4 total).
    const slotTexKey = `skill-slot-${color.toString(16)}`;
    makeStoneTexture(this, slotTexKey, {
      w: SLOT_R * 2, h: SLOT_R * 2, shape: 'circle', bevel: 6, accentRing: color, seed: color & 0xff,
    });
    const g = this.add.image(cx, cy, slotTexKey).setOrigin(0.5);
    const icon = this.add.image(cx, cy, iconKey).setOrigin(0.5).setScale(1.4);
    const text = this.add.text(cx, cy + Math.round(SLOT_R * 0.63), keyLabel, {
      fontFamily: FONT, fontSize: '14px', letterSpacing: LETTER_SPACING,
      color: '#d4a96a', stroke: '#0a0600', strokeThickness: 3,
    }).setOrigin(0.5, 0.5);
    const cooldownOverlay = this.add.graphics().setDepth(5);
    return { cx, cy, g, icon, text, cooldownOverlay };
  }

  _updateSkillCooldowns(player) {
    const now = this.arenaScene.time.now;
    ['Q','W','E','SPACE'].forEach((k, i) => {
      const slot = this.skillSlots[i];
      if (!slot) return;
      const cdEnd   = player.skillCooldowns?.[k]         ?? 0;
      const cdTotal = player.skillCooldownDurations?.[k] ?? 1;
      const ratio   = Math.max(0, Math.min(1, (cdEnd - now) / cdTotal));
      slot.cooldownOverlay.clear();
      if (ratio > 0.02) {
        const { cx, cy } = slot;
        const r = 24;
        // Sweep CCW from 12 → bright area grows clockwise from 12 o'clock
        const startA = -Math.PI / 2;
        const endA   = startA - ratio * Math.PI * 2;
        const pts = [{ x: cx, y: cy }];
        for (let j = 0; j <= 40; j++) {
          const a = startA + (endA - startA) * (j / 40);
          pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
        slot.cooldownOverlay.fillStyle(0x000000, 0.72);
        slot.cooldownOverlay.fillPoints(pts, true);
      }
    });
  }

  _buildIconButton(x, y, icon, onClick) {
    const btn = this.add.text(x, y, icon, {
      fontFamily: FONT_SYMBOL, fontSize: '28px', color: '#d4a96a',
      stroke: '#d4a96a', strokeThickness: 1,
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
    const layout = getSettings().uiLayout;
    this.bossBarContainer = this.add.container(layout.bossBar.x, layout.bossBar.y)
      .setScale(layout.bossBar.scale).setDepth(10);
    this.bossBarContainer.setVisible(false);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.65);
    shadow.fillRoundedRect(bx-12+4, by-8+4, bw+24, bh+16, 8);

    const housing = this.add.graphics();
    housing.fillStyle(0x1a0d05, 1);
    housing.fillRoundedRect(bx-8, by-6, bw+16, bh+12, 6);
    housing.lineStyle(2.5, 0x6b3a1f, 0.90);
    housing.strokeRoundedRect(bx-8, by-6, bw+16, bh+12, 6);
    housing.lineStyle(1, 0x8b5e3c, 0.28);
    housing.strokeRoundedRect(bx-6, by-4, bw+12, bh+8, 5);

    const barTrack = this.add.graphics();
    barTrack.fillStyle(0x050101, 1);
    barTrack.fillRoundedRect(bx, by, bw, bh, 5);
    barTrack.lineStyle(1.5, BOSS_BORDER, 0.85);
    barTrack.strokeRoundedRect(bx, by, bw, bh, 5);

    this.bossHpFill = this.add.graphics();
    this._redrawBossBar(1);

    const shine = this.add.graphics();
    shine.fillStyle(0xffffff, 0.07);
    shine.fillRoundedRect(bx+2, by+2, bw-4, Math.floor(bh*0.38), { tl:4, tr:4, bl:0, br:0 });

    const leftCap  = this.add.image(bx-10, by+bh/2, 'ui-boss-cap').setOrigin(1,0.5).setScale(1.15);
    const rightCap = this.add.image(bx+bw+10, by+bh/2, 'ui-boss-cap').setOrigin(0,0.5).setScale(1.15).setFlipX(true);

    this.bossNameText = this.add.text(GAME_WIDTH/2, 12, '', {
      fontFamily: FONT, fontSize: '31px', letterSpacing: LETTER_SPACING,
      color: PARCHMENT, stroke: '#2a0000', strokeThickness: 6,
    }).setOrigin(0.5, 0);

    this.enragedText = this.add.text(GAME_WIDTH/2, by+bh+10, 'ENRAGED!', {
      fontFamily: FONT, fontSize: '33px', letterSpacing: LETTER_SPACING,
      color: '#ff4400', stroke: '#220000', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setScale(0);

    this.bossBarContainer.add([
      shadow, housing, barTrack, this.bossHpFill, shine,
      leftCap, rightCap, this.bossNameText, this.enragedText,
    ]);
  }

  _redrawBossBar(ratio) {
    const bw=BOSS_BW, bh=BOSS_BH, by=BOSS_BY, bx=(GAME_WIDTH-BOSS_BW)/2;
    this.bossHpFill.clear();
    const fillW = Math.max(0, bw * ratio);
    if (fillW < 3) return;
    const col = ratio > 0.5 ? COLORS.BOSS_HP : ratio > 0.25 ? COLORS.BOSS_HP_MID : COLORS.BOSS_HP_LOW;
    this.bossHpFill.fillStyle(col, 1);
    this.bossHpFill.fillRoundedRect(bx+2, by+2, fillW-4, bh-4, 4);
    this.bossHpFill.fillStyle(0xffffff, 0.28);
    this.bossHpFill.fillRoundedRect(bx+2, by+2, fillW-4, Math.floor((bh-4)*0.38), { tl:4, tr:4, bl:0, br:0 });
    this.bossHpFill.fillStyle(0x000000, 0.28);
    this.bossHpFill.fillRoundedRect(bx+2, by+2+Math.floor((bh-4)*0.62), fillW-4, Math.floor((bh-4)*0.38), { tl:0, tr:0, bl:4, br:4 });
  }

  _flashEnraged() {
    if (!this.enragedText) return;
    this.enragedText.setScale(0).setAlpha(1);
    this.tweens.add({
      targets: this.enragedText, scaleX: 1.3, scaleY: 1.3,
      duration: 250, ease: 'Back.easeOut',
      onComplete: () => this.tweens.add({
        targets: this.enragedText, alpha: 0, duration: 550, ease: 'Quad.easeIn',
      }),
    });
  }

  // ─── Pause Menu ──────────────────────────────────────────────────────────────

  _buildPauseMenu() {
    const w=330, h=430, r=16, bevel=12, cx=GAME_WIDTH/2, cy=GAME_HEIGHT/2;
    this.pauseContainer = this.add.container(cx, cy);
    this.pauseContainer.setVisible(false).setDepth(200);

    // Stone slab panel — canvas-baked gradient texture
    makeStoneTexture(this, 'stone-pause-panel', { w, h, shape: 'rounded', radius: r, bevel, seed: 10 });
    const bg = this.add.image(0, 0, 'stone-pause-panel').setOrigin(0.5);

    const title = this.add.text(0, -h/2 + 38, 'MENU', stoneTextStyle(36, '#f0e8d0')).setOrigin(0.5);
    // TODO: hide subtitle when multiplayer is active
    const subtitle = this.add.text(0, -h/2 + 66, '(PAUSED)', stoneTextStyle(18, '#a0a0c0')).setOrigin(0.5).setAlpha(0.7);

    // Carved groove divider
    const div = this.add.graphics();
    div.lineStyle(1, S.CRACK, 0.60); div.lineBetween(-w/2+28, -h/2+84, w/2-28, -h/2+84);
    div.lineStyle(1, S.BEVEL_LIGHT, 0.30); div.lineBetween(-w/2+28, -h/2+85, w/2-28, -h/2+85);

    this.pauseContainer.add([bg, title, subtitle, div]);
    this._addPauseBtn('RESUME',    0, -53, () => this.arenaScene._togglePause());
    this._addPauseBtn('SETTINGS',  0,  17, () => this._openPauseSettings());
    this._addPauseBtn('EDIT UI',   0,  87, () => this._enterEditMode());
    this._addPauseBtn('MAIN MENU', 0, 157, () => { this.scene.stop(); this.arenaScene.scene.start('StartScene'); });
  }

  _openPauseSettings() {
    openSettingsOverlay(this, {
      player: this.arenaScene?.player ?? null,
      onClose: () => this._refreshSkillLabels(),
    });
  }

  // Refresh skill key labels after settings change mid-game.
  _refreshSkillLabels() {
    if (!this.skillSlots) return;
    const { keys } = getSettings();
    const labels = [displayKey(keys.skill1), displayKey(keys.skill2),
                    displayKey(keys.skill3), keys.dodge === 'SPACE' ? '_' : displayKey(keys.dodge)];
    this.skillSlots.forEach((slot, i) => {
      if (slot.text) slot.text.setText(labels[i]);
    });
  }

  // ─── Edit toolbar ─────────────────────────────────────────────────────────

  _buildEditToolbar() {
    // Nudged right of (16,16) so it doesn't sit on top of the FPS counter's default corner.
    this.editToolbar = this.add.container(130, 16).setDepth(400).setVisible(false).setScale(1.25);
    const tbW = 294, tbH = 50;
    makeStoneTexture(this, 'stone-edit-toolbar', { w: tbW, h: tbH, shape: 'rounded', radius: 8, bevel: 5, seed: 3 });

    // Drag-to-move — a transparent rect the size of the whole toolbar, added FIRST so the
    // two buttons (added after) render on top and keep input priority over their own hit
    // areas; the rest of the toolbar body (not covered by a button) drags the container.
    // Same screen-space-delta pattern as the panel edit boxes' moveOverlay below (avoids
    // any ambiguity from dragX/dragY being reported in a nested container's local space).
    const dragArea = this.add.rectangle(tbW / 2, tbH / 2, tbW, tbH, 0x000000, 0)
      .setInteractive({ cursor: 'grab' });
    this.input.setDraggable(dragArea);
    let tbSPX, tbSPY, tbSCX, tbSCY;
    dragArea.on('dragstart', (ptr) => {
      tbSPX = ptr.x; tbSPY = ptr.y;
      tbSCX = this.editToolbar.x; tbSCY = this.editToolbar.y;
    });
    dragArea.on('drag', (ptr) => {
      this.editToolbar.x = tbSCX + (ptr.x - tbSPX);
      this.editToolbar.y = tbSCY + (ptr.y - tbSPY);
    });
    this.editToolbar.add(dragArea);

    this.editToolbar.add(this.add.image(tbW / 2, tbH / 2, 'stone-edit-toolbar').setOrigin(0.5));
    this.editToolbar.add(this._makeToolbarBtn(8,  7, 170, 36, 'DONE EDITING', S.TEXT,    () => this._exitEditMode()));
    this.editToolbar.add(this._makeToolbarBtn(184, 7, 102, 36, 'RESET UI',    '#ff8888', () => this._resetUILayout()));
  }

  _makeToolbarBtn(x, y, w, h, label, color, fn) {
    const grp = [];
    const key = `stone-toolbar-btn-${w}x${h}`;
    makeStoneTexture(this, key, { w, h, shape: 'rounded', radius: 6, bevel: 4, seed: 7 });
    grp.push(this.add.image(x + w / 2, y + h / 2, key).setOrigin(0.5));
    const hoverG = this.add.graphics();
    hoverG.fillStyle(S.BEVEL_LIGHT, 0.14);
    hoverG.fillRoundedRect(x, y, w, h, 6);
    hoverG.setAlpha(0);
    grp.push(hoverG);
    grp.push(this.add.text(x + w / 2, y + h / 2, label, stoneTextStyle(17, color)).setOrigin(0.5));
    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h).setInteractive({ cursor: 'pointer' });
    hit.on('pointerover',  () => this.tweens.add({ targets: hoverG, alpha: 1, duration: 100 }));
    hit.on('pointerout',   () => this.tweens.add({ targets: hoverG, alpha: 0, duration: 100 }));
    hit.on('pointerdown', fn);
    grp.push(hit);
    return grp;
  }

  // ─── Edit mode entry / exit ───────────────────────────────────────────────

  _enterEditMode() {
    this._editMode          = true;
    this._editGrips         = [];
    this._wasBossBarVisible = undefined; // set in _spawnDragGrips on first entry
    this._wasFpsVisible     = undefined; // set in _spawnEditBoxes on first entry
    this.pauseContainer.setVisible(false);
    this.editToolbar.setVisible(true);
    this._spawnEditBoxes();
  }

  _exitEditMode() {
    this._editMode = false;
    this._editGrips.forEach(g => g.destroy(true));
    this._editGrips = [];
    this.editToolbar.setVisible(false);
    if (!this._wasBossBarVisible) {
      this.bossBarContainer.setVisible(false).setAlpha(1);
    }
    this._wasBossBarVisible = undefined;
    if (!this._wasFpsVisible) {
      this.fpsContainer.setVisible(false).setAlpha(1);
    }
    this._wasFpsVisible = undefined;
    this.pauseContainer.setVisible(true);
  }

  _resetUILayout() {
    const def = { x: 0, y: 0, scale: 1 };
    saveSetting('uiLayout', { resource: { ...def }, skillBar: { ...def }, score: { ...def }, bossBar: { ...def }, fps: { ...def } });
    this.resourceContainer.setPosition(0, 0).setScale(1);
    this.skillBarContainer.setPosition(0, 0).setScale(1);
    this.scoreContainer.setPosition(0, 0).setScale(1);
    this.bossBarContainer.setPosition(0, 0).setScale(1);
    this.fpsContainer.setPosition(16, 16).setScale(1);
    this._editGrips.forEach(g => g.destroy(true));
    this._editGrips = [];
    this._spawnEditBoxes();
  }

  _spawnEditBoxes() {
    const slotDiam   = SLOT_R * 2;
    const totalSlotW = 4 * slotDiam + 3 * SLOT_GAP;
    const firstCX    = (GAME_WIDTH - totalSlotW) / 2 + SLOT_R;

    // Bounds wrap the rendered panel content (left caps overhang the bars: ui-hp-cap 52×50
    // ×1.30 and ui-stam-cap 46×56 ×1.08 in _buildBarMount) so the box centers on the bar group.
    this._createEditBox(this.resourceContainer, 'resource', 'Resource Bars',
      5, HP_BAR_Y - 24, 465, ST_BAR_Y + 47 - (HP_BAR_Y - 24), 1);

    this._createEditBox(this.skillBarContainer, 'skillBar', 'Skill Bar',
      firstCX - SLOT_R - 6, SLOT_CY - SLOT_R - 6, totalSlotW + 12, SLOT_R * 2 + 12, 1);

    this._createEditBox(this.scoreContainer, 'score', 'Score / Level',
      GAME_WIDTH - 256, 8, 248, 100, 1);

    if (this._wasBossBarVisible === undefined) {
      this._wasBossBarVisible = this.bossBarContainer.visible;
    }
    if (!this._wasBossBarVisible) this.bossBarContainer.setVisible(true).setAlpha(0.5);

    this._createEditBox(this.bossBarContainer, 'bossBar', 'Boss Bar',
      (GAME_WIDTH - BOSS_BW) / 2 - 20, BOSS_BY - 10, BOSS_BW + 40, BOSS_BH + 20, 1);

    // FPS counter may be toggled off in settings — force it visible (dimmed) during edit
    // mode so it can still be positioned/scaled, same convention as the boss bar above.
    if (this._wasFpsVisible === undefined) {
      this._wasFpsVisible = this.fpsContainer.visible;
    }
    if (!this._wasFpsVisible) this.fpsContainer.setVisible(true).setAlpha(0.5);

    this._createEditBox(this.fpsContainer, 'fps', 'FPS Counter', -6, -6, 120, 32, 1);
  }

  _createEditBox(container, panelKey, label, pLeft, pTop, pW, pH, baseScale) {
    const RIM = 10;     // left/right/bottom rim thickness (matches frame texture)
    const HEADER = 28;  // top header strip height (holds the label)
    const HR = 7;       // resize-handle radius
    const frameKey = makeStoneFrameTexture(this, 'stone-edit-frame', { rim: RIM, header: HEADER });
    const saveLayout = () => saveSetting('uiLayout', {
      [panelKey]: { x: container.x, y: container.y, scale: container.scaleX / baseScale },
    });

    // Screen-space position of each edge, derived fresh from container state each call
    const screenL = () => container.x + pLeft * container.scaleX;
    const screenT = () => container.y + pTop  * container.scaleX;
    const screenW = () => pW * container.scaleX;
    const screenH = () => pH * container.scaleX;

    // Stone rim frame — gradient bevel border, transparent center, extended top header.
    // NineSlice stretches the edges without distorting the corners. Non-interactive.
    const frame = this.add.nineslice(0, 0, frameKey, undefined, pW, pH + HEADER, RIM, RIM, HEADER, RIM)
      .setOrigin(0, 0).setDepth(351);

    // Transparent overlay covering the panel content area — drag anywhere on panel to move
    const moveOverlay = this.add.rectangle(0, 0, 10, 10)
      .setFillStyle(0x000000, 0)
      .setInteractive({ cursor: 'grab' })
      .setDepth(352);
    this.input.setDraggable(moveOverlay);

    const titleTxt = this.add.text(0, 0, '', stoneTextStyle(16)).setOrigin(0.5).setDepth(353);

    // Corner resize handles — seated stone pebble look
    const mkHandle = () => {
      const h = this.add.circle(0, 0, HR, S.BEVEL_MID, 1)
        .setStrokeStyle(2, S.BEVEL_DARK, 1)
        .setInteractive({ cursor: 'nwse-resize' })
        .setDepth(354);
      this.input.setDraggable(h);
      return h;
    };
    const tlH = mkHandle();
    const trH = mkHandle();
    const blH = mkHandle();
    const brH = mkHandle();

    const updateBox = () => {
      const l = screenL(), t = screenT(), w = screenW(), h = screenH();
      // Frame spans the content area plus the header strip above it.
      frame.setPosition(l, t - HEADER).setSize(w, h + HEADER);
      moveOverlay.setPosition(l + w / 2, t + h / 2).setSize(w, h);

      titleTxt.setPosition(l + w / 2, t - HEADER / 2)
        .setText(`${label}  ×${(container.scaleX / baseScale).toFixed(1)}`);
      tlH.setPosition(l,     t);
      trH.setPosition(l + w, t);
      blH.setPosition(l,     t + h);
      brH.setPosition(l + w, t + h);
    };
    updateBox();

    // Transparent overlay: drag to move panel
    let sPX, sPY, sCX, sCY;
    moveOverlay.on('dragstart', (ptr) => { sPX = ptr.x; sPY = ptr.y; sCX = container.x; sCY = container.y; });
    moveOverlay.on('drag',      (ptr) => { container.x = sCX + (ptr.x - sPX); container.y = sCY + (ptr.y - sPY); updateBox(); });
    moveOverlay.on('dragend',   ()    => saveLayout());

    // Corner handles: scale derived from scratch each frame — no accumulation, no drift.
    // Each handle anchors at its diagonal opposite corner.
    const addResize = (handle, getAX, getAY, sCalc, cxCalc, cyCalc) => {
      let aX, aY;
      handle.on('dragstart', () => { aX = getAX(); aY = getAY(); });
      handle.on('drag', (ptr) => {
        const s = Phaser.Math.Clamp(sCalc(ptr.x, aX), 0.7 * baseScale, 1.5 * baseScale);
        container.x = cxCalc(aX, s);
        container.y = cyCalc(aY, s);
        container.setScale(s);
        updateBox();
      });
      handle.on('dragend', () => saveLayout());
    };

    // brH (bottom-right) → anchor = top-left
    addResize(brH,
      () => screenL(), () => screenT(),
      (px, ax) => (px - ax) / pW,
      (ax, s)  => ax - pLeft * s,
      (ay, s)  => ay - pTop  * s
    );
    // blH (bottom-left) → anchor = top-right
    addResize(blH,
      () => screenL() + screenW(), () => screenT(),
      (px, ax) => (ax - px) / pW,
      (ax, s)  => ax - (pLeft + pW) * s,
      (ay, s)  => ay - pTop * s
    );
    // trH (top-right) → anchor = bottom-left
    addResize(trH,
      () => screenL(), () => screenT() + screenH(),
      (px, ax) => (px - ax) / pW,
      (ax, s)  => ax - pLeft * s,
      (ay, s)  => ay - (pTop + pH) * s
    );
    // tlH (top-left) → anchor = bottom-right
    addResize(tlH,
      () => screenL() + screenW(), () => screenT() + screenH(),
      (px, ax) => (ax - px) / pW,
      (ax, s)  => ax - (pLeft + pW) * s,
      (ay, s)  => ay - (pTop + pH) * s
    );

    [frame, moveOverlay, titleTxt, tlH, trH, blH, brH].forEach(o => this._editGrips.push(o));
  }

  // ─── Skill tooltips ───────────────────────────────────────────────────────

  _checkSkillTooltips() {
    if (!this.skillBarContainer || !this.skillSlots) return;
    const ptr   = this.input.activePointer;
    const scale = this.skillBarContainer.scaleX;
    let hovered = -1;
    this.skillSlots.forEach((slot, i) => {
      const sx   = this.skillBarContainer.x + slot.cx * scale;
      const sy   = this.skillBarContainer.y + slot.cy * scale;
      const dist = Phaser.Math.Distance.Between(ptr.x, ptr.y, sx, sy);
      if (dist < SLOT_R * scale + 8) hovered = i;
    });
    if (hovered !== this._tooltipSlot) {
      this._hideTooltip();
      if (hovered >= 0) {
        const slot = this.skillSlots[hovered];
        const sx   = this.skillBarContainer.x + slot.cx * scale;
        const sy   = this.skillBarContainer.y + slot.cy * scale;
        this._showSkillTooltip(hovered, sx, sy);
      }
      this._tooltipSlot = hovered;
    }
  }

  _showSkillTooltip(idx, screenX, screenY) {
    const info = SKILL_INFO[idx];
    if (!info) return;
    const TW = 260, PAD = 12, BADGE_H = 26, NAME_H = 30, DESC_H = 58;
    const TH = PAD + BADGE_H + 6 + NAME_H + DESC_H + PAD;
    const tipY = screenY - SLOT_R * this.skillBarContainer.scaleX - 10 - TH / 2;

    const { keys }   = getSettings();
    const slotKeys   = ['skill1', 'skill2', 'skill3', 'dodge'];
    const keyLabel   = displayKey(keys[slotKeys[idx]] ?? '');

    this._tooltipContainer = this.add.container(
      Phaser.Math.Clamp(screenX, TW / 2 + 10, GAME_WIDTH - TW / 2 - 10),
      Phaser.Math.Clamp(tipY, TH / 2 + 10, GAME_HEIGHT - TH / 2 - 10)
    ).setDepth(450).setAlpha(0);

    // Stone slab tooltip — canvas-baked gradient panels
    makeStoneTexture(this, 'stone-tooltip-panel', { w: TW, h: TH, shape: 'rounded', radius: 8, bevel: 6, seed: 20 });
    const bg = this.add.image(0, 0, 'stone-tooltip-panel').setOrigin(0.5);

    const bx = -TW / 2 + PAD, by = -TH / 2 + PAD;
    const badgeW = 30, badgeH = BADGE_H;
    makeStoneTexture(this, 'stone-tooltip-badge', { w: badgeW, h: badgeH, shape: 'rounded', radius: 4, bevel: 3, seed: 25 });
    const badgeBg = this.add.image(bx + badgeW / 2, by + badgeH / 2, 'stone-tooltip-badge').setOrigin(0.5);
    const badgeTxt = this.add.text(bx + badgeW / 2, by + badgeH / 2, keyLabel,
      stoneTextStyle(15)).setOrigin(0.5);
    const nameTxt = this.add.text(bx + badgeW + 7, by + badgeH / 2, info.name,
      stoneTextStyle(18, '#e8e8ff')).setOrigin(0, 0.5);
    const descTxt = this.add.text(bx, by + badgeH + 8, info.desc, {
      fontFamily: FONT, fontSize: '15px', letterSpacing: LETTER_SPACING, color: '#a0a0c8',
      wordWrap: { width: TW - PAD * 2 },
    }).setOrigin(0, 0);

    this._tooltipContainer.add([bg, badgeBg, badgeTxt, nameTxt, descTxt]);
    this.tweens.add({ targets: this._tooltipContainer, alpha: 1, duration: 100, ease: 'Quad.easeOut' });
  }

  _hideTooltip() {
    if (!this._tooltipContainer) return;
    const tc = this._tooltipContainer;
    this._tooltipContainer = null;
    this._tooltipSlot      = -1;
    this.tweens.add({
      targets: tc, alpha: 0, duration: 80, ease: 'Quad.easeIn',
      onComplete: () => { if (tc.active) tc.destroy(true); },
    });
  }

  _addPauseBtn(label, x, y, fn) {
    const bw = 220, bh = 46, r = 8, bevel = 5;
    makeStoneTexture(this, 'stone-pause-btn', { w: bw, h: bh, shape: 'rounded', radius: r, bevel, seed: 5 });
    const bg = this.add.image(x, y, 'stone-pause-btn').setOrigin(0.5);
    const hoverG = this.add.graphics();
    hoverG.fillStyle(S.BEVEL_LIGHT, 0.14);
    hoverG.fillRoundedRect(x - bw / 2, y - bh / 2, bw, bh, r);
    hoverG.setAlpha(0);
    const textColor = label === 'RESUME' ? '#f0e8d0' : S.TEXT;
    const txt = this.add.text(x, y, label, stoneTextStyle(22, textColor)).setOrigin(0.5);
    const hit = this.add.rectangle(x, y, bw, bh).setInteractive({ cursor: 'pointer' });
    hit.on('pointerover',  () => { this.tweens.add({ targets: hoverG, alpha: 1, duration: 110 }); this.tweens.add({ targets: txt, scaleX: 1.04, scaleY: 1.04, duration: 110 }); });
    hit.on('pointerout',   () => { this.tweens.add({ targets: hoverG, alpha: 0, duration: 110 }); this.tweens.add({ targets: txt, scaleX: 1, scaleY: 1, duration: 110 }); });
    hit.on('pointerdown', fn);
    this.pauseContainer.add([bg, hoverG, txt, hit]);
  }

  // ─── Arena event listeners ───────────────────────────────────────────────────

  _listenToArena() {
    const a = this.arenaScene;
    a.events.on('bossSpawned',   ({ name, maxHp }) => {
      this.bossMaxHp=maxHp; this.bossHp=maxHp;
      this.bossNameText.setText(name); this.bossBarContainer.setVisible(true); this._redrawBossBar(1);
    });
    a.events.on('bossHpChanged', (hp) => { this.bossHp=hp; this._redrawBossBar(hp/this.bossMaxHp); });
    a.events.on('bossEnraged',   () => this._flashEnraged());
    a.events.on('bossDefeated',  () => {
      this.tweens.add({ targets:this.bossBarContainer, alpha:0, duration:600,
        onComplete:()=>this.bossBarContainer.setVisible(false).setAlpha(1) });
    });
    a.events.on('scoreChanged',  (score) => { this.score=score; this.scoreText.setText(`Score: ${score}`); });
    a.events.on('pauseToggled',  (paused) => {
      this.isPaused = paused;
      if (!paused && this._editMode) this._exitEditMode();
      this.pauseContainer.setVisible(paused);
    });
  }
}
