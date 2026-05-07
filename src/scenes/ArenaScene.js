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

    // ── Void background (entire world, slightly darker than floor) ──
    const void_ = this.add.graphics();
    void_.fillStyle(Phaser.Display.Color.ValueToColor(t.bg).darken(20).color, 1);
    void_.fillRect(0, 0, worldW, worldH);
    void_.setDepth(0);

    // ── Floor — single polygon fill ──
    const g = this.add.graphics();
    g.setDepth(1);
    g.fillStyle(t.floor, 1);
    g.fillPoints(perimeter, true);

    // ── Tile grid + cross-hatch, clipped to the polygon via a GeometryMask ──
    // (so grid lines never bleed into void areas regardless of arena shape)
    const gridG = this.add.graphics();
    gridG.setDepth(1);
    gridG.lineStyle(1, t.accent, 0.07);
    for (let x = bounds.x; x < bounds.x + bounds.w; x += 48) {
      gridG.lineBetween(x, bounds.y, x, bounds.y + bounds.h);
    }
    for (let y = bounds.y; y < bounds.y + bounds.h; y += 48) {
      gridG.lineBetween(bounds.x, y, bounds.x + bounds.w, y);
    }
    gridG.lineStyle(1, t.accent, 0.04);
    for (let d = -bounds.h; d < bounds.w; d += 72) {
      gridG.lineBetween(bounds.x + d, bounds.y, bounds.x + d + bounds.h, bounds.y + bounds.h);
      gridG.lineBetween(bounds.x + d + bounds.h, bounds.y, bounds.x + d, bounds.y + bounds.h);
    }
    const maskG = this.make.graphics({ add: false });
    maskG.fillStyle(0xffffff, 1);
    maskG.fillPoints(perimeter, true);
    gridG.setMask(maskG.createGeometryMask());

    // ── Walls — thick outer stroke + accent inner ring ──
    g.lineStyle(8, t.wall, 1);
    g.strokePoints(perimeter, true);
    const innerRing = _shrinkPts(perimeter, 10);
    g.lineStyle(2, t.accent, 0.4);
    g.strokePoints(innerRing, true);

    // ── Center medallion (at altar) ──
    const { x: cx, y: cy } = this.arena.altarPoint;
    g.lineStyle(2, t.accent, 0.22);
    g.strokeCircle(cx, cy, 90);
    g.lineStyle(1, t.accent, 0.14);
    g.strokeCircle(cx, cy, 54);
    g.lineStyle(1.5, t.accent, 0.18);
    g.lineBetween(cx - 100, cy, cx + 100, cy);
    g.lineBetween(cx, cy - 100, cx, cy + 100);
    g.lineStyle(1, t.accent, 0.1);
    const diagLen = 66;
    g.lineBetween(cx - diagLen, cy - diagLen, cx + diagLen, cy + diagLen);
    g.lineBetween(cx + diagLen, cy - diagLen, cx - diagLen, cy + diagLen);

    // ── Scatter diamonds ──
    g.lineStyle(1.5, t.accent, 0.3);
    const scatter = [
      [bounds.x + 110, bounds.y + 90], [bounds.x + bounds.w - 110, bounds.y + 90],
      [bounds.x + 110, bounds.y + bounds.h - 90], [bounds.x + bounds.w - 110, bounds.y + bounds.h - 90],
      [cx - 230, cy], [cx + 230, cy],
      [cx, bounds.y + 80], [cx, bounds.y + bounds.h - 80],
    ];
    scatter.forEach(([dx, dy]) => {
      if (!this.arena.containsPoint(dx, dy, 10)) return;
      const s = 10;
      g.lineBetween(dx, dy - s, dx + s, dy);
      g.lineBetween(dx + s, dy, dx, dy + s);
      g.lineBetween(dx, dy + s, dx - s, dy);
      g.lineBetween(dx - s, dy, dx, dy - s);
      g.fillStyle(t.accent, 0.35);
      g.fillCircle(dx, dy, 2.5);
    });

    // ── Vignette — progressive darkening inward from perimeter ──
    const vigLayers = [
      { depth: 88, alpha: 0.09 },
      { depth: 64, alpha: 0.09 },
      { depth: 42, alpha: 0.08 },
      { depth: 24, alpha: 0.07 },
      { depth: 12, alpha: 0.06 },
    ];
    vigLayers.forEach(({ depth: d, alpha }) => {
      const vg = this.add.graphics();
      vg.setDepth(3);
      vg.fillStyle(0x000000, alpha);
      const inner = _shrinkPts(perimeter, d);
      _fillBetweenPolygons(vg, perimeter, inner);
    });
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
