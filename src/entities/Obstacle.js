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

  // Draws a jagged rock polygon at (cx, cy) with semi-axes rx, ry.
  // Returns the vertex array so callers can reuse it for shade/highlight overlays.
  _rockPolygon(g, cx, cy, rx, ry, ptCount, hashOff) {
    const verts = [];
    for (let i = 0; i < ptCount; i++) {
      const baseA  = (i / ptCount) * Math.PI * 2;
      const jitter = (this._h(hashOff + i * 2) - 0.5) * (Math.PI * 2 / ptCount) * 0.55;
      const rScale = 0.62 + this._h(hashOff + i * 2 + 1) * 0.38;
      verts.push({
        x: cx + Math.cos(baseA + jitter) * rx * rScale,
        y: cy + Math.sin(baseA + jitter) * ry * rScale,
      });
    }
    g.fillPoints(verts, true);
    return verts;
  }

  _buildRock() {
    const g = this.scene.add.graphics();
    g.x = this.x;
    g.y = this.y;
    const tc = this._getObstacleTheme();
    const r  = this.baseRadius;

    // Per-instance hash-driven layout properties
    const variant   = Math.floor(this._h(0) * 4);      // 0=solo, 1=twin, 2=cluster, 3=slab
    const ptCount   = 7 + Math.floor(this._h(1) * 3);  // 7, 8, or 9 polygon vertices
    const scaleMult = 0.88 + this._h(2) * 0.26;        // 0.88–1.14× overall size

    // Draws one rock at local coords (cx, cy) with semi-axes rxArg×ryArg.
    // hBase: salt offset so each rock in a cluster uses independent hash streams.
    const drawOneRock = (cx, cy, rxArg, ryArg, hBase) => {
      // Shadow
      g.fillStyle(0x000000, 0.28);
      g.fillEllipse(cx + rxArg * 0.22, cy + ryArg * 0.65, rxArg * 1.55, ryArg * 0.52);

      // Base polygon — jagged irregular shape (no fillCircle)
      g.fillStyle(tc.rockBody, 1);
      const verts = this._rockPolygon(g, cx, cy, rxArg, ryArg, ptCount, hBase);

      // Shade overlay — same verts scaled toward center + shifted right-down
      // Gives directional shading without any circular blob
      g.fillStyle(tc.rockShade, 0.88);
      const shadeV = verts.map(v => ({
        x: cx + (v.x - cx) * 0.72 + rxArg * 0.20,
        y: cy + (v.y - cy) * 0.72 + ryArg * 0.15,
      }));
      g.fillPoints(shadeV, true);

      // Highlight patch — same verts scaled small + shifted up-left (lit face)
      g.fillStyle(tc.rockHL, 0.60);
      const hlV = verts.map(v => ({
        x: cx + (v.x - cx) * 0.38 - rxArg * 0.22,
        y: cy + (v.y - cy) * 0.38 - ryArg * 0.28,
      }));
      g.fillPoints(hlV, true);

      // 2–3 angular crack lines across the rock face
      const crackN = 2 + Math.floor(this._h(hBase + 50) * 2);
      for (let k = 0; k < crackN; k++) {
        const ch = hBase + 51 + k * 4;
        const cA = this._h(ch) * Math.PI * 2;
        const cL = rxArg * (0.28 + this._h(ch + 1) * 0.42);
        const mX = cx + (this._h(ch + 2) - 0.5) * rxArg * 0.38;
        const mY = cy + (this._h(ch + 3) - 0.5) * ryArg * 0.38;
        g.lineStyle(1, tc.rockCrack, tc.lavaGlow ? 0.85 : 0.70);
        g.lineBetween(mX - Math.cos(cA) * cL * 0.5, mY - Math.sin(cA) * cL * 0.5,
                      mX + Math.cos(cA) * cL * 0.5, mY + Math.sin(cA) * cL * 0.5);
        if (tc.lavaGlow) {
          g.lineStyle(0.8, 0xff8800, 0.40);
          g.lineBetween(mX - Math.cos(cA) * cL * 0.5, mY - Math.sin(cA) * cL * 0.5,
                        mX + Math.cos(cA) * cL * 0.5, mY + Math.sin(cA) * cL * 0.5);
          g.fillStyle(0xff6600, 0.22);
          g.fillCircle(mX + Math.cos(cA) * cL * 0.3, mY + Math.sin(cA) * cL * 0.3, ryArg * 0.22);
        }
      }
    };

    // ── Variant rock layouts ────────────────────────────────────────────────
    switch (variant) {
      case 0: { // Solo boulder — one large faceted rock
        const rx = r * scaleMult, ry = rx * 0.78;
        drawOneRock(0, 0, rx, ry, 100);
        break;
      }
      case 1: { // Twin cluster — two rocks side by side at a hash-driven angle
        const ang = this._h(10) * Math.PI;
        const rx0 = r * scaleMult,                          ry0 = rx0 * 0.78;
        const rx1 = rx0 * (0.72 + this._h(11) * 0.18),    ry1 = rx1 * 0.78;
        const d   = r * (0.55 + this._h(12) * 0.20);
        drawOneRock(-Math.cos(ang) * d * 0.40, -Math.sin(ang) * d * 0.20, rx0, ry0, 100);
        drawOneRock( Math.cos(ang) * d * 0.60,  Math.sin(ang) * d * 0.25, rx1, ry1, 150);
        break;
      }
      case 2: { // Classic cluster — main rock + 2 smaller satellites
        const ang1 = this._h(10) * Math.PI * 2;
        const ang2 = ang1 + Math.PI * (0.5 + this._h(11) * 0.60);
        const rx0  = r * scaleMult,                         ry0 = rx0 * 0.78;
        const rx1  = rx0 * (0.66 + this._h(12) * 0.14),   ry1 = rx1 * 0.78;
        const rx2  = rx0 * (0.58 + this._h(13) * 0.14),   ry2 = rx2 * 0.78;
        drawOneRock(0, 0, rx0, ry0, 100);
        drawOneRock(Math.cos(ang1) * r * (0.60 + this._h(14) * 0.15),
                    Math.sin(ang1) * r * 0.30, rx1, ry1, 150);
        drawOneRock(Math.cos(ang2) * r * (0.52 + this._h(15) * 0.15),
                    Math.sin(ang2) * r * 0.25, rx2, ry2, 200);
        break;
      }
      case 3: { // Flat slab — wide, low-profile rock
        const rx = r * scaleMult * 1.30, ry = rx * 0.52;
        drawOneRock(0, 0, rx, ry, 100);
        break;
      }
    }

    g.setDepth(this.y);
    this.container = g;
    this._addShadow(this.baseRadius);
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
    const g = this.scene.add.graphics();
    g.x = this.x;
    g.y = this.y;
    const r  = this.baseRadius;
    const tc = this._getObstacleTheme();

    // Hash-driven variant — affects front face height and detail
    const variant = Math.floor(this._h(0) * 4);
    // 0 = fresh cut, 1 = old/mossy, 2 = tall stump, 3 = low slab
    // frontH drives how tall the visible bark side-face is.
    // Values were doubled from original to give proper cylinder height.
    const frontH = [r * 1.10, r * 1.00, r * 1.60, r * 0.70][variant];
    const topW   = r * 2.0;                // uniform width for all variants
    const topH   = Math.min(frontH * 0.65, r * 0.80); // top face always shorter than bark band
    const topCY  = -frontH;   // center of top face (in local Y coords)

    // 1. Ground contact shadow — at the stump base (local y ≈ 0) so it sits
    //    flush under the bark face rather than floating below it.
    g.fillStyle(0x000000, 0.32);
    g.fillEllipse(2, 2, r * 2.2, r * 0.50);

    // 2. Front face — bark cylinder side (trapezoid with slight perspective taper)
    const frontTrap = [
      { x: -r,        y: topCY },
      { x:  r,        y: topCY },
      { x:  r * 0.85, y: 0 },
      { x: -r * 0.85, y: 0 },
    ];
    g.fillStyle(tc.stumpBark, 1);
    g.fillPoints(frontTrap, true);

    // Horizontal bark lines on front face
    // xEdge tapers from r (at top) to r*0.85 (at base), matching the trapezoid width.
    const barkLines = variant === 2 ? 5 : (variant === 3 ? 2 : 4);
    for (let i = 1; i <= barkLines; i++) {
      const ly       = topCY + frontH * i / (barkLines + 1);
      const progress = (ly - topCY) / frontH;   // 0 = top of face, 1 = base
      const xEdge    = r * (1.0 - 0.15 * progress); // tapers r → r*0.85
      g.lineStyle(1, tc.stumpRing, 0.30 + this._h(20 + i) * 0.15);
      g.lineBetween(-xEdge, ly, xEdge, ly);
    }

    // Vertical bark fissures
    const fissureCount = 1 + Math.floor(this._h(30) * 2);
    for (let i = 0; i < fissureCount; i++) {
      const fx     = (this._h(31 + i) - 0.5) * r * 1.4;
      const fLen   = frontH * (0.35 + this._h(32 + i) * 0.50);
      const fTop   = topCY + frontH * (0.05 + this._h(33 + i) * 0.2);
      const fTilt  = (this._h(34 + i) - 0.5) * 4;
      g.lineStyle(0.8, tc.stumpRing, 0.50);
      g.lineBetween(fx, fTop, fx + fTilt, fTop + fLen);
    }

    // Knot ovals on front face (variant 2 — tall stump)
    if (variant === 2) {
      for (let k = 0; k < 2; k++) {
        const kx = (this._h(40 + k * 2) - 0.5) * r * 1.2;
        const ky = topCY + frontH * (0.25 + this._h(41 + k * 2) * 0.50);
        g.fillStyle(tc.stumpRing, 0.55);
        g.fillEllipse(kx, ky, r * 0.28, r * 0.20);
        g.lineStyle(1, tc.stumpBark, 0.70);
        g.strokeEllipse(kx, ky, r * 0.28, r * 0.20);
      }
    }

    // 3. Top rim shadow — dark edge where front face meets the top face
    g.lineStyle(2, tc.stumpBark, 0.70);
    g.lineBetween(-r, topCY, r, topCY);

    // 4. Top face — cut ellipse (wood surface, slightly flattened for 2.5D)
    g.fillStyle(tc.stumpWood, 1);
    g.fillEllipse(0, topCY, topW, topH);

    // Moss patch on old stump (variant 1)
    if (variant === 1 && tc.canopyA) {
      g.fillStyle(tc.canopyA, 0.25);
      g.fillEllipse(-topW * 0.15, topCY - topH * 0.05, topW * 0.55, topH * 0.50);
    }

    // 5. Growth rings — flattened ellipses matching the top face shape
    const ringScales = variant === 1 ? [0.70, 0.46] : [0.72, 0.50, 0.32];
    ringScales.forEach((rs, ri) => {
      const offX = (this._h(50 + ri) - 0.5) * 2;
      const offY = (this._h(51 + ri) - 0.5) * 2;
      g.lineStyle(1, tc.stumpRing, tc.lavaGlow ? 0.75 : 0.50);
      g.strokeEllipse(offX, topCY + offY, topW * rs, topH * rs);
    });

    // 6. Radial grain lines from center to ellipse edge
    const grainCount = 4 + Math.floor(this._h(60) * 3);   // 4–6
    const lineColor  = tc.lavaGlow ? 0xff5500 : tc.stumpRing;
    g.lineStyle(1, lineColor, tc.lavaGlow ? 0.45 : 0.45);
    for (let i = 0; i < grainCount; i++) {
      const ga  = (i / grainCount) * Math.PI * 2 + this._h(61 + i) * 0.8;
      const gex = Math.cos(ga) * topW * 0.42;
      const gey = Math.sin(ga) * topH * 0.42;
      g.lineBetween(0, topCY, gex, topCY + gey);
    }

    // 7. Top ellipse rim highlight
    g.lineStyle(1.5, tc.stumpRing, 0.55);
    g.strokeEllipse(0, topCY, topW, topH);

    // 8. Center / lava pool
    if (tc.lavaGlow) {
      g.fillStyle(0xff6600, 0.18);
      g.fillEllipse(0, topCY, topW * 0.55, topH * 0.55);
      g.fillStyle(0xff8800, 0.28);
      g.fillEllipse(0, topCY, topW * 0.28, topH * 0.28);
    } else {
      g.fillStyle(tc.stumpBark, 0.80);
      g.fillEllipse(0, topCY, topW * 0.12, topH * 0.12);
    }

    g.setDepth(this.y);
    this.container = g;
    // No _addShadow() here — the inline shadow above is sufficient and
    // correctly placed. _addShadow() would add a second ellipse at
    // y + r*0.45 which is visually disconnected from the stump base.
  }

  // ── Tall tree ─────────────────────────────────────────────────────────────

  _buildTree() {
    const tr = this.baseRadius;   // trunk radius
    const cr = this.canopyRadius; // base canopy radius
    const tc = this._getObstacleTheme();

    // Hash-driven per-instance variety
    const tHMult  = 0.88 + this._h(3) * 0.30;   // trunk height  0.88–1.18×
    const lean    = (this._h(4) - 0.5) * 8;      // ±4° trunk lean
    const rootN   = 3 + Math.floor(this._h(5) * 2); // 3 or 4 roots
    const crMult  = 0.90 + this._h(6) * 0.22;    // canopy radius 0.90–1.12×
    const cOX     = (this._h(7) - 0.5) * cr * 0.18; // canopy asymmetry X
    const cOY     = (this._h(8) - 0.5) * cr * 0.12; // canopy asymmetry Y
    const swayMs  = 1600 + this._h(9) * 800;      // unique sway pace per tree
    const cr2     = cr * crMult;                   // actual canopy radius

    // ── Trunk container (Y-depth = this.y) ──
    const trunk = this.scene.add.container(this.x, this.y);
    trunk.setDepth(this.y);
    trunk.angle = lean;

    const tg = this.scene.add.graphics();
    // Ground shadow
    tg.fillStyle(0x000000, 0.50);
    tg.fillEllipse(5, tr * 0.5, tr * 2.4, tr * 0.7);
    // Roots — count and angles hash-driven
    tg.lineStyle(tr * 0.4, tc.roots, 1);
    for (let i = 0; i < rootN; i++) {
      const a  = (i / rootN) * Math.PI * 2 + this._h(70 + i) * 0.6;
      const ex = Math.cos(a) * tr * 1.35, ey = Math.sin(a) * tr * 0.6;
      tg.lineBetween(0, 0, ex, ey);
    }
    // Trunk cylinder — height scaled by tHMult
    const tTop = tr * 3.5 * tHMult, tH = tr * 4 * tHMult;
    tg.fillStyle(tc.trunkBody, 1);
    tg.fillRoundedRect(-tr, -tTop, tr * 2, tH, tr * 0.5);
    // Darker right-side band (cylindrical depth shading)
    tg.fillStyle(tc.trunkDark, 0.5);
    tg.fillRoundedRect(tr * 0.2, -tTop, tr * 0.8, tH, { tl: 0, tr: tr * 0.5, bl: 0, br: tr * 0.5 });
    // Outline
    tg.lineStyle(1.5, tc.trunkDark, 0.85);
    tg.strokeRoundedRect(-tr, -tTop, tr * 2, tH, tr * 0.5);
    // Bark highlight streaks
    tg.lineStyle(1, tc.trunkBody, 0.4);
    tg.lineBetween(-tr * 0.3, -tTop * 0.86, -tr * 0.3, tr * 0.3);
    tg.lineBetween( tr * 0.2, -tTop * 0.86,  tr * 0.2, tr * 0.3);
    // Volcanic embers — positions deterministic
    if (tc.lavaGlow) {
      for (let i = 0; i < 4; i++) {
        const ex = -tr * 0.5 + this._h(75 + i * 2) * tr;
        const ey = -tTop + this._h(76 + i * 2) * tH;
        tg.fillStyle(0xff6600, 0.55);
        tg.fillCircle(ex, ey, 1.2 + this._h(77 + i) * 1.2);
      }
    }
    trunk.add(tg);
    this.trunkContainer = trunk;

    // ── Canopy container (depth = this.y + 140, always above entities) ──
    const canopy = this.scene.add.container(this.x, this.y - tr * 3.2 * tHMult);
    canopy.setDepth(this.y + 140);

    const cg = this.scene.add.graphics();

    // ── Canopy shape — 3 deciduous styles, all using the same 4-layer sphere
    //    shading principle: dark shadow base (bottom rim) → medium body →
    //    wide lit-face ellipse (the 2.5D tilt element) → small highlight.
    //    this._h(0) is unused elsewhere in _buildTree (hashes start at _h(3)).
    //    0.00–0.33: Round crown   0.33–0.66: Wide spreading   0.66–1.0: Multi-cluster
    const CR           = cr2;
    const canopyStyle  = this._h(0);

    if (canopyStyle < 0.33) {
      // ── A: Round crown — single sphere, clean and elegant ──────────────
      // Layer 1: shadow hemisphere, pushed down — dark rim shows at bottom
      cg.fillStyle(tc.canopyA, 1);
      cg.fillCircle(cOX * 0.5, CR * 0.14 + cOY * 0.5, CR);
      // Layer 2: body — medium green, slightly upper-left
      cg.fillStyle(tc.canopyB, 1);
      cg.fillCircle(-CR * 0.04 + cOX, cOY, CR * 0.88);
      // Layer 3: lit top face — wide ellipse (2.5D tilt), slightly less extreme ratio
      cg.fillStyle(tc.canopyC, 1);
      cg.fillEllipse(-CR * 0.08 + cOX, -CR * 0.24 + cOY, CR * 1.20, CR * 0.88);
      // Layer 4: highlight — softened alpha so it blends rather than pops
      cg.fillStyle(tc.canopyD, 0.65);
      cg.fillEllipse(-CR * 0.14 + cOX, -CR * 0.38 + cOY, CR * 0.44, CR * 0.38);

    } else if (canopyStyle < 0.66) {
      // ── B: Wide spreading crown — broader than tall, full and heavy ────
      // Layer 1: shadow base (wide, pushed down)
      cg.fillStyle(tc.canopyA, 1);
      cg.fillEllipse(CR * 0.06 + cOX, CR * 0.18 + cOY, CR * 2.20, CR * 1.10);
      // Layer 2: main body
      cg.fillStyle(tc.canopyB, 1);
      cg.fillEllipse(-CR * 0.04 + cOX, CR * 0.04 + cOY, CR * 1.95, CR * 0.95);
      // Layer 3: lit face (upper-left, slightly narrower)
      cg.fillStyle(tc.canopyC, 1);
      cg.fillEllipse(-CR * 0.10 + cOX, -CR * 0.18 + cOY, CR * 1.65, CR * 0.72);
      // Layer 4: highlight — softened alpha
      cg.fillStyle(tc.canopyD, 0.65);
      cg.fillEllipse(-CR * 0.18 + cOX, -CR * 0.28 + cOY, CR * 0.72, CR * 0.42);

    } else {
      // ── C: Multi-cluster crown — 3 overlapping lobes ──────────────────
      // ALL FOUR layers applied to each lobe individually:
      // shadow base → body → lit face (circle, matching lobe shape) → highlight.
      // No separate shared highlight — each lobe is self-contained.
      const SR = CR * 0.60;
      const anchors = [
        { cx: -CR * 0.38, cy:  CR * 0.12 }, // lower-left lobe
        { cx:  CR * 0.35, cy:  CR * 0.05 }, // lower-right lobe
        { cx: -CR * 0.06, cy: -CR * 0.32 }, // upper-centre lobe
      ];
      anchors.forEach(({ cx, cy }, si) => {
        const jx = (this._h(200 + si * 2)     - 0.5) * CR * 0.24;
        const jy = (this._h(200 + si * 2 + 1) - 0.5) * CR * 0.16;
        const ox = cx + jx + cOX * 0.5;
        const oy = cy + jy + cOY * 0.5;
        // Layer 1: shadow base per lobe (pushed down)
        cg.fillStyle(tc.canopyA, 1);
        cg.fillCircle(ox, oy + SR * 0.12, SR);
        // Layer 2: body per lobe (slightly upper-left)
        cg.fillStyle(tc.canopyB, 1);
        cg.fillCircle(ox - SR * 0.04, oy, SR * 0.86);
        // Layer 3: lit face — circle to match the lobe shape (no flat wide ellipse)
        cg.fillStyle(tc.canopyC, 1);
        cg.fillCircle(ox - SR * 0.10, oy - SR * 0.20, SR * 0.62);
        // Layer 4: highlight — soft circle, low alpha so it blends
        cg.fillStyle(tc.canopyD, 0.65);
        cg.fillCircle(ox - SR * 0.18, oy - SR * 0.34, SR * 0.30);
      });
    }
    // Volcanic embers — deterministic positions
    if (tc.lavaGlow) {
      for (let i = 0; i < 6; i++) {
        const ea = this._h(80 + i * 2) * Math.PI * 2;
        const ed = this._h(81 + i * 2) * cr2 * 0.7;
        cg.fillStyle(0xff6600, 0.60 + this._h(82 + i) * 0.30);
        cg.fillCircle(Math.cos(ea) * ed, Math.sin(ea) * ed, 1.5 + this._h(83 + i) * 1.5);
      }
    }
    canopy.add(cg);
    this.canopyContainer = canopy;

    // Gentle sway — each tree has a unique pace and amplitude
    this.scene.tweens.add({
      targets: canopy,
      x: this.x + 3 + this._h(90) * 3,  // 3–6 px sway amplitude
      duration: swayMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.container = trunk;
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
    const r  = this.baseRadius;
    const tc = this._getObstacleTheme();

    // Hash-driven dimensions and variant
    const phVariant = this._h(0);
    const pw = r * (1.4 + this._h(1) * 0.4);   // width: 1.4–1.8× radius
    // Height variant: full / half-broken / stub
    const ph = phVariant < 0.33 ? r * 3.4
             : phVariant < 0.66 ? r * 2.1
             :                    r * 1.3;

    // Shadow
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(4, ph * 0.12, pw * 1.8, ph * 0.22);

    // Main shaft
    g.fillStyle(tc.pillarBody, 1);
    g.fillRoundedRect(-pw / 2, -ph, pw, ph, r * 0.35);
    // Dark side (cylindrical depth)
    g.fillStyle(tc.pillarDark, 1);
    g.fillRoundedRect(pw * 0.2, -ph, pw * 0.3, ph, { tl: 0, tr: r * 0.35, bl: 0, br: 0 });

    // Cap / broken top treatment
    if (phVariant < 0.33) {
      // Full pillar — clean cap + crumbled chips
      g.fillStyle(tc.pillarCap, 1);
      g.fillRoundedRect(-pw * 0.6, -ph, pw * 1.2, ph * 0.12, 3);
      const chipCount = 2 + Math.floor(this._h(10) * 4);  // 2–5 chips
      for (let i = 0; i < chipCount; i++) {
        const cx2 = -pw * 0.45 + this._h(11 + i) * pw * 0.9;
        const cs  = pw * (0.10 + this._h(12 + i) * 0.12);
        g.fillStyle(tc.pillarChip, 1);
        g.fillTriangle(cx2, -ph, cx2 + cs * 1.6, -ph,
                       cx2 + cs * 0.8 + (this._h(13 + i) - 0.5) * cs, -ph - cs * 1.1);
      }
    } else if (phVariant < 0.66) {
      // Half-broken — jagged fractured top edge
      const breakPts = [{ x: -pw / 2, y: -ph }];
      for (let ci = 0; ci < 5; ci++) {
        breakPts.push({
          x: -pw / 2 + pw * (ci + 1) / 6,
          y: -ph + (this._h(20 + ci) - 0.25) * ph * 0.22,
        });
      }
      breakPts.push({ x:  pw / 2,     y: -ph        });
      breakPts.push({ x:  pw / 2,     y: -ph + ph * 0.18 });
      breakPts.push({ x: -pw / 2,     y: -ph + ph * 0.14 });
      g.fillStyle(tc.pillarDark, 1);
      g.fillPoints(breakPts, true);
      // Exposed broken-face fill (lighter stone)
      g.fillStyle(tc.pillarCap, 0.70);
      g.fillPoints(breakPts.slice(0, 7), true);
    } else {
      // Stub — very low; rubble chips scattered around top
      g.fillStyle(tc.pillarCap, 1);
      g.fillRoundedRect(-pw * 0.6, -ph, pw * 1.2, ph * 0.18, 3);
      const chipCount = 3 + Math.floor(this._h(30) * 3);
      for (let i = 0; i < chipCount; i++) {
        const cx2 = -pw * 0.4 + this._h(31 + i) * pw * 0.8;
        const cy2 = -ph * (0.78 + this._h(32 + i) * 0.22);
        const cs  = pw * (0.10 + this._h(33 + i) * 0.15);
        g.fillStyle(tc.pillarChip, 1);
        g.fillTriangle(cx2 - cs, cy2, cx2 + cs, cy2,
                       cx2 + (this._h(34 + i) - 0.5) * cs, cy2 - cs * 1.2);
      }
    }

    // Cracks / veins — count and endpoints hash-driven
    const crackCount = 2 + Math.floor(this._h(40) * 3);  // 2–4 cracks
    for (let k = 0; k < crackCount; k++) {
      const ch  = 41 + k * 6;
      const x1  = (-pw * 0.45 + this._h(ch)     * pw * 0.9);
      const y1  = (-ph * 0.20 - this._h(ch + 1) * ph * 0.65);
      const x2  = (-pw * 0.45 + this._h(ch + 2) * pw * 0.9);
      const y2  = (-ph * 0.05 - this._h(ch + 3) * ph * 0.40);
      g.lineStyle(1.5, tc.pillarCrack, tc.lavaGlow ? 0.85 : 0.70);
      g.lineBetween(x1, y1, x2, y2);
      if (tc.lavaGlow) {
        g.lineStyle(0.8, 0xff6600, 0.45);
        g.lineBetween(x1, y1, x2, y2);
        g.fillStyle(0xff5500, 0.30);
        g.fillCircle((x1 + x2) * 0.5, (y1 + y2) * 0.5, pw * 0.10);
      }
    }

    // Outline
    g.lineStyle(1.5, tc.pillarDark, 0.60);
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
