import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/gameConfig.js';

// ─── Bar layout ──────────────────────────────────────────────────────────────
const LEFT_CAP_CX = 36;           // center X of left icon cap (heart/bolt shaped)
const BAR_X       = 56;           // bar track left edge (housing overlaps cap by ~6px)
const BAR_W       = 322;          // ~15% wider than previous 280
const BAR_H       = 22;           // ~40% taller than previous 16
const RIGHT_CAP_R = 13;           // right decorative cap radius
const HP_BAR_Y    = GAME_HEIGHT - 92;   // HP bar track top
const ST_BAR_Y    = GAME_HEIGHT - 54;   // Stamina bar track top

// ─── Circular skill slots ────────────────────────────────────────────────────
const SLOT_R   = 32;
const SLOT_GAP = 10;
const SLOT_CY  = GAME_HEIGHT - 46;

// ─── Boss bar ────────────────────────────────────────────────────────────────
const BOSS_BW = 540;
const BOSS_BH = 24;
const BOSS_BY = 44;

// ─── Palette ─────────────────────────────────────────────────────────────────
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
    this._listenToArena();
    this.input.keyboard.on('keydown-ESC', () => this.arenaScene._togglePause());
  }

  update() {
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
  }

  // ─── Icon textures ──────────────────────────────────────────────────────────

  _buildIconTextures() {
    this._bakeHeartIcon();
    this._bakeBoltIcon();
    this._bakeHpCapLeft();
    this._bakeStamCapLeft();
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
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.85);
    ctx.bezierCurveTo(cx - s*1.45, cy + s*0.05, cx - s*1.1, cy - s*0.95, cx, cy - s*0.2);
    ctx.bezierCurveTo(cx + s*1.1,  cy - s*0.95, cx + s*1.45, cy + s*0.05, cx, cy + s*0.85);
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

  // Heart-shaped cap background for HP bar left end
  _bakeHpCapLeft() {
    const key = 'ui-hp-cap-left';
    if (this.textures.exists(key)) return;
    const size = 44;
    const tex = this.textures.createCanvas(key, size, size);
    const ctx = tex.getContext();
    const cx = size / 2, cy = size / 2 + 1;

    // Outer glow / shadow
    ctx.fillStyle = '#0d0202';
    this._heartPath(ctx, cx, cy + 2, 21); ctx.fill();

    // Dark crimson body
    ctx.fillStyle = '#2a0808';
    this._heartPath(ctx, cx, cy, 20); ctx.fill();

    // Mid layer
    ctx.fillStyle = '#3d0e0e';
    this._heartPath(ctx, cx, cy - 1, 17); ctx.fill();

    // Gold/bronze border
    ctx.strokeStyle = '#c8861a'; ctx.lineWidth = 2.2;
    this._heartPath(ctx, cx, cy, 20); ctx.stroke();

    // Subtle inner gold ring
    ctx.strokeStyle = '#d4a96a'; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
    this._heartPath(ctx, cx, cy, 16); ctx.stroke();
    ctx.globalAlpha = 1;

    // Top-left specular
    ctx.fillStyle = 'rgba(255,245,208,0.25)';
    this._heartPath(ctx, cx - 2, cy - 3, 9); ctx.fill();

    tex.refresh();
  }

  // Bolt-shaped cap background for Stamina bar left end
  _bakeStamCapLeft() {
    const key = 'ui-stam-cap-left';
    if (this.textures.exists(key)) return;
    const size = 44;
    const tex = this.textures.createCanvas(key, size, size);
    const ctx = tex.getContext();

    // Scale original bolt (18x24) to fit 36x36 area centered in 44x44
    // Scale factor = 36/22 = 1.636, offset so bolt centers in canvas
    const sc = 1.636, xOff = 7.3, yOff = 2.36;
    const scalePt = ([x, y]) => [x * sc + xOff, y * sc + yOff];
    const outer = [[10,1],[3,12],[8,12],[5,23],[15,10],[9,10],[13,1]].map(scalePt);
    // Inset version (~80% scale from center)
    const innerSc = 1.3, innerXOff = 9.7, innerYOff = 5.0;
    const inner = [[10,1],[3,12],[8,12],[5,23],[15,10],[9,10],[13,1]]
      .map(([x,y]) => [x * innerSc + innerXOff, y * innerSc + innerYOff]);

    const drawPoly = (pts) => {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i=1; i<pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    };

    // Shadow
    ctx.fillStyle = '#020508';
    drawPoly(outer.map(([x,y]) => [x+1.5, y+1.5])); ctx.fill();

    // Dark navy body
    ctx.fillStyle = '#0a1a38'; drawPoly(outer); ctx.fill();

    // Lighter inner face
    ctx.fillStyle = '#122a58'; drawPoly(inner); ctx.fill();

    // Gold border
    ctx.strokeStyle = '#c8861a'; ctx.lineWidth = 2.2; drawPoly(outer); ctx.stroke();

    // Inner gold ring
    ctx.strokeStyle = '#d4a96a'; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
    drawPoly(inner); ctx.stroke();
    ctx.globalAlpha = 1;

    // Specular
    ctx.fillStyle = 'rgba(255,245,208,0.25)';
    drawPoly(inner.map(([x,y]) => [x-1, y-1])); ctx.fill();

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
    // HP bar
    this._buildBarMount(HP_BAR_Y, true);
    this._drawBarTrack(BAR_X, HP_BAR_Y, BAR_W, BAR_H, true);
    this.hpBarFill = this._makeBarFillG(BAR_X, HP_BAR_Y, BAR_W, BAR_H);
    this.hpNumText = this.add.text(BAR_X + BAR_W - 4, HP_BAR_Y + BAR_H/2, '', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '11px',
      color: PARCHMENT, stroke: '#080000', strokeThickness: 2,
    }).setOrigin(1, 0.5).setDepth(2);

    // Stamina bar
    this._buildBarMount(ST_BAR_Y, false);
    this._drawBarTrack(BAR_X, ST_BAR_Y, BAR_W, BAR_H, false);
    this.stBarFill = this._makeBarFillG(BAR_X, ST_BAR_Y, BAR_W, BAR_H);
    this.stNumText = this.add.text(BAR_X + BAR_W - 4, ST_BAR_Y + BAR_H/2, '', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '11px',
      color: PARCHMENT, stroke: '#00080a', strokeThickness: 2,
    }).setOrigin(1, 0.5).setDepth(2);

    // Skill slots
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

    // Score / Level — top-right
    this.scoreText = this.add.text(GAME_WIDTH - 20, 20, `Score: ${this.score}`, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px',
      color: '#d4a96a', stroke: '#1a0a08', strokeThickness: 3,
    }).setOrigin(1, 0);
    this.levelText = this.add.text(GAME_WIDTH - 20, 50, `Level: ${this.level}`, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '22px',
      color: PARCHMENT, stroke: '#1a0a08', strokeThickness: 3,
    }).setOrigin(1, 0);

    // Pause button
    this._buildIconButton(GAME_WIDTH - 54, GAME_HEIGHT - 36, '⏸', () => {
      this.arenaScene._togglePause();
    });
  }

  // Bar mount: dark housing beam + right decorative cap + left icon-shaped cap
  _buildBarMount(barY, isHp) {
    const barCY     = barY + BAR_H / 2;
    const houseX    = BAR_X - 4;
    const houseW    = BAR_W + 8;
    const houseY    = barCY - BAR_H / 2 - 4;
    const houseH    = BAR_H + 8;
    const borderCol = isHp ? 0x5a2a10 : 0x1a3a5a;
    const rightCapX = BAR_X + BAR_W + 10;
    const rightBord = isHp ? 0x7a3a18 : 0x2a4a6a;

    const g = this.add.graphics();

    // Housing beam
    g.fillStyle(0x1a0d08, 0.88);
    g.fillRoundedRect(houseX, houseY, houseW, houseH, 5);
    g.lineStyle(1.5, borderCol, 0.65);
    g.strokeRoundedRect(houseX, houseY, houseW, houseH, 5);

    // Right decorative end cap (circular)
    g.fillStyle(0x241008, 1);
    g.fillCircle(rightCapX, barCY, RIGHT_CAP_R);
    g.lineStyle(1.5, rightBord, 0.70);
    g.strokeCircle(rightCapX, barCY, RIGHT_CAP_R);
    g.fillStyle(PANEL_SHINE, 0.30);
    g.fillCircle(rightCapX - 3, barCY - 3, 3);

    // Left icon cap — heart or bolt shaped canvas texture
    this.add.image(LEFT_CAP_CX, barCY, isHp ? 'ui-hp-cap-left' : 'ui-stam-cap-left').setOrigin(0.5);

    // Small icon centered on top of cap
    const iconImg = this.add.image(LEFT_CAP_CX, barCY, isHp ? 'ui-heart' : 'ui-bolt').setOrigin(0.5);
    if (isHp) this.hpIcon = iconImg;
  }

  _drawBarTrack(x, y, w, h, isHp) {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.50);
    g.fillRoundedRect(x+2, y+2, w, h, 4);
    g.fillStyle(isHp ? 0x0d0505 : 0x05050d, 1);
    g.fillRoundedRect(x, y, w, h, 4);
    g.lineStyle(1.5, isHp ? 0x5a1a1a : 0x1a3a5a, 0.90);
    g.strokeRoundedRect(x, y, w, h, 4);
    g.lineStyle(1, 0x000000, 0.45);
    g.lineBetween(x+4, y+1, x+w-4, y+1);
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
    g.fillStyle(baseColor, 1);
    g.fillRoundedRect(0, 0, fillW, h, 3);
    g.fillStyle(shineColor, 0.32);
    g.fillRoundedRect(1, 0, Math.max(1, fillW-2), Math.floor(h*0.42), { tl:3, tr:3, bl:0, br:0 });
    g.fillStyle(0x000000, 0.25);
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
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.55); g.fillCircle(cx+3, cy+3, SLOT_R);
    g.fillStyle(0x1c1a18, 1);    g.fillCircle(cx, cy, SLOT_R);
    g.lineStyle(2, 0x5a5550, 0.65); g.strokeCircle(cx, cy, SLOT_R-1);
    g.lineStyle(3, 0x080706, 0.55); g.strokeCircle(cx, cy+3, SLOT_R-2);
    g.fillStyle(0x0f0c09, 1);    g.fillCircle(cx, cy, 26);
    g.lineStyle(2.5, color, 0.75); g.strokeCircle(cx, cy, 25);
    const icon = this.add.image(cx, cy, iconKey).setOrigin(0.5);
    const text = this.add.text(cx, cy+20, keyLabel, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '12px',
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
      fontFamily: "'Fredoka One', sans-serif", fontSize: '26px',
      color: PARCHMENT, stroke: '#2a0000', strokeThickness: 6,
    }).setOrigin(0.5, 0);

    this.enragedText = this.add.text(GAME_WIDTH/2, by+bh+10, 'ENRAGED!', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '28px',
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
    const w=330, h=290, r=16, cx=GAME_WIDTH/2, cy=GAME_HEIGHT/2;
    this.pauseContainer = this.add.container(cx, cy);
    this.pauseContainer.setVisible(false).setDepth(200);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000,0.70); shadow.fillRoundedRect(-w/2+7,-h/2+7,w,h,r);

    const bg = this.add.graphics();
    bg.fillStyle(0x140c06,0.97); bg.fillRoundedRect(-w/2,-h/2,w,h,r);
    bg.lineStyle(2.5,GOLD,0.88); bg.strokeRoundedRect(-w/2,-h/2,w,h,r);
    bg.lineStyle(1,0x8b5e3c,0.40); bg.strokeRoundedRect(-w/2+3,-h/2+3,w-6,h-6,r-2);
    bg.fillStyle(0xffffff,0.05); bg.fillRoundedRect(-w/2+2,-h/2+2,w-4,20,{tl:r-1,tr:r-1,bl:0,br:0});

    const title = this.add.text(0,-h/2+38,'PAUSED',{
      fontFamily:"'Fredoka One', sans-serif",fontSize:'36px',color:PARCHMENT,stroke:'#4a2800',strokeThickness:4,
    }).setOrigin(0.5);

    const div = this.add.graphics();
    div.lineStyle(1,GOLD,0.45); div.lineBetween(-w/2+28,-h/2+64,w/2-28,-h/2+64);

    this.pauseContainer.add([shadow,bg,title,div]);
    this._addPauseBtn('RESUME',0,18,() => this.arenaScene._togglePause());
    this._addPauseBtn('MAIN MENU',0,88,() => { this.scene.stop(); this.arenaScene.scene.start('StartScene'); });
  }

  _addPauseBtn(label, x, y, fn) {
    const bw=220, bh=46, r=10;
    const shadow=this.add.graphics();
    shadow.fillStyle(0x000000,0.50); shadow.fillRoundedRect(x-bw/2+3,y-bh/2+3,bw,bh,r);
    const bg=this.add.graphics();
    bg.fillStyle(0x2a1508,1); bg.fillRoundedRect(x-bw/2,y-bh/2,bw,bh,r);
    bg.fillStyle(0xfff5d0,0.09); bg.fillRoundedRect(x-bw/2,y-bh/2,bw,bh/2,{tl:r,tr:r,bl:0,br:0});
    bg.lineStyle(1.5,GOLD,0.75); bg.strokeRoundedRect(x-bw/2,y-bh/2,bw,bh,r);
    const hoverG=this.add.graphics();
    hoverG.fillStyle(GOLD,0.18); hoverG.fillRoundedRect(x-bw/2,y-bh/2,bw,bh,r); hoverG.setAlpha(0);
    const txt=this.add.text(x,y,label,{
      fontFamily:"'Fredoka One', sans-serif",fontSize:'24px',color:PARCHMENT,stroke:'#1a0a08',strokeThickness:3,
    }).setOrigin(0.5);
    const hit=this.add.rectangle(x,y,bw,bh).setInteractive({cursor:'pointer'});
    hit.on('pointerover',()=>{ this.tweens.add({targets:hoverG,alpha:1,duration:110}); this.tweens.add({targets:txt,scaleX:1.05,scaleY:1.05,duration:110}); });
    hit.on('pointerout', ()=>{ this.tweens.add({targets:hoverG,alpha:0,duration:110}); this.tweens.add({targets:txt,scaleX:1,scaleY:1,duration:110}); });
    hit.on('pointerdown',fn);
    this.pauseContainer.add([shadow,bg,hoverG,txt,hit]);
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
    a.events.on('pauseToggled',  (paused) => { this.isPaused=paused; this.pauseContainer.setVisible(paused); });
  }
}
