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
    this._spawnFoliage();
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

    const vigGs = []; // vignette removed — caused visible line artifacts at arena edge

    // ── Bake all static layers into one RenderTexture ───────────────────────
    // Phaser Graphics replay all draw commands every render frame. Baking into
    // a RenderTexture converts static content to a cached GPU texture:
    // 1 draw call per frame instead of 14, and 0 stencil passes instead of 2.
    //
    // Clear geometry masks before stamping — the RT bakes final pixel output
    // so masks are no longer needed once content is composited into the RT.
    // floorTexG and dropG share the same floorMask; clearMask(true) on the
    // first call destroys the mask object, clearMask(false) on the second just
    // removes the now-dead reference safely.
    floorTexG.clearMask(true);   // destroys floorMask
    dropG.clearMask(false);      // floorMask already gone; just clears reference

    const arenaRT = this.add.renderTexture(0, 0, worldW, worldH);
    arenaRT.setDepth(0).setOrigin(0, 0);

    // Stamp in logical depth order — each draw composites on top of the previous
    arenaRT.draw(voidG);
    arenaRT.draw(floorG);
    arenaRT.draw(floorTexG);
    arenaRT.draw(dropG);
    arenaRT.draw(wallFrontG);
    arenaRT.draw(wallCapG);
    arenaRT.draw(detailG);
    for (const vg of vigGs) arenaRT.draw(vg);

    // Destroy all live Graphics — the RT now holds their rendered output
    voidG.destroy();
    floorG.destroy();
    floorTexG.destroy();
    dropG.destroy();
    wallFrontG.destroy();
    wallCapG.destroy();
    detailG.destroy();
    for (const vg of vigGs) vg.destroy();
    maskG.destroy();   // source Graphics used to create the geometry mask

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

  // ── Foliage ────────────────────────────────────────────────────────────────
  // Decorative-only plants — no collision, no obstacle system.
  //
  // PERFORMANCE DESIGN:
  //   Ground cover: all drawn once into a single RenderTexture → 0 tweens,
  //   1 GPU draw call per frame instead of 73 Graphics + 73 repeat:-1 tweens.
  //   Mid-size props: ≤14 individual Graphics, Y-sorted, no tweens.
  //   Total before: 98 Graphics + 98 perpetual tweens.
  //   Total after:  1 RT + 14 Graphics + 0 tweens.

  _spawnFoliage() {
    const t        = this.theme;
    const themeIdx = _themeIndex(this.level);
    const perimeter = this.arena.shape.getPerimeterPolygon();
    const bounds    = this.arena.shape.bounds;
    const { worldW, worldH } = this.arena;

    // ── Ground cover — all baked into one RenderTexture ────────────────────
    const edgeCover  = _sampleEdgePositions(perimeter, this.arena, 55, 50, 140);
    const floorCover = _sampleFloorPositions(this.arena, bounds, 18);

    const rt = this.add.renderTexture(0, 0, worldW, worldH);
    rt.setDepth(5.5).setOrigin(0, 0);

    for (const { x, y } of [...edgeCover, ...floorCover]) {
      const tmpG = this.add.graphics();
      tmpG.setPosition(x, y);
      tmpG.setScale(0.65 + Math.random() * 0.70);
      _drawGroundCover(tmpG, themeIdx, t);
      rt.draw(tmpG);   // stamp into the cached texture
      tmpG.destroy();  // no live Graphics object remains
    }

    // ── Mid-size props — Y-sorted, static (no tweens) ──────────────────────
    // Depth offset -8: sort boundary sits 8 px above prop centre;
    // every prop has an extended shadow fill that covers the player's
    // foot zone while the player is "behind" the prop.
    const edgeProps  = _sampleEdgePositions(perimeter, this.arena, 10, 55, 135);
    const floorProps = _sampleFloorPositions(this.arena, bounds, 4);

    for (const { x, y } of [...edgeProps, ...floorProps]) {
      const g = this.add.graphics();
      g.setPosition(x, y).setDepth(y - 8);
      g.setScale(0.75 + Math.random() * 0.55);
      _drawMidProp(g, themeIdx, t);
      // No tween — static props are indistinguishable at game speed and
      // eliminate the last of the per-frame JS overhead for foliage.
    }
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

// ── Foliage placement helpers ──────────────────────────────────────────────

/**
 * Sample `count` positions near the arena perimeter using a cluster-based
 * walk: groups of 2–5 plants in a short arc, separated by random gaps,
 * producing organic uneven distribution instead of regular spacing.
 */
function _sampleEdgePositions(perimeter, arena, count, minInset, maxInset) {
  const N = perimeter.length;
  let cx = 0, cy = 0;
  for (const p of perimeter) { cx += p.x; cy += p.y; }
  cx /= N; cy /= N;

  const positions = [];
  // Random starting vertex so each arena looks different
  let i = Math.floor(Math.random() * N);
  let safety = 0;

  while (positions.length < count && safety++ < count * 30) {
    // Cluster: 2–5 plants in a short perimeter arc
    const cSize  = 2 + Math.floor(Math.random() * 4);
    const arcLen = 3 + Math.floor(Math.random() * 11); // perimeter vertices in this cluster's arc
    // Cluster shares a base inset distance (with per-plant spread)
    const cInset = minInset + Math.random() * (maxInset - minInset);

    for (let c = 0; c < cSize && positions.length < count; c++) {
      const pi  = (i + Math.floor(Math.random() * arcLen)) % N;
      const p   = perimeter[pi];
      const dx  = cx - p.x, dy = cy - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const inset  = Math.max(minInset * 0.45, cInset + (Math.random() - 0.5) * 38);
      const perpX  = -dy / len, perpY = dx / len;
      const jitter = (Math.random() - 0.5) * 26;
      const x = p.x + (dx / len) * inset + perpX * jitter;
      const y = p.y + (dy / len) * inset + perpY * jitter;
      if (arena.containsPoint(x, y, 8)) positions.push({ x, y });
    }

    // Random gap between clusters — 8–22 % of perimeter
    const gap = Math.floor(N * (0.08 + Math.random() * 0.14));
    i = (i + arcLen + gap) % N;
  }

  return positions;
}

/**
 * Sample `count` positions scattered across the arena interior, well
 * inside the perimeter and clear of the altar/spawn areas.
 */
function _sampleFloorPositions(arena, bounds, count) {
  const { altarPoint, spawnPoint } = arena;
  const positions = [];
  let attempts = 0;
  while (positions.length < count && attempts < count * 16) {
    attempts++;
    const x = bounds.x + Math.random() * bounds.w;
    const y = bounds.y + Math.random() * bounds.h;
    if (!arena.containsPoint(x, y, 80)) continue;
    if (Math.hypot(x - altarPoint.x, y - altarPoint.y) < 130) continue;
    if (Math.hypot(x - spawnPoint.x, y - spawnPoint.y)  < 130) continue;
    positions.push({ x, y });
  }
  return positions;
}

// ── Ground cover drawing ───────────────────────────────────────────────────

function _drawGroundCover(g, themeIdx, t) {
  const v = Math.floor(Math.random() * 3);
  switch (themeIdx) {
    case 0: _gcGreenFields(g, t, v);   break;
    case 1: _gcCrystalCaves(g, t, v); break;
    case 2: _gcVolcanic(g, t, v);     break;
    case 3: _gcCelestial(g, t, v);    break;
    case 4: _gcChaos(g, t, v);        break;
  }
}

// Theme 0 — Green Fields
function _gcGreenFields(g, t, v) {
  if (v === 0) {
    // Grass tuft — layered blades with shadow underlay + colour variation
    const blades = 5 + Math.floor(Math.random() * 4);
    const spread = 0.88;
    // Shadow layer — slightly behind and offset, dark green
    for (let i = 0; i < blades; i++) {
      const ang = -Math.PI / 2 - spread / 2 + spread * (i / (blades - 1)) + 0.06;
      const len = 7 + Math.random() * 5;
      const bend = (Math.random() - 0.5) * 0.28;
      g.lineStyle(2.8, 0x1e4008, 0.42);
      g.lineBetween(0, 2, Math.cos(ang + bend) * len, Math.sin(ang + bend) * len);
    }
    // Base ground patch
    g.fillStyle(0x2e5a10, 0.38);
    g.fillEllipse(0, 2, 12, 6);
    // Main blades — three alternating colours
    const cols = [0x9de060, 0x7ec850, 0x5aaa38];
    for (let i = 0; i < blades; i++) {
      const ang = -Math.PI / 2 - spread / 2 + spread * (i / (blades - 1));
      const len = 9 + Math.random() * 8;
      const bend = (Math.random() - 0.5) * 0.32;
      const midX = Math.cos(ang + bend * 0.5) * len * 0.55;
      const midY = Math.sin(ang + bend * 0.5) * len * 0.55;
      const tipX = Math.cos(ang + bend) * len;
      const tipY = Math.sin(ang + bend) * len;
      g.lineStyle(1.8, cols[i % 3], 0.88);
      g.lineBetween(0, 0, midX, midY);
      g.lineBetween(midX, midY, tipX, tipY);
      // Lighter highlight streak on every other blade
      if (i % 2 === 0) {
        g.lineStyle(0.8, 0xc4f07c, 0.52);
        g.lineBetween(midX, midY, tipX, tipY);
      }
    }
  } else if (v === 1) {
    // Wildflower cluster — stems with leaf pairs + petals
    const count = 2 + Math.floor(Math.random() * 3);
    const petColors = [0xff88aa, 0xffffaa, 0xff6677, 0xddaaff, 0xff99cc];
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 16;
      const oy = (Math.random() - 0.5) * 8;
      const sh = 9 + Math.random() * 9;
      // Shadow stem
      g.lineStyle(2, 0x1e3a08, 0.32);
      g.lineBetween(ox + 1, oy + 2, ox + 1, oy - sh + 1);
      // Stem
      g.lineStyle(1.2, 0x4a8820, 0.88);
      g.lineBetween(ox, oy, ox, oy - sh);
      // Leaf pair at mid-stem
      const lmy = oy - sh * 0.52;
      const la  = (Math.random() - 0.5) * 0.5;
      g.fillStyle(0x4a8820, 0.62);
      g.fillEllipse(ox + Math.cos(la) * 5, lmy + Math.sin(la) * 2, 8, 3.5);
      g.fillEllipse(ox - Math.cos(la) * 5, lmy - Math.sin(la) * 2, 6.5, 3);
      // Petals
      const fc     = petColors[i % petColors.length];
      const petals = 5 + Math.floor(Math.random() * 2);
      for (let j = 0; j < petals; j++) {
        const pa = (j / petals) * Math.PI * 2;
        g.fillStyle(fc, 0.82);
        g.fillEllipse(ox + Math.cos(pa) * 3.5, oy - sh + Math.sin(pa) * 3.5, 5.5, 3.2);
      }
      // Centre
      g.fillStyle(0xffee44, 0.95);
      g.fillCircle(ox, oy - sh, 2.2);
      g.fillStyle(0xffaa00, 0.6);
      g.fillCircle(ox - 0.5, oy - sh - 0.5, 1);
    }
  } else {
    // Moss / clover patch — layered organic blobs with micro highlights
    g.fillStyle(0x243d10, 0.40);
    g.fillEllipse(1, 2, 28, 15);
    g.fillStyle(0x3d6b24, 0.55);
    g.fillEllipse(-3, -1, 22, 11);
    g.fillStyle(0x4e8030, 0.52);
    g.fillEllipse(4, -2, 15, 8);
    g.fillStyle(0x5aaa38, 0.58);
    g.fillEllipse(-5, -3, 11, 7);
    g.fillStyle(0x3d6b24, 0.45);
    g.fillEllipse(6, -4, 9, 5);
    // Clover-dot ring
    for (let i = 0; i < 6; i++) {
      const la = (i / 6) * Math.PI * 2;
      g.fillStyle(0x7ec850, 0.68);
      g.fillCircle(Math.cos(la) * 8 - 1, Math.sin(la) * 4 - 1, 1.8 + Math.random() * 0.9);
    }
    // Micro highlights
    for (let i = 0; i < 5; i++) {
      g.fillStyle(0xaae060, 0.32);
      g.fillCircle((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, 1.1 + Math.random() * 0.6);
    }
  }
}

// Theme 1 — Crystal Caves
function _gcCrystalCaves(g, t, v) {
  if (v === 0) {
    // Tiny crystal cluster — 3-5 miniature shards
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 18;
      const oy = (Math.random() - 0.5) * 8;
      const h  = 5 + Math.random() * 8;
      const w  = 2 + Math.random() * 2.5;
      const tilt = (Math.random() - 0.5) * 0.4;
      g.fillStyle(t.accent, 0.75);
      g.fillPoints([{ x: ox - w, y: oy }, { x: ox + w, y: oy },
                    { x: ox + Math.sin(tilt) * h, y: oy - h }], true);
      g.lineStyle(0.8, t.wallHighlight, 0.5);
      g.strokePoints([{ x: ox - w, y: oy }, { x: ox + w, y: oy },
                      { x: ox + Math.sin(tilt) * h, y: oy - h }], true);
    }
  } else if (v === 1) {
    // Glowing mushroom cluster
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 16;
      const oy = (Math.random() - 0.5) * 6;
      const sh = 7 + Math.random() * 6;
      const cr = 4 + Math.random() * 4;
      g.lineStyle(1.5, t.wallInner, 0.9);
      g.lineBetween(ox, oy, ox, oy - sh);
      g.fillStyle(t.accentDim, 0.85);
      g.fillEllipse(ox, oy - sh - cr * 0.3, cr * 2.4, cr * 1.3);
      g.fillStyle(t.accent, 0.4);
      g.fillEllipse(ox - cr * 0.2, oy - sh - cr * 0.5, cr * 1.4, cr * 0.7);
      g.fillStyle(t.wallHighlight, 0.7);
      g.fillCircle(ox - cr * 0.25, oy - sh - cr * 0.4, 1.5);
    }
  } else {
    // Crystal dust — scattered tiny diamonds on floor
    g.fillStyle(t.accent, 0.25);
    g.fillEllipse(0, 0, 20, 10);
    const count = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const dx = (Math.random() - 0.5) * 16;
      const dy = (Math.random() - 0.5) * 8;
      const s  = 1.5 + Math.random() * 2;
      g.fillStyle(t.wallHighlight, 0.55 + Math.random() * 0.35);
      g.fillTriangle(dx, dy - s, dx + s * 0.65, dy + s * 0.4, dx - s * 0.65, dy + s * 0.4);
    }
  }
}

// Theme 2 — Volcanic
function _gcVolcanic(g, t, v) {
  if (v === 0) {
    // Ash patch with dark pebbles
    g.fillStyle(0x555555, 0.18);
    g.fillEllipse(0, 0, 24, 13);
    g.fillStyle(0x333333, 0.12);
    g.fillEllipse(-3, 2, 14, 7);
    for (let i = 0; i < 6; i++) {
      g.fillStyle(0x2a1a10, 0.7);
      g.fillCircle((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10, 1.2 + Math.random() * 1.5);
    }
  } else if (v === 1) {
    // Ember cluster — small glowing coals
    const count = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 18;
      const oy = (Math.random() - 0.5) * 10;
      const r  = 1.5 + Math.random() * 2.5;
      g.fillStyle(0xff4400, 0.22);
      g.fillCircle(ox, oy, r * 2.2);
      g.fillStyle(0xff6600, 0.6);
      g.fillCircle(ox, oy, r);
      g.fillStyle(0xffaa44, 0.9);
      g.fillCircle(ox, oy, r * 0.45);
    }
  } else {
    // Scorched debris — charred branch sticks with ember tips
    for (let i = 0; i < 3; i++) {
      const ox  = (Math.random() - 0.5) * 14;
      const oy  = (Math.random() - 0.5) * 8;
      const ang = Math.random() * Math.PI;
      const len = 8 + Math.random() * 10;
      const ex  = ox + Math.cos(ang) * len / 2;
      const ey  = oy + Math.sin(ang) * len / 2;
      g.lineStyle(2, 0x1a0a00, 0.9);
      g.lineBetween(ox - Math.cos(ang) * len / 2, oy - Math.sin(ang) * len / 2, ex, ey);
      g.fillStyle(0xff4400, 0.55);
      g.fillCircle(ex, ey, 2);
    }
  }
}

// Theme 3 — Celestial
function _gcCelestial(g, t, v) {
  if (v === 0) {
    // Stardust — scattered tiny bright specks
    const count = 8 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 22;
      const oy = (Math.random() - 0.5) * 12;
      const r  = 0.8 + Math.random() * 1.4;
      g.fillStyle(t.wallHighlight, 0.4 + Math.random() * 0.5);
      g.fillCircle(ox, oy, r);
      if (Math.random() < 0.35) {
        g.fillStyle(t.wallHighlight, 0.16);
        g.fillCircle(ox, oy, r * 2.5);
      }
    }
  } else if (v === 1) {
    // Cosmic rune — small glowing inscription circle
    g.lineStyle(1, t.accent, 0.5);
    g.strokeCircle(0, 0, 9);
    g.lineStyle(0.8, t.accent, 0.28);
    g.strokeCircle(0, 0, 6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.lineStyle(1, t.accent, 0.42);
      g.lineBetween(Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a) * 8, Math.sin(a) * 8);
    }
    g.fillStyle(t.accent, 0.3);
    g.fillCircle(0, 0, 2.5);
  } else {
    // Void pebbles — dark stones with star-shimmer
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 16;
      const oy = (Math.random() - 0.5) * 8;
      const r  = 2.5 + Math.random() * 2.5;
      g.fillStyle(t.wallInner, 0.9);
      g.fillCircle(ox, oy, r);
      g.lineStyle(0.8, t.accentDim, 0.55);
      g.strokeCircle(ox, oy, r);
      g.fillStyle(t.wallHighlight, 0.7);
      g.fillCircle(ox - r * 0.3, oy - r * 0.35, 0.9);
    }
  }
}

// Theme 4 — Chaos
function _gcChaos(g, t, v) {
  if (v === 0) {
    // Reality crack — jagged fissure with void glow
    const len = 14 + Math.random() * 12;
    const ang = Math.random() * Math.PI;
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const f  = i / 5;
      const jx = i > 0 && i < 5 ? (Math.random() - 0.5) * 5 : 0;
      const jy = i > 0 && i < 5 ? (Math.random() - 0.5) * 3 : 0;
      pts.push({ x: Math.cos(ang) * (len * f - len / 2) + jx,
                 y: Math.sin(ang) * (len * f - len / 2) + jy });
    }
    g.lineStyle(4, t.accent, 0.14);  g.strokePoints(pts, false);
    g.lineStyle(1.5, t.accent, 0.7); g.strokePoints(pts, false);
    g.lineStyle(0.8, 0xffffff, 0.45); g.strokePoints(pts, false);
  } else if (v === 1) {
    // Void shard cluster — angular glassy fragments
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const ox = (Math.random() - 0.5) * 16;
      const oy = (Math.random() - 0.5) * 10;
      const a  = Math.random() * Math.PI * 2;
      const s  = 3 + Math.random() * 4;
      const pts = [
        { x: ox + Math.cos(a)       * s, y: oy + Math.sin(a)       * s },
        { x: ox + Math.cos(a + 2.2) * s, y: oy + Math.sin(a + 2.2) * s },
        { x: ox + Math.cos(a + 4.0) * s * 0.8, y: oy + Math.sin(a + 4.0) * s * 0.8 },
      ];
      g.fillStyle(t.wallInner, 0.8);
      g.fillPoints(pts, true);
      g.lineStyle(0.8, t.accent, 0.6);
      g.strokePoints(pts, true);
    }
  } else {
    // Distortion ripple — concentric broken ellipses
    for (let i = 0; i < 3; i++) {
      const r = 5 + i * 5;
      g.lineStyle(0.8, t.accent, 0.22 - i * 0.06);
      g.strokeEllipse(0, 0, r * 2.2, r * 1.1);
    }
    g.fillStyle(t.accentDim, 0.2);
    g.fillEllipse(0, 0, 10, 5);
  }
}

// ── Mid-size prop drawing ──────────────────────────────────────────────────

function _drawMidProp(g, themeIdx, t) {
  const v = Math.floor(Math.random() * 2);
  switch (themeIdx) {
    case 0: _mpGreenFields(g, t, v);   break;
    case 1: _mpCrystalCaves(g, t, v); break;
    case 2: _mpVolcanic(g, t, v);     break;
    case 3: _mpCelestial(g, t, v);    break;
    case 4: _mpChaos(g, t, v);        break;
  }
}

// Theme 0 — Green Fields mid-size
function _mpGreenFields(g, t, v) {
  if (v === 0) {
    // Round layered bush
    // Extended occluder shadow — faint, covers player foot zone (y+24)
    g.fillStyle(0x000000, 0.13);
    g.fillEllipse(3, 14, 56, 24);
    // Visual shadow
    g.fillStyle(0x000000, 0.26);
    g.fillEllipse(4, 6, 48, 13);
    // Dark base layer
    g.fillStyle(0x1a4010, 1);
    g.fillCircle(-6, -4, 16);  g.fillCircle(7, -6, 18);  g.fillCircle(0, -10, 14);
    // Mid layer
    g.fillStyle(0x2e6820, 1);
    g.fillCircle(-5, -8, 12);  g.fillCircle(6, -10, 14);
    // Accent layer
    g.fillStyle(0x4a9030, 1);
    g.fillCircle(-2, -13, 9);  g.fillCircle(8, -14, 7);
    // Highlight layer
    g.fillStyle(0x52aa3e, 0.74);
    g.fillCircle(4, -13, 9);
    g.fillStyle(0x7ec850, 0.44);
    g.fillCircle(2, -16, 5);
    // Berries
    const berryC = [0xee3322, 0xff5544, 0xcc2211];
    for (let i = 0; i < 6; i++) {
      const bx = (Math.random() - 0.5) * 24;
      const by = -4 - Math.random() * 14;
      g.fillStyle(berryC[i % 3], 0.80);
      g.fillCircle(bx, by, 1.8 + Math.random() * 0.8);
      g.fillStyle(0xffffff, 0.38);
      g.fillCircle(bx - 0.7, by - 0.7, 0.65);
    }
    // Top leaf specular
    g.fillStyle(0xa0e060, 0.28);
    g.fillEllipse(-3, -17, 8, 4);
  } else {
    // Tall fern — arcing fronds with shadow underlay
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(2, 14, 44, 24);
    g.fillStyle(0x000000, 0.20);
    g.fillEllipse(3, 4, 36, 10);
    const fronds = 6 + Math.floor(Math.random() * 3);
    for (let i = 0; i < fronds; i++) {
      const t2  = i / (fronds - 1);
      const ang = -Math.PI / 2 - Math.PI / 3 + t2 * (Math.PI * 2 / 3);
      const len = 18 + Math.random() * 14;
      const bend = 0.22 + Math.random() * 0.18;
      const ctrlX = Math.cos(ang + bend * 0.4) * len * 0.5;
      const ctrlY = Math.sin(ang + bend * 0.4) * len * 0.5;
      const tipX  = Math.cos(ang + bend) * len;
      const tipY  = Math.sin(ang + bend) * len;
      // Shadow stroke
      g.lineStyle(2.5, 0x1a3a08, 0.38);
      g.lineBetween(1, 1, ctrlX + 1, ctrlY + 1);
      g.lineBetween(ctrlX + 1, ctrlY + 1, tipX + 1, tipY + 1);
      // Main frond
      g.lineStyle(1.8, 0x2a6010, 0.92);
      g.lineBetween(0, 0, ctrlX, ctrlY);
      g.lineBetween(ctrlX, ctrlY, tipX, tipY);
      // Leaflets with alternating colour
      const leafCount = 3 + Math.floor(len / 7);
      for (let j = 1; j < leafCount; j++) {
        const f  = j / leafCount;
        const lx = ctrlX * (1 - f) + tipX * f;
        const ly = ctrlY * (1 - f) + tipY * f;
        const lr = (1 - f) * 5.5 + 1.5;
        const la = ang + Math.PI * 0.45 * (j % 2 === 0 ? 1 : -1);
        g.fillStyle(j % 2 === 0 ? 0x3a8020 : 0x4a9428, 0.80);
        g.fillEllipse(lx + Math.cos(la) * lr, ly + Math.sin(la) * lr, lr * 2.2, lr * 0.85);
      }
    }
  }
}

// Theme 1 — Crystal Caves mid-size
function _mpCrystalCaves(g, t, v) {
  if (v === 0) {
    // Crystal spire formation — dark base rock + multiple angled shards
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(3, 15, 54, 24);
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(4, 6, 50, 15);
    g.fillStyle(t.wallInner, 1);
    g.fillEllipse(0, 2, 42, 18);
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(4, 3, 28, 12);
    const shards = [
      { ox: 0,   h: 32, tilt: 0,     c: t.accent      },
      { ox: -9,  h: 22, tilt: -0.22, c: t.accentDim   },
      { ox: 10,  h: 26, tilt: 0.2,   c: t.accent      },
      { ox: -18, h: 15, tilt: -0.4,  c: t.accentDim   },
      { ox: 17,  h: 18, tilt: 0.35,  c: t.wallHighlight},
    ];
    shards.forEach(({ ox, h, tilt, c }) => {
      const w   = 4 + Math.random() * 3;
      const tipX = ox + Math.sin(tilt) * h;
      const tipY = -(h - Math.abs(Math.sin(tilt)) * 4);
      const pts  = [{ x: ox - w, y: 0 }, { x: ox + w, y: 0 },
                    { x: tipX + w * 0.3, y: tipY }, { x: tipX - w * 0.3, y: tipY }];
      g.fillStyle(c, 0.82);
      g.fillPoints(pts, true);
      g.lineStyle(1, t.wallHighlight, 0.38);
      g.strokePoints(pts, true);
      g.fillStyle(0xffffff, 0.5);
      g.fillCircle(tipX, tipY, 1.8);
    });
  } else {
    // Bioluminescent mushroom — large glowing cap on tapered stem
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(2, 14, 48, 24);
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(3, 5, 44, 13);
    g.fillStyle(t.wallInner, 1);
    g.fillRoundedRect(-5, -28, 10, 28, 5 * 0.5);
    g.fillStyle(t.accentDim, 0.6);
    for (let i = 0; i < 4; i++) {
      g.fillCircle((Math.random() - 0.5) * 6, -28 * (0.2 + Math.random() * 0.65), 1.5 + Math.random());
    }
    g.fillStyle(t.accentDim, 1);
    g.fillEllipse(0, -28, 36, 20);
    g.fillStyle(t.accent, 0.6);
    g.fillEllipse(-3, -31, 24, 14);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI;
      g.fillStyle(t.wallHighlight, 0.72);
      g.fillCircle(Math.cos(a) * 11, -28 + Math.sin(a) * 4 + 3, 2);
    }
    g.lineStyle(1.5, t.wallInner, 0.65);
    g.strokeEllipse(0, -28, 36, 20);
  }
}

// Theme 2 — Volcanic mid-size
function _mpVolcanic(g, t, v) {
  if (v === 0) {
    // Charred dead tree — angular blackened limbs with ember tips
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(3, 14, 46, 24);
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(4, 5, 42, 12);
    g.lineStyle(6, 0x1a0800, 1);  g.lineBetween(0, 0, -2, -22);
    g.lineStyle(4, 0x260e04, 1);  g.lineBetween(-2, -22, 12, -36);
    g.lineStyle(4, 0x260e04, 1);  g.lineBetween(-2, -22, -14, -32);
    g.lineStyle(3, 0x1a0800, 1);  g.lineBetween(12, -36, 18, -44);
    g.lineStyle(2, 0x1a0800, 1);  g.lineBetween(12, -36, 22, -30);
    g.lineStyle(0.8, 0x0f0400, 0.6);
    g.lineBetween(-1, -5, 1, -18); g.lineBetween(-2, -10, -4, -20);
    [[18, -44], [22, -30], [-14, -32]].forEach(([ex, ey]) => {
      g.fillStyle(0xff4400, 0.28); g.fillCircle(ex, ey, 5);
      g.fillStyle(0xff8800, 0.7);  g.fillCircle(ex, ey, 2.5);
      g.fillStyle(0xffcc44, 0.9);  g.fillCircle(ex, ey, 1.2);
    });
  } else {
    // Sulfur crystal formation — obsidian rock with angular yellow-orange shards
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(3, 15, 50, 24);
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(4, 6, 46, 14);
    const basePts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 16 + (i % 2) * 4;
      basePts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.5 + 2 });
    }
    g.fillStyle(0x0e0806, 1);
    g.fillPoints(basePts, true);
    g.lineStyle(1.5, 0x1a1008, 0.8);
    g.strokePoints(basePts, true);
    [{ ox: -5, h: 24, c: 0xcc8800 }, { ox: 8, h: 18, c: 0xffaa00 },
     { ox: 0,  h: 28, c: 0xdd9900 }, { ox: -14, h: 14, c: 0xbb7700 },
     { ox: 14, h: 16, c: 0xffbb22 }].forEach(({ ox, h, c }) => {
      const w = 4 + Math.random() * 3;
      const tilt = (Math.random() - 0.5) * 0.3;
      g.fillStyle(c, 0.85);
      g.fillPoints([{ x: ox - w, y: 0 }, { x: ox + w, y: 0 },
                    { x: ox + Math.sin(tilt) * h, y: -h }], true);
      g.lineStyle(0.8, 0xffcc44, 0.28);
      g.strokePoints([{ x: ox - w, y: 0 }, { x: ox + w, y: 0 },
                      { x: ox + Math.sin(tilt) * h, y: -h }], true);
    });
  }
}

// Theme 3 — Celestial mid-size
function _mpCelestial(g, t, v) {
  if (v === 0) {
    // Ancient obelisk fragment — tapered stone with gold inlay
    const pw = 12, ph = 40;
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(3, 14, 36, 24);
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(4, 6, 32, 10);
    const body = [{ x: -pw / 2, y: 0 }, { x: pw / 2, y: 0 },
                  { x: pw / 2 - 2, y: -ph }, { x: -pw / 2 + 2, y: -ph }];
    g.fillStyle(t.wallInner, 1);
    g.fillPoints(body, true);
    g.fillStyle(0x000000, 0.55);
    g.fillRect(pw * 0.1, -ph, pw * 0.4, ph);
    // Gold bands + rune marks
    g.lineStyle(1, t.accentDim, 0.55);
    g.lineBetween(-pw / 2, -ph * 0.25, pw / 2 - 2, -ph * 0.25);
    g.lineBetween(-pw / 2, -ph * 0.6,  pw / 2 - 2, -ph * 0.6);
    g.lineStyle(0.8, t.accent, 0.4);
    g.lineBetween(-pw * 0.25, -ph * 0.35, pw * 0.25, -ph * 0.35);
    g.lineBetween(-pw * 0.1,  -ph * 0.45, pw * 0.1,  -ph * 0.45);
    // Gold capstone
    g.fillStyle(t.accentDim, 0.8);
    g.fillTriangle(-pw / 2 + 2, -ph, pw / 2 - 2, -ph, 0, -ph - 10);
    g.lineStyle(1.5, t.wallShadow, 0.7);
    g.strokePoints(body, true);
  } else {
    // Cosmic orb on a carved stone pedestal
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(3, 14, 40, 24);
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(4, 6, 36, 11);
    g.fillStyle(t.wallInner, 1);
    g.fillRoundedRect(-12, -10, 24, 10, 3);
    g.lineStyle(1, t.wallShadow, 0.65);
    g.strokeRoundedRect(-12, -10, 24, 10, 3);
    const or = 14;
    g.fillStyle(t.floor, 0.95);
    g.fillCircle(0, -10 - or, or);
    g.fillStyle(t.accent, 0.1);
    g.fillCircle(0, -10 - or, or);
    g.lineStyle(1, t.accent, 0.22);
    g.strokeCircle(0, -10 - or, or);
    g.lineStyle(0.8, t.accentDim, 0.18);
    g.strokeCircle(0, -10 - or, or * 0.7);
    g.fillStyle(t.wallHighlight, 0.38);
    g.fillCircle(-or * 0.3, -10 - or - or * 0.3, or * 0.22);
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(-or * 0.32, -10 - or - or * 0.32, or * 0.1);
    for (let i = 0; i < 5; i++) {
      const sa = Math.random() * Math.PI * 2;
      const sd = Math.random() * or * 0.65;
      g.fillStyle(t.wallHighlight, 0.7);
      g.fillCircle(Math.cos(sa) * sd, -10 - or + Math.sin(sa) * sd, 0.9 + Math.random() * 0.8);
    }
  }
}

// Theme 4 — Chaos mid-size
function _mpChaos(g, t, v) {
  if (v === 0) {
    // Chaos crystal — irregular fractured body with glowing internal cracks
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(3, 14, 48, 24);
    g.fillStyle(0x000000, 0.35);
    g.fillEllipse(4, 6, 44, 13);
    const body = [
      { x: 0, y: -36 }, { x: 14, y: -24 }, { x: 18, y: -10 },
      { x: 10, y: 2 },  { x: -8, y: 4 },   { x: -18, y: -8 },
      { x: -12, y: -26}, { x: -4, y: -34 },
    ];
    g.fillStyle(t.wallInner, 1);
    g.fillPoints(body, true);
    g.lineStyle(1.5, t.accent, 0.65);
    g.lineBetween(0, -36, 6, -18); g.lineBetween(6, -18, 12, -4);
    g.lineBetween(-12, -26, -4, -12); g.lineBetween(-4, -12, 6, -18);
    g.fillStyle(t.accent, 0.07);
    g.fillPoints(body, true);
    g.lineStyle(1.5, t.wallShadow, 0.8);
    g.strokePoints(body, true);
    g.lineStyle(0.8, 0xffffff, 0.32);
    g.lineBetween(-4, -34, 14, -24); g.lineBetween(-12, -26, -18, -8);
  } else {
    // Reality fragment — flat angular slab with chaos veining
    // Extended occluder shadow (reaches y+25)
    g.fillStyle(0x000000, 0.11);
    g.fillEllipse(3, 15, 44, 24);
    g.fillStyle(0x000000, 0.3);
    g.fillEllipse(4, 8, 40, 12);
    const frag = [
      { x: -16, y: -6 }, { x: 12, y: -18 }, { x: 20, y: -4 },
      { x: 6, y: 8 },    { x: -14, y: 4 },
    ];
    g.fillStyle(t.wallInner, 1);
    g.fillPoints(frag, true);
    g.fillStyle(t.accent, 0.06);
    g.fillPoints(frag, true);
    g.lineStyle(1.5, t.accent, 0.48);
    g.strokePoints(frag, true);
    g.lineStyle(0.8, t.accentDim, 0.32);
    g.lineBetween(-10, -4, 14, -14);
    g.lineBetween(-8,  2,  10, -8);
    g.lineBetween(-4,  6,  18, 0);
    g.fillStyle(t.wallHighlight, 0.52);
    [frag[0], frag[1], frag[2]].forEach(({ x, y }) => g.fillCircle(x, y, 1.5));
  }
}
