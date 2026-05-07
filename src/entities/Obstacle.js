import Phaser from 'phaser';
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
