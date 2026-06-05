import Phaser from 'phaser';
import {
  PLAYER, SKILLS, COLORS, SCALING,
  GAME_WIDTH, GAME_HEIGHT
} from '../config/gameConfig.js';
import { spawnBurst, spawnSparks, spawnDust, spawnBlood, spawnImpactRing } from '../systems/ParticleHelper.js';

// ─── Canvas 2D helper ─────────────────────────────────────────────────────────
// Draws a rounded rectangle path onto a Canvas 2D context.
// `r` may be a number (uniform) or { tl, tr, bl, br } for per-corner radii.
function rrect(ctx, x, y, w, h, r) {
  let tl = 0, tr = 0, bl = 0, br = 0;
  if (typeof r === 'object') {
    tl = r.tl ?? 0; tr = r.tr ?? 0; bl = r.bl ?? 0; br = r.br ?? 0;
  } else if (typeof r === 'number') {
    tl = tr = bl = br = Math.min(r, w / 2, h / 2);
  }
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr > 0) ctx.arcTo(x + w, y,     x + w, y + tr, tr); else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br > 0) ctx.arcTo(x + w, y + h, x + w - br, y + h, br); else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl > 0) ctx.arcTo(x,     y + h, x, y + h - bl, bl); else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl > 0) ctx.arcTo(x,     y,     x + tl, y, tl); else ctx.lineTo(x, y);
  ctx.closePath();
}

export default class Player {
  constructor(scene, x, y, level = 1, incomingHp = null) {
    this.scene = scene;
    this.level = level;

    // --- Stats (scaled by level) ---
    const hpBonus = (level - 1) * SCALING.HP_PER_LEVEL;
    this.maxHp = PLAYER.BASE_HP + hpBonus;
    this.hp = incomingHp !== null ? Math.min(incomingHp, this.maxHp) : this.maxHp;
    this.speed = PLAYER.BASE_SPEED + (level - 1) * SCALING.BOSS_SPEED_PER_LEVEL * 0.5;
    this.staminaMax = PLAYER.STAMINA_MAX;
    this.stamina = this.staminaMax;
    this.baseDamage = PLAYER.BASE_DAMAGE * (1 + (level - 1) * SCALING.DAMAGE_MULTIPLIER_PER_LEVEL);

    // --- Position ---
    this.x = x;
    this.y = y;

    // --- State ---
    this.alive = true;
    this.invincible = false;
    this.moving = false;
    this.targetX = x;
    this.targetY = y;
    this.facingAngle = 0; // radians, toward mouse

    // --- Cooldowns (timestamps) ---
    this.skillCooldowns = { Q: 0, W: 0, E: 0, SPACE: 0 };
    this.skillCooldownDurations = {
      Q: SKILLS.Q.cooldown,
      W: SKILLS.W.cooldown,
      E: SKILLS.E.cooldown,
      SPACE: PLAYER.DODGE_COOLDOWN,
    };
    this.basicAttackCooldown = 0;
    this.isDodging = false;

    // --- Bounds ---
    this.arenaBounds = null;

    // --- Graphics ---
    this._buildGraphics();
    this._buildFloatingHPBar();

    // --- Projectile group ---
    this.projectiles = scene.add.group();

    // --- Input ---
    this._setupInput();

    // --- Animations ---
    this._idleTimer = 0;
    this._legPhase = 0;
    this._hitFlashTimer = 0;
    this._weaponRecoil = 0;     // extra inward orbit offset, set on fire, decays to 0
  }

  setArenaBounds(rect) {
    this.arenaBounds = rect;
  }

  _buildGraphics() {
    // Ground shadow — standalone (not in container, world-space position each frame)
    this.shadowG = this.scene.add.graphics().setDepth(9);

    this.container = this.scene.add.container(this.x, this.y).setDepth(10);

    // Bake static character textures (one canvas per direction) and weapon
    this._buildFacingTextures();
    this._buildWeaponTexture();

    // Legs: live Graphics — only parts that genuinely change every frame (walk stride)
    this.gLegL = this.scene.add.graphics();
    this.gLegR = this.scene.add.graphics();

    // Single merged character sprite — head + helmet + body all in one 80×120 canvas.
    // Canvas center (40, 60) = local (0, 0) = waist pivot. setOrigin(0.5, 0.5) so
    // the canvas center is the container-local position anchor.
    this.characterSprite = this.scene.add.image(0, 0, 'player-char-down');
    this.characterSprite.setOrigin(0.5, 0.5);

    // Weapon: orbits body center — position updated every frame in update().
    this.weaponSprite = this.scene.add.image(0, 0, 'player-weapon');
    this.weaponSprite.setOrigin(4 / 30, 0.5);

    // Z-order: legs → character → weapon (weapon floats over the body)
    this.container.add([this.gLegL, this.gLegR, this.characterSprite, this.weaponSprite]);
    this.container.setScale(0.765);

    this.facing = null;
    this._drawLegs(0, false);
    this._updateFacing();
  }

  // ─── Facing texture baking ────────────────────────────────────────────────
  // Creates three 80×120 canvas textures (one per direction) once at startup.
  // Each canvas contains the full character: helmet + head + body + pauldrons.
  _buildFacingTextures() {
    for (const dir of ['down', 'up', 'left']) {
      const key = `player-char-${dir}`;
      if (this.scene.textures.exists(key)) continue;
      const tex = this.scene.textures.createCanvas(key, 80, 120);
      this._drawCharToCanvas(tex.getContext(), dir, 40, 60);
      tex.refresh();
    }
  }

  // ─── Weapon texture baking ────────────────────────────────────────────────
  _buildWeaponTexture() {
    const key = 'player-weapon';
    if (this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.createCanvas(key, 30, 16);
    this._drawWeaponToCanvas(tex.getContext(), 0, 8);
    tex.refresh();
  }

  // ─── Character canvas drawing ─────────────────────────────────────────────
  // Canvas 80×120. ox=40 (center x), oy=60 (waist pivot = container local origin).
  // Head center at canvas (40, 28) = local (0, −32). Head r=22. Dome r=24.
  // Body at canvas y=63–77. Legs drawn live below the canvas.
  // All three directions use the same shared helpers; 'right' is 'left' scaleX-flipped.
  _drawCharToCanvas(ctx, dir, ox, oy) {
    // ox=40, oy=60 (waist/canvas-center). Head center at (ox, oy-32).
    // Head r=22. Helmet dome r=24. Body at canvas y=63–77.
    const hx = n => '#' + n.toString(16).padStart(6, '0');
    const BODY    = hx(COLORS.PLAYER_BODY);
    const BODY_HI = hx(COLORS.PLAYER_BODY_HI);
    const BODY_LO = hx(COLORS.PLAYER_BODY_LO);
    const HELM    = hx(COLORS.PLAYER_HELMET);
    const HELM_HI = hx(COLORS.PLAYER_HELMET_HI);
    const HELM_LO = hx(COLORS.PLAYER_HELMET_LO);
    const SHIELD  = hx(COLORS.PLAYER_SHIELD);
    const SHIELD_HI = hx(COLORS.PLAYER_SHIELD_HI);
    const SHIELD_LO = hx(COLORS.PLAYER_SHIELD_LO);
    const SKIN    = hx(COLORS.PLAYER_SKIN);
    const SKIN_HI = hx(COLORS.PLAYER_SKIN_HI);
    const SKIN_LO = hx(COLORS.PLAYER_SKIN_LO);
    const HAIR    = hx(COLORS.PLAYER_HAIR);
    const OUTLINE = '#1a1a2a';
    const HEAD_CX = ox,  HEAD_CY = oy - 32;   // head circle center in canvas
    const HEAD_R  = 22,  DOME_R  = 24;         // head radius, helmet dome radius
    const BODY_Y1 = oy + 3,   BODY_Y2 = oy + 17;  // body top/bottom in canvas

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = OUTLINE;

    // ─── Shared helpers ──────────────────────────────────────────────────

    // Skin head circle — radial gradient (sun upper-left)
    const drawHead = () => {
      const g = ctx.createRadialGradient(
        HEAD_CX - HEAD_R * 0.35, HEAD_CY - HEAD_R * 0.45, HEAD_R * 0.12,
        HEAD_CX, HEAD_CY + HEAD_R * 0.1, HEAD_R * 1.05
      );
      g.addColorStop(0, SKIN_HI); g.addColorStop(0.55, SKIN); g.addColorStop(1, SKIN_LO);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(HEAD_CX, HEAD_CY, HEAD_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;
    };

    // Helmet dome — half-ellipse clockwise from π to 0 = top half (the dome)
    const drawDome = (brimX, brimW) => {
      // Dome fill with radial gradient (upper-left hot spot)
      const g = ctx.createRadialGradient(
        HEAD_CX - DOME_R * 0.3, HEAD_CY - DOME_R * 0.5, 2,
        HEAD_CX, HEAD_CY, DOME_R
      );
      g.addColorStop(0, HELM_HI); g.addColorStop(0.55, HELM); g.addColorStop(1, HELM_LO);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(HEAD_CX, HEAD_CY, DOME_R, DOME_R, 0, Math.PI, 0, false);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;

      // Specular hotspot (bright upper-left ellipse)
      ctx.fillStyle = HELM_HI;
      ctx.globalAlpha = 0.50;
      ctx.beginPath();
      ctx.ellipse(HEAD_CX - DOME_R * 0.28, HEAD_CY - DOME_R * 0.52, DOME_R * 0.32, DOME_R * 0.15, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Gold spike at crown
      const tipY = HEAD_CY - DOME_R - 4;
      ctx.fillStyle = hx(COLORS.PLAYER_SHIELD_HI);
      ctx.beginPath();
      ctx.moveTo(HEAD_CX, tipY - 3);
      ctx.lineTo(HEAD_CX + 3, tipY + 3);
      ctx.lineTo(HEAD_CX, tipY + 5);
      ctx.lineTo(HEAD_CX - 3, tipY + 3);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = hx(COLORS.PLAYER_SHIELD); ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;

      // Brim band (dark steel bar across the bottom of the dome)
      ctx.fillStyle = HELM_LO;
      rrect(ctx, brimX, HEAD_CY - 2, brimW, 5, 2);
      ctx.fill(); ctx.stroke();

      // Rivets along the brim
      ctx.fillStyle = HELM_HI;
      const rivetStep = brimW / 4;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.arc(brimX + rivetStep * i, HEAD_CY + 0.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.8; ctx.stroke();
      }
      ctx.lineWidth = 1.5; ctx.strokeStyle = OUTLINE;
    };

    // Ear flap (steel side-guard extending below the brim)
    const drawEarFlap = (fx) => {
      const g = ctx.createRadialGradient(fx + 2, HEAD_CY + 4, 1, fx + 4, HEAD_CY + 8, 8);
      g.addColorStop(0, HELM_HI); g.addColorStop(1, HELM_LO);
      ctx.fillStyle = g;
      rrect(ctx, fx, HEAD_CY + 2, 9, 14, 2);
      ctx.fill(); ctx.stroke();
    };

    // Vertical-oval eye — chibi style, taller than wide
    const drawEye = (ex, ey) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, ey, 3.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#2d4f8a';
      ctx.beginPath(); ctx.ellipse(ex, ey + 0.5, 2.2, 3.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0a14';
      ctx.beginPath(); ctx.ellipse(ex, ey + 0.5, 1.2, 2.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + 1.1, ey - 1.5, 1.0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = OUTLINE;
    };

    // Pauldron (small steel shoulder dome with radial gradient)
    const drawPauldron = (pcx, pcy, r) => {
      const g = ctx.createRadialGradient(pcx - r * 0.4, pcy - r * 0.5, r * 0.1, pcx, pcy, r);
      g.addColorStop(0, HELM_HI); g.addColorStop(0.55, HELM); g.addColorStop(1, HELM_LO);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pcx, pcy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };

    // Torso with linear gradient (top-lit by default, pass true for back-lit)
    const drawTorso = (tw, bx, backLit = false) => {
      const ty = BODY_Y1, th = BODY_Y2 - BODY_Y1;
      const g = ctx.createLinearGradient(0, ty, 0, ty + th);
      if (backLit) { g.addColorStop(0, BODY_LO); g.addColorStop(0.5, BODY); g.addColorStop(1, BODY_HI); }
      else          { g.addColorStop(0, BODY_HI); g.addColorStop(0.45, BODY); g.addColorStop(1, BODY_LO); }
      ctx.fillStyle = g;
      rrect(ctx, bx, ty, tw, th, 4);
      ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
    };

    // Heater shield (pentagon, gold gradient) — used in left/right profile
    const drawShield = (sx, sy) => {
      const sw = 14, sh = 18, scx = sx + sw / 2;
      const g = ctx.createLinearGradient(sx, sy, sx, sy + sh);
      g.addColorStop(0, SHIELD_HI); g.addColorStop(0.5, SHIELD); g.addColorStop(1, SHIELD_LO);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy);
      ctx.lineTo(sx + sw, sy + sh * 0.55);
      ctx.lineTo(scx, sy + sh);
      ctx.lineTo(sx, sy + sh * 0.55);
      ctx.closePath();
      ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      // Diamond emblem
      ctx.fillStyle = SHIELD_LO;
      ctx.beginPath();
      ctx.moveTo(scx, sy + 4); ctx.lineTo(scx + 3, sy + 8);
      ctx.lineTo(scx, sy + 12); ctx.lineTo(scx - 3, sy + 8);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1; ctx.stroke();
      ctx.lineWidth = 1.5;
    };

    // ─── Direction-specific rendering ────────────────────────────────────

    if (dir === 'down') {
      // 1. Skin head circle
      drawHead();

      // 2. Hair tuft peeking from under the brim (drawn before helmet so brim covers top)
      ctx.fillStyle = HAIR;
      ctx.beginPath();
      ctx.arc(HEAD_CX - 4, HEAD_CY + 1, 3.5, Math.PI, 0);  // left bump
      ctx.arc(HEAD_CX + 4, HEAD_CY + 1, 3.5, Math.PI, 0);  // right bump
      ctx.lineTo(HEAD_CX + 8, HEAD_CY + 4);
      ctx.lineTo(HEAD_CX - 8, HEAD_CY + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke(); ctx.lineWidth = 1.5;

      // 3. Helmet dome + brim + rivets + spike
      drawDome(HEAD_CX - 28, 56);   // brimX=12, brimW=56

      // 4. Eyes (below the brim, vertical ovals)
      drawEye(HEAD_CX - 11, HEAD_CY + 12);
      drawEye(HEAD_CX + 11, HEAD_CY + 12);

      // 5. Rosy cheeks
      ctx.fillStyle = 'rgba(255,120,120,0.52)';
      ctx.beginPath(); ctx.ellipse(HEAD_CX - 16, HEAD_CY + 19, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(HEAD_CX + 16, HEAD_CY + 19, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();

      // 6. Tiny nose
      ctx.fillStyle = SKIN_LO;
      ctx.beginPath(); ctx.arc(HEAD_CX, HEAD_CY + 16, 1.3, 0, Math.PI * 2); ctx.fill();

      // 7. Smile
      ctx.strokeStyle = '#7a4830'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(HEAD_CX, HEAD_CY + 20, 4, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;

      // 8. Body
      drawTorso(22, ox - 11);
      // Gold chest cross
      ctx.fillStyle = SHIELD;
      ctx.fillRect(ox - 1.5, BODY_Y1 + 2, 3, 8);
      ctx.fillRect(ox - 4,   BODY_Y1 + 5, 9, 3);
      ctx.strokeStyle = SHIELD_LO; ctx.lineWidth = 0.8;
      ctx.strokeRect(ox - 1.5, BODY_Y1 + 2, 3, 8);
      ctx.strokeRect(ox - 4, BODY_Y1 + 5, 9, 3);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
      // Belt
      ctx.fillStyle = HELM_LO;
      ctx.fillRect(ox - 11, BODY_Y2 - 1, 22, 2.5);

      // 9. Pauldrons (shoulder caps at body top corners)
      drawPauldron(ox - 15, BODY_Y1, 5);
      drawPauldron(ox + 15, BODY_Y1, 5);

    } else if (dir === 'up') {
      // 1. Skin head circle
      drawHead();

      // 2. Helmet dome + spine + ear flaps
      drawDome(HEAD_CX - 30, 60);   // wider brim for back view

      // Center spine seam
      ctx.strokeStyle = HELM_LO; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.65;
      ctx.beginPath(); ctx.moveTo(HEAD_CX, HEAD_CY - DOME_R + 2); ctx.lineTo(HEAD_CX, HEAD_CY); ctx.stroke();
      ctx.globalAlpha = 1.0; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;

      // Ear flaps
      drawEarFlap(HEAD_CX - 31);
      drawEarFlap(HEAD_CX + 22);

      // 3. Body (back-lit gradient) + pauldrons + belt
      drawTorso(22, ox - 11, true);
      ctx.fillStyle = HELM_LO;
      ctx.fillRect(ox - 11, BODY_Y2 - 1, 22, 2.5);
      drawPauldron(ox - 15, BODY_Y1, 5);
      drawPauldron(ox + 15, BODY_Y1, 5);

    } else { // left — side profile (mirrored for right via scaleX=−1)
      // 1. Skin head circle
      drawHead();

      // 2. Helmet dome, brim extends more to the LEFT (front of character)
      drawDome(HEAD_CX - 30, 62);   // brimX=10, brimW=62

      // One ear flap on the RIGHT (back) side only
      drawEarFlap(HEAD_CX + 22);

      // 3. Face on LEFT side (canvas x ≈ 18–36)
      drawEye(HEAD_CX - 13, HEAD_CY + 12);

      ctx.fillStyle = 'rgba(255,120,120,0.52)';
      ctx.beginPath(); ctx.ellipse(HEAD_CX - 15, HEAD_CY + 19, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();

      // Tiny nose bump on the front edge
      ctx.fillStyle = SKIN_LO;
      ctx.beginPath(); ctx.arc(HEAD_CX - 21, HEAD_CY + 15, 1.8, 0, Math.PI * 2); ctx.fill();

      // 4. Heater shield on LEFT (front side)
      drawShield(ox - 30, BODY_Y1 - 3);

      // 5. Narrower body (side profile)
      drawTorso(16, ox - 8);
      ctx.fillStyle = HELM_LO;
      ctx.fillRect(ox - 8, BODY_Y2 - 1, 16, 2.5);

      // 6. ONE pauldron, slightly left of body center (near-side shoulder)
      drawPauldron(ox - 6, BODY_Y1, 5);
    }
  }


  // ─── Weapon canvas drawing — stubby brass blunderbuss ─────────────────────
  // Canvas 30×16. Origin: grip back-end at canvas x=4, muzzle tip at canvas x=26.
  _drawWeaponToCanvas(ctx, _ox, oy) {
    const hx = n => '#' + n.toString(16).padStart(6, '0');
    const BRASS    = hx(COLORS.PLAYER_BRASS);
    const BRASS_HI = hx(COLORS.PLAYER_BRASS_HI);
    const BRASS_LO = hx(COLORS.PLAYER_BRASS_LO);
    const WOOD     = hx(COLORS.PLAYER_WOOD);
    const GOLD     = hx(COLORS.PLAYER_SHIELD);
    const GOLD_HI  = hx(COLORS.PLAYER_SHIELD_HI);
    const OUTLINE  = '#1a1a2a';

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;

    // Wood grip (dark brown, back end)
    ctx.fillStyle = WOOD;
    rrect(ctx, 1, oy - 3, 6, 6, { tl: 2, tr: 1, bl: 2, br: 1 });
    ctx.fill();
    ctx.stroke();
    // Grip top highlight streak
    ctx.fillStyle = '#8a5430';
    ctx.fillRect(2, oy - 2, 4, 1);

    // Gold trim band between grip and barrel
    ctx.fillStyle = GOLD;
    ctx.fillRect(7, oy - 4, 2, 8);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(7, oy - 4, 2, 8);
    // Gold trim shine
    ctx.fillStyle = GOLD_HI;
    ctx.fillRect(7, oy - 4, 2, 1.5);

    // Brass barrel (linear vertical gradient, top-lit)
    const barrelGrad = ctx.createLinearGradient(0, oy - 4, 0, oy + 4);
    barrelGrad.addColorStop(0,    BRASS_HI);
    barrelGrad.addColorStop(0.45, BRASS);
    barrelGrad.addColorStop(1,    BRASS_LO);
    ctx.fillStyle = barrelGrad;
    // Tapered barrel: starts at grip x=9 width 7, ends at muzzle x=22 width 9
    ctx.beginPath();
    ctx.moveTo(9,  oy - 3);    // top back
    ctx.lineTo(22, oy - 4.5);  // top front
    ctx.lineTo(22, oy + 4.5);  // bottom front
    ctx.lineTo(9,  oy + 3);    // bottom back
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Muzzle bell — wide flared opening at the front
    const muzzleGrad = ctx.createLinearGradient(0, oy - 7, 0, oy + 7);
    muzzleGrad.addColorStop(0,    BRASS_HI);
    muzzleGrad.addColorStop(0.45, BRASS);
    muzzleGrad.addColorStop(1,    BRASS_LO);
    ctx.fillStyle = muzzleGrad;
    ctx.beginPath();
    ctx.moveTo(22, oy - 4.5);
    ctx.lineTo(27, oy - 7);
    ctx.lineTo(28, oy);
    ctx.lineTo(27, oy + 7);
    ctx.lineTo(22, oy + 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner muzzle cavity (dark)
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath();
    ctx.ellipse(27, oy, 1.5, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Subtle top highlight along the entire barrel for extra metal pop
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(10, oy - 2.5);
    ctx.lineTo(22, oy - 3.7);
    ctx.lineTo(26, oy - 5.2);
    ctx.lineTo(26, oy - 4);
    ctx.lineTo(22, oy - 2.8);
    ctx.lineTo(10, oy - 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // ─── Live leg animation ───────────────────────────────────────────────────
  // Called every frame. Legs alternate up/down (marching bob) instead of
  // sliding left/right. Consistent x-positions in all facing directions.
  _drawLegs(legPhase, moving) {
    const col  = COLORS.PLAYER_BODY;
    const boot = COLORS.PLAYER_BODY_LO;
    const outl = 0x1a1a2a;

    // Left lifts when sin > 0, right lifts when sin < 0 → natural alternation
    const liftL = moving ? -Math.max(0,  Math.sin(legPhase))           * 4 : 0;
    const liftR = moving ? -Math.max(0, -Math.sin(legPhase))           * 4 : 0;

    const drawLeg = (g, lx, lift) => {
      g.clear();
      g.fillStyle(col,  1); g.fillRoundedRect(lx, 17 + lift, 8, 10, 3);
      g.fillStyle(boot, 1); g.fillRect(lx, 24 + lift, 8, 3);
      g.lineStyle(1.5, outl, 1);
      g.strokeRoundedRect(lx, 17 + lift, 8, 10, 3);
    };

    drawLeg(this.gLegL, -11, liftL);
    drawLeg(this.gLegR,   3, liftR);
  }

  // ─── Facing direction update ──────────────────────────────────────────────
  // Derives facing from facingAngle; swaps the single characterSprite texture
  // only when direction changes. 'right' mirrors 'left' via scaleX=−1.
  _updateFacing() {
    const a = this.facingAngle;
    let f;
    if      (a > -Math.PI * 0.75 && a < -Math.PI * 0.25) f = 'up';
    else if (a >  Math.PI * 0.25 && a <  Math.PI * 0.75) f = 'down';
    else if (a > -Math.PI * 0.25 && a <  Math.PI * 0.25) f = 'right';
    else                                                   f = 'left';

    if (f === this.facing) return;
    this.facing = f;

    const dir  = (f === 'right') ? 'left' : f;
    const flip = (f === 'right') ? -1 : 1;
    this.characterSprite.setTexture(`player-char-${dir}`);
    this.characterSprite.setScale(flip, 1);
  }

  _buildFloatingHPBar() {
    this.floatHPBg = this.scene.add.graphics();
    this.floatHPFill = this.scene.add.graphics();
    this.floatHPBg.setDepth(15);
    this.floatHPFill.setDepth(16);
    this._updateFloatingHP();
  }

  _updateFloatingHP() {
    const bw = PLAYER.HP_BAR_WIDTH;
    const bh = PLAYER.HP_BAR_HEIGHT;
    const bx = this.x - bw / 2;
    const by = this.y + PLAYER.HP_BAR_OFFSET_Y;

    this.floatHPBg.clear();
    this.floatHPBg.fillStyle(0x220000, 1);
    this.floatHPBg.fillRoundedRect(bx, by, bw, bh, 2);

    this.floatHPFill.clear();
    const ratio = Math.max(0, this.hp / this.maxHp);
    const fillW = (bw - 2) * ratio;
    if (fillW > 1) {
      const col = ratio < 0.25 ? 0xff0000 : 0xe74c3c;
      this.floatHPFill.fillStyle(col, 1);
      this.floatHPFill.fillRoundedRect(bx + 1, by + 1, fillW, bh - 2, 2);
    }
  }

  _setupInput() {
    const scene = this.scene;

    // Right-click: move (use worldX/Y so coordinates work in large camera-followed worlds)
    scene.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) {
        this.targetX = ptr.worldX;
        this.targetY = ptr.worldY;
        this.moving = true;
      }
      if (ptr.leftButtonDown()) {
        this._handleLeftClick(ptr);
      }
    });

    scene.input.on('pointermove', (ptr) => {
      // Continuous right-click hold movement
      if (ptr.rightButtonDown()) {
        this.targetX = ptr.worldX;
        this.targetY = ptr.worldY;
        this.moving = true;
      }
      // Always track facing angle (world coords)
      this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, ptr.worldX, ptr.worldY);
    });

    // Do NOT stop movement on right-click release —
    // player continues to the last registered target and stops on arrival.

    // Skill keys
    scene.input.keyboard.on('keydown-Q', () => this._useSkill('Q'));
    scene.input.keyboard.on('keydown-W', () => this._useSkill('W'));
    scene.input.keyboard.on('keydown-E', () => this._useSkill('E'));
    scene.input.keyboard.on('keydown-SPACE', (e) => {
      e.preventDefault();
      this._dodge();
    });
  }

  _handleLeftClick(ptr) {
    this._basicAttack(ptr);
  }

  _basicAttack(ptr) {
    const now = this.scene.time.now;
    if (now < this.basicAttackCooldown) return;
    this.basicAttackCooldown = now + PLAYER.BASIC_ATTACK_COOLDOWN;

    const angle = Phaser.Math.Angle.Between(this.x, this.y, ptr.worldX, ptr.worldY);
    this._fireProjectile(angle, this.baseDamage, 0x88ddff, 7, PLAYER.BASIC_ATTACK_SPEED, false);

    // Blunderbuss recoil — kick 3px inward from orbit, reset after 60ms.
    // The orbit update in update() picks up _weaponRecoil each frame so no tween needed.
    this._weaponRecoil = -3;
    this.scene.time.delayedCall(60, () => { this._weaponRecoil = 0; });
  }

  _fireProjectile(angle, damage, color, radius, speed, isSkill) {
    const proj = this.scene.add.graphics();

    // Outer glow
    proj.fillStyle(color, 0.18);
    proj.fillCircle(0, 0, radius * 3.2);
    // Mid glow
    proj.fillStyle(color, 0.42);
    proj.fillCircle(0, 0, radius * 1.9);
    // Main body
    proj.fillStyle(color, 1);
    proj.fillCircle(0, 0, radius);
    // Bright white core
    proj.fillStyle(0xffffff, 0.9);
    proj.fillCircle(0, 0, radius * 0.42);

    if (isSkill) {
      proj.lineStyle(2.5, 0xffffff, 0.75);
      proj.strokeCircle(0, 0, radius * 1.15);
    }

    // Spawn at the muzzle tip. Weapon orbits at 10px local, barrel adds 22px → 32px
    // local total, × 0.765 scale ≈ 24px world-space from player center.
    const MUZZLE_WORLD = 24;
    proj.x = this.x + Math.cos(angle) * MUZZLE_WORLD;
    proj.y = this.y + Math.sin(angle) * MUZZLE_WORLD;
    proj.setDepth(8);

    proj._vx = Math.cos(angle) * speed;
    proj._vy = Math.sin(angle) * speed;
    proj._damage = damage;
    proj._isSkill = isSkill;
    proj._alive = true;
    proj._color = color;
    proj._radius = radius;
    proj._trailTimer = 0;
    proj._speed = speed;
    proj._distTraveled = 0;

    this.projectiles.add(proj);
  }

  _useSkill(key) {
    const now = this.scene.time.now;
    if (now < this.skillCooldowns[key]) return;

    const skill = SKILLS[key];
    if (this.stamina < skill.staminaCost) return;

    this.stamina -= skill.staminaCost;
    this.skillCooldowns[key] = now + skill.cooldown;

    const angle = this.facingAngle;
    const dmg = skill.damage * (1 + (this.level - 1) * SCALING.DAMAGE_MULTIPLIER_PER_LEVEL);

    if (key === 'Q') {
      // Power Strike — big fast projectile
      this._fireProjectile(angle, dmg, SKILLS.Q.color, 11, SKILLS.Q.projectileSpeed, true);
      this.scene.cameras.main.shake(80, 0.0015);
      // G — Q activation flash
      spawnBurst(this.scene, this.x, this.y, {
        color: 0xffee44, count: 6,
        minDist: 12, maxDist: 35,
        minSize: 3, maxSize: 6,
        duration: 180,
      });
    } else if (key === 'W') {
      // Shield Dash — dash + i-frames + contact damage
      this._doDash(angle, SKILLS.W.dashDistance, SKILLS.W.dashSpeed, SKILLS.W.iframeDuration, dmg, 0x44aaff);
    } else if (key === 'E') {
      // Ground Slam — AoE around player
      this._groundSlam(dmg, SKILLS.E.radius);
    }
  }

  _dodge() {
    const now = this.scene.time.now;
    if (now < this.skillCooldowns['SPACE']) return;
    if (this.stamina < PLAYER.DODGE_STAMINA_COST) return;
    this.stamina -= PLAYER.DODGE_STAMINA_COST;
    this.skillCooldowns['SPACE'] = now + PLAYER.DODGE_COOLDOWN;

    this._doDash(this.facingAngle, PLAYER.DODGE_DISTANCE, PLAYER.DODGE_SPEED, PLAYER.DODGE_IFRAME_DURATION, 0, 0x44ff88);
  }

  _doDash(angle, distance, speed, iframeDur, contactDmg, trailColor) {
    if (this.isDodging) return;
    this.isDodging = true;
    this.invincible = true;

    const dashEnd = this._findLastValidDashPoint(angle, distance);
    const targetX = dashEnd.x;
    const targetY = dashEnd.y;
    const duration = (distance / speed) * 1000;

    // Ghost trail
    this._spawnGhostTrail(trailColor);

    // One-hit flag — contact damage fires at most once per dash
    let dashHitLanded = false;

    this.scene.tweens.add({
      targets: this.container,
      x: targetX,
      y: targetY,
      duration,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        this.x = this.container.x;
        this.y = this.container.y;
        this._updateFloatingHP();
        // Contact damage on dash through boss — only once per dash
        if (contactDmg > 0 && !dashHitLanded) {
          if (this._checkContactDamage(contactDmg)) dashHitLanded = true;
        }
      },
      onComplete: () => {
        this.isDodging = false;
        const ptr = this.scene.input.activePointer;
        // Dot-product tells us whether the cursor is still ahead of the landing
        // point in the dash direction.  Positive → ahead, resume.  Zero/negative
        // → player overshot the cursor, stop here instead of walking backward.
        const dot = (ptr.worldX - this.x) * Math.cos(angle)
                  + (ptr.worldY - this.y) * Math.sin(angle);
        if (ptr.rightButtonDown() && dot > 0) {
          this.targetX = ptr.worldX;
          this.targetY = ptr.worldY;
          this.moving = true;
        } else {
          this.moving = false;
        }
        // i-frames outlast the dash slightly
        this.scene.time.delayedCall(iframeDur - duration, () => {
          this.invincible = false;
          this.container.setAlpha(1);
        });
      }
    });

    // Flicker during i-frames
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: Math.floor(iframeDur / 160),
    });
  }

  _spawnGhostTrail(color) {
    for (let i = 0; i < 4; i++) {
      const delay = i * 50;
      this.scene.time.delayedCall(delay, () => {
        const ghost = this.scene.add.graphics();
        ghost.fillStyle(color, 0.35);
        ghost.fillRoundedRect(this.x - 16, this.y - 10, 32, 28, 6);
        ghost.fillCircle(this.x, this.y - 18, 13);
        ghost.setDepth(7);
        this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 300, onComplete: () => ghost.destroy() });
      });
    }
  }

  // Returns true if contact damage actually landed (boss was hit).
  _checkContactDamage(dmg) {
    const arena = this.scene;
    if (arena.altar) {
      const altarDist = Phaser.Math.Distance.Between(this.x, this.y, arena.altar.x, arena.altar.y);
      if (altarDist < 55) arena.altar.interact();
    }
    if (arena.boss && arena.bossAlive) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, arena.boss.x, arena.boss.y);
      if (dist < 55) {
        arena.boss.takeDamage(dmg);
        return true;
      }
    }
    return false;
  }

  _groundSlam(dmg, radius) {
    // Visual: expanding ring
    const ring = this.scene.add.graphics();
    ring.x = this.x;
    ring.y = this.y;
    ring.setDepth(9);

    this.scene.tweens.addCounter({
      from: 0,
      to: radius,
      duration: 280,
      ease: 'Quad.easeOut',
      onUpdate: (tween) => {
        const r = tween.getValue();
        ring.clear();
        ring.lineStyle(4, SKILLS.E.color, 1 - r / radius);
        ring.strokeCircle(0, 0, r);
      },
      onComplete: () => {
        ring.destroy();
        // F — ground dust cloud on slam landing
        spawnDust(this.scene, this.x, this.y, 16);
      }
    });

    // Stomp animation: jump then land
    this.scene.tweens.add({
      targets: this.container,
      y: this.container.y - 18,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    this.scene.cameras.main.shake(150, 0.0024);

    const arena = this.scene;
    if (arena.altar) {
      const altarDist = Phaser.Math.Distance.Between(this.x, this.y, arena.altar.x, arena.altar.y);
      if (altarDist < radius + 20) arena.altar.interact();
    }
    if (arena.boss && arena.bossAlive) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, arena.boss.x, arena.boss.y);
      if (dist < radius + 30) arena.boss.takeDamage(dmg);
    }
  }

  takeDamage(amount) {
    if (!this.alive || this.invincible) return;
    this.hp = Math.max(0, this.hp - amount);

    // Brief invincibility after hit
    this.invincible = true;
    this.scene.time.delayedCall(500, () => { this.invincible = false; });

    // Red flash
    this._hitFlash();
    this._updateFloatingHP();

    // E — blood splatter on player hit
    spawnBlood(this.scene, this.x, this.y, 12);

    if (this.hp <= 0) this._die();
  }

  _hitFlash() {
    [this.characterSprite, this.weaponSprite].forEach(s => {
      this.scene.tweens.add({
        targets: s, alpha: 0.3, duration: 60, yoyo: true, repeat: 2,
        onComplete: () => { if (s?.active) s.setAlpha(1); },
      });
    });
  }

  _die() {
    this.alive = false;
    this.container.setAlpha(0);
    this.floatHPBg.destroy();
    this.floatHPFill.destroy();
    if (this.shadowG) { this.shadowG.destroy(); this.shadowG = null; }

    // Death particles
    for (let i = 0; i < 12; i++) {
      const frag = this.scene.add.graphics();
      frag.fillStyle(COLORS.PLAYER_BODY, 1);
      frag.fillRect(-5, -5, 10, 10);
      frag.x = this.x;
      frag.y = this.y;
      const angle = (i / 12) * Math.PI * 2;
      const dist = Phaser.Math.Between(40, 100);
      this.scene.tweens.add({
        targets: frag,
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
        alpha: 0, angle: Phaser.Math.Between(-180, 180),
        duration: 600, ease: 'Quad.easeOut',
        onComplete: () => frag.destroy()
      });
    }

    this.scene.time.delayedCall(700, () => this.scene.playerDied());
  }

  /** Arena-aware wall-slide movement. Updates this.x / this.y. */
  _tryMove(nx, ny) {
    const arena = this.scene.arena;
    const r = 14;
    if (!arena) { this.x = nx; this.y = ny; return; }
    if (arena.containsPoint(nx, ny, r)) {
      this.x = nx; this.y = ny;
    } else if (arena.containsPoint(nx, this.y, r)) {
      this.x = nx;                        // slide along Y wall
    } else if (arena.containsPoint(this.x, ny, r)) {
      this.y = ny;                        // slide along X wall
    }
    // else: fully blocked — stay put
  }

  /** Push the player out of any overlapping obstacle bases. */
  _pushOutObstacles() {
    const r = 14;
    this.scene.obstacles?.forEach(obs => {
      const dx = this.x - obs.x, dy = this.y - obs.y;
      const dist = Math.hypot(dx, dy);
      const min = r + obs.baseRadius;
      if (dist < min && dist > 0.01) {
        const push = (min - dist) / dist;
        this.x += dx * push;
        this.y += dy * push;
      }
    });
  }

  /** Slide player to the surface of the boss — skipped during dashes so they phase through. */
  _pushOutBoss() {
    const boss = this.scene.boss;
    if (!boss || !this.scene.bossAlive) return;
    const PLAYER_RADIUS = 16;
    const minDist = boss.size + PLAYER_RADIUS;
    const dx = this.x - boss.x;
    const dy = this.y - boss.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < minDist && dist > 0) {
      const scale = minDist / dist;
      this.x = boss.x + dx * scale;
      this.y = boss.y + dy * scale;
    }
  }

  /**
   * Walk along the dash path and return the last world position that passes
   * arena.containsPoint. This prevents dashing through walls.
   */
  _findLastValidDashPoint(angle, distance) {
    const arena = this.scene.arena;
    if (!arena) {
      return { x: this.x + Math.cos(angle) * distance, y: this.y + Math.sin(angle) * distance };
    }
    const STEPS = 24;
    let lastX = this.x, lastY = this.y;
    for (let i = 1; i <= STEPS; i++) {
      const t = (i / STEPS) * distance;
      const tx = this.x + Math.cos(angle) * t;
      const ty = this.y + Math.sin(angle) * t;
      if (arena.containsPoint(tx, ty, 16)) {
        lastX = tx; lastY = ty;
      } else {
        break; // wall hit — stop here
      }
    }
    return { x: lastX, y: lastY };
  }

  update(time, delta) {
    if (!this.alive) return;
    const dt = delta / 1000;

    // Passive stamina regen
    this.stamina = Math.min(this.staminaMax, this.stamina + PLAYER.STAMINA_REGEN_RATE * dt);

    // Movement — skip while dash tween owns the container
    if (this.moving && !this.isDodging) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, this.targetX, this.targetY);
      if (dist > 4) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.targetX, this.targetY);
        // Rubble slow — walking only; dash (isDodging) bypasses this entirely
        let speedMult = 1;
        if (this.scene.obstacles) {
          for (const obs of this.scene.obstacles) {
            if (obs.rubbleActive &&
                Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y) < obs.rubbleRadius) {
              speedMult = 0.55;
              break;
            }
          }
        }
        const step = Math.min(this.speed * speedMult * dt, dist);
        this._tryMove(this.x + Math.cos(angle) * step, this.y + Math.sin(angle) * step);
        this._pushOutObstacles();
        this._pushOutBoss();
        this.container.x = this.x;
        this.container.y = this.y;
        this._legPhase += dt * 12;
      } else {
        this.moving = false;
      }
    }

    // Idle bob — gentle whole-body y nudge (no redraw)
    this._idleTimer += dt;
    const bobOffset = this.moving ? 0 : Math.sin(this._idleTimer * 2.2) * 2;
    this.characterSprite.y = bobOffset;

    // Leg marching bob + facing update
    this._drawLegs(this._legPhase, this.moving);
    this._updateFacing();

    // Weapon orbits body center at fixed radius, always pointing at cursor
    const WEAPON_ORBIT_R = 10;
    const orbitR = WEAPON_ORBIT_R + this._weaponRecoil;
    this.weaponSprite.x = orbitR * Math.cos(this.facingAngle);
    this.weaponSprite.y = orbitR * Math.sin(this.facingAngle);
    this.weaponSprite.rotation = this.facingAngle;

    // Update floating HP bar position
    this._updateFloatingHP();

    // Update ground shadow
    if (this.shadowG && this.shadowG.active) {
      this.shadowG.clear();
      this.shadowG.fillStyle(0x000000, 0.28);
      this.shadowG.fillEllipse(this.x + 2, this.y + 22, 30, 8);
    }

    // Update projectiles
    this._updateProjectiles(dt);

    // Check boss proximity for altar interaction hint
    this._checkAltarProximity();
  }

  _updateProjectiles(dt) {
    const scene = this.scene;
    const sceneArena = scene.arena;

    this.projectiles.getChildren().forEach(proj => {
      if (!proj._alive) return;
      proj.x += proj._vx * dt;
      proj.y += proj._vy * dt;
      proj._distTraveled += proj._speed * dt;

      // Fizzle at max range
      if (proj._distTraveled >= PLAYER.PROJECTILE_MAX_RANGE) {
        proj._alive = false;
        this.scene.tweens.add({ targets: proj, alpha: 0, scaleX: 0.2, scaleY: 0.2, duration: 80, onComplete: () => proj.destroy() });
        return;
      }

      // Trail particle
      proj._trailTimer = (proj._trailTimer || 0) + dt;
      if (proj._trailTimer > 0.028) {
        proj._trailTimer = 0;
        const trail = this.scene.add.graphics();
        trail.fillStyle(proj._color || 0x88ddff, 0.5);
        trail.fillCircle(0, 0, (proj._radius || 5) * 0.8);
        trail.x = proj.x;
        trail.y = proj.y;
        trail.setDepth(7);
        this.scene.tweens.add({
          targets: trail, alpha: 0, scaleX: 0.2, scaleY: 0.2,
          duration: 100, onComplete: () => trail.destroy()
        });
      }

      // Out of arena bounds — destroy
      if (sceneArena && !sceneArena.containsPoint(proj.x, proj.y, 0)) {
        proj._alive = false;
        proj.destroy();
        return;
      }

      // Hit obstacle base — destroy (projectiles can't pass through obstacle bases)
      if (scene.obstacles) {
        for (const obs of scene.obstacles) {
          const od = Phaser.Math.Distance.Between(proj.x, proj.y, obs.x, obs.y);
          if (od < obs.baseRadius + (proj._radius || 5)) {
            // Spark ricochet on obstacle hit; ring for skill shots
            spawnSparks(this.scene, proj.x, proj.y, proj._color || 0x88ddff, 8);
            if (proj._isSkill) spawnImpactRing(this.scene, proj.x, proj.y, proj._color || 0x88ddff);
            proj._alive = false;
            proj.destroy();
            return;
          }
        }
      }

      // Hit altar
      if (scene.altar) {
        const altarDist = Phaser.Math.Distance.Between(proj.x, proj.y, scene.altar.x, scene.altar.y);
        if (altarDist < 40) {
          spawnSparks(this.scene, proj.x, proj.y, proj._color || 0x88ddff, 8);
          if (proj._isSkill) spawnImpactRing(this.scene, proj.x, proj.y, proj._color || 0x88ddff);
          scene.altar.interact();
          proj._alive = false;
          proj.destroy();
          return;
        }
      }

      // Hit boss
      if (scene.boss && scene.bossAlive) {
        const dist = Phaser.Math.Distance.Between(proj.x, proj.y, scene.boss.x, scene.boss.y);
        if (dist < scene.boss.size + (proj._radius || 5)) {
          // Stamina regen on hit (basic attack only)
          if (!proj._isSkill) {
            this.stamina = Math.min(this.staminaMax, this.stamina + PLAYER.STAMINA_REGEN_PER_HIT);
          }
          // D — sparks at boss surface edge (not deep inside body)
          const hitAngle = Math.atan2(proj.y - scene.boss.y, proj.x - scene.boss.x);
          const sx = scene.boss.x + Math.cos(hitAngle) * scene.boss.size;
          const sy = scene.boss.y + Math.sin(hitAngle) * scene.boss.size;
          spawnSparks(this.scene, sx, sy, proj._color || 0x88ddff, 10);
          // Ring only for skill shots (Q) — differentiates from basic attack
          if (proj._isSkill) spawnImpactRing(this.scene, sx, sy, proj._color || 0x88ddff);
          scene.boss.takeDamage(proj._damage);
          proj._alive = false;
          proj.destroy();
        }
      }

      // Aux hit zones — e.g. Stomper arms (checked only if still alive after body check)
      if (proj._alive && scene.boss && scene.bossAlive) {
        for (const zone of scene.boss.getAuxHitZones()) {
          const zd = Phaser.Math.Distance.Between(proj.x, proj.y, zone.x, zone.y);
          if (zd < zone.r + (proj._radius || 5)) {
            if (!proj._isSkill) {
              this.stamina = Math.min(this.staminaMax, this.stamina + PLAYER.STAMINA_REGEN_PER_HIT);
            }
            spawnSparks(this.scene, proj.x, proj.y, proj._color || 0x88ddff, 8);
            if (proj._isSkill) spawnImpactRing(this.scene, proj.x, proj.y, proj._color || 0x88ddff);
            scene.boss.takeDamage(proj._damage);
            proj._alive = false;
            proj.destroy();
            break;
          }
        }
      }
    });
  }

  _checkAltarProximity() {
    const arena = this.scene;
    if (!arena.altar) return;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, arena.altar.x, arena.altar.y);
    if (dist < 55) {
      arena.altar.interact();
    }
  }

  destroy() {
    this.container.destroy(true);   // destroys gLegL, gLegR, bodySprite, headSprite
    if (this.shadowG?.active) { this.shadowG.destroy(); this.shadowG = null; }
    this.floatHPBg.destroy();
    this.floatHPFill.destroy();
    this.projectiles.clear(true, true);
  }
}
