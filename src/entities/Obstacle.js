import Phaser from 'phaser';
import { OBSTACLES } from '../config/gameConfig.js';

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

    this._build();
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

  _buildRock() {
    const g = this.scene.add.graphics();
    g.x = this.x;
    g.y = this.y;
    const tc = this._getObstacleTheme();

    const r = this.baseRadius;
    const numRocks = 2 + Math.floor(Math.random() * 2); // 2 or 3 rocks in cluster
    const offsets = [
      { dx: 0, dy: 0, s: 1.0 },
      { dx: r * 0.65, dy: r * 0.3, s: 0.72 },
      { dx: -r * 0.55, dy: r * 0.25, s: 0.65 },
    ].slice(0, numRocks);

    offsets.forEach(({ dx, dy, s }) => {
      const rr = r * s;
      // Shadow
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(dx + 3, dy + rr * 0.55, rr * 1.7, rr * 0.55);
      // Body
      g.fillStyle(tc.rockBody, 1);
      g.fillCircle(dx, dy, rr);
      // Side shading
      g.fillStyle(tc.rockShade, 1);
      g.fillCircle(dx + rr * 0.18, dy + rr * 0.18, rr * 0.72);
      // Top highlight
      g.fillStyle(tc.rockHL, 0.65);
      g.fillEllipse(dx - rr * 0.3, dy - rr * 0.35, rr * 0.8, rr * 0.5);
      // Crack detail
      g.lineStyle(1, tc.rockCrack, tc.lavaGlow ? 0.85 : 0.7);
      g.lineBetween(dx - rr * 0.1, dy - rr * 0.3, dx + rr * 0.3, dy + rr * 0.1);
      // Volcanic extra: glowing lava seep in the crack
      if (tc.lavaGlow) {
        g.lineStyle(0.8, 0xff8800, 0.4);
        g.lineBetween(dx - rr * 0.1, dy - rr * 0.3, dx + rr * 0.3, dy + rr * 0.1);
        g.fillStyle(0xff6600, 0.22);
        g.fillCircle(dx + rr * 0.1, dy, rr * 0.25);
      }
    });

    g.setDepth(this.y);
    this.container = g;
    this._addShadow(this.baseRadius);
  }

  // ── Tree stump ────────────────────────────────────────────────────────────

  _buildStump() {
    const g = this.scene.add.graphics();
    g.x = this.x;
    g.y = this.y;
    const r = this.baseRadius;
    const tc = this._getObstacleTheme();

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(3, r * 0.5, r * 1.9, r * 0.6);

    // Outer stump ring (bark / crust)
    g.fillStyle(tc.stumpBark, 1);
    g.fillCircle(0, 0, r);
    // Inner wood / crystal / obsidian face
    g.fillStyle(tc.stumpWood, 1);
    g.fillCircle(0, 0, r * 0.75);
    // Growth / fracture rings
    g.lineStyle(1.5, tc.stumpRing, tc.lavaGlow ? 0.75 : 0.5);
    g.strokeCircle(0, 0, r * 0.55);
    g.lineStyle(1, tc.stumpRing, tc.lavaGlow ? 0.55 : 0.35);
    g.strokeCircle(0, 0, r * 0.35);
    // Center
    g.fillStyle(tc.lavaGlow ? 0xff4400 : tc.stumpBark, tc.lavaGlow ? 0.6 : 0.8);
    g.fillCircle(0, 0, r * 0.12);
    // Radial grain / crack lines
    const lineColor = tc.lavaGlow ? 0xff5500 : tc.stumpRing;
    const lineAlpha = tc.lavaGlow ? 0.45 : 0.5;
    g.lineStyle(1, lineColor, lineAlpha);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      g.lineBetween(0, 0, Math.cos(angle) * r * 0.65, Math.sin(angle) * r * 0.65);
    }
    // Outer edge highlight
    g.lineStyle(1.5, tc.stumpRing, 0.6);
    g.strokeCircle(0, 0, r);
    // Volcanic: lava glow pool in center
    if (tc.lavaGlow) {
      g.fillStyle(0xff6600, 0.18);
      g.fillCircle(0, 0, r * 0.65);
      g.fillStyle(0xff8800, 0.28);
      g.fillCircle(0, 0, r * 0.30);
    }

    g.setDepth(this.y);
    this.container = g;
    this._addShadow(r);
  }

  // ── Tall tree ─────────────────────────────────────────────────────────────

  _buildTree() {
    const tr = this.baseRadius;  // trunk radius
    const cr = this.canopyRadius; // canopy radius

    // ── Trunk container (Y-depth = this.y) ──
    const trunk = this.scene.add.container(this.x, this.y);
    trunk.setDepth(this.y);

    const tc = this._getObstacleTheme();
    const tg = this.scene.add.graphics();
    // Shadow on ground — boosted for stronger sense of mass
    tg.fillStyle(0x000000, 0.5);
    tg.fillEllipse(5, tr * 0.5, tr * 2.4, tr * 0.7);
    // Roots (small arcs)
    tg.lineStyle(tr * 0.4, tc.roots, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.15;
      const ex = Math.cos(a) * tr * 1.35, ey = Math.sin(a) * tr * 0.6;
      tg.lineBetween(0, 0, ex, ey);
    }
    // Trunk cylinder body
    tg.fillStyle(tc.trunkBody, 1);
    tg.fillRoundedRect(-tr, -tr * 3.5, tr * 2, tr * 4, tr * 0.5);
    // Darker right-side band for cylindrical depth (light from upper-left)
    tg.fillStyle(tc.trunkDark, 0.5);
    tg.fillRoundedRect(tr * 0.2, -tr * 3.5, tr * 0.8, tr * 4, { tl: 0, tr: tr * 0.5, bl: 0, br: tr * 0.5 });
    // Outline
    tg.lineStyle(1.5, tc.trunkDark, 0.85);
    tg.strokeRoundedRect(-tr, -tr * 3.5, tr * 2, tr * 4, tr * 0.5);
    // Bark / surface highlights
    tg.lineStyle(1, tc.trunkBody, 0.4);
    tg.lineBetween(-tr * 0.3, -tr * 3, -tr * 0.3, tr * 0.3);
    tg.lineBetween(tr * 0.2, -tr * 3, tr * 0.2, tr * 0.3);
    // Volcanic: ember cinders on trunk
    if (tc.lavaGlow) {
      for (let i = 0; i < 4; i++) {
        const ex = -tr * 0.5 + Math.random() * tr, ey = -tr * 3 + Math.random() * tr * 3;
        tg.fillStyle(0xff6600, 0.55);
        tg.fillCircle(ex, ey, 1.2 + Math.random() * 1.2);
      }
    }

    trunk.add(tg);
    this.trunkContainer = trunk;

    // ── Canopy container (depth = this.y + 140, always above entities) ──
    const canopy = this.scene.add.container(this.x, this.y - tr * 3.2);
    canopy.setDepth(this.y + 140);

    const cg = this.scene.add.graphics();
    // Four layered canopy circles — colours from theme palette
    const layers = [
      { r: cr,         color: tc.canopyA, alpha: 1,    ox: 0,          oy: 0          },
      { r: cr * 0.82,  color: tc.canopyB, alpha: 1,    ox: -cr * 0.05, oy:  cr * 0.05 },
      { r: cr * 0.62,  color: tc.canopyC, alpha: 1,    ox:  cr * 0.08, oy: -cr * 0.08 },
      { r: cr * 0.35,  color: tc.canopyD, alpha: 0.85, ox: -cr * 0.04, oy: -cr * 0.12 },
    ];
    layers.forEach(({ r, color, alpha, ox, oy }) => {
      cg.fillStyle(color, alpha);
      cg.fillCircle(ox, oy, r);
    });
    // Rim shadow
    cg.lineStyle(3, tc.canopyRim, 0.55);
    cg.strokeCircle(0, 0, cr);
    // Top-left highlight crescent
    cg.fillStyle(tc.canopyHL, tc.canopyHLAlpha ?? 0.45);
    cg.fillCircle(-cr * 0.28, -cr * 0.3, cr * 0.22);
    cg.fillStyle(tc.canopyHL, (tc.canopyHLAlpha ?? 0.45) + 0.05);
    cg.fillCircle(-cr * 0.32, -cr * 0.36, cr * 0.10);
    // Volcanic: scattered ember sparks on canopy
    if (tc.lavaGlow) {
      for (let i = 0; i < 6; i++) {
        const ea = Math.random() * Math.PI * 2, ed = Math.random() * cr * 0.7;
        cg.fillStyle(0xff6600, 0.6 + Math.random() * 0.3);
        cg.fillCircle(Math.cos(ea) * ed, Math.sin(ea) * ed, 1.5 + Math.random() * 1.5);
      }
    }

    canopy.add(cg);
    this.canopyContainer = canopy;

    // Gentle sway tween on canopy
    this.scene.tweens.add({
      targets: canopy,
      x: this.x + 4,
      duration: 1800 + Math.random() * 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.container = trunk; // primary reference
  }

  // ── Spire (theme-specific vertical prop) ──────────────────────────────────
  // Uses the same trunk + canopy two-container pattern as trees so occlusion-fade
  // (via checkOcclusion + this.tall=true) just works.
  _buildSpire() {
    const r = this.baseRadius;

    // Base container (depth = this.y → ground-plane sort)
    const trunk = this.scene.add.container(this.x, this.y);
    trunk.setDepth(this.y);
    const tg = this.scene.add.graphics();

    // Ground shadow (shared by all themes)
    tg.fillStyle(0x000000, 0.55);
    tg.fillEllipse(4, r * 0.5, r * 2.4, r * 0.6);

    // Canopy container (depth = this.y + 140 → always above entities)
    const canopyY = this.y - r * 2.6;
    const canopy = this.scene.add.container(this.x, canopyY);
    canopy.setDepth(this.y + 140);
    const cg = this.scene.add.graphics();

    // Theme-specific look
    switch (this.themeIdx) {
      case 0: this._spireGreenFields(tg, cg, r); break;
      case 1: this._spireCrystalCaves(tg, cg, r); break;
      case 2: this._spireVolcanic(tg, cg, r); break;
      case 3: this._spireCelestial(tg, cg, r); break;
      case 4: this._spireChaos(tg, cg, r); break;
      default: this._spireGreenFields(tg, cg, r);
    }

    trunk.add(tg);
    canopy.add(cg);
    this.trunkContainer = trunk;
    this.canopyContainer = canopy;
    this.container = trunk;
  }

  // Theme 0 — Green Fields: mossy stone column with grass tufts on top
  _spireGreenFields(tg, cg, r) {
    // Stone column (base)
    tg.fillStyle(0x4a4030, 1);
    tg.fillRoundedRect(-r * 0.85, -r * 2.5, r * 1.7, r * 3, r * 0.3);
    tg.fillStyle(0x2e261c, 0.5);
    tg.fillRoundedRect(r * 0.1, -r * 2.5, r * 0.75, r * 3, { tl: 0, tr: r * 0.3, bl: 0, br: r * 0.3 });
    tg.lineStyle(1.5, 0x1a1610, 0.85);
    tg.strokeRoundedRect(-r * 0.85, -r * 2.5, r * 1.7, r * 3, r * 0.3);
    // Mossy patches
    tg.fillStyle(0x4a7028, 0.7);
    tg.fillEllipse(-r * 0.4, -r * 1.8, r * 0.7, r * 0.4);
    tg.fillEllipse(r * 0.3, -r * 0.6, r * 0.5, r * 0.3);
    // Crack
    tg.lineStyle(1, 0x0f0a05, 0.6);
    tg.lineBetween(-r * 0.2, -r * 2.3, r * 0.1, -r * 0.5);

    // Grass tufts on top (canopy)
    cg.fillStyle(0x3a6020, 1);
    cg.fillEllipse(0, 0, r * 1.9, r * 0.8);
    cg.fillStyle(0x52aa3e, 1);
    cg.fillEllipse(-r * 0.2, -r * 0.15, r * 1.3, r * 0.6);
    // Grass blades
    cg.lineStyle(1.5, 0x6ec048, 0.9);
    for (let i = 0; i < 7; i++) {
      const bx = -r * 0.7 + (i / 6) * r * 1.4;
      const tilt = (i % 2 ? 1 : -1) * (3 + Math.random() * 4);
      cg.lineBetween(bx, 0, bx + tilt, -r * 0.5);
    }
  }

  // Theme 1 — Crystal Caves: dark anchor rock with crystal shards rising
  _spireCrystalCaves(tg, cg, r) {
    // Dark anchor rock (base)
    tg.fillStyle(0x1a1830, 1);
    for (let i = 0; i < 4; i++) {
      const ox = (i - 1.5) * r * 0.45;
      tg.fillCircle(ox, 0, r * 0.85);
    }
    tg.lineStyle(1.5, 0x0a0820, 0.85);
    tg.strokeCircle(-r * 0.5, 0, r * 0.85);
    tg.strokeCircle(r * 0.5, 0, r * 0.85);

    // 4 crystal shards in canopy — diamonds rising at angles
    const shards = [
      { x: 0,        h: r * 2.4, tilt: 0,    color: 0x66eeff },
      { x: -r * 0.5, h: r * 1.7, tilt: -0.15, color: 0x44ccdd },
      { x: r * 0.5,  h: r * 1.8, tilt: 0.18,  color: 0x99eeff },
      { x: -r * 0.2, h: r * 1.3, tilt: 0.05,  color: 0x88ddee },
    ];
    shards.forEach(({ x, h, tilt, color }) => {
      const w = r * 0.32;
      const cos = Math.cos(tilt), sin = Math.sin(tilt);
      const tip   = { x: x + sin * h,    y: -h * cos };
      const right = { x: x + cos * w,    y: -w * sin };
      const left  = { x: x - cos * w,    y: w * sin };
      const base  = { x: x,              y: 0 };
      cg.fillStyle(color, 0.85);
      cg.fillPoints([base, right, tip, left], true);
      cg.lineStyle(1, 0xffffff, 0.55);
      cg.lineBetween(base.x, base.y, tip.x, tip.y);
      cg.fillStyle(0xffffff, 0.45);
      cg.fillCircle(tip.x, tip.y, 1.5);
    });
  }

  // Theme 2 — Volcanic: charred basalt outcrop with embers glowing on top
  _spireVolcanic(tg, cg, r) {
    // Basalt base (jagged)
    tg.fillStyle(0x251008, 1);
    const pts = [];
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const radR = r * (0.95 + (i % 2) * 0.18);
      pts.push({ x: Math.cos(a) * radR, y: Math.sin(a) * radR * 0.55 - r * 0.4 });
    }
    tg.fillPoints(pts, true);
    tg.lineStyle(1.5, 0x100804, 0.9);
    tg.strokePoints(pts, true);
    // Lava cracks glowing in the basalt
    tg.lineStyle(1.5, 0xff4400, 0.65);
    tg.lineBetween(-r * 0.5, -r * 0.7, r * 0.2, -r * 0.2);
    tg.lineBetween(r * 0.1, -r * 0.5, r * 0.6, -r * 0.1);

    // Embers on top — 5 glowing dots, alpha-pulsing
    cg.fillStyle(0x6a2010, 0.9);
    cg.fillEllipse(0, 0, r * 1.8, r * 0.7);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const ex = Math.cos(a) * r * 0.55;
      const ey = Math.sin(a) * r * 0.22 - r * 0.15;
      cg.fillStyle(0xff6622, 0.5);
      cg.fillCircle(ex, ey, 4.5);
      cg.fillStyle(0xffaa44, 0.95);
      cg.fillCircle(ex, ey, 2.2);
    }
  }

  // Theme 3 — Celestial: smooth stone pillar with starfield twinkle on top
  _spireCelestial(tg, cg, r) {
    // Smooth stone pillar
    tg.fillStyle(0x1c1c3a, 1);
    tg.fillRoundedRect(-r * 0.75, -r * 2.4, r * 1.5, r * 3, r * 0.25);
    tg.fillStyle(0x0a0a20, 0.5);
    tg.fillRoundedRect(r * 0.05, -r * 2.4, r * 0.7, r * 3, { tl: 0, tr: r * 0.25, bl: 0, br: r * 0.25 });
    tg.lineStyle(1.5, 0x05051a, 0.9);
    tg.strokeRoundedRect(-r * 0.75, -r * 2.4, r * 1.5, r * 3, r * 0.25);
    // Gold inlay vertical
    tg.lineStyle(1, 0xffd700, 0.5);
    tg.lineBetween(0, -r * 2.2, 0, -r * 0.3);

    // Starfield top — dark dome with sparkling stars
    cg.fillStyle(0x10103a, 0.95);
    cg.fillEllipse(0, 0, r * 1.7, r * 0.8);
    // 8 stars at random positions
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = Math.random() * r * 0.6;
      const sx = Math.cos(ang) * dist;
      const sy = Math.sin(ang) * dist * 0.4 - r * 0.1;
      const sz = 0.8 + Math.random() * 1.5;
      cg.fillStyle(0xffeebb, 0.95);
      cg.fillCircle(sx, sy, sz);
      cg.fillStyle(0xffeebb, 0.25);
      cg.fillCircle(sx, sy, sz * 2.2);
    }
  }

  // Theme 4 — Chaos: distorted fragmented base with orbiting shards
  _spireChaos(tg, cg, r) {
    // Distorted base — irregular fractured rock
    tg.fillStyle(0x2a0a30, 1);
    const pts = [];
    const segs = 7;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const rr = r * (0.85 + Math.sin(i * 1.7) * 0.3);
      pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.55 - r * 0.4 });
    }
    tg.fillPoints(pts, true);
    tg.lineStyle(1.5, 0xff00ff, 0.55);
    tg.strokePoints(pts, true);
    // Magenta crack
    tg.lineStyle(1, 0xff00ff, 0.7);
    tg.lineBetween(-r * 0.3, -r * 0.6, r * 0.4, -r * 0.1);

    // Orbiting fragments — 3 small floating shards (subtle rotation tween)
    const fragments = [
      { ox: -r * 0.5, oy: -r * 0.2, size: 4, color: 0xff44ff },
      { ox: r * 0.4,  oy: -r * 0.4, size: 5, color: 0xff00ff },
      { ox: 0,        oy: -r * 0.7, size: 3, color: 0xee88ff },
    ];
    fragments.forEach(({ ox, oy, size, color }) => {
      cg.fillStyle(color, 0.85);
      const tri = [
        { x: ox, y: oy - size },
        { x: ox + size, y: oy + size * 0.5 },
        { x: ox - size, y: oy + size * 0.5 },
      ];
      cg.fillPoints(tri, true);
      cg.lineStyle(0.8, 0xffffff, 0.7);
      cg.strokePoints(tri, true);
    });
    // Subtle slow rotation on the canopy container — caller adds it
    this.scene.tweens.add({
      targets: cg,
      angle: 360,
      duration: 12000,
      repeat: -1,
    });
  }

  // ── Pillar / ruins ────────────────────────────────────────────────────────

  _buildPillar() {
    const g = this.scene.add.graphics();
    g.x = this.x;
    g.y = this.y;
    const r = this.baseRadius;
    const pw = r * 1.6, ph = r * 3.4;
    const tc = this._getObstacleTheme();

    // Shadow
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(4, ph * 0.12, pw * 1.8, ph * 0.22);

    // Main shaft
    g.fillStyle(tc.pillarBody, 1);
    g.fillRoundedRect(-pw / 2, -ph, pw, ph, r * 0.35);
    // Dark side
    g.fillStyle(tc.pillarDark, 1);
    g.fillRoundedRect(pw * 0.2, -ph, pw * 0.3, ph, { tl: 0, tr: r * 0.35, bl: 0, br: 0 });
    // Cap (slightly wider)
    g.fillStyle(tc.pillarCap, 1);
    g.fillRoundedRect(-pw * 0.6, -ph, pw * 1.2, ph * 0.12, 3);
    // Cracks / veins
    g.lineStyle(1.5, tc.pillarCrack, tc.lavaGlow ? 0.85 : 0.7);
    g.lineBetween(-pw * 0.1, -ph * 0.65, pw * 0.25, -ph * 0.4);
    g.lineBetween(-pw * 0.3, -ph * 0.3, pw * 0.1, -ph * 0.15);
    // Volcanic: lava seep at crack
    if (tc.lavaGlow) {
      g.lineStyle(0.8, 0xff6600, 0.45);
      g.lineBetween(-pw * 0.1, -ph * 0.65, pw * 0.25, -ph * 0.4);
      g.fillStyle(0xff5500, 0.3);
      g.fillCircle(pw * 0.1, -ph * 0.4, pw * 0.12);
    }
    // Crumbled chips at top
    for (let i = 0; i < 3; i++) {
      const cx2 = -pw * 0.4 + i * pw * 0.35;
      g.fillStyle(tc.pillarChip, 1);
      g.fillTriangle(cx2, -ph, cx2 + pw * 0.18, -ph, cx2 + pw * 0.09, -ph - ph * 0.08);
    }
    // Outline
    g.lineStyle(1.5, tc.pillarDark, 0.6);
    g.strokeRoundedRect(-pw / 2, -ph, pw, ph, r * 0.35);

    g.setDepth(this.y);
    this.container = g;
    this._addShadow(r);
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
  }
}
