import { OBSTACLES } from '../config/gameConfig.js';

export default class Obstacle {
  constructor(scene, x, y, type, tall) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.type = type;
    this.tall = tall;

    // Collision radii
    this.baseRadius = OBSTACLES[`${type.toUpperCase()}_RADIUS`] ?? 28;
    this.canopyRadius = tall ? OBSTACLES.TREE_CANOPY_RADIUS : 0;

    // Tween guard
    this._canopyAlphaTweening = false;

    this._build();
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  _build() {
    switch (this.type) {
      case 'rock':   this._buildRock();   break;
      case 'stump':  this._buildStump();  break;
      case 'tree':   this._buildTree();   break;
      case 'pillar': this._buildPillar(); break;
      default:       this._buildRock();
    }
  }

  // ── Rock ──────────────────────────────────────────────────────────────────

  _buildRock() {
    const g = this.scene.add.graphics();
    g.x = this.x;
    g.y = this.y;

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
      g.fillStyle(0x4a4a55, 1);
      g.fillCircle(dx, dy, rr);
      // Side shading
      g.fillStyle(0x33333c, 1);
      g.fillCircle(dx + rr * 0.18, dy + rr * 0.18, rr * 0.72);
      // Top highlight
      g.fillStyle(0x7a7a88, 0.65);
      g.fillEllipse(dx - rr * 0.3, dy - rr * 0.35, rr * 0.8, rr * 0.5);
      // Crack detail
      g.lineStyle(1, 0x222228, 0.7);
      g.lineBetween(dx - rr * 0.1, dy - rr * 0.3, dx + rr * 0.3, dy + rr * 0.1);
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

    // Shadow
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(3, r * 0.5, r * 1.9, r * 0.6);

    // Outer stump ring (bark)
    g.fillStyle(0x4a2e10, 1);
    g.fillCircle(0, 0, r);
    // Inner wood face
    g.fillStyle(0x7a4e20, 1);
    g.fillCircle(0, 0, r * 0.75);
    // Growth rings
    g.lineStyle(1.5, 0x5c3a16, 0.5);
    g.strokeCircle(0, 0, r * 0.55);
    g.lineStyle(1, 0x5c3a16, 0.35);
    g.strokeCircle(0, 0, r * 0.35);
    // Center dot
    g.fillStyle(0x3a2008, 0.8);
    g.fillCircle(0, 0, r * 0.12);
    // Grain lines (radial cracks)
    g.lineStyle(1, 0x4a3010, 0.5);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      g.lineBetween(0, 0, Math.cos(angle) * r * 0.65, Math.sin(angle) * r * 0.65);
    }
    // Bark edge highlight
    g.lineStyle(1.5, 0x6a3e18, 0.6);
    g.strokeCircle(0, 0, r);

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

    const tg = this.scene.add.graphics();
    // Shadow on ground
    tg.fillStyle(0x000000, 0.3);
    tg.fillEllipse(5, tr * 0.5, tr * 2.2, tr * 0.65);
    // Roots (small arcs)
    tg.lineStyle(tr * 0.4, 0x3a1e08, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI * 0.15;
      const ex = Math.cos(a) * tr * 1.35, ey = Math.sin(a) * tr * 0.6;
      tg.lineBetween(0, 0, ex, ey);
    }
    // Trunk cylinder body
    tg.fillStyle(0x3e200a, 1);
    tg.fillRoundedRect(-tr, -tr * 3.5, tr * 2, tr * 4, tr * 0.5);
    tg.lineStyle(1.5, 0x5a3012, 0.7);
    tg.strokeRoundedRect(-tr, -tr * 3.5, tr * 2, tr * 4, tr * 0.5);
    // Bark highlights
    tg.lineStyle(1, 0x6a4018, 0.4);
    tg.lineBetween(-tr * 0.3, -tr * 3, -tr * 0.3, tr * 0.3);
    tg.lineBetween(tr * 0.2, -tr * 3, tr * 0.2, tr * 0.3);

    trunk.add(tg);
    this.trunkContainer = trunk;

    // ── Canopy container (depth = this.y + 140, always above entities) ──
    const canopy = this.scene.add.container(this.x, this.y - tr * 3.2);
    canopy.setDepth(this.y + 140);

    const cg = this.scene.add.graphics();
    // Three layered circles: dark base, mid, bright center
    const layers = [
      { r: cr, color: 0x1a4010, alpha: 1, ox: 0, oy: 0 },
      { r: cr * 0.82, color: 0x276618, alpha: 1, ox: -cr * 0.05, oy: cr * 0.05 },
      { r: cr * 0.62, color: 0x38882a, alpha: 1, ox: cr * 0.08, oy: -cr * 0.08 },
      { r: cr * 0.35, color: 0x52aa3e, alpha: 0.85, ox: -cr * 0.04, oy: -cr * 0.12 },
    ];
    layers.forEach(({ r, color, alpha, ox, oy }) => {
      cg.fillStyle(color, alpha);
      cg.fillCircle(ox, oy, r);
    });
    // Rim shadow
    cg.lineStyle(3, 0x0e2808, 0.45);
    cg.strokeCircle(0, 0, cr);
    // Top highlight sparkle
    cg.fillStyle(0xaaddaa, 0.3);
    cg.fillCircle(-cr * 0.28, -cr * 0.3, cr * 0.18);

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

  // ── Pillar / ruins ────────────────────────────────────────────────────────

  _buildPillar() {
    const g = this.scene.add.graphics();
    g.x = this.x;
    g.y = this.y;
    const r = this.baseRadius;
    const pw = r * 1.6, ph = r * 3.4;

    // Shadow
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(4, ph * 0.12, pw * 1.8, ph * 0.22);

    // Main shaft
    g.fillStyle(0x808080, 1);
    g.fillRoundedRect(-pw / 2, -ph, pw, ph, r * 0.35);
    // Dark side
    g.fillStyle(0x555555, 1);
    g.fillRoundedRect(pw * 0.2, -ph, pw * 0.3, ph, { tl: 0, tr: r * 0.35, bl: 0, br: 0 });
    // Cap (slightly wider)
    g.fillStyle(0x909090, 1);
    g.fillRoundedRect(-pw * 0.6, -ph, pw * 1.2, ph * 0.12, 3);
    // Cracks
    g.lineStyle(1.5, 0x404040, 0.7);
    g.lineBetween(-pw * 0.1, -ph * 0.65, pw * 0.25, -ph * 0.4);
    g.lineBetween(-pw * 0.3, -ph * 0.3, pw * 0.1, -ph * 0.15);
    // Crumbled chips at top
    for (let i = 0; i < 3; i++) {
      const cx2 = -pw * 0.4 + i * pw * 0.35;
      g.fillStyle(0x707070, 1);
      g.fillTriangle(cx2, -ph, cx2 + pw * 0.18, -ph, cx2 + pw * 0.09, -ph - ph * 0.08);
    }
    // Outline
    g.lineStyle(1.5, 0x404040, 0.6);
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

  // ── Occlusion (called per frame from ArenaScene.update) ───────────────────

  // entities: [{x, y, alive}] — canopy fades if the player OR boss is behind this tree
  checkOcclusion(entities) {
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
