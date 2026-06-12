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

    // Single merged character sprite — full character in one 70×82 canvas.
    // Canvas pixel (35, 60) = local (0, 0) = waist. setOrigin(0.5, 60/82) so
    // that specific pixel is the container-local position anchor.
    this.characterSprite = this.scene.add.image(0, 0, 'player-char35-down');
    this.characterSprite.setOrigin(0.5, 60 / 82);

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
  // Creates three 70×82 canvas textures (one per direction). Canvas pixel (35, 60)
  // = character waist = container local (0, 0). Key 'player-char35-{dir}' avoids
  // any cached v1-v4 textures.
  _buildFacingTextures() {
    for (const dir of ['down', 'up', 'left']) {
      const key = `player-char35-${dir}`;
      if (this.scene.textures.exists(key)) continue;
      const tex = this.scene.textures.createCanvas(key, 70, 82);
      this._drawCharToCanvas(tex.getContext(), dir, 35, 60);
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
      ctx.quadraticCurveTo(ox - 13, HC + 26, ox - 4,  HC + 26.5); // chin
      ctx.quadraticCurveTo(ox + 8,  HC + 29.5, ox + 18, HC + 22); // continues along the head bottom (nape)
      ctx.quadraticCurveTo(ox + 26, HC + 16, ox + 25, HC + 6);  // back edge, up under the chain
      ctx.closePath();                                          // top edge, hidden under band
      ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1.5;

      // 3. Chainmail guard — angular mass over the back of the head, hanging down
      // to the neck with a flat hem (drawn after the face so it frames the jaw)
      const chainPath = () => {
        ctx.beginPath();
        ctx.moveTo(ox - 2, HC + 2);                              // front-top, behind face
        ctx.lineTo(ox + 23, HC + 6);                             // top edge under the band
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
    this.characterSprite.setTexture(`player-char35-${dir}`);
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
