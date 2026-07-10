import Phaser from 'phaser';
import { OBSTACLES } from '../config/gameConfig.js';
import { bakeRockTexture, bakePillarTexture, bakeStumpTexture, bakeTreeTrunkTexture, bakeTreeCanopyTexture, bakeSpireTrunkTexture, bakeSpireCanopyTexture, bakeEmberParticleTexture, bakeSpireVolTeethTexture, bakeCelestialOrbiterTexture, bakeChaosFragmentTexture, bakeChaosDebrisShardTexture } from './obstacleArt.js';

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

    // Live per-frame-animated sprites that trace an elliptical orbit (celestial stars,
    // chaos fragments/debris — see the "2.5D perspective" rule in this project's CLAUDE.md
    // for why these use real position math instead of image-angle rotation). Tracked here
    // for explicit update-listener + image cleanup in break()/destroy().
    this._liveOrbiters = [];

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
      { // 2 — Volcanic Depths (rock body shifted from brown toward deep maroon/purple-black
        // for stronger contrast against the hot yellow-orange crack glow, per reference art)
        rockBody: 0x220916, rockShade: 0x12060e, rockHL: 0x4a1830, rockCrack: 0xff5500,
        trunkBody: 0x160a02, trunkDark: 0x0a0400, roots: 0x1a0900,
        canopyA: 0x1a0800, canopyB: 0x280e04, canopyC: 0x200a02, canopyD: 0x301208,
        canopyHL: 0xff6600, canopyRim: 0x0a0300, canopyHLAlpha: 0.40,
        stumpBark: 0x1a0a04, stumpWood: 0x100602, stumpRing: 0x3c1a08,
        pillarBody: 0x1e1008, pillarDark: 0x0c0604, pillarCap: 0x2a1a0c,
        pillarCrack: 0xff4400, pillarChip: 0x241208,
        lavaGlow: true,
      },
      { // 3 — Celestial Void (cool blue-grey "moonstone" stone bodies + gold accent trim —
        // mirrors the spire's own indigo-shaft (0x1c1c3a) + gold-inlay formula, so obstacles
        // carry warm/cool contrast instead of the uniform gold wash from the first pass;
        // canopy stays warm gold/amber — a blue trunk holding up a golden canopy, echoing
        // the spire's blue-shaft-with-gold-star-topper structure)
        rockBody: 0x1e1c38, rockShade: 0x0e0c1e, rockHL: 0x6a6ea0, rockCrack: 0xffcc44,
        trunkBody: 0x1c1a34, trunkDark: 0x0e0c1c, roots: 0x201c38,
        // The vertical tone ramp (canopyC top -> canopyB mid -> canopyA bottom) fills MOST
        // of the canopy and stays vibrant gold (canopyB/C bumped a tier, matching the
        // stump's popping stumpWood tone). canopyD is used TWICE in bakeTreeCanopyTexture:
        // (1) per-clump topCol = lerp(tone, canopyD, 0.26) — needs canopyD clearly brighter
        // than canopyC or the clump highlight is imperceptible and the dome texture melts
        // flat; (2) a broad low-alpha (0.16) "light bloom" radial covering most of the
        // canopy width — since the base tone is already bright gold, a canopyD pushed too
        // far toward white made that broad wash read as a washed-out patch rather than a
        // highlight. 0xf8cc60 is the middle ground: still a clear step up from canopyC for
        // per-clump pop, without being so pale it blows out the broad bloom.
        // canopyA stays dark for a grounded shadow rim (same "bright body, dark rim" shape
        // that already works on the stump's cylinder).
        // (canopyHL/canopyHLAlpha are dead fields — unused by bakeTreeCanopyTexture — left as-is.)
        canopyA: 0x201404, canopyB: 0x8a6420, canopyC: 0xd4a030, canopyD: 0xf8cc60,
        canopyHL: 0xffe9b3, canopyRim: 0x140c02, canopyHLAlpha: 0.50,
        // stump reverted to warm gilded-wood tones (was cool blue-grey like the rock/pillar
        // stone) — a cut tree stump reads as wood, not mineral, and in blue it looked like a
        // barrel rather than a stump; gold stumpRing accents now pop against a warm base too.
        stumpBark: 0x5a3c10, stumpWood: 0x8a6820, stumpRing: 0xffcc44,
        pillarBody: 0x201c3a, pillarDark: 0x100c20, pillarCap: 0x342e58,
        pillarCrack: 0xffcc44, pillarChip: 0xd4b870,
        lavaGlow: false,
      },
      { // 4 — Chaos Realm — cyan/blue-teal obstacle bodies, violet/magenta crack accents
        // (rockCrack/pillarCrack/stumpRing). Seventh pass: the previous brightening
        // (roughly doubled) overshot — split the difference between that and the pass
        // before it, so bodies sit meaningfully lighter than the floor without reading as
        // cartoonishly bright.
        crackGlow: true,
        rockBody: 0x1e3843, rockShade: 0x0f2028, rockHL: 0x4a829c, rockCrack: 0xcc44ff,
        trunkBody: 0x182a34, trunkDark: 0x0d1c22, roots: 0x1e3843,
        canopyA: 0x152a35, canopyB: 0x2d5466, canopyC: 0x448098, canopyD: 0x78e4f7,
        canopyHL: 0x44eeff, canopyRim: 0x0f212c, canopyHLAlpha: 0.42,
        stumpBark: 0x1e3843, stumpWood: 0x2d5466, stumpRing: 0xaa66e0,
        pillarBody: 0x1e3843, pillarDark: 0x0f212c, pillarCap: 0x4a829c,
        pillarCrack: 0xbb44ff, pillarChip: 0x8ad8e8,
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

    // CC's stalagmite and the volcanic monolith are anchored at their base but their visible
    // mass rises almost entirely upward — a collision circle centered at the base (like round
    // obstacles, which have visible body on every side of their anchor) leaves a large "phantom
    // wall" south of the spire (collision reaches r+5px down, but the shadow only reaches ~0.3r)
    // while barely reaching into the tall visible trunk to the north. Shift the collision
    // anchor up into the trunk's wider lower section so it actually matches the silhouette.
    // The celestial obelisk (H=2.8r) keeps real body across most of its height (tapered,
    // not stalagmite-thin), so it only needs a modest upward nudge, not CC/Volcanic's
    // larger offsets. The chaos monolith's mass is entirely airborne (hovers from -0.55r
    // to -3.2r), so its anchor shifts well up into the wide lower-middle of the body.
    const COL_OFFSETS = [0, -r * 1.1, -r * 1.5, -r * 0.4, -r * 1.4]; // GF, CC, Vol, Cel, Chaos
    this.colOffsetY = COL_OFFSETS[this.themeIdx];

    // Canopy anchor offset (r multiples above base). CC's crystals cluster low at the base;
    // the volcanic crater notch sits near the top of the tall monolith (H=4.0r, notch at
    // ~0.75H); the celestial dome seats on the obelisk's flat top (H=2.8r); chaos's fragment
    // ring centers on the floating monolith's upper body so it orbits AROUND it.
    const CANOPY_OFFSETS = [2.6, 0.0, 3.0, 2.8, 2.1]; // GF, CC, Vol, Cel, Chaos
    const canopyY = this.y - r * CANOPY_OFFSETS[this.themeIdx];
    const canopy  = this.scene.add.container(this.x, canopyY);
    // CC's crystals and the volcanic magma pool are integrated into the trunk's own
    // silhouette, so they sort with the trunk rather than the +140 overhead-canopy boost
    // the other themes use for their separate, higher-floating canopies.
    const lowCanopy = this.themeIdx === 1 || this.themeIdx === 2;
    canopy.setDepth(lowCanopy ? this.y + 1 : this.y + 140);

    const { originX: cOX, originY: cOY } = bakeSpireCanopyTexture(
      this.scene, canopyKey, this.themeIdx, r, this._h.bind(this));
    const canopyImg = this.scene.add.image(0, 0, canopyKey).setOrigin(cOX, cOY);
    canopy.add(canopyImg);

    // Theme 4 — Chaos: fragments + debris both use REAL elliptical position math, never
    // image-angle rotation (see the "2.5D perspective governs every orbit/rotation" rule in
    // this project's CLAUDE.md) — `angle: 360` on a baked image traces a true circle for any
    // off-center point, which breaks the flattened 2.5D look these were built for.
    if (this.themeIdx === 4) {
      // 3 fragments — each its own small shared texture (bake-once). Scene-level images
      // (NOT canopy children this time — a container's children can't get independent
      // depth) so each can genuinely toggle in front of / behind the trunk as it orbits:
      // sin(angle) > 0 puts it on the "near" (lower, squashed-forward) part of the ellipse,
      // which should render in front; < 0 puts it on the "far" side, behind. Depth is only
      // touched on the (rare) frames where that flips, to avoid forcing a full scene resort
      // every frame. Sped up substantially from the original ~9-15s/lap — at that radius,
      // the old speed worked out to well under 1px of movement per frame (see the "slow
      // small orbits get pixel-quantized" rule in CLAUDE.md), which read as stutter.
      const canopyWorldY = this.y - r * 2.1;
      const fragments = [
        { a: 0.2, size: 7, c: 0xff44ff, ring: 0.95, vOff: -0.15, speed: 1.0 },
        { a: 2.3, size: 5, c: 0xff00ff, ring: 0.95, vOff:  0.20, speed: 1.3 }, // smallest triangle → fastest/tightest orbit
        { a: 4.4, size: 9, c: 0xee88ff, ring: 1.15, vOff:  0.05, speed: 0.8 }, // largest triangle → widest/slowest orbit
      ];
      fragments.forEach(({ a, size, c, ring, vOff, speed }) => {
        const fragKey = bakeChaosFragmentTexture(this.scene, size, c);
        const frag = this.scene.add.image(this.x, canopyWorldY, fragKey);
        const angularSpeed = (Math.PI * 2 * speed) / 1800; // rad/ms — ~1.4-2.25s/lap
        let elapsed = a / angularSpeed; // phase offset so `a` still spreads them around the ring
        let wasInFront = null;
        const updateHandler = (time, delta) => {
          if (!frag.active) { this.scene.events.off('update', updateHandler); return; }
          elapsed += delta;
          const angle = elapsed * angularSpeed;
          frag.x = this.x + Math.cos(angle) * r * ring;
          frag.y = canopyWorldY + Math.sin(angle) * r * ring * 0.45 + r * vOff; // squashed
          const inFront = Math.sin(angle) > 0;
          if (inFront !== wasInFront) {
            frag.setDepth(this.y + (inFront ? 2 : -2));
            wasInFront = inFront;
          }
        };
        this.scene.events.on('update', updateHandler);
        this._liveOrbiters.push({ image: frag, updateHandler });
      });

      // Floating debris — 3 individual chunks tracing the SAME small squashed-ellipse orbit
      // in the hover gap, each at a different phase, so they follow one another around the
      // loop instead of moving as one rigid group in lockstep.
      const debrisRestY = -r * 0.15; // nudged down a couple px so it clears the spire body
      // Confirmed by testing: at the original small/slow values, per-frame movement was
      // under ~0.2px — below the render pipeline's pixel-rounding threshold, so the sprite
      // literally didn't move for several frames, then snapped a whole pixel (the "moves,
      // pauses, jumps" stutter). Sized/timed here to keep per-frame movement close to the
      // ~1px/frame smoothness threshold (see CLAUDE.md) despite the further size reduction.
      const debrisRX = r * 0.65, debrisRY = r * 0.29;
      const debrisSpeed = (Math.PI * 2) / 1260; // rad/ms
      const debrisSizes = [r * 0.20, r * 0.24, r * 0.17];
      debrisSizes.forEach((size, i) => {
        const shardKey = bakeChaosDebrisShardTexture(this.scene, Math.round(size));
        const shard = this.scene.add.image(0, debrisRestY, shardKey);
        trunk.add(shard);
        const phase = (i / debrisSizes.length) * Math.PI * 2;
        let elapsed = 0;
        const updateHandler = (time, delta) => {
          if (!shard.active) { this.scene.events.off('update', updateHandler); return; }
          elapsed += delta;
          const angle = elapsed * debrisSpeed + phase;
          shard.x = Math.cos(angle) * debrisRX;
          shard.y = debrisRestY + Math.sin(angle) * debrisRY;
        };
        this.scene.events.on('update', updateHandler);
        this._liveOrbiters.push({ image: shard, updateHandler });
      });
    }

    // Theme 2 — Volcanic: live rising embers. The magma pool/halo/smoke are static (baked
    // above), but embers need real upward motion + fade-out, which a static texture can't
    // give them — so these are a handful of tweened sprites, parented under the canopy
    // container (destroyed/cleaned up the same way the chaos rotation tween's image is).
    if (this.themeIdx === 2) {
      const emberKey = bakeEmberParticleTexture(this.scene);
      const emberCount = 5;
      for (let i = 0; i < emberCount; i++) {
        const startX   = (this._h(800 + i) - 0.5) * r * 0.9;
        const startY   = -r * 0.05;
        const riseDist = r * (1.6 + this._h(810 + i) * 1.2);
        const riseDur  = 1800 + this._h(820 + i) * 1400;
        const growDur  = 220 + this._h(825 + i) * 160;
        const scale    = 0.22 + this._h(830 + i) * 0.18;
        const driftX   = (this._h(840 + i) - 0.5) * r * 0.6;
        const pauseMs  = 300 + this._h(860 + i) * 900;

        const ember = this.scene.add.image(startX, startY, emberKey)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setScale(0).setAlpha(0);
        canopy.add(ember);

        // Each cycle: coalesce from a dot (grow + fade in), then rise and fade out, then
        // pause and repeat. Chained via onComplete (rather than tween repeat) so the grow
        // and rise phases can have distinct durations/eases; guarded by ember.active so the
        // chain self-terminates once break()/destroy() removes the canopy container.
        const riseAndFade = () => {
          if (!ember.active) return;
          this.scene.tweens.add({
            targets: ember,
            x: startX + driftX, y: startY - riseDist,
            alpha: 0, scale: scale * 0.4,
            duration: riseDur,
            ease: 'Sine.easeOut',
            onComplete: () => { if (ember.active) this.scene.time.delayedCall(pauseMs, growIn); },
          });
        };
        const growIn = () => {
          if (!ember.active) return;
          ember.setPosition(startX, startY).setScale(0).setAlpha(0);
          this.scene.tweens.add({
            targets: ember,
            scale, alpha: 1,
            duration: growDur,
            ease: 'Quad.easeOut',
            onComplete: riseAndFade,
          });
        };
        this.scene.time.delayedCall(this._h(850 + i) * 1500, growIn);
      }

      // Front crater teeth — added to the canopy container AFTER the embers, so they render
      // in front of the rising embers. The embers then read as spawning down inside the
      // crater (behind this rim) rather than popping out on top of the front teeth.
      const teethKey = `obs-spire-volteeth-${Math.round(this.x)}-${Math.round(this.y)}`;
      const { originX: thOX, originY: thOY } = bakeSpireVolTeethTexture(
        this.scene, teethKey, r, this._h.bind(this));
      this._trackTex(teethKey);
      canopy.add(this.scene.add.image(0, 0, teethKey).setOrigin(thOX, thOY));
    }

    // Theme 3 — Celestial: 3 stars spiralling around the obelisk. No real depth-sorting —
    // the orbiter is ALWAYS rendered in front of the trunk (depth set once, never touched
    // again), and "going behind the pillar" is a pure illusion: it arcs away from the shaft,
    // sweeps across in front of it, arcs back in on the other side, then briefly shrinks and
    // fades to nothing right as it would pass behind — then fades back in arcing away again.
    // Simpler and more robust than trying to occlude against the actual trunk silhouette,
    // and removes any possibility that depth changes were behind the earlier stutter.
    if (this.themeIdx === 3) {
      const starKey = bakeCelestialOrbiterTexture(this.scene);
      const orbitCount = 4;
      const orbitDirections = [1, -1, 1, -1]; // 2 one way, 2 the other
      // Reverted to the original small radius per explicit request, despite this being the
      // exact direction (small + slow) that causes the sub-pixel pixel-quantization
      // stutter (see CLAUDE.md) — if it stutters again, size is the fix, not more tuning.
      const vCenter = r * 1.54, vRange = r * 0.84, orbitRX = r * 0.60;
      for (let i = 0; i < orbitCount; i++) {
        // Normal blend (not ADD) — additive blending makes brightness swing wildly depending
        // on what's directly behind the orb (dark navy body vs. the bright gold inlay line
        // it crosses), which was likely contributing to the "jittery" look; normal alpha
        // blending renders a stable, consistent orb regardless of the background underneath.
        const orbiter = this.scene.add.image(this.x, this.y - vCenter, starKey)
          .setScale(0.28)
          .setDepth(this.y + 2); // set once — always in front, never toggled again

        const revolutions   = 1.8 + this._h(870 + i) * 1.2;
        // Slightly faster than the original 10-14s, per explicit request — still well below
        // the ~1.6s smoothness floor at this radius (see CLAUDE.md), so some residual
        // stutter is expected, just less severe than at 22-30s.
        const cycleDuration = 6500 + this._h(890 + i) * 2000; // ms for one full vertical rise/fall
        const direction     = orbitDirections[i];
        const angularSpeed  = (Math.PI * 2 * revolutions) / cycleDuration * direction;
        const verticalSpeed = (Math.PI * 2) / cycleDuration;
        const phase = this._h(880 + i) * Math.PI * 2;
        let elapsed = this._h(895 + i) * cycleDuration; // random start offset so orbiters desync

        const updateHandler = (time, delta) => {
          if (!orbiter.active) { this.scene.events.off('update', updateHandler); return; }
          elapsed += delta;
          const angle = elapsed * angularSpeed + phase;
          orbiter.x = this.x + Math.cos(angle) * orbitRX;
          // One slow rise-then-fall per full cycle (not per revolution) — the actual spiral
          // climb/descent along the shaft, decoupled from the fast spin.
          orbiter.y = this.y - vCenter + Math.sin(elapsed * verticalSpeed + phase) * vRange;
          // Visible ("in front") for most of the loop — arcing away, crossing, arcing back —
          // with only a brief dip to invisible right at the "behind" point, instead of a
          // smooth 50/50 fade. sin(angle) still marks that point (same phase as before), but
          // the steep multiplier here compresses the fade into a short window around it.
          // Alpha alone drives the fade — scale is fixed. At this sprite's tiny final size
          // (a few px), continuously rescaling it every frame can only land on a handful of
          // distinct pixel footprints, so it visibly "steps" between sizes even though the
          // underlying number changes smoothly; alpha blending doesn't have that problem.
          const vis = Phaser.Math.Clamp(Math.sin(angle) * 2.2 + 0.75, 0, 1);
          orbiter.setAlpha(vis);
        };
        this.scene.events.on('update', updateHandler);
        this._liveOrbiters.push({ image: orbiter, updateHandler });
      }
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
    this._removeCelestialOrbiters();

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
    this._removeCelestialOrbiters();
    // Free baked textures after the fade (shutdown listener covers the scene-stop case).
    this.scene.time.delayedCall(350, () => this._removeTextures());
  }

  // ── Celestial orbiting stars ──────────────────────────────────────────────
  // Scene-level images (not container children — see _buildSpire), so they need explicit
  // update-listener + image cleanup rather than relying on a container's destroy() to cascade.
  _removeCelestialOrbiters() {
    if (!this._liveOrbiters.length) return;
    this._liveOrbiters.forEach(({ image, updateHandler }) => {
      this.scene.events.off('update', updateHandler);
      if (image.active) image.destroy();
    });
    this._liveOrbiters = [];
  }
}
