import Phaser from 'phaser';
import { OBSTACLES } from '../config/gameConfig.js';
import { bakeRockTexture, bakePillarTexture, bakeStumpTexture, bakeTreeTrunkTexture, bakeTreeCanopyTexture, bakeSpireTrunkTexture, bakeSpireCanopyTexture } from './obstacleArt.js';

export default class Obstacle {
  constructor(scene, x, y, type, tall, themeIdx = 0) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.type = type;
    this.tall = tall;
    this.themeIdx = themeIdx;

    // Collision radii
    this.baseRadius = OBSTACLES[`${type.toUpperCase()}_RADIUS`] ?? 28;
    this.canopyRadius = tall ? OBSTACLES.TREE_CANOPY_RADIUS : 0;

    // Breaking / rubble state
    this._origBaseRadius  = this.baseRadius; // preserved after break() zeroes baseRadius
    this.broken           = false;
    this.rubbleActive     = false;
    this.rubbleRadius     = 0;
    this._rubbleGraphics  = [];

    // Tween guard
    this._canopyAlphaTweening = false;

    // Baked-texture keys for this instance (freed on break/destroy/shutdown)
    this._texKeys = [];

    this._build();
    this.scene.events.once('shutdown', () => this._removeTextures());
  }

  // ── Deterministic per-instance hash ──────────────────────────────────────
  // Returns a float in [0, 1) seeded by (this.x, this.y, salt).
  // Same obstacle position → same appearance across reloads.
  // Use this instead of Math.random() in all build methods.
  _h(salt) {
    const n = (Math.abs(Math.round(this.x) * 374761393
                      + Math.round(this.y) * 1274126177
                      + salt * 2654435761) >>> 0);
    return n / 0xffffffff;
  }

  // ── Theme palette ─────────────────────────────────────────────────────────
  // Returns a colour object used by all non-spire obstacle builders.
  // Each field is a 0xRRGGBB integer. Theme 0 (Green Fields) reproduces the
  // original hardcoded values; themes 1-4 give biome-appropriate palettes.

  _getObstacleTheme() {
    const T = [
      { // 0 — Green Fields (original colours)
        rockBody: 0x4a4a55, rockShade: 0x33333c, rockHL: 0x7a7a88, rockCrack: 0x222228,
        trunkBody: 0x3e200a, trunkDark: 0x2a1606, roots: 0x3a1e08,
        canopyA: 0x1a4010, canopyB: 0x276618, canopyC: 0x38882a, canopyD: 0x52aa3e,
        canopyHL: 0xddffdd, canopyRim: 0x0e2808, canopyHLAlpha: 0.50,
        stumpBark: 0x4a2e10, stumpWood: 0x7a4e20, stumpRing: 0x5c3a16,
        pillarBody: 0x808080, pillarDark: 0x555555, pillarCap: 0x909090,
        pillarCrack: 0x404040, pillarChip: 0x707070,
        lavaGlow: false,
      },
      { // 1 — Crystal Caves
        rockBody: 0x252a4a, rockShade: 0x14182e, rockHL: 0x4a5590, rockCrack: 0x5577cc,
        trunkBody: 0x1a1e3a, trunkDark: 0x0e1020, roots: 0x14182e,
        canopyA: 0x104048, canopyB: 0x1a6878, canopyC: 0x2a90a8, canopyD: 0x44b0c8,
        canopyHL: 0x88ddee, canopyRim: 0x0a2830, canopyHLAlpha: 0.55,
        stumpBark: 0x1a1e3a, stumpWood: 0x2a3060, stumpRing: 0x3a4480,
        pillarBody: 0x252a4a, pillarDark: 0x14182e, pillarCap: 0x354a7a,
        pillarCrack: 0x4466aa, pillarChip: 0x3a4a7a,
        lavaGlow: false,
      },
      { // 2 — Volcanic Depths
        rockBody: 0x1c0e06, rockShade: 0x0e0702, rockHL: 0x3c1a08, rockCrack: 0xff5500,
        trunkBody: 0x160a02, trunkDark: 0x0a0400, roots: 0x1a0900,
        canopyA: 0x1a0800, canopyB: 0x280e04, canopyC: 0x200a02, canopyD: 0x301208,
        canopyHL: 0xff6600, canopyRim: 0x0a0300, canopyHLAlpha: 0.40,
        stumpBark: 0x1a0a04, stumpWood: 0x100602, stumpRing: 0x3c1a08,
        pillarBody: 0x1e1008, pillarDark: 0x0c0604, pillarCap: 0x2a1a0c,
        pillarCrack: 0xff4400, pillarChip: 0x241208,
        lavaGlow: true,
      },
      { // 3 — Celestial Void
        rockBody: 0x1c1030, rockShade: 0x0e0818, rockHL: 0x3c2060, rockCrack: 0x9966cc,
        trunkBody: 0x14102a, trunkDark: 0x0a0814, roots: 0x181430,
        canopyA: 0x101828, canopyB: 0x1a2850, canopyC: 0x283878, canopyD: 0x3848a0,
        canopyHL: 0x8899ee, canopyRim: 0x080c18, canopyHLAlpha: 0.48,
        stumpBark: 0x1c1030, stumpWood: 0x2c1a50, stumpRing: 0x4c2a80,
        pillarBody: 0x1e1230, pillarDark: 0x0e0a1a, pillarCap: 0x2e1a50,
        pillarCrack: 0x8855bb, pillarChip: 0x241540,
        lavaGlow: false,
      },
      { // 4 — Chaos Realm
        rockBody: 0x14101e, rockShade: 0x0a0812, rockHL: 0x302050, rockCrack: 0xcc44ff,
        trunkBody: 0x120e1c, trunkDark: 0x080610, roots: 0x16101e,
        canopyA: 0x140e20, canopyB: 0x1e1438, canopyC: 0x281a50, canopyD: 0x381a70,
        canopyHL: 0xaa44ff, canopyRim: 0x080610, canopyHLAlpha: 0.42,
        stumpBark: 0x14101e, stumpWood: 0x201830, stumpRing: 0x3c2060,
        pillarBody: 0x16101e, pillarDark: 0x0a0812, pillarCap: 0x241630,
        pillarCrack: 0xbb44ff, pillarChip: 0x1e1230,
        lavaGlow: false,
      },
    ];
    return T[Math.min(this.themeIdx ?? 0, 4)];
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  _build() {
    switch (this.type) {
      case 'rock':   this._buildRock();   break;
      case 'stump':  this._buildStump();  break;
      case 'tree':   this._buildTree();   break;
      case 'pillar': this._buildPillar(); break;
      case 'spire':  this._buildSpire();  break;
      default:       this._buildRock();
    }
  }

  // ── Rock ──────────────────────────────────────────────────────────────────
  // Jagged faceted boulder — canvas-baked with a directional facet gradient
  // (see bakeRockTexture in obstacleArt.js). Shape/variants/hash variety unchanged.

  _buildRock() {
    const tc = this._getObstacleTheme();
    const r  = this.baseRadius;

    // Per-instance hash-driven layout properties
    const variant   = Math.floor(this._h(0) * 4);      // 0=solo, 1=twin, 2=cluster, 3=slab
    const ptCount   = 7 + Math.floor(this._h(1) * 3);  // 7, 8, or 9 polygon vertices
    const scaleMult = 0.88 + this._h(2) * 0.26;        // 0.88–1.14× overall size

    const key = `obs-rock-${Math.round(this.x)}-${Math.round(this.y)}`;
    bakeRockTexture(this.scene, key, { r, variant, ptCount, scaleMult }, tc, this._h.bind(this));
    this._trackTex(key);

    const img = this.scene.add.image(this.x, this.y, key).setOrigin(0.5).setDepth(this.y);
    this.container = img;
    // Soft per-rock contact shadows are baked into the texture — no separate _addShadow.
  }

  // ── Tree stump ────────────────────────────────────────────────────────────
  // 2.5D cylinder: front bark face (visible side) + top ellipse (cut face).
  //
  //   ___________
  //  / top face  \   ← cut ellipse — wood + growth rings
  // |_____________|  ← top rim line
  // |  bark face  |  ← front cylinder band — bark texture + fissures
  // |_____________|  ← ground line
  //      shadow

  _buildStump() {
    const r  = this.baseRadius;
    const tc = this._getObstacleTheme();

    // Hash-driven variant (unchanged): 0=fresh cut, 1=old/mossy, 2=tall, 3=low slab
    const variant = Math.floor(this._h(0) * 4);
    const frontH  = [r * 1.10, r * 1.00, r * 1.60, r * 0.70][variant]; // visible bark height
    const topW    = r * 2.0;
    const topH    = Math.min(frontH * 0.65, r * 0.80);
    const topCY   = -frontH;

    const key = `obs-stump-${Math.round(this.x)}-${Math.round(this.y)}`;
    const { originX, originY } = bakeStumpTexture(
      this.scene, key, { r, variant, frontH, topW, topH, topCY }, tc, this._h.bind(this));
    this._trackTex(key);

    const img = this.scene.add.image(this.x, this.y, key)
      .setOrigin(originX, originY).setDepth(this.y);
    this.container = img;
    // Soft layered ground shadow is baked into the texture — no separate _addShadow.
  }

  // ── Tall tree ─────────────────────────────────────────────────────────────

  _buildTree() {
    const tr = this.baseRadius;
    const cr = this.canopyRadius;
    const tc = this._getObstacleTheme();

    // Hash-driven per-instance variety
    const tHMult = 0.88 + this._h(3) * 0.30;
    const lean   = (this._h(4) - 0.5) * 8;
    const crMult = 0.90 + this._h(6) * 0.22;
    const cOffX  = (this._h(7) - 0.5) * cr * 0.18;  // canopy asymmetry X
    const cOffY  = (this._h(8) - 0.5) * cr * 0.12;  // canopy asymmetry Y
    const swayMs = 1600 + this._h(9) * 800;
    const cr2    = cr * crMult;

    const tTop = tr * 3.5 * tHMult;
    const tH   = tr * 4.0 * tHMult;

    // Bake trunk (cylinder gradient + tapered root buttresses + ground shadow)
    const trunkKey = `obs-tree-trunk-${Math.round(this.x)}-${Math.round(this.y)}`;
    const { originX: tOX, originY: tOY } = bakeTreeTrunkTexture(
      this.scene, trunkKey, { tr, tTop, tH }, tc, this._h.bind(this));
    this._trackTex(trunkKey);

    // Bake canopy (dome gradient shading, 3 deciduous styles)
    const canopyKey = `obs-tree-canopy-${Math.round(this.x)}-${Math.round(this.y)}`;
    bakeTreeCanopyTexture(
      this.scene, canopyKey, { cr2, cOffX, cOffY }, tc, this._h.bind(this));
    this._trackTex(canopyKey);

    // ── Trunk container (Y-depth = this.y) ──
    const trunk = this.scene.add.container(this.x, this.y);
    trunk.setDepth(this.y);
    trunk.angle = lean;
    trunk.add(this.scene.add.image(0, 0, trunkKey).setOrigin(tOX, tOY));
    this.trunkContainer = trunk;

    // ── Canopy container (depth = this.y + 140, always above entities) ──
    const canopy = this.scene.add.container(this.x, this.y - tr * 3.2 * tHMult);
    canopy.setDepth(this.y + 140);
    canopy.add(this.scene.add.image(0, 0, canopyKey).setOrigin(0.5));
    this.canopyContainer = canopy;

    // Gentle sway — unique pace and amplitude per tree
    this.scene.tweens.add({
      targets: canopy,
      x: this.x + 3 + this._h(90) * 3,
      duration: swayMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.container = trunk;
  }

  // ── Spire (theme-specific vertical prop) ──────────────────────────────────
  // Uses the same trunk + canopy two-container pattern as trees so occlusion-fade
  // (via checkOcclusion + this.tall=true) just works. Both visuals are canvas-baked.
  _buildSpire() {
    const r = this.baseRadius;
    const trunkKey  = `obs-spire-trunk-${Math.round(this.x)}-${Math.round(this.y)}`;
    const canopyKey = `obs-spire-canopy-${Math.round(this.x)}-${Math.round(this.y)}`;

    const { originX: tOX, originY: tOY } = bakeSpireTrunkTexture(
      this.scene, trunkKey, this.themeIdx, r, this._h.bind(this));
    this._trackTex(trunkKey);
    this._trackTex(canopyKey);

    const trunk = this.scene.add.container(this.x, this.y);
    trunk.setDepth(this.y);
    trunk.add(this.scene.add.image(0, 0, trunkKey).setOrigin(tOX, tOY));

    const canopyY = this.y - r * 2.6;
    const canopy  = this.scene.add.container(this.x, canopyY);
    canopy.setDepth(this.y + 140);

    const { originX: cOX, originY: cOY } = bakeSpireCanopyTexture(
      this.scene, canopyKey, this.themeIdx, r, this._h.bind(this));
    const canopyImg = this.scene.add.image(0, 0, canopyKey).setOrigin(cOX, cOY);
    canopy.add(canopyImg);

    // Theme 4 — Chaos: rotate the baked image (perf win vs rotating live Graphics)
    if (this.themeIdx === 4) {
      this.scene.tweens.add({ targets: canopyImg, angle: 360, duration: 12000, repeat: -1 });
    }

    this.trunkContainer = trunk;
    this.canopyContainer = canopy;
    this.container = trunk;
    this.tall = false; // spires don't use occlusion fade
  }

  // ── Pillar / ruins ────────────────────────────────────────────────────────

  _buildPillar() {
    const r  = this.baseRadius;
    const tc = this._getObstacleTheme();

    // Hash-driven dimensions and variant (unchanged)
    const phVariant = this._h(0);
    const pw = r * (1.4 + this._h(1) * 0.4);   // width: 1.4–1.8× radius
    const ph = phVariant < 0.33 ? r * 3.4      // full / half-broken / stub
             : phVariant < 0.66 ? r * 2.1
             :                    r * 1.3;

    const key = `obs-pillar-${Math.round(this.x)}-${Math.round(this.y)}`;
    const { originX, originY } = bakePillarTexture(
      this.scene, key, { r, pw, ph, phVariant }, tc, this._h.bind(this));
    this._trackTex(key);

    const img = this.scene.add.image(this.x, this.y, key)
      .setOrigin(originX, originY).setDepth(this.y);
    this.container = img;

    // Ground shadow, centered under the base. Layered ellipses (wide+faint → narrow+dark)
    // fake a soft fade; the widest layer spans the full pillar width.
    const sg = this.scene.add.graphics();
    sg.fillStyle(0x000000, 0.10); sg.fillEllipse(this.x, this.y + 2, pw * 1.18, pw * 0.36);
    sg.fillStyle(0x000000, 0.14); sg.fillEllipse(this.x, this.y + 2, pw * 1.00, pw * 0.30);
    sg.fillStyle(0x000000, 0.18); sg.fillEllipse(this.x, this.y + 2, pw * 0.78, pw * 0.23);
    sg.setDepth(this.y - 1);
    this.shadowG = sg;
  }

  // ── Baked texture tracking ────────────────────────────────────────────────

  _trackTex(key) { this._texKeys.push(key); }

  _removeTextures() {
    if (!this._texKeys || !this._texKeys.length) return;
    for (const k of this._texKeys) {
      if (this.scene.textures.exists(k)) this.scene.textures.remove(k);
    }
    this._texKeys = [];
  }

  // ── Shadow ellipse on ground ──────────────────────────────────────────────

  _addShadow(radius) {
    const sg = this.scene.add.graphics();
    sg.fillStyle(0x000000, 0.28);
    sg.fillEllipse(this.x + 4, this.y + radius * 0.45, radius * 2.0, radius * 0.55);
    sg.setDepth(this.y - 1);
    this.shadowG = sg;
  }

  // ── Breaking ──────────────────────────────────────────────────────────────

  break() {
    if (this.broken) return;
    this.broken      = true;
    this.baseRadius  = 0;                              // disable all collision
    this.rubbleActive = true;
    this.rubbleRadius = this._origBaseRadius * 1.2;

    // Destroy main visuals immediately
    [this.container, this.trunkContainer, this.canopyContainer]
      .filter(Boolean)
      .forEach(c => { if (c.active) c.destroy(); });
    this.container = this.trunkContainer = this.canopyContainer = null;
    if (this.shadowG && this.shadowG.active) { this.shadowG.destroy(); this.shadowG = null; }

    this._spawnShatterParticles();
    this._removeTextures(); // main visuals gone; shatter fragments are live Graphics

    // Deactivate slow zone + fade debris after 15 s
    this.scene.time.delayedCall(15000, () => {
      this.rubbleActive = false;
      this._rubbleGraphics.forEach(g => {
        if (g.active) this.scene.tweens.add({
          targets: g, alpha: 0, duration: 1000,
          onComplete: () => { if (g.active) g.destroy(); }
        });
      });
    });
  }

  // ── Shatter particle burst ────────────────────────────────────────────────

  _spawnShatterParticles() {
    const count   = Phaser.Math.Between(7, 11);
    const scatter = this._origBaseRadius * 1.5;

    for (let i = 0; i < count; i++) {
      const g = this.scene.add.graphics();
      this._drawShatterFragment(g, i);
      g.x     = this.x;
      g.y     = this.y;
      g.angle = Phaser.Math.Between(0, 360);
      g.setDepth(12); // burst above entities so it reads clearly at the moment of impact

      // Scatter outward, spreading evenly with slight random offset
      const a     = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.4, 0.4);
      const dist  = Phaser.Math.FloatBetween(scatter * 0.35, scatter);
      const destX = this.x + Math.cos(a) * dist;
      const destY = this.y + Math.sin(a) * dist;

      this.scene.tweens.add({
        targets: g,
        x: destX,
        y: destY,
        angle:  g.angle + Phaser.Math.Between(-220, 220),
        scaleY: 0.32,   // flatten as if lying on the floor
        duration: Phaser.Math.Between(180, 320),
        ease: 'Cubic.easeOut',
        onComplete: () => {
          g.setDepth(2); // settled — below entities, above floor
        },
      });

      this._rubbleGraphics.push(g);
      this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    }
  }

  // Draw one shatter fragment, styled to match the obstacle type.
  _drawShatterFragment(g, index) {
    switch (this.type) {

      case 'rock': {
        // Jagged irregular stone chunk — 5-point polygon with slight random radii
        const sz = Phaser.Math.Between(7, 15);
        g.fillStyle(index % 2 === 0 ? 0x4a4a55 : 0x6b6b7a, 1);
        const pts = [];
        for (let j = 0; j < 5; j++) {
          const a = (j / 5) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
          const r = sz * Phaser.Math.FloatBetween(0.55, 1.0);
          pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
        }
        g.fillPoints(pts, true);
        // Highlight edge on lighter pieces
        if (index % 2 === 0) {
          g.lineStyle(1, 0x8888aa, 0.55);
          g.strokePoints(pts, true);
        }
        break;
      }

      case 'stump': {
        // Short wood plank with grain lines
        const w = Phaser.Math.Between(9, 18);
        const h = Phaser.Math.Between(4, 9);
        g.fillStyle(index % 2 === 0 ? 0x6a3e18 : 0x8B5e28, 1);
        g.fillRect(-w / 2, -h / 2, w, h);
        g.lineStyle(1, 0x4a2e10, 0.5);
        g.lineBetween(-w * 0.25, -h * 0.1, w * 0.25, h * 0.1);
        g.lineBetween(-w * 0.1,  -h * 0.35, w * 0.15, h * 0.3);
        break;
      }

      case 'tree': {
        if (index % 3 === 0) {
          // Leaf cluster — small layered circles
          const r = Phaser.Math.Between(5, 10);
          g.fillStyle(0x1a4010, 1);
          g.fillCircle(0, 0, r);
          g.fillStyle(0x38882a, 1);
          g.fillCircle(-r * 0.2, -r * 0.25, r * 0.6);
          g.fillStyle(0x52aa3e, 0.7);
          g.fillCircle(r * 0.1, -r * 0.4, r * 0.35);
        } else {
          // Wood chip — bark-coloured plank
          const w = Phaser.Math.Between(6, 15);
          const h = Phaser.Math.Between(3, 7);
          g.fillStyle(index % 2 === 0 ? 0x3e200a : 0x5a3012, 1);
          g.fillRect(-w / 2, -h / 2, w, h);
          g.lineStyle(1, 0x6a4018, 0.4);
          g.lineBetween(-w * 0.3, 0, w * 0.3, 0);
        }
        break;
      }

      case 'pillar': {
        // Rectangular stone block with side shading and a crack
        const w = Phaser.Math.Between(9, 20);
        const h = Phaser.Math.Between(7, 14);
        g.fillStyle(index % 2 === 0 ? 0x808080 : 0x9E9E9E, 1);
        g.fillRoundedRect(-w / 2, -h / 2, w, h, 2);
        // Dark side shading
        g.fillStyle(0x555555, 0.45);
        g.fillRect(w * 0.15, -h / 2, w * 0.3, h);
        // Crack
        g.lineStyle(1, 0x404040, 0.7);
        g.lineBetween(-w * 0.1, -h * 0.35, w * 0.2, h * 0.3);
        break;
      }

      default: {
        g.fillStyle(0x888888, 1);
        g.fillRect(-5, -5, 10, 10);
      }
    }
  }

  // ── Occlusion (called per frame from ArenaScene.update) ───────────────────

  // entities: [{x, y, alive}] — canopy fades if the player OR boss is behind this tree
  checkOcclusion(entities) {
    if (this.broken) return;
    if (!this.tall || !this.canopyContainer) return;
    const behind = entities.some(e =>
      e?.alive && e.y < this.y - 10 && Math.abs(e.x - this.x) < this.canopyRadius * 0.8
    );
    const target = behind ? 0.22 : 1;

    if (!this._canopyAlphaTweening &&
        Math.abs(this.canopyContainer.alpha - target) > 0.08) {
      this._canopyAlphaTweening = true;
      this.scene.tweens.add({
        targets: this.canopyContainer,
        alpha: target,
        duration: 200,
        onComplete: () => { this._canopyAlphaTweening = false; },
      });
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy() {
    if (this.broken) return; // already cleaned up by break()
    const fade = (obj) => {
      if (!obj || !obj.active) return;
      this.scene.tweens.add({
        targets: obj, alpha: 0, duration: 300,
        onComplete: () => obj.destroy(),
      });
    };
    fade(this.trunkContainer);
    fade(this.canopyContainer);
    if (this.container && this.container !== this.trunkContainer) fade(this.container);
    if (this.shadowG) fade(this.shadowG);
    // Free baked textures after the fade (shutdown listener covers the scene-stop case).
    this.scene.time.delayedCall(350, () => this._removeTextures());
  }
}
