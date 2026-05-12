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
    const themeIdx = _themeIndex(this.level);

    // ── DEPTH 0: Void background ─────────────────────────────────────────────
    const voidG = this.add.graphics().setDepth(0);
    voidG.fillStyle(Phaser.Display.Color.ValueToColor(t.bg).darken(20).color, 1);
    voidG.fillRect(0, 0, worldW, worldH);

    // Theme-specific void background art
    _drawThemedVoid(voidG, themeIdx, worldW, worldH, bounds, t);

    // Island underside glow — soft colored halo beneath the floating arena
    const glowCx = worldW * 0.5, glowCy = worldH * 0.5;
    voidG.fillStyle(t.particle, 0.06);
    voidG.fillEllipse(glowCx, glowCy + bounds.h * 0.35, bounds.w * 0.85, bounds.h * 0.25);
    voidG.fillStyle(t.particle, 0.035);
    voidG.fillEllipse(glowCx, glowCy + bounds.h * 0.42, bounds.w * 1.1, bounds.h * 0.32);

    // Outer wall halo — soft glow on the void side of the wall
    voidG.lineStyle(6, t.wallHighlight, 0.08);
    voidG.strokePoints(perimeter, true);

    // ── DEPTH 1: Floor (filled all the way to perimeter — no top-down ring) ──
    const floorG = this.add.graphics().setDepth(1);
    floorG.fillStyle(t.floor, 1);
    floorG.fillPoints(perimeter, true);

    // ── DEPTH 1: Floor texture (brick mortar + cross-hatch + patches) ────────
    // All floor-content graphics share ONE geometry mask (one stencil texture).
    const maskG = this.make.graphics({ add: false });
    maskG.fillStyle(0xffffff, 1);
    maskG.fillPoints(perimeter, true);
    const floorMask = maskG.createGeometryMask();

    const floorTexG = this.add.graphics().setDepth(1);
    floorTexG.setMask(floorMask);

    _drawBrickTexture(floorTexG, bounds, 48, 32, t.accentDim, 0.055);

    floorTexG.lineStyle(1, t.accentDim, 0.03);
    for (let d = -bounds.h; d < bounds.w; d += 80) {
      floorTexG.lineBetween(bounds.x + d, bounds.y, bounds.x + d + bounds.h, bounds.y + bounds.h);
      floorTexG.lineBetween(bounds.x + d + bounds.h, bounds.y, bounds.x + d, bounds.y + bounds.h);
    }

    _drawFloorPatches(floorTexG, this.arena, bounds, t.floorLight, t.floorDark, 22);

    // ── DEPTH 2: Drop shadow — wall casting onto floor, north-facing only ────
    const dropG = this.add.graphics().setDepth(2);
    dropG.setMask(floorMask);
    _drawWallDropShadow(dropG, perimeter, ARENA.WALL_SHADOW_DEPTH);

    // ── DEPTH 3 & 4: Wall front faces + top caps (the 2.5D wall geometry) ────
    const wallFrontG = this.add.graphics().setDepth(3);
    const wallCapG = this.add.graphics().setDepth(4);
    _drawWallFrontFaces(wallFrontG, wallCapG, perimeter, t,
      ARENA.WALL_HEIGHT, ARENA.WALL_THICKNESS);

    // ── DEPTH 5: Floor details ────────────────────────────────────────────────
    const detailG = this.add.graphics().setDepth(5);

    const { x: cx, y: cy } = this.arena.altarPoint;
    _drawMedallion(detailG, cx, cy, t.accent, t.accentDim);

    _drawThemeDetails(detailG, themeIdx, this.arena, bounds, t.accent, t.accentDim, 15);

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

    // ── DEPTH 6: Vignette — progressive darkening inward from perimeter ──────
    const vigOffsets = [88, 64, 42, 24, 12];
    const vigAlphas  = [0.09, 0.09, 0.08, 0.07, 0.06];
    vigOffsets.forEach((d, i) => {
      const vg = this.add.graphics().setDepth(6);
      vg.fillStyle(0x000000, vigAlphas[i]);
      const inner = _shrinkPts(perimeter, d);
      _fillBetweenPolygons(vg, perimeter, inner);
    });

    // ── DEPTH 7: Ambient particles ───────────────────────────────────────────
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
      const g = this.add.graphics().setDepth(7);
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
      new Obstacle(this, d.x, d.y, d.type, d.tall, d.themeIdx ?? 0)
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
  g.lineStyle(3, color, alpha * 0.2);
  g.strokePoints(pts, false);
}

// ── 2.5D wall geometry helpers ────────────────────────────────────────────────

/**
 * Per-edge "facing factor": how much this edge's outward face points NORTH
 * (toward the camera-tilted-forward direction). 1 = pure north, 0 = E/W or south.
 *
 * Polygon convention here: CCW with interior-on-right (Y-down screen coords).
 * For an edge from A to B with direction (dx, dy), the OUTWARD normal is (dy, -dx).
 * North-facing means outward.y < 0, i.e. -dx < 0, i.e. dx > 0.
 */
function _facingFactor(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ny = -dx / len;             // outward-normal Y component
  return Math.max(0, -ny);          // 1 pure north → 0 E/W or south
}

/**
 * Two-pass wall geometry for the faked 2.5D look:
 *
 *   1. Front face — vertical cliff side, drawn ONLY on north-facing edges.
 *      Extruded UP in screen Y by `WALL_HEIGHT * facingFactor`. Stone-block
 *      texture for visible depth on the cliff.
 *
 *   2. Top cap — visible "thickness of the wall from above", drawn on EVERY
 *      edge (including south). The cap is a band extruded OUTWARD from the
 *      perimeter by THICKNESS pixels (perpendicular to each edge, into the
 *      void), then ALSO lifted UP in screen Y by `WALL_HEIGHT * facingFactor`
 *      so north walls appear elevated above the floor while south walls sit
 *      right at floor level. This gives the "wall around the entire arena"
 *      illusion with camera-tilt asymmetry baked in via the lift.
 *
 * Because the cap is drawn at depth 4 (above floor and front face), the wall
 * reads as a continuous ring around the arena from any viewpoint, with the
 * THICK part at the top of the wall (the cap), not at the bottom.
 */
function _drawWallFrontFaces(frontG, capG, perimeter, theme, WALL_HEIGHT, THICKNESS) {
  const N = perimeter.length;

  // Per-edge outward unit normal (CCW polygon, inside-on-right, Y-down)
  const outwardEdge = new Array(N);
  const facing = new Array(N);
  for (let i = 0; i < N; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % N];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    outwardEdge[i] = { x: dy / len, y: -dx / len };
    facing[i] = Math.max(0, -outwardEdge[i].y);
  }

  // Per-vertex outward direction (average of the two adjacent edges' normals)
  // and per-vertex lift (how high to push the cap up in screen Y).
  const vOutward = new Array(N);
  const vLift    = new Array(N);
  for (let i = 0; i < N; i++) {
    const prev = outwardEdge[(i - 1 + N) % N];
    const curr = outwardEdge[i];
    const x = prev.x + curr.x, y = prev.y + curr.y;
    const len = Math.hypot(x, y) || 1;
    vOutward[i] = { x: x / len, y: y / len };
    vLift[i]    = WALL_HEIGHT * Math.max(facing[(i - 1 + N) % N], facing[i]);
  }

  // Per-vertex exterior height — south-facing weight for the floating island cliff.
  // Uses min(prev, curr) instead of max so the cliff bottom starts at ZERO at the
  // E/W→south transition vertex, then ramps up smoothly — preventing the abrupt
  // "stepping edge" that max produces at the first south-facing vertex.
  // (For north faces max is correct because the gap risk is at convex top corners;
  //  for south faces the exposed risk is at the bottom corner where the face begins.)
  const vExtH = new Array(N);
  for (let i = 0; i < N; i++) {
    const extPrev = Math.max(0, outwardEdge[(i - 1 + N) % N].y);
    const extCurr = Math.max(0, outwardEdge[i].y);
    vExtH[i] = WALL_HEIGHT * Math.min(extPrev, extCurr);
  }

  // ── Pass 1: Front faces (north-facing edges only) ─────────────────────────
  for (let i = 0; i < N; i++) {
    const fEdge = facing[i];
    if (fEdge < 0.05) continue;

    const a = perimeter[i], b = perimeter[(i + 1) % N];
    const la = vLift[i], lb = vLift[(i + 1) % N];
    const topA = { x: a.x, y: a.y - la };
    const topB = { x: b.x, y: b.y - lb };
    const quad = [a, b, topB, topA];

    // Base fill — cliff face stone color
    frontG.fillStyle(theme.wallInner, 1);
    frontG.fillPoints(quad, true);

    // Stone-block texture on the cliff
    _drawWallTextureOnQuad(frontG, quad, theme, fEdge, i, WALL_HEIGHT);

    // Bottom crease — dark line where wall meets floor
    frontG.lineStyle(1, theme.wallShadow, 0.7);
    frontG.lineBetween(a.x, a.y, b.x, b.y);
  }

  // ── Pass 1b: Exterior faces (south-facing — floating island cliff) ───────
  // The exterior cliff starts at the outer cap edge and extends downward into the void,
  // mirroring the interior north face. Drawn into the same frontG at depth 3 so the
  // cap at depth 4 naturally sits on top of it and hides the seam.
  for (let i = 0; i < N; i++) {
    const extFactor = outwardEdge[i].y;   // positive = outward points south = south-facing
    if (extFactor < 0.05) continue;

    const a = perimeter[i], b = perimeter[(i + 1) % N];
    const oA = vOutward[i], oB = vOutward[(i + 1) % N];
    const la = vLift[i], lb = vLift[(i + 1) % N];
    const hA = vExtH[i], hB = vExtH[(i + 1) % N];

    // Top of exterior face = outer cap edge (cap hides this seam at depth 4)
    const topA = { x: a.x + oA.x * THICKNESS, y: a.y - la + oA.y * THICKNESS };
    const topB = { x: b.x + oB.x * THICKNESS, y: b.y - lb + oB.y * THICKNESS };
    // Bottom = top dropped straight down by exterior height (no horizontal spread —
    // mirrors how the north face goes straight UP, keeping consistent geometry)
    const botA = { x: topA.x, y: topA.y + hA };
    const botB = { x: topB.x, y: topB.y + hB };

    // Base fill — cliff face stone color
    frontG.fillStyle(theme.wallInner, 1);
    frontG.fillPoints([topA, topB, botB, botA], true);

    // Stone-block texture on the exterior cliff
    _drawWallExtTextureOnQuad(frontG, topA, topB, botA, botB, theme, extFactor, i);

    // Bottom edge — dark shadow at the very base of the island
    frontG.lineStyle(2, theme.wallShadow, 0.85);
    frontG.lineBetween(botA.x, botA.y, botB.x, botB.y);

    // Top-edge crease (cap covers this at depth 4, but crease adds sharpness)
    frontG.lineStyle(1, theme.wallShadow, 0.50);
    frontG.lineBetween(topA.x, topA.y, topB.x, topB.y);
  }

  // ── Pass 2: Top caps (ALL edges — wall is continuous around perimeter) ────
  for (let i = 0; i < N; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % N];
    const oA = vOutward[i], oB = vOutward[(i + 1) % N];
    const la = vLift[i], lb = vLift[(i + 1) % N];

    // Inner edge of cap = top of front face on north edges, perimeter on south
    const inA = { x: a.x,                       y: a.y - la };
    const inB = { x: b.x,                       y: b.y - lb };
    // Outer edge of cap = inner edge pushed outward by THICKNESS
    const outA = { x: a.x + oA.x * THICKNESS,   y: a.y - la + oA.y * THICKNESS };
    const outB = { x: b.x + oB.x * THICKNESS,   y: b.y - lb + oB.y * THICKNESS };

    const capQuad = [inA, inB, outB, outA];

    // Cap fill — the brighter "top of wall" stone color
    capG.fillStyle(theme.wallTop, 1);
    capG.fillPoints(capQuad, true);

    // Subtle stone-block markers on the cap (small dark tick lines every ~46 px)
    const fE = facing[i];
    const edgeLen = Math.hypot(b.x - a.x, b.y - a.y);
    const TICK_SPACING = 46;
    const tickHash = ((i * 2654435761) >>> 0) / 0xffffffff;
    const startOff = tickHash * TICK_SPACING;
    capG.lineStyle(1, theme.wallShadow, 0.45);
    for (let s = startOff; s < edgeLen; s += TICK_SPACING) {
      const t = s / edgeLen;
      const innerPx = a.x + (b.x - a.x) * t;
      const innerPy = (a.y - la) + ((b.y - lb) - (a.y - la)) * t;
      const outerPx = innerPx + (oA.x + (oB.x - oA.x) * t) * THICKNESS;
      const outerPy = innerPy + (oA.y + (oB.y - oA.y) * t) * THICKNESS;
      capG.lineBetween(innerPx, innerPy, outerPx, outerPy);
    }

    // Outer-edge highlight — bright line on the lit (back) edge of the cap
    capG.lineStyle(2, theme.wallHighlight, 0.55 + 0.35 * fE);
    capG.lineBetween(outA.x, outA.y, outB.x, outB.y);

    // Inner-edge crease — dark line where cap transitions to front face / floor
    capG.lineStyle(1, theme.wallShadow, 0.65);
    capG.lineBetween(inA.x, inA.y, inB.x, inB.y);
  }
}

/**
 * Stone-block texture inside a wall front-face quad. Mortar joints (vertical),
 * horizontal courses, weathered block tints — all procedural, deterministic per
 * edge so re-renders don't flicker.
 */
function _drawWallTextureOnQuad(g, quad, theme, facingFactor, edgeIdx, WALL_HEIGHT) {
  const [a, b, topB, topA] = quad;

  // Edge axis (horizontal direction along the wall) and per-vertex top heights
  const edgeDx = b.x - a.x;
  const edgeDy = b.y - a.y;
  const edgeLen = Math.hypot(edgeDx, edgeDy) || 1;
  const ux = edgeDx / edgeLen, uy = edgeDy / edgeLen;          // unit along edge

  // ── Vertical mortar joints ────────────────────────────────────────────────
  // Position joints every ~46 px along the edge with a per-edge offset so
  // adjacent quads' joints don't visually align.
  const JOINT_SPACING = 46;
  const hash = ((edgeIdx * 2654435761) >>> 0) / 0xffffffff;    // [0, 1)
  const startOffset = hash * JOINT_SPACING;

  g.lineStyle(1, theme.wallShadow, 0.55);
  for (let s = startOffset; s < edgeLen; s += JOINT_SPACING) {
    const t = s / edgeLen;
    // Bottom point of joint along the floor edge
    const bx = a.x + edgeDx * t;
    const by = a.y + edgeDy * t;
    // Interpolated top height at this point along the edge
    const haTop = topA.y - a.y;
    const hbTop = topB.y - b.y;
    const tHeight = haTop + (hbTop - haTop) * t;
    g.lineBetween(bx, by, bx, by + tHeight);
  }

  // ── Horizontal courses — at 33% and 66% of wall height ────────────────────
  g.lineStyle(1, theme.wallShadow, 0.30);
  [0.33, 0.66].forEach(frac => {
    const cAx = a.x, cAy = a.y - (a.y - topA.y) * frac;
    const cBx = b.x, cBy = b.y - (b.y - topB.y) * frac;
    g.lineBetween(cAx, cAy, cBx, cBy);
  });

  // ── Random block weathering tints — sample 2–4 blocks and overlay ─────────
  const blocks = Math.floor(edgeLen / JOINT_SPACING);
  const tintCount = Math.min(4, Math.max(2, Math.floor(blocks * 0.4)));
  for (let k = 0; k < tintCount; k++) {
    const bhash = ((edgeIdx * 1009 + k * 7919) >>> 0) / 0xffffffff;
    const blockIdx = Math.floor(bhash * Math.max(1, blocks));
    const courseIdx = ((bhash * 100) | 0) % 3;                   // 0/1/2 → bottom/mid/top course

    const sStart = startOffset + blockIdx * JOINT_SPACING;
    const sEnd = sStart + JOINT_SPACING;
    if (sStart >= edgeLen) continue;

    const t1 = sStart / edgeLen;
    const t2 = Math.min(1, sEnd / edgeLen);
    const fracBot = courseIdx === 0 ? 0    : courseIdx === 1 ? 0.33 : 0.66;
    const fracTop = courseIdx === 0 ? 0.33 : courseIdx === 1 ? 0.66 : 1.0;

    const lerpY = (pt, top, frac) => pt.y - (pt.y - top.y) * frac;
    const p1 = { x: a.x + edgeDx * t1, y: lerpY(a, topA, fracBot) };
    const p2 = { x: a.x + edgeDx * t2, y: lerpY(a, topA, fracBot) };
    const p3 = { x: a.x + edgeDx * t2, y: lerpY(a, topA, fracTop) };
    const p4 = { x: a.x + edgeDx * t1, y: lerpY(a, topA, fracTop) };

    const lighter = (bhash > 0.5);
    const tintColor = lighter ? theme.wallHighlight : theme.wallShadow;
    g.fillStyle(tintColor, 0.08);
    g.fillPoints([p1, p2, p3, p4], true);
  }
}

/**
 * Stone-block texture for the EXTERIOR (south-facing) cliff face.
 * The face runs from topA/topB (at the cap outer edge) to botA/botB (cliff bottom).
 * Joints are vertical (top→bottom), courses are horizontal, and the bottom 20%
 * gets an extra dark AO overlay suggesting depth at the cliff base.
 */
function _drawWallExtTextureOnQuad(g, topA, topB, botA, botB, theme, extFactor, edgeIdx) {
  const edgeDx = topB.x - topA.x;
  const edgeDy = topB.y - topA.y;
  const edgeLen = Math.hypot(edgeDx, edgeDy) || 1;

  // ── Vertical mortar joints ────────────────────────────────────────────────
  const JOINT_SPACING = 46;
  const hash = ((edgeIdx * 2654435761) >>> 0) / 0xffffffff;
  const startOffset = hash * JOINT_SPACING;

  g.lineStyle(1, theme.wallShadow, 0.55);
  for (let s = startOffset; s < edgeLen; s += JOINT_SPACING) {
    const t = s / edgeLen;
    const tx = topA.x + edgeDx * t;
    const ty = topA.y + edgeDy * t;
    const bx = botA.x + (botB.x - botA.x) * t;
    const by = botA.y + (botB.y - botA.y) * t;
    g.lineBetween(tx, ty, bx, by);
  }

  // ── Horizontal courses at 33% and 66% of cliff height ────────────────────
  g.lineStyle(1, theme.wallShadow, 0.30);
  [0.33, 0.66].forEach(frac => {
    const cAx = topA.x + (botA.x - topA.x) * frac;
    const cAy = topA.y + (botA.y - topA.y) * frac;
    const cBx = topB.x + (botB.x - topB.x) * frac;
    const cBy = topB.y + (botB.y - topB.y) * frac;
    g.lineBetween(cAx, cAy, cBx, cBy);
  });

  // ── Bottom 20% ambient occlusion overlay — deep shadow at the cliff base ──
  const fracStart = 0.80;
  const shadA1 = { x: topA.x + (botA.x - topA.x) * fracStart, y: topA.y + (botA.y - topA.y) * fracStart };
  const shadB1 = { x: topB.x + (botB.x - topB.x) * fracStart, y: topB.y + (botB.y - topB.y) * fracStart };
  g.fillStyle(theme.wallShadow, 0.18);
  g.fillPoints([shadA1, shadB1, botB, botA], true);
}

/**
 * Drop-shadow band on the FLOOR side of each non-south edge — the wall casting
 * shade onto the floor toward the camera. Tapered by facingFactor so south
 * edges get nothing and pure-north edges get full opacity.
 */
function _drawWallDropShadow(g, perimeter, SHADOW_DEPTH) {
  const N = perimeter.length;
  for (let i = 0; i < N; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % N];
    const fEdge = _facingFactor(a, b);
    if (fEdge < 0.05) continue;

    const fA = Math.max(_facingFactor(perimeter[(i - 1 + N) % N], a), fEdge);
    const fB = Math.max(fEdge, _facingFactor(b, perimeter[(i + 2) % N]));

    const inA = { x: a.x, y: a.y + SHADOW_DEPTH * fA };
    const inB = { x: b.x, y: b.y + SHADOW_DEPTH * fB };

    g.fillStyle(0x000000, 0.35 * fEdge);
    g.fillPoints([a, b, inB, inA], true);
  }
}

/**
 * Theme-specific procedural art drawn in the void surrounding the arena.
 * Rendered at depth 0, on top of the solid void fill but below the arena floor
 * (depth 1), so the floor polygon covers it naturally. No masks needed.
 */
function _drawThemedVoid(g, themeIdx, worldW, worldH, bounds, t) {
  const cx = worldW * 0.5, cy = worldH * 0.5;
  const bx = bounds.x, by = bounds.y, bw = bounds.w, bh = bounds.h;

  switch (themeIdx) {
    case 0: { // Green Fields — layered distant hills + treeline
      const hillData = [
        { color: t.floorDark, alpha: 0.18, rScale: 0.70 },
        { color: t.accentDim, alpha: 0.12, rScale: 0.55 },
        { color: t.floorDark, alpha: 0.08, rScale: 0.45 },
      ];
      hillData.forEach(({ color, alpha, rScale }) => {
        const rx = worldW * rScale, ry = worldH * 0.22;
        g.fillStyle(color, alpha);
        g.fillEllipse(cx, by - ry * 0.4,         rx * 2,  ry * 2);   // top hills
        g.fillEllipse(bx - rx * 0.3, cy,          rx,      worldH * rScale * 1.3); // left
        g.fillEllipse(bx + bw + rx * 0.3, cy,     rx,      worldH * rScale * 1.3); // right
        g.fillEllipse(cx, by + bh + ry * 0.4,     rx * 2,  ry * 2);  // bottom hills
      });
      // Treeline silhouette along the top void
      g.fillStyle(t.floorDark, 0.22);
      for (let i = 0; i < 24; i++) {
        const tx = bx - 120 + (bw + 240) * (i / 23);
        const r  = 8 + Math.sin(i * 7.3) * 4;
        g.fillCircle(tx, by - 20 - Math.abs(Math.sin(i * 2.1)) * 28, r);
      }
      break;
    }

    case 1: { // Crystal Caves — stalactites from top + glow reflection pools
      // Glow pools at bottom void
      g.fillStyle(t.wallHighlight, 0.04);
      g.fillEllipse(cx - 200, by + bh + 80, 320, 80);
      g.fillEllipse(cx + 150, by + bh + 60, 260, 60);
      g.fillStyle(t.accent, 0.06);
      g.fillEllipse(cx, by + bh + 100, 400, 90);
      // Stalactite silhouettes
      g.fillStyle(t.wallInner, 0.35);
      const stCount = 22;
      for (let i = 0; i < stCount; i++) {
        const stx = bx - 80 + (bw + 160) * (i / (stCount - 1));
        const sth = 20 + Math.abs(Math.sin(i * 3.7)) * 60;
        const stw = 4  + Math.abs(Math.cos(i * 2.3)) * 8;
        g.fillTriangle(stx - stw, by - 8, stx + stw, by - 8, stx, by - 8 - sth);
      }
      // Crystal tip glows on every 3rd stalactite
      g.fillStyle(t.accent, 0.30);
      for (let i = 0; i < stCount; i += 3) {
        const stx = bx - 80 + (bw + 160) * (i / (stCount - 1));
        const sth = 20 + Math.abs(Math.sin(i * 3.7)) * 60;
        g.fillCircle(stx, by - 8 - sth, 2.5);
      }
      break;
    }

    case 2: { // Volcanic Depths — lava glow + magma rivers + embers
      g.fillStyle(0xff4400, 0.08);
      g.fillEllipse(cx, by + bh + 100, bw * 1.2, bh * 0.35);
      g.fillStyle(0xff6600, 0.05);
      g.fillEllipse(cx, by + bh + 80,  bw * 0.9, bh * 0.22);
      g.fillStyle(0xff3300, 0.05);
      g.fillEllipse(bx - 80,       cy + 60, 220, bh * 0.6);
      g.fillEllipse(bx + bw + 80,  cy + 60, 220, bh * 0.6);
      // Distant magma rivers
      g.lineStyle(2, 0xff6600, 0.14);
      g.lineBetween(bx - 200, by + bh * 0.6,  bx + bw * 0.4, by + bh + 160);
      g.lineBetween(bx + bw + 200, by + bh * 0.5, bx + bw * 0.7, by + bh + 140);
      g.lineStyle(1, 0xff4400, 0.10);
      g.lineBetween(bx - 150, by + bh * 0.8, bx + bw * 0.3, by + bh + 200);
      // Ember dots (skip those inside the arena bounding box)
      g.fillStyle(0xff8800, 0.5);
      for (let i = 0; i < 18; i++) {
        const ex = bx - 100 + (bw + 200) * ((i * 0.618) % 1);
        const ey = by - 50  + (bh + 200) * ((i * 0.382) % 1);
        if (ex > bx && ex < bx + bw && ey > by && ey < by + bh) continue;
        g.fillCircle(ex, ey, 1.5 + (i % 3) * 0.8);
      }
      break;
    }

    case 3: { // Celestial Void — starfield + nebula clouds + faint grid
      for (let i = 0; i < 140; i++) {
        const sx = worldW * ((i * 0.618033) % 1);
        const sy = worldH * ((i * 0.381966) % 1);
        if (sx > bx + 20 && sx < bx + bw - 20 && sy > by + 20 && sy < by + bh - 20) continue;
        const alpha = 0.20 + ((i * 97) % 100) / 100 * 0.60;
        const r     = 0.8  + ((i * 31) % 5)   * 0.30;
        g.fillStyle(t.wallHighlight, alpha);
        g.fillCircle(sx, sy, r);
      }
      // Nebula clouds
      g.fillStyle(t.accent, 0.04);
      g.fillEllipse(bx - 180, by - 100, 460, 220);
      g.fillStyle(t.accentDim, 0.06);
      g.fillEllipse(bx + bw + 100, cy - 60, 380, 200);
      g.fillStyle(t.accent, 0.03);
      g.fillEllipse(cx, by + bh + 120, 520, 180);
      // Faint star-chart grid
      g.lineStyle(1, t.accentDim, 0.04);
      for (let gx = 0; gx < worldW; gx += 160) g.lineBetween(gx, 0, gx, worldH);
      for (let gy = 0; gy < worldH; gy += 160) g.lineBetween(0, gy, worldW, gy);
      break;
    }

    case 4: { // Chaos Realm — void slashes + fractured ring fragments
      const slashes = [
        [bx - 200, by + bh * 0.2,    bx + bw * 0.30,  by - 80         ],
        [bx + bw + 150, by + bh * 0.3, bx + bw * 0.75, by - 60        ],
        [bx - 150, by + bh * 0.8,    bx + bw * 0.20,  by + bh + 120   ],
        [bx + bw + 180, by + bh * 0.7, bx + bw * 0.80, by + bh + 100  ],
        [bx - 100, cy,               bx + bw * 0.15,  by + bh * 0.35  ],
        [bx + bw + 130, cy - 40,     bx + bw * 0.85,  by + bh * 0.40  ],
      ];
      slashes.forEach(([x1, y1, x2, y2]) => {
        g.lineStyle(3, t.accent, 0.09);    g.lineBetween(x1, y1, x2, y2);
        g.lineStyle(1, t.wallHighlight, 0.18); g.lineBetween(x1, y1, x2, y2);
      });
      // Fractured arc fragments
      g.lineStyle(1, t.accentDim, 0.20);
      const frags = [
        [bx - 120,      by + 80,        90, 0.4, 1.8],
        [bx + bw + 100, by + 60,        70, 2.2, 3.5],
        [cx - 300,      by - 80,        60, 3.8, 5.1],
        [cx + 250,      by + bh + 70,   80, 1.0, 2.6],
        [bx - 80,       by + bh + 50,   55, 4.2, 5.8],
        [bx + bw + 60,  cy + 120,       65, 0.8, 2.0],
      ];
      frags.forEach(([fx, fy, fr, startA, endA]) => {
        const steps = Math.ceil((endA - startA) / 0.15);
        const pts = [];
        for (let s = 0; s <= steps; s++) {
          const a = startA + (endA - startA) * s / steps;
          pts.push({ x: fx + Math.cos(a) * fr, y: fy + Math.sin(a) * fr });
        }
        if (pts.length >= 2) g.strokePoints(pts, false);
      });
      break;
    }
  }
}
