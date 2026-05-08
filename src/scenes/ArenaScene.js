import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, ARENA, getTheme } from '../config/gameConfig.js';
import { getRandomBossKey } from '../config/bossConfig.js';
import Player from '../entities/Player.js';
import Altar from '../entities/Altar.js';
import Portal from '../entities/Portal.js';
import Obstacle from '../entities/Obstacle.js';
import { createBoss } from '../entities/bosses/BossFactory.js';
import ArenaGenerator from '../arenas/ArenaGenerator.js';
import CameraController from '../systems/CameraController.js';

export default class ArenaScene extends Phaser.Scene {
  constructor() {
    super({ key: 'ArenaScene' });
  }

  init(data) {
    this.level = data.level || 1;
    this.score = data.score || 0;
    this.incomingHp = data.playerHp ?? null;
    this.defeatedBosses = data.defeatedBosses || [];
    this.paused = false;
  }

  create() {
    // Generate arena world
    this.arena = ArenaGenerator.generate(this.level);
    this.theme = getTheme(this.level);
    this.cameras.main.setBackgroundColor(this.theme.bg);

    this._buildArena();
    this._spawnObstacles();
    this._spawnPlayer();
    this._spawnAltar();

    this.boss = null;
    this.portal = null;
    this.bossAlive = false;

    // Camera — multiplayer-ready
    this.cameraController = new CameraController(
      this.cameras.main,
      this.arena.worldW,
      this.arena.worldH
    );
    this.cameraController.setTargets([this.player]);

    this.scene.launch('UIScene', {
      arenaScene: this,
      level: this.level,
      score: this.score,
    });

    this.input.mouse.disableContextMenu();
    this.cameras.main.fadeIn(400, 0, 0, 0);
    // ESC is handled by UIScene — it stays active while ArenaScene is natively paused
  }

  update(time, delta) {
    if (this.paused) return;

    this.cameraController.update();

    if (this.player) {
      this.player.update(time, delta);
      // Y-depth sort — player renders in front of / behind obstacles correctly
      this.player.container.setDepth(this.player.y);
      if (this.player.shadowG) this.player.shadowG.setDepth(this.player.y - 1);
    }

    if (this.boss && this.bossAlive) {
      this.boss.update(time, delta);
      this.boss.container.setDepth(this.boss.y);
      if (this.boss.shadowG) this.boss.shadowG.setDepth(this.boss.y - 1);
    }

    // Tall tree occlusion — fade canopy when player OR boss walks behind
    if (this.obstacles) {
      const occludeTargets = [this.player, this.boss].filter(e => e?.alive);
      for (const obs of this.obstacles) {
        obs.checkOcclusion(occludeTargets);
      }
    }

    // Portal walk-through detection
    if (this.portal && this.player?.alive) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.portal.x, this.portal.y
      );
      if (dist < this.portal.enterRadius) this.portal.enter();
    }
  }

  // ── Arena visuals ──────────────────────────────────────────────────────────

  _buildArena() {
    const { worldW, worldH, shape } = this.arena;
    const t = this.theme;
    const bounds = shape.bounds;
    const perimeter = shape.getPerimeterPolygon();
    const WALL_DEPTH = 26;                       // px — pseudo-3D wall ring thickness
    const innerRing = _shrinkPts(perimeter, WALL_DEPTH);

    // ── DEPTH 0: Void background ─────────────────────────────────────────────
    const voidG = this.add.graphics().setDepth(0);
    voidG.fillStyle(Phaser.Display.Color.ValueToColor(t.bg).darken(20).color, 1);
    voidG.fillRect(0, 0, worldW, worldH);

    // Radial void rings from world center — atmosphere rings hinting at the abyss
    _drawVoidRings(voidG, worldW * 0.5, worldH * 0.5,
      Math.max(worldW, worldH) * 0.6, t.wallShadow, 7, 0.055);

    // Outer wall halo — soft glow on the void side of the wall
    voidG.lineStyle(6, t.wallHighlight, 0.08);
    voidG.strokePoints(perimeter, true);

    // ── DEPTH 1: Wall + floor (pseudo-3D) ────────────────────────────────────
    // Draw the full polygon in wallTop, then "punch out" the floor interior by
    // drawing the inset polygon in floor color — the ring difference IS the wall.
    const wallG = this.add.graphics().setDepth(1);
    wallG.fillStyle(t.wallTop, 1);
    wallG.fillPoints(perimeter, true);
    wallG.fillStyle(t.floor, 1);
    wallG.fillPoints(innerRing, true);

    // ── DEPTH 1: Floor texture (brick mortar + scattered patches) ────────────
    // All floor-content graphics share ONE geometry mask (one stencil texture).
    const maskG = this.make.graphics({ add: false });
    maskG.fillStyle(0xffffff, 1);
    maskG.fillPoints(innerRing, true);
    const floorMask = maskG.createGeometryMask();

    const floorTexG = this.add.graphics().setDepth(1);
    floorTexG.setMask(floorMask);

    // Brick mortar lines
    _drawBrickTexture(floorTexG, bounds, 48, 32, t.accentDim, 0.055);

    // Cross-hatch diagonal lines (subtle depth)
    floorTexG.lineStyle(1, t.accentDim, 0.03);
    for (let d = -bounds.h; d < bounds.w; d += 80) {
      floorTexG.lineBetween(bounds.x + d, bounds.y, bounds.x + d + bounds.h, bounds.y + bounds.h);
      floorTexG.lineBetween(bounds.x + d + bounds.h, bounds.y, bounds.x + d, bounds.y + bounds.h);
    }

    // Scattered floor patches (light/dark ellipses for floor variation)
    _drawFloorPatches(floorTexG, this.arena, bounds, t.floorLight, t.floorDark, 22);

    // ── DEPTH 2: AO shadow bands (dark near walls, bright in center) ─────────
    // Validate innerRing before drawing AO bands
    const innerRingValid = innerRing.every(p => this.arena.containsPoint(p.x, p.y, 0));
    if (innerRingValid) {
      const aoG = this.add.graphics().setDepth(2);
      _drawAOBands(aoG, innerRing, t.wallShadow);
    }

    // ── DEPTH 2: Wall edge highlights ────────────────────────────────────────
    const edgeG = this.add.graphics().setDepth(2);

    // Outer wall bottom shadow — the wall's shadowed face
    edgeG.lineStyle(3, t.wallShadow, 0.7);
    edgeG.strokePoints(perimeter, true);

    // Inner wall top highlight — the lit top corner of the 3D wall ring
    edgeG.lineStyle(1.5, t.wallHighlight, 0.55);
    edgeG.strokePoints(innerRing, true);

    // Secondary inner edge — subtle depth crease
    const innerRing2 = _shrinkPts(perimeter, WALL_DEPTH - 6);
    edgeG.lineStyle(1, t.wallHighlight, 0.20);
    edgeG.strokePoints(innerRing2, true);

    // ── DEPTH 2: Floor details ────────────────────────────────────────────────
    const detailG = this.add.graphics().setDepth(2);

    // Enhanced center medallion at altar point
    const { x: cx, y: cy } = this.arena.altarPoint;
    _drawMedallion(detailG, cx, cy, t.accent, t.accentDim);

    // Theme-specific floor decorations (rune crosses, crystal shards, cracks, etc.)
    const themeIdx = _themeIndex(this.level);
    _drawThemeDetails(detailG, themeIdx, this.arena, bounds, t.accent, t.accentDim, 15);

    // Scatter diamonds (accent details at key positions)
    const scatter = [
      [bounds.x + 110, bounds.y + 90], [bounds.x + bounds.w - 110, bounds.y + 90],
      [bounds.x + 110, bounds.y + bounds.h - 90], [bounds.x + bounds.w - 110, bounds.y + bounds.h - 90],
      [cx - 230, cy], [cx + 230, cy],
      [cx, bounds.y + 80], [cx, bounds.y + bounds.h - 80],
    ];
    scatter.forEach(([dx, dy]) => {
      if (!this.arena.containsPoint(dx, dy, 30)) return;
      const s = 10;
      detailG.lineStyle(1.5, t.accent, 0.28);
      detailG.lineBetween(dx, dy - s, dx + s, dy);
      detailG.lineBetween(dx + s, dy, dx, dy + s);
      detailG.lineBetween(dx, dy + s, dx - s, dy);
      detailG.lineBetween(dx - s, dy, dx, dy - s);
      detailG.fillStyle(t.accent, 0.35);
      detailG.fillCircle(dx, dy, 2.5);
    });

    // ── DEPTH 3: Vignette — progressive darkening inward from inner wall edge ─
    const vigOffsets = [88, 64, 42, 24, 12];
    const vigAlphas  = [0.09, 0.09, 0.08, 0.07, 0.06];
    vigOffsets.forEach((d, i) => {
      const vg = this.add.graphics().setDepth(3);
      vg.fillStyle(0x000000, vigAlphas[i]);
      const inner = _shrinkPts(innerRing, d);
      _fillBetweenPolygons(vg, innerRing, inner);
    });

    // ── DEPTH 4: Ambient particles ───────────────────────────────────────────
    this._initParticles(t.particle);
    this.events.once('shutdown', () => this._cleanupParticles());
  }

  // ── Particle system ─────────────────────────────────────────────────────────

  _initParticles(color) {
    this._particles = [];
    this._particleUpdateFn = (time, delta) => {
      const dt = delta / 1000;
      for (const p of this._particles) {
        if (!p.g.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (!this.arena.containsPoint(p.x, p.y, 20)) {
          // Redirect toward altar instead of reflecting (avoids oscillation)
          const ax = this.arena.altarPoint.x - p.x;
          const ay = this.arena.altarPoint.y - p.y;
          const al = Math.hypot(ax, ay) || 1;
          p.vx = (ax / al) * p.speed;
          p.vy = (ay / al) * p.speed;
        }
        p.g.setPosition(p.x, p.y);
      }
    };

    const COUNT = 8;
    for (let i = 0; i < COUNT; i++) {
      // Find a valid random position inside the arena
      let px = this.arena.altarPoint.x, py = this.arena.altarPoint.y;
      for (let tries = 0; tries < 40; tries++) {
        const bnd = this.arena.shape.bounds;
        const tx = bnd.x + Math.random() * bnd.w;
        const ty = bnd.y + Math.random() * bnd.h;
        if (this.arena.containsPoint(tx, ty, 40)) { px = tx; py = ty; break; }
      }

      const r = 1.5 + Math.random() * 1.0;
      const speed = 10 + Math.random() * 15;
      const angle = Math.random() * Math.PI * 2;
      const g = this.add.graphics().setDepth(4);
      g.fillStyle(color, 0.7);
      g.fillCircle(0, 0, r);
      g.setPosition(px, py);

      // Alpha pulse tween
      this.tweens.add({
        targets: g,
        alpha: { from: 0.1, to: 0.5 },
        duration: 2000 + Math.random() * 1500,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 1000,
        ease: 'Sine.easeInOut',
      });

      this._particles.push({ g, x: px, y: py, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, speed });
    }

    this.events.on('update', this._particleUpdateFn);
  }

  _cleanupParticles() {
    if (this._particleUpdateFn) {
      this.events.off('update', this._particleUpdateFn);
      this._particleUpdateFn = null;
    }
    if (this._particles) {
      for (const p of this._particles) {
        if (p.g.active) p.g.destroy();
      }
      this._particles = [];
    }
  }

  // ── Obstacles ──────────────────────────────────────────────────────────────

  _spawnObstacles() {
    this.obstacles = this.arena.obstacles.map(d =>
      new Obstacle(this, d.x, d.y, d.type, d.tall)
    );
  }

  // ── Entities ───────────────────────────────────────────────────────────────

  _spawnPlayer() {
    const { x, y } = this.arena.spawnPoint;
    this.player = new Player(this, x, y, this.level, this.incomingHp);
  }

  _spawnAltar() {
    const { x, y } = this.arena.altarPoint;
    this.altar = new Altar(this, x, y);
    this.altar.onInteract = () => this._summonBoss();
  }

  _summonBoss() {
    if (this.bossAlive || this.boss) return;
    this.altar.destroy();
    this.altar = null;

    const bossKey = getRandomBossKey(this.level, this.defeatedBosses);

    // Find a valid spawn position within the arena
    let bx = this.player.x, by = this.player.y;
    for (let tries = 0; tries < 40; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(240, 420);
      const tx = this.player.x + Math.cos(angle) * dist;
      const ty = this.player.y + Math.sin(angle) * dist;
      const clearOfObstacles = !this.obstacles?.some(o =>
        Math.hypot(tx - o.x, ty - o.y) < o.baseRadius + 70
      );
      if (this.arena.containsPoint(tx, ty, 80) && clearOfObstacles) {
        bx = tx; by = ty; break;
      }
    }

    this.boss = createBoss(this, bossKey, bx, by, this.level);
    this.boss.bossKey = bossKey;
    this.boss.onDeath = () => this._onBossDeath();
    this.bossAlive = true;

    this.events.emit('bossSpawned', { name: this.boss.bossName, maxHp: this.boss.maxHp });
    this.boss.events.on('hpChanged', hp => this.events.emit('bossHpChanged', hp));
    this.cameras.main.shake(300, 0.0036);
  }

  _onBossDeath() {
    // Save death position before nulling the boss reference
    const deathX = this.boss?.x ?? this.arena.altarPoint.x;
    const deathY = this.boss?.y ?? this.arena.altarPoint.y;
    if (this.boss?.bossKey) this.defeatedBosses.push(this.boss.bossKey);
    this.bossAlive = false;
    this.boss = null;
    this.score += 100 + this.level * 50;
    this.events.emit('scoreChanged', this.score);
    this.events.emit('bossDefeated');
    this.cameras.main.shake(400, 0.0054);
    this.time.delayedCall(800, () => this._spawnPortal(deathX, deathY));
  }

  _spawnPortal(nearX, nearY) {
    // Try to place the portal close to where the boss died
    let px = nearX, py = nearY;
    for (let tries = 0; tries < 40; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(80, 260);
      const tx = nearX + Math.cos(angle) * dist;
      const ty = nearY + Math.sin(angle) * dist;
      if (this.arena.containsPoint(tx, ty, 60) &&
          Phaser.Math.Distance.Between(tx, ty, this.player.x, this.player.y) > 100) {
        px = tx; py = ty; break;
      }
    }
    this.portal = new Portal(this, px, py);
    this.portal.onEnter = () => this._nextLevel();
  }

  _nextLevel() {
    if (this.portal) { this.portal.destroy(); this.portal = null; }
    this.cameraController.destroy();
    this.scene.stop('UIScene');
    this.cameras.main.fadeOut(500, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('ArenaScene', {
        level: this.level + 1,
        score: this.score,
        playerHp: null,
        defeatedBosses: this.defeatedBosses,
      });
    });
  }

  _togglePause() {
    // Emit first so UIScene receives the event before the scene clock freezes
    const nowPaused = !this.scene.isPaused();
    this.events.emit('pauseToggled', nowPaused);
    if (nowPaused) {
      this.scene.pause();   // freezes time.now — cooldown timestamps cannot expire
    } else {
      this.scene.resume();
    }
  }

  playerDied() {
    this.paused = true;
    this.cameraController?.destroy();
    this.scene.stop('UIScene');
    this.cameras.main.fadeOut(600, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameOverScene', { score: this.score, level: this.level });
    });
  }

  onPlayerHitBoss(damage) {
    if (this.boss && this.bossAlive) this.boss.takeDamage(damage);
  }
}

// ── Geometry helpers ───────────────────────────────────────────────────────────

/** Inset (positive d) or expand (negative d) a polygon's points */
function _shrinkPts(pts, d) {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const nx1 = -(p.y - prev.y), ny1 = p.x - prev.x;
    const nx2 = -(next.y - p.y), ny2 = next.x - p.x;
    const len1 = Math.hypot(nx1, ny1) || 1;
    const len2 = Math.hypot(nx2, ny2) || 1;
    const nx = nx1 / len1 + nx2 / len2;
    const ny = ny1 / len1 + ny2 / len2;
    const len = Math.hypot(nx, ny) || 1;
    return { x: p.x + (nx / len) * d, y: p.y + (ny / len) * d };
  });
}

/**
 * Fill the border band between an outer polygon and its shrunken inner version.
 * Approximated by drawing individual trapezoids between each edge pair.
 */
function _fillBetweenPolygons(g, outer, inner) {
  const n = Math.min(outer.length, inner.length);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = outer[i], b = outer[j];
    const c = inner[j], d = inner[i];
    g.fillTriangle(a.x, a.y, b.x, b.y, d.x, d.y);
    g.fillTriangle(b.x, b.y, c.x, c.y, d.x, d.y);
  }
}

// ── Arena art helpers ──────────────────────────────────────────────────────────

/** Returns 0-4 theme index based on level bracket */
function _themeIndex(level) {
  if (level <= 5)  return 0;
  if (level <= 10) return 1;
  if (level <= 15) return 2;
  if (level <= 20) return 3;
  return 4;
}

/**
 * Stroke concentric atmosphere rings from the world center outward.
 * Creates an "abyss" impression in the void surrounding the arena.
 */
function _drawVoidRings(g, cx, cy, maxR, color, count = 7, alpha = 0.06) {
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const r = maxR * (0.15 + t * 0.70);
    g.lineStyle(1, color, alpha * (1 - t * 0.6));
    g.strokeCircle(cx, cy, r);
  }
}

/**
 * Draw staggered brick mortar lines (cobblestone / flagstone look).
 * Odd rows are offset by half a brick width for a masonry pattern.
 */
function _drawBrickTexture(g, bounds, brickW = 48, brickH = 32, lineColor, alpha = 0.06) {
  g.lineStyle(1, lineColor, alpha);
  // Horizontal mortar lines
  for (let y = bounds.y; y <= bounds.y + bounds.h; y += brickH) {
    g.lineBetween(bounds.x, y, bounds.x + bounds.w, y);
  }
  // Vertical mortar lines — staggered per row
  let row = 0;
  for (let y = bounds.y; y <= bounds.y + bounds.h; y += brickH) {
    const offset = (row % 2 === 0) ? 0 : brickW * 0.5;
    for (let x = bounds.x - brickW + offset; x <= bounds.x + bounds.w; x += brickW) {
      g.lineBetween(x, y, x, y + brickH);
    }
    row++;
  }
}

/**
 * Scatter small random ellipse patches on the floor for surface variation.
 * Alternates between lightColor and darkColor, validated against the arena boundary.
 */
function _drawFloorPatches(g, arena, bounds, lightColor, darkColor, count = 22) {
  for (let i = 0; i < count; i++) {
    // Random position within bounds
    const px = bounds.x + Math.random() * bounds.w;
    const py = bounds.y + Math.random() * bounds.h;
    if (!arena.containsPoint(px, py, 30)) continue;

    const color = (i % 2 === 0) ? lightColor : darkColor;
    const alpha = 0.10 + Math.random() * 0.04;
    const rx = 18 + Math.random() * 32;
    const ry = 10 + Math.random() * 18;
    const angle = Math.random() * Math.PI;
    g.fillStyle(color, alpha);
    // Approximate rotated ellipse with a filled ellipse (rotation not supported natively,
    // so we use multiple overlapping circles for a hand-worn appearance)
    g.fillEllipse(px, py, rx * 2, ry * 2);
  }
}

/**
 * Draw 5 ambient-occlusion shadow bands inward from the innerRing wall edge.
 * Darkens the floor near the walls to give a recessed shadow feel on the floor.
 */
function _drawAOBands(g, innerRing, shadowColor) {
  // Each band is a 6px slice on the FLOOR side (inside innerRing, toward center)
  // offset=0 means right at the wall edge; higher = further into the floor
  const bandW = 8;
  const alphas = [0.16, 0.12, 0.09, 0.06, 0.04];
  for (let i = 0; i < alphas.length; i++) {
    const outer = _shrinkPts(innerRing, i * bandW);           // floor side, near wall
    const inner = _shrinkPts(innerRing, (i + 1) * bandW);    // floor side, further in
    g.fillStyle(shadowColor, alphas[i]);
    _fillBetweenPolygons(g, outer, inner);
  }
}

/**
 * Draw an enhanced center medallion — decorative compass rose / ritual circle.
 * Rings, spokes, and diamond tips create an ancient stone etching feel.
 */
function _drawMedallion(g, cx, cy, accent, accentDim) {
  // Outer rings
  g.lineStyle(2, accent, 0.22); g.strokeCircle(cx, cy, 110);
  g.lineStyle(1, accent, 0.18); g.strokeCircle(cx, cy, 82);
  g.lineStyle(1, accentDim, 0.15); g.strokeCircle(cx, cy, 58);

  // Center fill dot
  g.fillStyle(accent, 0.16); g.fillCircle(cx, cy, 34);
  g.fillStyle(accent, 0.35); g.fillCircle(cx, cy, 10);

  // 8 spokes from r=42 to r=100
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cos = Math.cos(a), sin = Math.sin(a);
    g.lineStyle(1, accent, 0.14);
    g.lineBetween(cx + cos * 42, cy + sin * 42, cx + cos * 100, cy + sin * 100);
  }

  // Diamond tips at r=108 on cardinal directions
  [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5].forEach(a => {
    const cos = Math.cos(a), sin = Math.sin(a);
    const bx = cx + cos * 108, by = cy + sin * 108;
    const rx = Math.cos(a + Math.PI * 0.5), ry = Math.sin(a + Math.PI * 0.5);
    const s = 8;
    g.lineStyle(1.5, accent, 0.28);
    g.lineBetween(bx - rx * s, by - ry * s, bx + cos * s, by + sin * s);
    g.lineBetween(bx + cos * s, by + sin * s, bx + rx * s, by + ry * s);
    g.lineBetween(bx + rx * s, by + ry * s, bx - cos * s, by - sin * s);
    g.lineBetween(bx - cos * s, by - sin * s, bx - rx * s, by - ry * s);
  });
}

/**
 * Scatter count theme-specific floor decorations at random valid arena positions.
 */
function _drawThemeDetails(g, themeIdx, arena, bounds, accent, accentDim, count = 15) {
  let drawn = 0, attempts = 0;
  while (drawn < count && attempts < count * 6) {
    attempts++;
    const px = bounds.x + Math.random() * bounds.w;
    const py = bounds.y + Math.random() * bounds.h;
    if (!arena.containsPoint(px, py, 30)) continue;
    const a = 0.18 + Math.random() * 0.14;
    const color = (Math.random() < 0.6) ? accent : accentDim;
    switch (themeIdx) {
      case 0: _drawRuneCross(g, px, py, color, a);      break; // Green Fields
      case 1: _drawCrystalShard(g, px, py, color, a);  break; // Crystal Caves
      case 2: _drawLavaCrack(g, px, py, color, a);     break; // Volcanic Depths
      case 3: _drawStarCluster(g, px, py, color, a);   break; // Celestial Void
      case 4: _drawSpiralFragment(g, px, py, color, a);break; // Chaos Realm
    }
    drawn++;
  }
}

/** Theme 0 — rune cross with serif nubs (ancient stone carving) */
function _drawRuneCross(g, x, y, color, alpha) {
  const arm = 9, nub = 3;
  g.lineStyle(1.5, color, alpha);
  g.lineBetween(x - arm, y, x + arm, y);
  g.lineBetween(x, y - arm, x, y + arm);
  // Serif nubs at each arm tip
  [[-arm, 0], [arm, 0], [0, -arm], [0, arm]].forEach(([dx, dy]) => {
    const perp = dy === 0 ? [0, nub] : [nub, 0];
    g.lineBetween(x + dx - perp[0], y + dy - perp[1],
                  x + dx + perp[0], y + dy + perp[1]);
  });
}

/** Theme 1 — crystal shard: a rotated filled diamond */
function _drawCrystalShard(g, x, y, color, alpha) {
  const h = 10 + Math.random() * 6, w = 4 + Math.random() * 3;
  const ang = Math.random() * Math.PI;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const pts = [
    { x: x + cos * (-h), y: y + sin * (-h) },
    { x: x + (-sin) * w, y: y + cos * w     },
    { x: x + cos * h,    y: y + sin * h     },
    { x: x + sin * w,    y: y + (-cos) * w  },
  ];
  g.fillStyle(color, alpha * 0.5);
  g.fillPoints(pts, true);
  g.lineStyle(1, color, alpha);
  g.strokePoints(pts, true);
}

/** Theme 2 — lava crack: 3-segment jagged fissure */
function _drawLavaCrack(g, x, y, color, alpha) {
  const len = 14 + Math.random() * 10;
  const ang = Math.random() * Math.PI;
  // Glow pass
  g.lineStyle(5, color, alpha * 0.25);
  const pts = [];
  for (let i = 0; i <= 3; i++) {
    const t = i / 3;
    const jx = (i > 0 && i < 3) ? (Math.random() - 0.5) * 6 : 0;
    const jy = (i > 0 && i < 3) ? (Math.random() - 0.5) * 6 : 0;
    pts.push({
      x: x + Math.cos(ang) * (len * t - len * 0.5) + jx,
      y: y + Math.sin(ang) * (len * t - len * 0.5) + jy,
    });
  }
  g.strokePoints(pts, false);
  // Seam pass
  g.lineStyle(1.5, color, alpha);
  g.strokePoints(pts, false);
}

/** Theme 3 — star cluster: 3 small dots in a triangle */
function _drawStarCluster(g, x, y, color, alpha) {
  const spread = 8;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const sx = x + Math.cos(a) * spread, sy = y + Math.sin(a) * spread;
    const r = 1.5 + Math.random() * 1.5;
    g.fillStyle(color, alpha);
    g.fillCircle(sx, sy, r);
    // Small glow ring
    g.lineStyle(1, color, alpha * 0.4);
    g.strokeCircle(sx, sy, r + 2);
  }
}

/** Theme 4 — spiral fragment: 6-segment arc suggesting a broken spiral */
function _drawSpiralFragment(g, x, y, color, alpha) {
  const segs = 6;
  const startR = 4, endR = 12;
  const startA = Math.random() * Math.PI * 2;
  const sweep = Math.PI * 0.75;
  g.lineStyle(1.5, color, alpha);
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = startA + t * sweep;
    const r = startR + (endR - startR) * t;
    pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r });
  }
  g.strokePoints(pts, false);
  // Ghost outer pass for glow feel
  g.lineStyle(3, color, alpha * 0.2);
  g.strokePoints(pts, false);
}
