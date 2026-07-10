import Phaser from 'phaser';
import {
  PLAYER, SKILLS, COLORS, SCALING, WEAPON,
  GAME_WIDTH, GAME_HEIGHT
} from '../config/gameConfig.js';
import { getSettings, saveSetting } from '../config/settings.js';
import { spawnBurst, spawnSparks, spawnDust, spawnBlood, spawnImpactRing, spawnGroundSlamDust, spawnDashBurst, spawnDashTrailPuff } from '../systems/ParticleHelper.js';

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
    this._weaponRecoil = 0;     // backward kick along the aim axis, decays each frame
    this._weaponAngle = 0;      // smoothed weapon tilt — lerps toward facingAngle
    this._weaponBehind = false; // true while the weapon renders behind the character
    this._weaponSide = 1;       // 1 = right of the body, -1 = left; jumps across at vertical aim
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

    // Single merged character sprite — full character in one 70×82 canvas.
    // Canvas pixel (35, 60) = local (0, 0) = waist. setOrigin(0.5, 60/82) so
    // that specific pixel is the container-local position anchor.
    this.characterSprite = this.scene.add.image(0, 0, 'player-char37-down');
    this.characterSprite.setOrigin(0.5, 60 / 82);

    // Weapon: hugs the body and tilts about its own midpoint — position/rotation
    // updated every frame in update(). Centered origin = see-saw pivot.
    this.weaponSprite = this.scene.add.image(0, 0, 'player-weapon2');
    this.weaponSprite.setOrigin(0.5, 0.5);

    // Z-order: legs → character → weapon (weapon floats over the body)
    this.container.add([this.gLegL, this.gLegR, this.characterSprite, this.weaponSprite]);
    this.container.setScale(0.765);

    this.facing = null;
    this._drawLegs(0, false);
    this._updateFacing();
  }

  // ─── Facing texture baking ────────────────────────────────────────────────
  // Creates three 70×82 canvas textures (one per direction). Canvas pixel (35, 60)
  // = character waist = container local (0, 0). Key 'player-char37-{dir}' avoids
  // any cached v1-v4 textures.
  _buildFacingTextures() {
    for (const dir of ['down', 'up', 'left']) {
      const key = `player-char37-${dir}`;
      if (this.scene.textures.exists(key)) continue;
      const tex = this.scene.textures.createCanvas(key, 70, 82);
      this._drawCharToCanvas(tex.getContext(), dir, 35, 60);
      tex.refresh();
    }
  }

  // ─── Weapon texture baking ────────────────────────────────────────────────
  _buildWeaponTexture() {
    const key = 'player-weapon2';
    if (this.scene.textures.exists(key)) return;
    const tex = this.scene.textures.createCanvas(key, 48, 22);
    this._drawWeaponToCanvas(tex.getContext(), 0, 11);
    tex.refresh();
  }

  // ─── Character canvas drawing (v5 — BoI "head IS the character") ─────────────
  // Canvas 70×82. ox=35, oy=60 (waist = local origin, canvas pixel (35,60)).
  // Head circle center: (ox, oy-28) = (35, 32), radius 28.
  // Helmet = TOP HALF of the head circle, painted steel. Same circle, different paint.
  // Brim = horizontal line across the circle at head center y.
  // Body = tiny 20×10 stub below the head. Legs = live Graphics below the canvas.
  _drawCharToCanvas(ctx, dir, ox, oy) {
    const HC = oy - 25;   // head circle center y in canvas (= 35) — 3px lower so head sits on torso
    const HR = 28;         // head radius
    const hx = n => '#' + n.toString(16).padStart(6, '0');
    const BODY    = hx(COLORS.PLAYER_BODY);
    const BODY_HI = hx(COLORS.PLAYER_BODY_HI);
    const BODY_LO = hx(COLORS.PLAYER_BODY_LO);
    const HELM    = hx(COLORS.PLAYER_HELMET);
    const HELM_HI = hx(COLORS.PLAYER_HELMET_HI);
    const HELM_LO = hx(COLORS.PLAYER_HELMET_LO);
    const CHAIN    = hx(COLORS.PLAYER_CHAINMAIL);
    const CHAIN_HI = hx(COLORS.PLAYER_CHAINMAIL_HI);
    const CHAIN_LO = hx(COLORS.PLAYER_CHAINMAIL_LO);
    const SHIELD  = hx(COLORS.PLAYER_SHIELD);
    const SHIELD_HI = hx(COLORS.PLAYER_SHIELD_HI);
    const SHIELD_LO = hx(COLORS.PLAYER_SHIELD_LO);
    const SKIN    = hx(COLORS.PLAYER_SKIN);
    const SKIN_HI = hx(COLORS.PLAYER_SKIN_HI);
    const SKIN_LO = hx(COLORS.PLAYER_SKIN_LO);
    const OUTLINE = '#1a1a2a';
    // ─── Shared helpers ──────────────────────────────────────────────────

    // ─── Shared helpers ──────────────────────────────────────────────────

    // Head circle — skin, radial gradient (sun upper-left)
    // HC = oy-28 = 32 in canvas. HR = 28.
    const drawHead = () => {
      const g = ctx.createRadialGradient(
        ox - HR * 0.35, HC - HR * 0.45, HR * 0.12,
        ox, HC + HR * 0.1,  HR * 1.05
      );
      g.addColorStop(0,    SKIN_HI);
      g.addColorStop(0.55, SKIN);
      g.addColorStop(1.0,  SKIN_LO);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ox, HC, HR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;
    };

    // Ring rivet — chunky donut rivet (light disc + dark center hole)
    const drawRingRivet = (rx, ry) => {
      ctx.fillStyle = HELM_HI;
      ctx.beginPath(); ctx.arc(rx, ry, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.fillStyle = OUTLINE;
      ctx.beginPath(); ctx.arc(rx, ry, 1.0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5;
    };

    // FRONT-VIEW helmet — steel wraps down the sides to the jaw; the face is a small
    // window in the lower center. Brim band sweeps over the eyes into a center V nasal
    // point, its ends curving down around the face window. Vertical riveted crest band
    // up the dome center, gold finial at the crown.
    const drawHelmFront = () => {
      // 1. Full steel over the entire head circle
      const g = ctx.createRadialGradient(
        ox - HR * 0.25, HC - HR * 0.50, 2,
        ox, HC, HR * 1.05
      );
      g.addColorStop(0,    HELM_HI);
      g.addColorStop(0.55, HELM);
      g.addColorStop(1.0,  HELM_LO);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ox, HC, HR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;

      // Specular hotspot (upper-left)
      ctx.fillStyle = HELM_HI;
      ctx.globalAlpha = 0.50;
      ctx.beginPath();
      ctx.ellipse(ox - HR * 0.28, HC - HR * 0.52, HR * 0.30, HR * 0.14, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Speckle texture on the dome
      ctx.fillStyle = HELM_HI;
      ctx.globalAlpha = 0.35;
      const speckles = [[-14, -12], [10, -16], [17, -6], [-19, -2], [6, -7]];
      for (const [dx, dy] of speckles) {
        ctx.beginPath(); ctx.arc(ox + dx, HC + dy, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 2. Face window — wide skin oval carved into the lower center (wider than
      // tall — the cuddly squashed-oval face of the reference, not a circle)
      const fg = ctx.createRadialGradient(
        ox - 6, HC + 8, 3,
        ox, HC + 14, 20
      );
      fg.addColorStop(0,    SKIN_HI);
      fg.addColorStop(0.55, SKIN);
      fg.addColorStop(1.0,  SKIN_LO);
      ctx.fillStyle = fg;
      // Wide flat top (hidden under the brim band) so skin reaches the rim between
      // the eyes and the cheek guards — no steel bleed below the band; sides bulge
      // to the guards, bottom is a flattened oval chin
      ctx.beginPath();
      ctx.moveTo(ox - 16, HC + 4);
      ctx.quadraticCurveTo(ox - 20, HC + 5,  ox - 19, HC + 13);
      ctx.quadraticCurveTo(ox - 18, HC + 22, ox - 7,  HC + 25);
      ctx.quadraticCurveTo(ox,      HC + 26.5, ox + 7, HC + 25);
      ctx.quadraticCurveTo(ox + 18, HC + 22, ox + 19, HC + 13);
      ctx.quadraticCurveTo(ox + 20, HC + 5,  ox + 16, HC + 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;

      // Steel wedge filling the V notch — no skin/gap visible between the V band
      // and the dome behind it
      ctx.fillStyle = HELM;
      ctx.beginPath();
      ctx.moveTo(ox - 13, HC + 2);
      ctx.lineTo(ox, HC + 7);
      ctx.lineTo(ox + 13, HC + 2);
      ctx.closePath();
      ctx.fill();

      // 5. Vertical crest band (drawn before the brim so the V overlaps its base)
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ox, HC - HR - 1);
      ctx.lineTo(ox, HC + 6);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7.5; ctx.stroke();
      ctx.strokeStyle = HELM_LO; ctx.lineWidth = 4.5; ctx.stroke();

      // Chainmail cheek guards — hang from the helmet rim, framing the face sides
      // down to the jaw. Drawn BEFORE the brim band so the band overlaps their tops
      // (they read as part of the helmet, not straps tied behind the head).
      const drawCheekGuard = (side) => {   // side: -1 left, +1 right
        const gx = side < 0 ? ox - 26 : ox + 19;   // 7 wide, hugging the rim edge
        const cg = ctx.createLinearGradient(gx, HC + 4, gx + 7, HC + 4);
        if (side < 0) { cg.addColorStop(0, CHAIN_LO); cg.addColorStop(0.6, CHAIN); cg.addColorStop(1, CHAIN_HI); }
        else          { cg.addColorStop(0, CHAIN_HI); cg.addColorStop(0.4, CHAIN); cg.addColorStop(1, CHAIN_LO); }
        ctx.fillStyle = cg;
        rrect(ctx, gx, HC + 4, 7, 18,
          side < 0 ? { tl: 3, tr: 2, bl: 7, br: 5 } : { tl: 2, tr: 3, bl: 5, br: 7 });
        ctx.fill();
        ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;
        // Chainmail link hint — offset rows of small arcs
        ctx.strokeStyle = CHAIN_LO; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.55;
        for (let row = 0; row < 4; row++) {
          const ly = HC + 8 + row * 3.5;
          const lx = gx + 2.5 + (row % 2 ? 1.5 : 0);
          ctx.beginPath(); ctx.arc(lx, ly, 1.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        }
        ctx.globalAlpha = 1.0; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
      };
      drawCheekGuard(-1);
      drawCheekGuard(1);

      // 3. Brim band with a shallow V nasal point; near-flat ends landing on the
      // cheek guards' tops
      const brimPath = () => {
        ctx.beginPath();
        ctx.moveTo(ox - 25, HC + 7);
        ctx.quadraticCurveTo(ox - 20, HC + 3, ox - 13, HC + 2);
        ctx.lineTo(ox, HC + 6.5);
        ctx.lineTo(ox + 13, HC + 2);
        ctx.quadraticCurveTo(ox + 20, HC + 3, ox + 25, HC + 7);
      };
      ctx.lineJoin = 'miter';
      brimPath();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 8; ctx.stroke();
      brimPath();
      ctx.strokeStyle = HELM_LO; ctx.lineWidth = 5; ctx.stroke();
      ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;

      // 4. Ring rivets — band sweeps and crest
      drawRingRivet(ox - 19, HC + 4.5);
      drawRingRivet(ox - 10, HC + 2.5);
      drawRingRivet(ox + 10, HC + 2.5);
      drawRingRivet(ox + 19, HC + 4.5);
      drawRingRivet(ox, HC - 19);
      drawRingRivet(ox, HC - 9);

      // 6. Gold finial at the crown — round base with a pointed tip
      drawFinial();
    };

    // Gold finial at the crown — round base with a pointed tip. fx/fy default to the
    // straight-on crown; the side view passes an offset apex (helmet tilted back).
    const drawFinial = (fx = ox, fy = HC - HR - 3) => {
      ctx.fillStyle = SHIELD_HI;
      ctx.beginPath();
      ctx.moveTo(fx - 2.5, fy);
      ctx.quadraticCurveTo(fx - 2, fy - 5, fx, fy - 7);
      ctx.quadraticCurveTo(fx + 2, fy - 5, fx + 2.5, fy);
      ctx.arc(fx, fy, 2.5, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = SHIELD; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
    };

    // BACK-VIEW helmet — all steel + chainmail, zero skin. Same dome/crest/finial as
    // the front; below the ∪ rim band a chainmail curtain (aventail) spans the full
    // head width and hangs below the rim to the shoulders.
    const drawHelmBack = () => {
      // 1. Full steel over the entire head circle
      const g = ctx.createRadialGradient(
        ox - HR * 0.25, HC - HR * 0.50, 2,
        ox, HC, HR * 1.05
      );
      g.addColorStop(0,    HELM_HI);
      g.addColorStop(0.55, HELM);
      g.addColorStop(1.0,  HELM_LO);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ox, HC, HR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;

      // Specular hotspot (upper-left)
      ctx.fillStyle = HELM_HI;
      ctx.globalAlpha = 0.50;
      ctx.beginPath();
      ctx.ellipse(ox - HR * 0.28, HC - HR * 0.52, HR * 0.30, HR * 0.14, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Speckle texture on the dome
      ctx.fillStyle = HELM_HI;
      ctx.globalAlpha = 0.35;
      const speckles = [[-12, -14], [13, -13], [18, -4], [-18, -5], [-7, -8], [8, -6]];
      for (const [dx, dy] of speckles) {
        ctx.beginPath(); ctx.arc(ox + dx, HC + dy, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 2. Chainmail curtain — narrow elliptical sliver hugging the rim band's curve,
      // hanging just below the helmet silhouette (the dome owns most of the head)
      const curtainPath = () => {
        ctx.beginPath();
        // Top edge = circular arc along the band (left→right through the dip):
        // through (±24, HC+8) and (ox, HC+16) → R=40, center (ox, HC-24)
        ctx.arc(ox, HC - 24, 40, Math.atan2(32, -24), Math.atan2(32, 24), true);
        ctx.lineTo(ox + 23, HC + 19);                           // right edge, slight taper
        // Hem = circular arc (right→left) through (±23, HC+19) and (ox, HC+28.5):
        // R=32.6, center (ox, HC-4.1); lowest point clears the circle bottom
        ctx.arc(ox, HC - 4.1, 32.6, Math.atan2(23.1, 23), Math.atan2(23.1, -23), false);
        ctx.closePath();                                        // left edge
      };
      const cg = ctx.createLinearGradient(0, HC + 10, 0, HC + 30);
      cg.addColorStop(0,   CHAIN_HI);
      cg.addColorStop(0.45, CHAIN);
      cg.addColorStop(1,   CHAIN_LO);
      ctx.fillStyle = cg;
      curtainPath();
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;
      // Chainmail link hint — offset rows of small arcs, clipped to the curtain
      ctx.save();
      curtainPath();
      ctx.clip();
      ctx.strokeStyle = CHAIN_LO; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.55;
      for (let row = 0; row < 4; row++) {
        const ly = HC + 16 + row * 3.5;
        for (let col = -5; col <= 5; col++) {
          const lx = ox + col * 5 + (row % 2 ? 2.5 : 0);
          ctx.beginPath(); ctx.arc(lx, ly, 1.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1.0; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;

      // 3. Vertical crest band — crown down to the ∪ band's center dip
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ox, HC - HR - 1);
      ctx.lineTo(ox, HC + 16);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 7.5; ctx.stroke();
      ctx.strokeStyle = HELM_LO; ctx.lineWidth = 4.5; ctx.stroke();

      // 4. ∪ rim band — circular arc: ends raised to (±24, HC+8), center dip kept at
      // (HC+16) — tighter R=40 arc, curvature spread evenly across the whole band
      const bandPath = () => {
        ctx.beginPath();
        ctx.arc(ox, HC - 24, 40, Math.atan2(32, -24), Math.atan2(32, 24), true);
      };
      bandPath();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 8; ctx.stroke();
      bandPath();
      ctx.strokeStyle = HELM_LO; ctx.lineWidth = 5; ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;

      // 5. Ring rivets — on the arc midline: y = HC-24 + sqrt(40² − x²)
      drawRingRivet(ox - 19, HC + 11.2);
      drawRingRivet(ox - 10, HC + 14.7);
      drawRingRivet(ox,      HC + 16);
      drawRingRivet(ox + 10, HC + 14.7);
      drawRingRivet(ox + 19, HC + 11.2);
      drawRingRivet(ox, HC - 19);
      drawRingRivet(ox, HC - 9);
      drawRingRivet(ox, HC + 1);

      // 6. Gold finial
      drawFinial();
    };

    // SIDE-VIEW helmet (facing left; back = +x, mirrored right via scaleX=-1).
    // Dome tilted BACK: the rim band runs diagonally — high over the brow, dipping
    // low at the back of the head — and the finial sits behind the apex. Rounded
    // skin face profile at the front-lower quadrant; angular chainmail guard over
    // the back of the head hanging down to the neck.
    const drawHelmSide = () => {
      // 1. Full steel over the entire head circle
      const g = ctx.createRadialGradient(
        ox - HR * 0.25, HC - HR * 0.50, 2,
        ox, HC, HR * 1.05
      );
      g.addColorStop(0,    HELM_HI);
      g.addColorStop(0.55, HELM);
      g.addColorStop(1.0,  HELM_LO);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ox, HC, HR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;

      // Specular hotspot (upper-left)
      ctx.fillStyle = HELM_HI;
      ctx.globalAlpha = 0.50;
      ctx.beginPath();
      ctx.ellipse(ox - HR * 0.28, HC - HR * 0.52, HR * 0.30, HR * 0.14, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1.0;

      // Speckle texture on the dome
      ctx.fillStyle = HELM_HI;
      ctx.globalAlpha = 0.35;
      const speckles = [[-13, -13], [12, -15], [17, -5], [-19, -4], [5, -8]];
      for (const [dx, dy] of speckles) {
        ctx.beginPath(); ctx.arc(ox + dx, HC + dy, 1.1, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 2. Face window — rounded profile at the front-lower quadrant: forehead under
      // the band, rounded cheek, soft chin, vertical jaw edge against the chainmail
      const fg = ctx.createRadialGradient(
        ox - 18, HC + 9, 3,
        ox - 10, HC + 15, 26
      );
      fg.addColorStop(0,    SKIN_HI);
      fg.addColorStop(0.55, SKIN);
      fg.addColorStop(1.0,  SKIN_LO);
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(ox - 25, HC + 1);                              // top-front, under band
      ctx.quadraticCurveTo(ox - 27, HC + 14, ox - 20, HC + 21); // rounded forehead→cheek
      ctx.quadraticCurveTo(ox - 14, HC + 25.5, ox - 4, HC + 27);  // chin
      ctx.quadraticCurveTo(ox + 6,  HC + 28.5, ox + 18, HC + 22); // nape — control collinear with chin tangent (no kink)
      ctx.quadraticCurveTo(ox + 26, HC + 16, ox + 25, HC + 6);  // back edge, up under the chain
      ctx.closePath();                                          // top edge, hidden under band
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;

      // 3. Chainmail guard — angular mass over the back of the head, hanging down
      // to the neck with a flat hem (drawn after the face so it frames the jaw)
      const chainPath = () => {
        ctx.beginPath();
        ctx.moveTo(ox - 2, HC + 7);                              // front-top, behind face
        ctx.lineTo(ox + 23, HC + 8);                             // top edge tracks under the band's curve
        ctx.quadraticCurveTo(ox + 28, HC + 10, ox + 27, HC + 15); // back of skull bulge
        ctx.lineTo(ox + 26, HC + 21);                            // straight down (angular)
        ctx.quadraticCurveTo(ox + 26, HC + 25, ox + 21, HC + 25.5); // small back corner
        ctx.lineTo(ox + 3, HC + 24.5);                           // flat hem forward
        ctx.quadraticCurveTo(ox - 2, HC + 24, ox - 2, HC + 19);  // front-bottom corner
        ctx.closePath();                                         // front edge up the jaw
      };
      const cg = ctx.createLinearGradient(0, HC + 2, 0, HC + 26);
      cg.addColorStop(0,   CHAIN_HI);
      cg.addColorStop(0.45, CHAIN);
      cg.addColorStop(1,   CHAIN_LO);
      ctx.fillStyle = cg;
      chainPath();
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;
      // Chainmail link hint — offset rows of small arcs, clipped to the guard
      ctx.save();
      chainPath();
      ctx.clip();
      ctx.strokeStyle = CHAIN_LO; ctx.lineWidth = 0.8; ctx.globalAlpha = 0.55;
      for (let row = 0; row < 5; row++) {
        const ly = HC + 9 + row * 3.5;
        for (let col = 0; col <= 5; col++) {
          const lx = ox + col * 5 + (row % 2 ? 2.5 : 0);
          ctx.beginPath(); ctx.arc(lx, ly, 1.6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1.0; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;

      // 4. Tilted rim band — high over the brow (front), dipping toward the back
      const bandPath = () => {
        ctx.beginPath();
        ctx.moveTo(ox - 26, HC + 0);
        ctx.quadraticCurveTo(ox - 2, HC + 10, ox + 25, HC + 7);
      };
      ctx.lineCap = 'round';
      bandPath();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 8; ctx.stroke();
      bandPath();
      ctx.strokeStyle = HELM_LO; ctx.lineWidth = 5; ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;

      // 5. Ring rivets along the band midline
      drawRingRivet(ox - 19, HC + 2.7);
      drawRingRivet(ox - 4,  HC + 6.4);
      drawRingRivet(ox + 12, HC + 7.7);
      drawRingRivet(ox + 21, HC + 7.4);

      // 6. Gold finial — apex shifted back (helmet tilt)
      drawFinial(ox + 5, HC - HR - 1.5);
    };

    // Vertical-oval eye (chibi: taller than wide)
    const drawEye = (ex, ey) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, ey, 4.0, 6.0, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#2d4f8a';
      ctx.beginPath(); ctx.ellipse(ex, ey + 0.5, 2.5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0a14';
      ctx.beginPath(); ctx.ellipse(ex, ey + 0.5, 1.4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex + 1.2, ey - 1.8, 1.0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = OUTLINE;
    };

    // Tiny body stub (barely visible — BoI style)
    const drawBody = (bx, bw, backLit = false) => {
      const by = oy + 2, bh = 10;
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      if (backLit) { g.addColorStop(0, BODY_LO); g.addColorStop(0.5, BODY); g.addColorStop(1, BODY_HI); }
      else          { g.addColorStop(0, BODY_HI); g.addColorStop(0.5, BODY); g.addColorStop(1, BODY_LO); }
      ctx.fillStyle = g;
      rrect(ctx, bx, by, bw, bh, 5);   // r=5 — noticeably rounded, not boxy
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = HELM_LO;
      ctx.fillRect(bx + 2, by + bh - 2, bw - 4, 2);   // belt line (inset to clear rounded corners)
    };

    // Arm — small steel circle, sticking out from the body side. r=4.
    const drawArm = (pcx, pcy) => {
      const r = 4;
      const g = ctx.createRadialGradient(pcx - 1, pcy - 1, 0.5, pcx, pcy, r);
      g.addColorStop(0, HELM_HI); g.addColorStop(0.6, HELM); g.addColorStop(1, HELM_LO);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(pcx, pcy, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
    };

    // Heater shield (left-view only, gold pentagon)
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
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = SHIELD_LO;
      ctx.beginPath();
      ctx.moveTo(scx, sy + 4); ctx.lineTo(scx + 3, sy + 8);
      ctx.lineTo(scx, sy + 12); ctx.lineTo(scx - 3, sy + 8);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = 1; ctx.stroke(); ctx.lineWidth = 1.5;
    };

    // ─── Direction-specific rendering ────────────────────────────────────

    if (dir === 'down') {
      drawHead();
      drawHelmFront();
      drawEye(ox - 10, HC + 12);
      drawEye(ox + 10, HC + 12);
      // Cheeks
      ctx.fillStyle = 'rgba(255,120,120,0.50)';
      ctx.beginPath(); ctx.ellipse(ox - 13, HC + 18, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ox + 13, HC + 18, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      // Nose
      ctx.fillStyle = SKIN_LO;
      ctx.beginPath(); ctx.arc(ox, HC + 17, 1.3, 0, Math.PI * 2); ctx.fill();
      // Smile
      ctx.strokeStyle = '#7a4830'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ox, HC + 22, 4, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
      // Body — bw=26, bx centered at ox
      const bx = ox - 13;
      drawBody(bx, 26);
      // Gold cross
      ctx.fillStyle = SHIELD;
      ctx.fillRect(ox - 1.5, oy + 3, 3, 6);
      ctx.fillRect(ox - 4,   oy + 5, 9, 3);
      ctx.strokeStyle = SHIELD_LO; ctx.lineWidth = 0.8;
      ctx.strokeRect(ox - 1.5, oy + 3, 3, 6);
      ctx.strokeRect(ox - 4, oy + 5, 9, 3);
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5;
      drawArm(bx - 2,      oy + 6);   // left arm
      drawArm(bx + 26 + 2, oy + 6);  // right arm

    } else if (dir === 'up') {
      drawHead();        // base circle — fully covered, keeps the outline silhouette
      drawHelmBack();    // dome + chainmail curtain + crest + ∪ band + rivets + finial
      const bxU = ox - 13;   // bw=26 centered at ox
      drawBody(bxU, 26);               // overlaps the curtain's bottom edge
      drawArm(bxU - 2,       oy + 6);  // left arm
      drawArm(bxU + 26 + 2,  oy + 6); // right arm

    } else { // left — side profile (mirrored for right via scaleX=-1)
      drawHead();
      drawHelmSide();
      drawEye(ox - 14, HC + 12);
      // One cheek
      ctx.fillStyle = 'rgba(255,120,120,0.50)';
      ctx.beginPath(); ctx.ellipse(ox - 16, HC + 18, 4.5, 3, 0, 0, Math.PI * 2); ctx.fill();
      // Nose
      ctx.fillStyle = SKIN_LO;
      ctx.beginPath(); ctx.arc(ox - 24, HC + 14, 1.5, 0, Math.PI * 2); ctx.fill();
      // Shield
      drawShield(ox - 30, oy + 2);
      // Side body — same width as front/back (chibi style, no narrowing)
      const bxL = ox - 13;
      drawBody(bxL, 26);
      drawArm(ox + 2,  oy + 6);          // arm slightly toward center (x=37), mid-torso height
    }
  }


  // ─── Weapon canvas drawing — dark iron hand-cannon with brass bands ───────
  // Canvas 48×22, oy=11 = vertical center. Cascabel knob at the back (x≈1-9),
  // breech block, straight barrel, chunky muzzle rim with a dark bore at x≈46.
  // Midpoint origin (0.5, 0.5) — the float system tilts it about the center.
  _drawWeaponToCanvas(ctx, _ox, oy) {
    const hx = n => '#' + n.toString(16).padStart(6, '0');
    const BRASS    = hx(COLORS.PLAYER_BRASS);
    const BRASS_HI = hx(COLORS.PLAYER_BRASS_HI);
    const BRASS_LO = hx(COLORS.PLAYER_BRASS_LO);
    const OUTLINE  = '#1a1a2a';

    const IRON     = hx(COLORS.PLAYER_IRON);
    const IRON_HI  = hx(COLORS.PLAYER_IRON_HI);
    const IRON_LO  = hx(COLORS.PLAYER_IRON_LO);

    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.2;

    // Shared top-lit iron gradient builder
    const ironGrad = (top, bottom) => {
      const g = ctx.createLinearGradient(0, top, 0, bottom);
      g.addColorStop(0,    IRON_HI);
      g.addColorStop(0.45, IRON);
      g.addColorStop(1,    IRON_LO);
      return g;
    };

    // 1. Cascabel knob (back) — the cartoon cannon butt: small ball + short neck
    ctx.fillStyle = ironGrad(oy - 4, oy + 4);
    ctx.beginPath(); ctx.arc(4, oy, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.stroke();
    ctx.fillStyle = IRON;
    ctx.fillRect(6, oy - 2.5, 3, 5);   // neck connecting knob to breech
    ctx.strokeRect(6, oy - 2.5, 3, 5);

    // 2. Breech block — thickest mass at the back
    ctx.fillStyle = ironGrad(oy - 8, oy + 8);
    rrect(ctx, 8, oy - 8, 8, 16, { tl: 4, tr: 1, bl: 4, br: 1 });
    ctx.fill();
    ctx.stroke();

    // 3. Main barrel — straight iron cylinder, slight forward taper, NO flare
    ctx.fillStyle = ironGrad(oy - 7.5, oy + 7.5);
    ctx.beginPath();
    ctx.moveTo(16, oy - 7.5);   // top back
    ctx.lineTo(40, oy - 6.5);   // top front (taper)
    ctx.lineTo(40, oy + 6.5);   // bottom front
    ctx.lineTo(16, oy + 7.5);   // bottom back
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 5. Muzzle lip — chunky swollen ring at the front (a rim, not a flare)
    ctx.fillStyle = ironGrad(oy - 8, oy + 8);
    rrect(ctx, 40, oy - 8, 6, 16, 2);
    ctx.fill();
    ctx.stroke();

    // 6. Bore — deep dark barrel hole on the muzzle face
    ctx.fillStyle = IRON_LO;
    ctx.beginPath(); ctx.ellipse(44.5, oy, 2.4, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0a0a14';
    ctx.beginPath(); ctx.ellipse(44.8, oy, 1.7, 4.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1; ctx.stroke();
    ctx.lineWidth = 1.2;

    // 4. Brass reinforcing bands — breech joint, mid-barrel, behind the muzzle lip
    const drawBand = (bx, h) => {
      const g = ctx.createLinearGradient(0, oy - h / 2, 0, oy + h / 2);
      g.addColorStop(0, BRASS_HI);
      g.addColorStop(0.5, BRASS);
      g.addColorStop(1, BRASS_LO);
      ctx.fillStyle = g;
      rrect(ctx, bx, oy - h / 2, 3, h, 1);
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.lineWidth = 1.2;
    };
    drawBand(15, 17);   // breech/barrel joint
    drawBand(26, 16);   // mid-barrel
    drawBand(36, 15.5); // behind the muzzle lip

    // 7. Specular streak along the top of the barrel — metal pop
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.30;
    ctx.beginPath();
    ctx.moveTo(17, oy - 5.8);
    ctx.lineTo(39, oy - 5.0);
    ctx.lineTo(39, oy - 3.6);
    ctx.lineTo(17, oy - 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // ─── Live leg animation ───────────────────────────────────────────────────
  // BoI-style foot blobs: short wide ellipses alternating up/down (marching).
  _drawLegs(legPhase, moving) {
    const col  = COLORS.PLAYER_BODY;
    const boot = COLORS.PLAYER_BODY_LO;
    const outl = 0x1a1a2a;

    const liftL  = moving ? -Math.max(0,  Math.sin(legPhase)) * 3 : 0;
    const liftR  = moving ? -Math.max(0, -Math.sin(legPhase)) * 3 : 0;
    // Horizontal swing: foot swings forward (toward center) when lifted
    const swingL = moving ?  Math.sin(legPhase) * 3 : 0;
    const swingR = moving ? -Math.sin(legPhase) * 3 : 0;

    const drawBlob = (g, cx, liftY) => {
      g.clear();
      g.fillStyle(col,  1); g.fillEllipse(cx, 15 + liftY, 10, 8);
      g.fillStyle(boot, 1); g.fillEllipse(cx, 17 + liftY, 10, 4);
      g.lineStyle(1.5, outl, 1);
      g.strokeEllipse(cx, 15 + liftY, 10, 8);
    };

    drawBlob(this.gLegL, -7 + swingL, liftL);
    drawBlob(this.gLegR,  7 + swingR, liftR);
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
    this.characterSprite.setTexture(`player-char37-${dir}`);
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

    // Pointer: move on right-click, attack on left-click, always track facing angle
    scene.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) {
        this.targetX = ptr.worldX;
        this.targetY = ptr.worldY;
        this.moving  = true;
      }
      if (ptr.leftButtonDown()) this._handleLeftClick(ptr);
    });
    scene.input.on('pointermove', (ptr) => {
      if (ptr.rightButtonDown()) {
        this.targetX = ptr.worldX;
        this.targetY = ptr.worldY;
        this.moving  = true;
      }
      this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, ptr.worldX, ptr.worldY);
    });

    // WASD keys for movement (polled in update when movementMode === 'wasd')
    this.wasdKeys = scene.input.keyboard.addKeys('W,A,S,D');

    // Skill / dodge keys — registered from settings so they survive rebinds
    this._skillKeyHandlers = [];
    this._movementMode = getSettings().movementMode;
    this._registerSkillKeys();
  }

  // Re-registers skill/dodge keyboard listeners from current settings.
  // Called on init and whenever the player rebinds a key or changes movement mode.
  _registerSkillKeys() {
    // Remove previous listeners
    for (const [evt, fn] of this._skillKeyHandlers) {
      this.scene.input.keyboard.off(evt, fn);
    }
    this._skillKeyHandlers = [];

    const { keys } = getSettings();
    const bind = (slot, skillId, isDodge = false) => {
      const evt = `keydown-${keys[slot]}`;
      const fn  = isDodge
        ? (e) => { e.preventDefault(); this._dodge(); }
        : ()  => this._useSkill(skillId);
      this.scene.input.keyboard.on(evt, fn);
      this._skillKeyHandlers.push([evt, fn]);
    };

    bind('skill1', 'Q');
    bind('skill2', 'W');
    bind('skill3', 'E');
    bind('dodge',  null, true);
  }

  // Called by the settings overlay whenever the player changes a binding or mode.
  applySettings() {
    const s = getSettings();
    this._movementMode = s.movementMode;
    this._registerSkillKeys();
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

    // Recoil — backward kick along the aim axis; update() decays it each frame.
    this._weaponRecoil = WEAPON.RECOIL_KICK;
  }

  // Muzzle tip world position — derived from the weapon sprite's live local position
  // plus the barrel half-length along the fire angle, scaled by the container.
  _muzzleWorldPos(angle = this._weaponAngle) {
    return {
      x: this.container.x + (this.weaponSprite.x + Math.cos(angle) * WEAPON.MUZZLE_OFFSET) * this.container.scaleX,
      y: this.container.y + (this.weaponSprite.y + Math.sin(angle) * WEAPON.MUZZLE_OFFSET) * this.container.scaleY,
    };
  }

  _getPlayerProjTexture(color, radius, isSkill) {
    const key = `fx-pproj-${color.toString(16)}-${radius}${isSkill ? '-s' : ''}`;
    if (this.scene.textures.exists(key)) return key;

    const GLOW = radius * 3.2;
    const S = Math.ceil(GLOW) * 2 + 4;
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');
    const cx = S / 2, cy = S / 2;
    const R = (color >> 16) & 0xff;
    const G = (color >> 8)  & 0xff;
    const B =  color        & 0xff;
    const lr = Math.min(255, Math.round(R * 1.5 + 80));
    const lg = Math.min(255, Math.round(G * 1.5 + 80));
    const lb = Math.min(255, Math.round(B * 1.5 + 80));
    const dr = Math.round(R * 0.3), dg = Math.round(G * 0.3), db = Math.round(B * 0.3);

    // Layer 1 — outer soft glow cloud
    const outerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, GLOW);
    outerGlow.addColorStop(0.00, `rgba(${R},${G},${B},0.30)`);
    outerGlow.addColorStop(0.40, `rgba(${R},${G},${B},0.18)`);
    outerGlow.addColorStop(0.75, `rgba(${R},${G},${B},0.07)`);
    outerGlow.addColorStop(1.00, `rgba(${R},${G},${B},0.00)`);
    ctx.fillStyle = outerGlow; ctx.fillRect(0, 0, S, S);

    // Layer 2 — mid glow
    const midGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.9);
    midGlow.addColorStop(0.00, `rgba(${R},${G},${B},0.65)`);
    midGlow.addColorStop(0.60, `rgba(${R},${G},${B},0.30)`);
    midGlow.addColorStop(1.00, `rgba(${R},${G},${B},0.00)`);
    ctx.fillStyle = midGlow; ctx.fillRect(0, 0, S, S);

    // Layer 3 — sphere body (clipped, offset focal point for 3D shading)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
    const sphere = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.3, 0, cx, cy, radius);
    sphere.addColorStop(0.00, 'rgba(255,255,255,1.00)');
    sphere.addColorStop(0.20, `rgba(${lr},${lg},${lb},1.00)`);
    sphere.addColorStop(0.55, `rgba(${R},${G},${B},1.00)`);
    sphere.addColorStop(0.85, `rgba(${dr},${dg},${db},0.90)`);
    sphere.addColorStop(1.00, `rgba(${dr},${dg},${db},0.00)`);
    ctx.fillStyle = sphere; ctx.fillRect(0, 0, S, S);
    ctx.restore();

    // Q skill ring accent — baked white stroke around the sphere
    if (isSkill) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2); ctx.stroke();
    }

    this.scene.textures.addCanvas(key, canvas);
    return key;
  }

  _fireProjectile(angle, damage, color, radius, speed, isSkill) {
    const texKey = this._getPlayerProjTexture(color, radius, isSkill);
    const m = this._muzzleWorldPos(angle);
    const proj = this.scene.add.image(m.x, m.y, texKey);
    proj.setOrigin(0.5, 0.5).setDepth(8);

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
      // Shield Dash — gradient puff burst backward at launch, then dash
      spawnDashBurst(this.scene, this.x, this.y, angle, 0x44aaff);
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
    // Distance-throttled smoke trail — spawn puffs every ~16px of travel
    let trailLastX = this.container.x;
    let trailLastY = this.container.y;
    const TRAIL_STEP_SQ = 10 * 10;

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
        // Smoke trail — throttle by distance so density stays even
        const dx = this.container.x - trailLastX;
        const dy = this.container.y - trailLastY;
        if (dx * dx + dy * dy >= TRAIL_STEP_SQ) {
          spawnDashTrailPuff(this.scene, this.container.x, this.container.y, angle, trailColor);
          trailLastX = this.container.x;
          trailLastY = this.container.y;
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
      this.scene.time.delayedCall(i * 45, () => {
        if (!this.alive) return;

        const cx  = this.container.x;
        const cy  = this.container.y;
        const csx = this.container.scaleX * this.characterSprite.scaleX;
        const csy = this.container.scaleY;
        const wx  = cx + this.weaponSprite.x * this.container.scaleX;
        const wy  = cy + this.weaponSprite.y * this.container.scaleY;
        const startAlpha = 0.45 - i * 0.06;

        const gc = this.scene.add.image(cx, cy, this.characterSprite.texture.key);
        gc.setOrigin(0.5, 60 / 82).setScale(csx, csy)
          .setTint(color).setAlpha(startAlpha).setDepth(7);
        this.scene.tweens.add({
          targets: gc, alpha: 0, duration: 260,
          onComplete: () => gc.destroy(),
        });

        const gw = this.scene.add.image(wx, wy, 'player-weapon2');
        gw.setOrigin(0.5, 0.5)
          .setScale(this.container.scaleX, this.container.scaleY)
          .setRotation(this.weaponSprite.rotation)
          .setFlipY(this.weaponSprite.flipY)
          .setTint(color).setAlpha(startAlpha - 0.05).setDepth(7);
        this.scene.tweens.add({
          targets: gw, alpha: 0, duration: 260,
          onComplete: () => gw.destroy(),
        });
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
    spawnGroundSlamDust(this.scene, this.x, this.y);

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
      const ocy = obs.y + (obs.colOffsetY || 0);
      const dx = this.x - obs.x, dy = this.y - ocy;
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

    // WASD movement — overrides target position each frame when keys are held
    if (this._movementMode === 'wasd' && !this.isDodging) {
      let dx = 0, dy = 0;
      if (this.wasdKeys.W.isDown) dy -= 1;
      if (this.wasdKeys.S.isDown) dy += 1;
      if (this.wasdKeys.A.isDown) dx -= 1;
      if (this.wasdKeys.D.isDown) dx += 1;
      if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        this.targetX = this.x + (dx / len) * 200;
        this.targetY = this.y + (dy / len) * 200;
        this.moving  = true;
      } else {
        this.moving  = false;
        this.targetX = this.x;
        this.targetY = this.y;
      }
    }

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

    // Keep container Y locked to world position — no vertical bob (would drift over shadow).
    this._idleTimer += dt;
    if (!this.isDodging) {
      this.container.y = this.y;
    }

    // Scale animation — walk squish on foot-landings, idle breathe squish in place.
    // Both operate purely on scale so the character stays grounded on its shadow.
    if (this.moving && !this.isDodging) {
      // Walk squish: peaks when |sin(legPhase)|≈0 (both feet on ground = landing)
      const s = (1 - Math.abs(Math.sin(this._legPhase))) * 0.06;
      this.container.scaleX = 0.765 * (1 + s);
      this.container.scaleY = 0.765 * (1 - s * 0.65);
    } else if (!this.isDodging) {
      // Idle breathe: very subtle ±3% height pulse, ±1.2% width compensation
      const breathe = Math.sin(this._idleTimer * 2.2) * 0.03;
      this.container.scaleX = 0.765 * (1 + breathe * 0.4);
      this.container.scaleY = 0.765 * (1 - breathe);
    } else {
      // Dodging — flat scale; dash tween owns container position
      this.container.scaleX = this.container.scaleY = 0.765;
    }

    // Leg marching bob + facing update
    this._drawLegs(this._legPhase, this.moving);
    this._updateFacing();

    // Weapon hugs the body and tilts about its midpoint toward the cursor.
    // Smoothed angle (shortest arc) → slight follow lag instead of an instant snap.
    const tiltDelta = Phaser.Math.Angle.Wrap(this.facingAngle - this._weaponAngle);
    this._weaponAngle = Phaser.Math.Angle.Wrap(this._weaponAngle + tiltDelta * WEAPON.TILT_LERP);

    // Recoil decays exponentially back to rest
    this._weaponRecoil *= WEAPON.RECOIL_DECAY;
    if (this._weaponRecoil < 0.05) this._weaponRecoil = 0;

    const wa  = this._weaponAngle;
    const bob = Math.sin(this._idleTimer * WEAPON.BOB_SPEED) * WEAPON.BOB_AMPLITUDE;
    // Split half-ellipse swivel: the weapon lives on the cursor's side of the body,
    // sliding between SIDE_GAP (vertical aim) and ORBIT_X (horizontal aim), and
    // JUMPS across the body when the aim crosses vertical — its midpoint never
    // overlaps the body center, so it is never fully hidden behind the character.
    const c = Math.cos(wa);
    if      (this._weaponSide > 0 && c < -WEAPON.SIDE_SWITCH_MARGIN) this._weaponSide = -1;
    else if (this._weaponSide < 0 && c >  WEAPON.SIDE_SWITCH_MARGIN) this._weaponSide = 1;
    const spread = WEAPON.SIDE_GAP + Math.abs(c) * (WEAPON.ORBIT_X - WEAPON.SIDE_GAP);
    this.weaponSprite.x = this._weaponSide * spread - c * this._weaponRecoil;
    const s = Math.sin(wa);
    const orbitY = s > 0 ? WEAPON.ORBIT_Y_DOWN : WEAPON.ORBIT_Y_UP;  // deeper bottom half
    this.weaponSprite.y = WEAPON.ANCHOR_Y + s * orbitY + bob
                          - s * this._weaponRecoil * 0.5;
    this.weaponSprite.rotation = wa;
    this.weaponSprite.flipY = this._weaponSide < 0;   // mirror exactly when it crosses sides

    // Z-order: the giant head draws above the weapon for most angles — the weapon
    // comes in front of the body only when aiming down-ish, with hysteresis so it
    // doesn't flicker at the cone edge.
    const offDown = Math.abs(Phaser.Math.Angle.Wrap(wa - Math.PI / 2));  // 0 = straight down
    if (this._weaponBehind && offDown < Phaser.Math.DegToRad(WEAPON.FRONT_ENTER_DEG)) {
      this._weaponBehind = false;
      this.container.moveAbove(this.weaponSprite, this.characterSprite);
    } else if (!this._weaponBehind && offDown > Phaser.Math.DegToRad(WEAPON.FRONT_EXIT_DEG)) {
      this._weaponBehind = true;
      this.container.moveBelow(this.weaponSprite, this.characterSprite);
    }

    // Update floating HP bar position
    this._updateFloatingHP();

    // Update ground shadow
    if (this.shadowG && this.shadowG.active) {
      this.shadowG.clear();
      this.shadowG.fillStyle(0x000000, 0.28);
      this.shadowG.fillEllipse(this.x + 1, this.y + 12, 28, 7);
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
          const ocy = obs.y + (obs.colOffsetY || 0);
          const od = Phaser.Math.Distance.Between(proj.x, proj.y, obs.x, ocy);
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
