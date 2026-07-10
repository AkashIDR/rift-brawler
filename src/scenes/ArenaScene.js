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
import { hexToRgba, shade } from '../entities/obstacleArt.js';

// Player container origin is the waist; feet are ~17px below it (22px canvas × 0.765 scale).
// Depth-sort uses this so the player occludes props it stands in front of.
const PLAYER_FOOT_OFFSET = 17;

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

    // Per-instance mid-size-prop textures (canvas-baked, one per prop) — tracked so they
    // can be freed on scene shutdown, mirroring Obstacle._texKeys/_removeTextures.
    this._midPropTexKeys = [];
    this.events.once('shutdown', () => this._removeMidPropTextures());

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
      // Y-depth sort by the player's FEET. The container origin is the waist (~17px above
      // the feet), so sorting by player.y alone makes the player render behind a prop whose
      // base it's standing in front of. Offsetting to the feet fixes the occlusion.
      const footDepth = this.player.y + PLAYER_FOOT_OFFSET;
      this.player.container.setDepth(footDepth);
      if (this.player.shadowG) this.player.shadowG.setDepth(footDepth - 1);
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

    // ── DEPTH 1: Floor — baked gradient texture (radial vignette + soft natural patches) ──
    // Canvas 2D clips to the polygon (clean AA edges, no Phaser stencil artifacts) and lays
    // down a real gradient for depth — Graphics can't gradient-fill. Baked once per arena.
    const floorKey = this._bakeFloorTexture(this.arena, t);
    const floorImg = this.add.image(bounds.x, bounds.y, floorKey).setOrigin(0, 0).setDepth(1);

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
    // No geometry masks in this pipeline — stencil masks produce per-segment
    // boundary artifacts when drawing to an RT. All content that needs clipping
    // uses arena.containsPoint() to self-validate instead.
    const arenaRT = this.add.renderTexture(0, 0, worldW, worldH);
    arenaRT.setDepth(0).setOrigin(0, 0);

    arenaRT.draw(voidG);
    arenaRT.draw(floorImg);
    arenaRT.draw(wallFrontG);
    arenaRT.draw(wallCapG);
    arenaRT.draw(detailG);
    for (const vg of vigGs) arenaRT.draw(vg);

    // Destroy all live Graphics — the RT now holds their rendered output
    voidG.destroy();
    floorImg.destroy();
    wallFrontG.destroy();
    wallCapG.destroy();
    detailG.destroy();
    for (const vg of vigGs) vg.destroy();

    // ── DEPTH 7: Ambient particles ───────────────────────────────────────────
    this._initParticles(t.particle);
    this.events.once('shutdown', () => this._cleanupParticles());
  }

  // ── Floor texture bake ───────────────────────────────────────────────────────
  // Canvas-baked gradient floor: trace the arena polygon → clip → flat base → radial
  // vignette (lit center, shadowed walls) → soft natural patches. Returns the texture key.
  // Themes are global to the Phaser TextureManager, so the key is freed + rebaked per level.
  _bakeFloorTexture(arena, theme) {
    const { shape } = arena;
    const bounds = shape.bounds;
    const perimeter = shape.getPerimeterPolygon();
    const w = Math.ceil(bounds.w), h = Math.ceil(bounds.h);
    const key = 'arena-floor';
    if (this.textures.exists(key)) this.textures.remove(key);
    const tex = this.textures.createCanvas(key, w, h);
    const ctx = tex.getContext();
    const ox = -bounds.x, oy = -bounds.y; // world → canvas-local

    // Clip to the arena polygon — clean AA edges, confines every fill to the floor shape.
    ctx.save();
    ctx.beginPath();
    perimeter.forEach((p, i) => {
      const px = p.x + ox, py = p.y + oy;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.clip();

    // Base flat floor.
    ctx.fillStyle = hexToRgba(theme.floor, 1);
    ctx.fillRect(0, 0, w, h);

    // Radial vignette — lit center fading to darker near the walls (overall depth).
    // Outer radius kept near half the arena (not the full diagonal) so the falloff is
    // visible across the play area, with a black ambient-occlusion edge for clear depth.
    const cx = w / 2, cy = h / 2, outer = 0.60 * Math.max(w, h);
    const vg = ctx.createRadialGradient(cx, cy, outer * 0.10, cx, cy, outer);
    vg.addColorStop(0,    hexToRgba(theme.floorLight, 0.35));
    vg.addColorStop(0.45, hexToRgba(theme.floor, 0));
    vg.addColorStop(0.80, hexToRgba(theme.floorDark, 0.60));
    vg.addColorStop(1,    'rgba(0,0,0,0.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Soft natural patches — each an irregular blob = a cluster of overlapping soft radial
    // lobes, vertically squashed (wider than tall) so it reads as lying on the ground plane.
    const patchCount = 16 + Math.floor(Math.random() * 12); // 16–28 (fewer, much larger)
    for (let i = 0; i < patchCount; i++) {
      const px = Math.random() * w, py = Math.random() * h;
      const isLight = (i % 2 === 0);
      const tone   = isLight ? theme.floorLight : theme.floorDark;
      // Light patches read a touch brighter than the dark ones.
      const baseA  = (0.16 + Math.random() * 0.20) * (isLight ? 1.3 : 1.0); // dark 0.16–0.36
      const baseR  = 200 + Math.random() * 300;         // 200–500 (broad terrain)
      const squash = 0.55 + Math.random() * 0.17;       // wider than tall
      const lobes  = 3 + Math.floor(Math.random() * 4); // 3–6
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, squash);
      for (let j = 0; j < lobes; j++) {
        const jx = (Math.random() - 0.5) * baseR;
        const jy = (Math.random() - 0.5) * baseR;
        const lr = baseR * (0.5 + Math.random() * 0.5);
        const la = baseA * (0.6 + Math.random() * 0.4);
        const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, lr);
        g.addColorStop(0, hexToRgba(tone, la));
        g.addColorStop(1, hexToRgba(tone, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(jx, jy, lr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    ctx.restore();
    tex.refresh();
    return key;
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

  _removeMidPropTextures() {
    if (!this._midPropTexKeys || !this._midPropTexKeys.length) return;
    for (const k of this._midPropTexKeys) {
      if (this.textures.exists(k)) this.textures.remove(k);
    }
    this._midPropTexKeys = [];
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

    // Shared neutral radial-falloff masks (petal / blob / highlight), baked once per
    // arena build and reused via setTint/setScale — gives ground cover real gradients
    // without any persistent per-item GameObjects: each mask Image is created, stamped
    // into the same shared RenderTexture, and destroyed within the scatter loop below,
    // exactly the way the floor texture's baked Image is stamped into arenaRT.
    const maskKeys = {
      petal:     _bakeSoftRadialMask(this, 'gc-petal-mask', 10),
      blob:      _bakeSoftRadialMask(this, 'gc-blob-mask', 16),
      highlight: _bakeSoftRadialMask(this, 'gc-highlight-mask', 6),
    };

    const rt = this.add.renderTexture(0, 0, worldW, worldH);
    rt.setDepth(5.5).setOrigin(0, 0);

    let gcIdx = 0;
    for (const { x, y } of [...edgeCover, ...floorCover]) {
      const salt0 = gcIdx * 1000;
      const hash  = (s) => _hashAt(x, y, salt0 + s);
      const tmpG = this.add.graphics();
      tmpG.setPosition(x, y);
      const scale = 0.65 + hash(1) * 0.70;
      tmpG.setScale(scale);
      const gradientDraws = _drawGroundCover(tmpG, themeIdx, t, hash, maskKeys);
      rt.draw(tmpG);   // stamp into the cached texture
      tmpG.destroy();  // no live Graphics object remains
      for (const gd of gradientDraws) {
        const img = this.add.image(x + gd.dx * scale, y + gd.dy * scale, gd.key)
          .setTint(gd.tint).setAlpha(gd.alpha ?? 1)
          .setScale((gd.scaleX ?? gd.scale ?? 1) * scale, (gd.scaleY ?? gd.scale ?? 1) * scale)
          .setRotation(gd.rotation ?? 0);
        rt.draw(img);
        img.destroy();  // no live Image object remains
      }
      gcIdx++;
    }

    // ── Mid-size props — Y-sorted, static (no tweens) ──────────────────────
    // Depth offset -8: sort boundary sits 8 px above prop centre;
    // every prop has an extended shadow fill that covers the player's
    // foot zone while the player is "behind" the prop.
    const edgeProps  = _sampleEdgePositions(perimeter, this.arena, 10, 55, 135);
    const floorProps = _sampleFloorPositions(this.arena, bounds, 4);

    let mpIdx = 0;
    for (const { x, y } of [...edgeProps, ...floorProps]) {
      const salt0 = mpIdx * 1000;
      const hash  = (s) => _hashAt(x, y, salt0 + s);
      const key = `mp-${themeIdx}-${Math.round(x)}-${Math.round(y)}`;
      const { originX, originY } = _bakeMidPropTexture(this, key, themeIdx, t, hash);
      this._midPropTexKeys.push(key);
      const scale = 0.75 + hash(1) * 0.55;
      this.add.image(x, y, key)
        .setOrigin(originX, originY)
        .setDepth(y - 8)
        .setScale(scale);
      // No tween, no live Graphics — static props are baked once (see _bakeMidPropTexture)
      // and displayed as a single Image, eliminating the per-frame vector-replay cost.
      mpIdx++;
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
    this.boss.events.on('enraged',   ()  => this.events.emit('bossEnraged'));
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
          Phaser.Math.Distance.Between(tx, ty, this.player.x, this.player.y) > 100 &&
          (!this.obstacles || this.obstacles.every(obs =>
            Phaser.Math.Distance.Between(tx, ty, obs.x, obs.y) > obs.baseRadius + 50))) {
        px = tx; py = ty; break;
      }
    }
    this.portal = new Portal(this, px, py);
    this.portal.onEnter = () => this._nextLevel();
  }

  _nextLevel() {
    // Hide player instantly — character vanishes as they step through the portal
    if (this.player) {
      this.player.container.setAlpha(0);
      if (this.player.shadowG)     this.player.shadowG.setAlpha(0);
      if (this.player.floatHPBg)   this.player.floatHPBg.setAlpha(0);
      if (this.player.floatHPFill) this.player.floatHPFill.setAlpha(0);
    }
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

// ── Ground-cover art helpers ────────────────────────────────────────────────
// Deterministic hash mirroring Obstacle._h(salt), so ground-cover art is stable across
// reloads of the same arena layout (scatter LAYOUT still comes from Math.random via
// _sampleFloorPositions/_sampleEdgePositions — that's an arena-generation concern, not
// a per-item-art one).
function _hashAt(x, y, salt) {
  const n = (Math.abs(Math.round(x) * 374761393
                     + Math.round(y) * 1274126177
                     + salt * 2654435761) >>> 0);
  return n / 0xffffffff;
}

// Point on a quadratic bezier at t (Phaser Graphics has no native curve command, so
// curved blades/stems are built by sampling this into a point array, then fillPoints()).
function _quadPoint(x0, y0, cx, cy, x1, y1, t) {
  const mt = 1 - t;
  return { x: mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
           y: mt * mt * y0 + 2 * mt * t * cy + t * t * y1 };
}

// Curved, tapered blade as a filled polygon: a straight base edge, one bezier-curved
// edge sampled out to the tip, and a straight return edge back to the base (closeShape).
function _bladePoints(bx, by, ctrlX, ctrlY, tipX, tipY, hw, ca, sa, segs) {
  const baseL = { x: bx - ca * hw, y: by - sa * hw };
  const baseR = { x: bx + ca * hw, y: by + sa * hw };
  const pts = [baseL];
  for (let i = 1; i <= segs; i++) {
    pts.push(_quadPoint(baseL.x, baseL.y, ctrlX, ctrlY, tipX, tipY, i / segs));
  }
  pts.push(baseR);
  return pts;
}

// Bakes ONE reusable neutral white radial-falloff mask (bright center -> transparent
// edge) at the given radius. Ground-cover glows/mounds/petals reuse this via
// setTint(color)/setAlpha/setScale/setRotation rather than baking per-color variants —
// avoids a combinatorial texture count across 5 themes x many glow colors. Guarded by
// textures.exists like _bakeFloorTexture, so it's safe to call once per arena build.
function _bakeSoftRadialMask(scene, key, radius) {
  if (scene.textures.exists(key)) return key;
  const d = radius * 2;
  const tex = scene.textures.createCanvas(key, d, d);
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(radius, radius, radius, 0, Math.PI * 2); ctx.fill();
  tex.refresh();
  return key;
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

function _drawGroundCover(g, themeIdx, t, hash, maskKeys) {
  const v = Math.floor(hash(0) * 3);
  switch (themeIdx) {
    case 0: return _gcGreenFields(g, t, v, hash, maskKeys);
    case 1: return _gcCrystalCaves(g, t, v, hash, maskKeys);
    case 2: return _gcVolcanic(g, t, v, hash, maskKeys);
    case 3: return _gcCelestial(g, t, v, hash, maskKeys);
    case 4: return _gcChaos(g, t, v, hash, maskKeys);
    default: return [];
  }
}

// Curved, lush grass tuft — a small mound base (not one point) with 3 layered colour
// passes of curved blades rooted at different points along the mound's surface, wide
// natural fan. Same recipe as the proven _spireGFCanopy grass tuft, adapted for Phaser
// Graphics (point-sampled bezier via _bladePoints, not canvas quadraticCurveTo) and
// scaled down for the smaller ground-cover footprint.
function _gcGrassTuft(g, hash) {
  const mCX = 0, mCY = 1, mRX = 9, mRY = 3.2;

  // Mound base — 2 flat rings approximate a lit-top/dark-rim mound.
  g.fillStyle(0x2e5010, 0.55);
  g.fillEllipse(mCX, mCY + 1, mRX * 2, mRY * 2);
  g.fillStyle(0x4a8c30, 0.6);
  g.fillEllipse(mCX - mRX * 0.15, mCY - mRY * 0.3, mRX * 1.5, mRY * 1.4);

  // Root point on the mound's top-surface ellipse — NOT a single shared vertex.
  const surfaceBase = (xFrac, jY) => {
    const bx = mCX + xFrac * mRX * 0.90;
    const clamped = Math.max(-1, Math.min(1, (bx - mCX) / mRX));
    const halfH = mRY * Math.sqrt(1 - clamped * clamped);
    const by = mCY - halfH + Math.min(halfH * 1.8, Math.max(0, jY));
    return [bx, by];
  };

  const bladeLayer = (count, fanHalf, colorHex, alpha, lenBase, lenVar, hw, salt) => {
    g.fillStyle(colorHex, alpha);
    for (let i = 0; i < count; i++) {
      const xFrac = count > 1
        ? -fanHalf + (i / (count - 1)) * fanHalf * 2 + (hash(salt + i) - 0.5) * 0.16
        : (hash(salt + i) - 0.5) * 0.16;
      const [bx, by] = surfaceBase(xFrac, hash(salt + 40 + i) * mRY * 2.5);
      const ang  = xFrac * 1.15 + (hash(salt + 80 + i) - 0.5) * 0.30; // wide natural fan
      const bLen = lenBase * (0.78 + hash(salt + 120 + i) * lenVar);
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const bow = ang < 0 ? -0.32 : ang > 0 ? 0.32 : (hash(salt + 160 + i) - 0.5) * 0.24;
      const tipX = bx + sa * bLen, tipY = by - ca * bLen;
      const ctrlX = bx + sa * bLen * 0.65 + bow * bLen * ca;
      const ctrlY = by - ca * bLen * 0.65 + bow * bLen * sa;
      const pts = _bladePoints(bx, by, ctrlX, ctrlY, tipX, tipY, hw, ca, sa, 5);
      g.fillPoints(pts, true);
    }
  };

  // Layer 0 — dark back, widest fan (also serves as the shadow read — no separate pass).
  bladeLayer(9, 0.95, 0x2e6614, 0.85, 5.5, 0.55, 0.85, 0);
  // Layer 1 — mid green.
  bladeLayer(7, 0.75, 0x4ea828, 0.90, 7.0, 0.55, 0.72, 200);
  // Layer 2 — vivid lime front, narrower fan, more length variance.
  bladeLayer(5, 0.55, 0x8ee820, 1.00, 8.5, 0.75, 0.60, 400);
}

// Theme 0 — Green Fields
function _gcGreenFields(g, t, v, hash, maskKeys) {
  if (v === 0) {
    _gcGrassTuft(g, hash);
    return [];
  } else if (v === 1) {
    // Wildflower cluster — stems with leaf pairs + petals. Petals/centre-glow use the
    // shared soft-mask stamps for a real gradient instead of flat ellipse/circle fills.
    const grads = [];
    const count = 2 + Math.floor(hash(1) * 3);
    const petColors = [0xff88aa, 0xffffaa, 0xff6677, 0xddaaff, 0xff99cc];
    for (let i = 0; i < count; i++) {
      const s = i * 60;
      const ox = (hash(s + 2) - 0.5) * 16;
      const oy = (hash(s + 3) - 0.5) * 8;
      const sh = 9 + hash(s + 4) * 9;
      const bend = (hash(s + 5) - 0.5) * 3; // slight stem bow instead of ramrod-straight
      // Shadow stem
      g.lineStyle(2, 0x1e3a08, 0.32);
      g.lineBetween(ox + 1, oy + 2, ox + 1 + bend, oy - sh * 0.5 + 1);
      g.lineBetween(ox + 1 + bend, oy - sh * 0.5 + 1, ox + 1, oy - sh + 1);
      // Stem
      g.lineStyle(1.2, 0x4a8820, 0.88);
      g.lineBetween(ox, oy, ox + bend, oy - sh * 0.5);
      g.lineBetween(ox + bend, oy - sh * 0.5, ox, oy - sh);
      // Leaf pair — independent angle/size per leaf (was one shared angle for both)
      const lmy = oy - sh * 0.52;
      const laL = (hash(s + 6) - 0.5) * 0.6, laR = (hash(s + 7) - 0.5) * 0.6;
      const lsL = 7 + hash(s + 8) * 2.5, lsR = 6 + hash(s + 9) * 2;
      g.fillStyle(0x4a8820, 0.62);
      g.fillEllipse(ox + Math.cos(laL) * 5, lmy + Math.sin(laL) * 2, lsL, 3.5);
      g.fillEllipse(ox - Math.cos(laR) * 5, lmy - Math.sin(laR) * 2, lsR, 3);
      // Petals — flat, crisp circles (Graphics, hard edge) so the flower silhouette stays
      // readable at small sizes, each with a small gloss stamp (NOT a big soft glow — a
      // glow sized close to or larger than the petal spacing is what caused the earlier
      // "smudge of color": petals whose glow-radius exceeded their center-to-center
      // distance blurred into one blob). Placement radius `pr` is kept > the petal's own
      // radius so adjacent petals touch at most, never fully overlap.
      const fc     = petColors[i % petColors.length];
      const petals = 5 + Math.floor(hash(s + 10) * 2);
      const pr     = 5.2 + hash(s + 12) * 1.3;
      for (let j = 0; j < petals; j++) {
        const pa = (j / petals) * Math.PI * 2 + (hash(s + 20 + j) - 0.5) * 0.35;
        const petR = 2.4 + hash(s + 25 + j) * 0.6;
        const px = ox + Math.cos(pa) * pr, py = oy - sh + Math.sin(pa) * pr;
        g.fillStyle(fc, 0.92);
        g.fillCircle(px, py, petR);
        grads.push({ key: maskKeys.highlight, dx: px, dy: py, tint: 0xffffff, alpha: 0.32, scale: petR * 0.5 / 6 });
      }
      // Centre — flat core dot + a modest soft glow (kept smaller than the petal ring
      // radius so it reads as a center glow, not an all-consuming blob)
      g.fillStyle(0xffee44, 0.95);
      g.fillCircle(ox, oy - sh, 2.2);
      grads.push({ key: maskKeys.highlight, dx: ox - 0.5, dy: oy - sh - 0.5, tint: 0xffaa00, alpha: 0.75, scale: 0.65 });
    }
    return grads;
  } else {
    // Moss / clover patch — 3 gradient blobs with a clear light-to-dark bias (bright lit
    // blob upper-left, dark rim blob lower-right — "one lit mound," not 3 concentric
    // same-centered circles) + jittered clover ring.
    const grads = [];
    grads.push({ key: maskKeys.blob, dx: 4,  dy: 3,  tint: 0x1e3208, alpha: 0.60, scaleX: 1.15, scaleY: 0.64 });
    grads.push({ key: maskKeys.blob, dx: 0,  dy: 0,  tint: 0x3d6b24, alpha: 0.65, scaleX: 0.92, scaleY: 0.51 });
    grads.push({ key: maskKeys.blob, dx: -5, dy: -4, tint: 0x74cc4c, alpha: 0.75, scaleX: 0.62, scaleY: 0.34 });
    // Clover-dot ring — hash-jittered radius per dot instead of a perfect circle
    for (let i = 0; i < 6; i++) {
      const la = (i / 6) * Math.PI * 2 + (hash(30 + i) - 0.5) * 0.3;
      const rr = 7 + hash(35 + i) * 2.4;
      g.fillStyle(0x7ec850, 0.68);
      g.fillCircle(Math.cos(la) * rr - 1, Math.sin(la) * rr * 0.5 - 1, 1.8 + hash(40 + i) * 0.9);
    }
    // Micro highlights — sparing soft glow stamps, clearly larger than before
    for (let i = 0; i < 3; i++) {
      grads.push({
        key: maskKeys.highlight,
        dx: (hash(50 + i) - 0.5) * 20, dy: (hash(55 + i) - 0.5) * 10,
        tint: 0xaae060, alpha: 0.55, scale: 0.5 + hash(60 + i) * 0.22,
      });
    }
    return grads;
  }
}

// Theme 1 — Crystal Caves
function _gcCrystalCaves(g, t, v, hash, maskKeys) {
  if (v === 0) {
    // Tiny crystal cluster — 3-5 miniature shards, vertex count varies 3-4 (was fixed
    // triangle), each gets a soft highlight stamp on its upper facet for a lit-edge read.
    const grads = [];
    const count = 3 + Math.floor(hash(1) * 3);
    for (let i = 0; i < count; i++) {
      const s = i * 20;
      const ox = (hash(s + 2) - 0.5) * 18;
      const oy = (hash(s + 3) - 0.5) * 8;
      const h  = 5 + hash(s + 4) * 8;
      const w  = 2 + hash(s + 5) * 2.5;
      const tilt = (hash(s + 6) - 0.5) * 0.4;
      const tipX = ox + Math.sin(tilt) * h, tipY = oy - h;
      let pts;
      if (hash(s + 7) < 0.5) {
        pts = [{ x: ox - w, y: oy }, { x: ox + w, y: oy }, { x: tipX, y: tipY }];
      } else {
        const midX = ox + Math.sin(tilt) * h * 0.55 + (hash(s + 8) - 0.5) * w * 0.6;
        const midY = oy - h * 0.55;
        pts = [{ x: ox - w, y: oy }, { x: ox + w, y: oy }, { x: midX + w * 0.3, y: midY }, { x: tipX, y: tipY }];
      }
      g.fillStyle(t.accent, 0.75);
      g.fillPoints(pts, true);
      g.lineStyle(0.8, t.wallHighlight, 0.5);
      g.strokePoints(pts, true);
      grads.push({ key: maskKeys.highlight, dx: (tipX + ox) / 2, dy: (tipY + oy) / 2, tint: t.wallHighlight, alpha: 0.48, scale: h / 8 });
    }
    return grads;
  } else if (v === 1) {
    // Glowing mushroom cluster — cap is a stamped gradient blob instead of a flat fill.
    const grads = [];
    const count = 2 + Math.floor(hash(1) * 2);
    for (let i = 0; i < count; i++) {
      const s = i * 20;
      const ox = (hash(s + 2) - 0.5) * 16;
      const oy = (hash(s + 3) - 0.5) * 6;
      const sh = 7 + hash(s + 4) * 6;
      const cr = 4 + hash(s + 5) * 4;
      g.lineStyle(1.5, t.wallInner, 0.9);
      g.lineBetween(ox, oy, ox, oy - sh);
      grads.push({ key: maskKeys.blob, dx: ox, dy: oy - sh - cr * 0.3, tint: t.accentDim, alpha: 0.85, scaleX: cr * 0.16, scaleY: cr * 0.09 });
      grads.push({ key: maskKeys.highlight, dx: ox - cr * 0.25, dy: oy - sh - cr * 0.4, tint: t.wallHighlight, alpha: 0.8, scale: cr * 0.14 });
    }
    return grads;
  } else {
    // Crystal dust — base glow is now a gradient stamp; specks stay flat (fine at this size).
    const grads = [];
    grads.push({ key: maskKeys.blob, dx: 0, dy: 0, tint: t.accent, alpha: 0.42, scaleX: 0.88, scaleY: 0.44 });
    const count = 5 + Math.floor(hash(1) * 4);
    for (let i = 0; i < count; i++) {
      const s = i * 10;
      const dx = (hash(s + 2) - 0.5) * 16;
      const dy = (hash(s + 3) - 0.5) * 8;
      const sz = 1.5 + hash(s + 4) * 2;
      g.fillStyle(t.wallHighlight, 0.55 + hash(s + 5) * 0.35);
      g.fillTriangle(dx, dy - sz, dx + sz * 0.65, dy + sz * 0.4, dx - sz * 0.65, dy + sz * 0.4);
    }
    return grads;
  }
}

// Theme 2 — Volcanic
function _gcVolcanic(g, t, v, hash, maskKeys) {
  if (v === 0) {
    // Ash patch with dark pebbles — soft ash mounds are gradient stamps; pebbles stay flat.
    const grads = [];
    grads.push({ key: maskKeys.blob, dx: 0, dy: 0, tint: 0x555555, alpha: 0.28, scaleX: 0.95, scaleY: 0.52 });
    grads.push({ key: maskKeys.blob, dx: -3, dy: 2, tint: 0x333333, alpha: 0.20, scaleX: 0.58, scaleY: 0.29 });
    for (let i = 0; i < 6; i++) {
      const s = i * 10;
      g.fillStyle(0x2a1a10, 0.7);
      g.fillCircle((hash(s + 2) - 0.5) * 20, (hash(s + 3) - 0.5) * 10, 1.2 + hash(s + 4) * 1.5);
    }
    return grads;
  } else if (v === 1) {
    // Ember cluster — replaces the old 3-manual-ring fake gradient with ONE bright core
    // highlight stamp + ONE larger orange blob stamp underneath (strictly simpler & better).
    const grads = [];
    const count = 5 + Math.floor(hash(1) * 4);
    for (let i = 0; i < count; i++) {
      const s = i * 20;
      const ox = (hash(s + 2) - 0.5) * 18;
      const oy = (hash(s + 3) - 0.5) * 10;
      const r  = 1.5 + hash(s + 4) * 2.5;
      grads.push({ key: maskKeys.blob, dx: ox, dy: oy, tint: 0xff6600, alpha: 0.55, scale: r * 2.2 / 16 });
      grads.push({ key: maskKeys.highlight, dx: ox, dy: oy, tint: 0xffaa44, alpha: 0.95, scale: r * 0.9 / 6 });
    }
    return grads;
  } else {
    // Scorched debris — charred sticks get a slight bow (were dead-straight); ember tip
    // glow is now a soft stamp instead of a flat circle.
    const grads = [];
    for (let i = 0; i < 3; i++) {
      const s = i * 20;
      const ox  = (hash(s + 2) - 0.5) * 14;
      const oy  = (hash(s + 3) - 0.5) * 8;
      const ang = hash(s + 4) * Math.PI;
      const len = 8 + hash(s + 5) * 10;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const sxp = ox - ca * len / 2, syp = oy - sa * len / 2;
      const exp = ox + ca * len / 2, eyp = oy + sa * len / 2;
      const bow = (hash(s + 6) - 0.5) * len * 0.12;
      const midX = (sxp + exp) / 2 - sa * bow, midY = (syp + eyp) / 2 + ca * bow;
      g.lineStyle(2, 0x1a0a00, 0.9);
      g.lineBetween(sxp, syp, midX, midY);
      g.lineBetween(midX, midY, exp, eyp);
      grads.push({ key: maskKeys.highlight, dx: exp, dy: eyp, tint: 0xff4400, alpha: 0.85, scale: 0.55 });
    }
    return grads;
  }
}

// Theme 3 — Celestial
function _gcCelestial(g, t, v, hash, maskKeys) {
  if (v === 0) {
    // Stardust — small flat core dot + a real soft-mask halo (replaces the old flat
    // low-alpha circle approximation of a glow).
    const grads = [];
    const count = 8 + Math.floor(hash(1) * 6);
    for (let i = 0; i < count; i++) {
      const s = i * 10;
      const ox = (hash(s + 2) - 0.5) * 22;
      const oy = (hash(s + 3) - 0.5) * 12;
      const r  = 0.8 + hash(s + 4) * 1.4;
      g.fillStyle(t.wallHighlight, 0.4 + hash(s + 5) * 0.5);
      g.fillCircle(ox, oy, r);
      if (hash(s + 6) < 0.35) {
        grads.push({ key: maskKeys.highlight, dx: ox, dy: oy, tint: t.wallHighlight, alpha: 0.42, scale: r * 3.2 / 6 });
      }
    }
    return grads;
  } else if (v === 1) {
    // Cosmic rune — an etched glyph should stay flat linework, not go dimensional; add
    // one low-alpha glow blob underneath for a "magically lit" read.
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
    return [{ key: maskKeys.blob, dx: 0, dy: 0, tint: t.accent, alpha: 0.3, scale: 1.1 }];
  } else {
    // Void pebbles — dark stones (gradient blob) with a star-shimmer highlight stamp.
    const grads = [];
    const count = 3 + Math.floor(hash(1) * 3);
    for (let i = 0; i < count; i++) {
      const s = i * 20;
      const ox = (hash(s + 2) - 0.5) * 16;
      const oy = (hash(s + 3) - 0.5) * 8;
      const r  = 2.5 + hash(s + 4) * 2.5;
      grads.push({ key: maskKeys.blob, dx: ox, dy: oy, tint: t.wallInner, alpha: 0.95, scale: r * 2.4 / 16 });
      g.lineStyle(0.8, t.accentDim, 0.55);
      g.strokeCircle(ox, oy, r);
      grads.push({ key: maskKeys.highlight, dx: ox - r * 0.3, dy: oy - r * 0.35, tint: t.wallHighlight, alpha: 0.8, scale: 0.5 });
    }
    return grads;
  }
}

// Theme 4 — Chaos
function _gcChaos(g, t, v, hash, maskKeys) {
  if (v === 0) {
    // Reality crack — stays flat linework (a fissure shouldn't go dimensional); now also
    // forks into a smaller secondary crack partway along (real fractures branch) and
    // scatters a couple of tiny angular shatter-bit debris triangles near the mouth.
    const len = 14 + hash(1) * 12;
    const ang = hash(2) * Math.PI;
    const pts = [];
    for (let i = 0; i <= 5; i++) {
      const f  = i / 5;
      const jx = i > 0 && i < 5 ? (hash(10 + i) - 0.5) * 5 : 0;
      const jy = i > 0 && i < 5 ? (hash(20 + i) - 0.5) * 3 : 0;
      pts.push({ x: Math.cos(ang) * (len * f - len / 2) + jx,
                 y: Math.sin(ang) * (len * f - len / 2) + jy });
    }
    g.lineStyle(4, t.accent, 0.14);  g.strokePoints(pts, false);
    g.lineStyle(1.5, t.accent, 0.7); g.strokePoints(pts, false);
    g.lineStyle(0.8, 0xffffff, 0.45); g.strokePoints(pts, false);
    // Secondary branch — forks off the crack partway along, shorter and dimmer.
    const forkIdx = 2 + Math.floor(hash(30) * 2); // fork from segment 2 or 3
    const forkAng = ang + (hash(31) < 0.5 ? 1 : -1) * (0.6 + hash(32) * 0.5);
    const forkLen = len * (0.35 + hash(33) * 0.25);
    const forkPts = [pts[forkIdx], {
      x: pts[forkIdx].x + Math.cos(forkAng) * forkLen,
      y: pts[forkIdx].y + Math.sin(forkAng) * forkLen,
    }];
    g.lineStyle(1, t.accent, 0.55); g.strokePoints(forkPts, false);
    g.lineStyle(0.6, 0xffffff, 0.3); g.strokePoints(forkPts, false);
    // Tiny shatter-bit debris scattered near the crack mouth.
    for (let i = 0; i < 2; i++) {
      const s = 40 + i * 10;
      const dx = pts[0].x + (hash(s + 1) - 0.5) * len * 0.8;
      const dy = pts[0].y + (hash(s + 2) - 0.5) * len * 0.5;
      const dsz = 1.2 + hash(s + 3) * 1.3;
      const da = hash(s + 4) * Math.PI * 2;
      g.fillStyle(t.wallInner, 0.7);
      g.fillTriangle(dx + Math.cos(da) * dsz, dy + Math.sin(da) * dsz,
                      dx + Math.cos(da + 2.3) * dsz, dy + Math.sin(da + 2.3) * dsz,
                      dx + Math.cos(da + 4.2) * dsz * 0.8, dy + Math.sin(da + 4.2) * dsz * 0.8);
      g.lineStyle(0.6, t.accent, 0.5);
      g.strokeTriangle(dx + Math.cos(da) * dsz, dy + Math.sin(da) * dsz,
                        dx + Math.cos(da + 2.3) * dsz, dy + Math.sin(da + 2.3) * dsz,
                        dx + Math.cos(da + 4.2) * dsz * 0.8, dy + Math.sin(da + 4.2) * dsz * 0.8);
    }
    return [{ key: maskKeys.blob, dx: 0, dy: 0, tint: t.accent, alpha: 0.32, scaleX: len / 12, scaleY: 0.4 }];
  } else if (v === 1) {
    // Void shard cluster — angular glassy fragments; vertex count now varies 3-4 (was a
    // fixed triangle), and a thin low-alpha energy-crackle line connects two neighboring
    // shards for an "unstably pulled apart" read.
    const grads = [];
    const count = 3 + Math.floor(hash(1) * 3);
    const centers = [];
    for (let i = 0; i < count; i++) {
      const s = i * 20;
      const ox = (hash(s + 2) - 0.5) * 16;
      const oy = (hash(s + 3) - 0.5) * 10;
      const a  = hash(s + 4) * Math.PI * 2;
      const sz = 3 + hash(s + 5) * 4;
      let pts;
      if (hash(s + 6) < 0.5) {
        pts = [
          { x: ox + Math.cos(a)       * sz, y: oy + Math.sin(a)       * sz },
          { x: ox + Math.cos(a + 2.2) * sz, y: oy + Math.sin(a + 2.2) * sz },
          { x: ox + Math.cos(a + 4.0) * sz * 0.8, y: oy + Math.sin(a + 4.0) * sz * 0.8 },
        ];
      } else {
        pts = [
          { x: ox + Math.cos(a)         * sz,       y: oy + Math.sin(a)         * sz },
          { x: ox + Math.cos(a + 1.6)   * sz * 0.9, y: oy + Math.sin(a + 1.6)   * sz * 0.9 },
          { x: ox + Math.cos(a + 3.2)   * sz,       y: oy + Math.sin(a + 3.2)   * sz },
          { x: ox + Math.cos(a + 4.7)   * sz * 0.8, y: oy + Math.sin(a + 4.7)   * sz * 0.8 },
        ];
      }
      g.fillStyle(t.wallInner, 0.8);
      g.fillPoints(pts, true);
      g.lineStyle(0.8, t.accent, 0.6);
      g.strokePoints(pts, true);
      grads.push({ key: maskKeys.highlight, dx: pts[0].x, dy: pts[0].y, tint: t.accent, alpha: 0.42, scale: sz / 7 });
      centers.push({ x: ox, y: oy });
    }
    // Energy-crackle line between two neighboring shards, thin and low-alpha.
    if (centers.length >= 2) {
      const ci = Math.floor(hash(90) * centers.length);
      const cj = (ci + 1) % centers.length;
      const mx = (centers[ci].x + centers[cj].x) / 2 + (hash(91) - 0.5) * 4;
      const my = (centers[ci].y + centers[cj].y) / 2 + (hash(92) - 0.5) * 4;
      g.lineStyle(0.6, t.accent, 0.35);
      g.strokePoints([centers[ci], { x: mx, y: my }, centers[cj]], false);
    }
    return grads;
  } else {
    // Distortion ripple — concentric broken ellipses stay flat stroke art (ripples read
    // as line art); now also gets a few short angular glitch tick-marks radiating from
    // the center, tying it to the same crack/shard fracture language as the other variants.
    for (let i = 0; i < 3; i++) {
      const r = 5 + i * 5;
      g.lineStyle(0.8, t.accent, 0.22 - i * 0.06);
      g.strokeEllipse(0, 0, r * 2.2, r * 1.1);
    }
    g.fillStyle(t.accentDim, 0.2);
    g.fillEllipse(0, 0, 10, 5);
    const tickN = 3 + Math.floor(hash(1) * 3);
    for (let i = 0; i < tickN; i++) {
      const a = (i / tickN) * Math.PI * 2 + (hash(40 + i) - 0.5) * 0.4;
      const r0 = 9 + hash(45 + i) * 3, r1 = r0 + 2 + hash(50 + i) * 3;
      g.lineStyle(0.8, 0xffffff, 0.4);
      g.lineBetween(Math.cos(a) * r0, Math.sin(a) * r0 * 0.5, Math.cos(a) * r1, Math.sin(a) * r1 * 0.5);
    }
    return [{ key: maskKeys.blob, dx: 0, dy: 0, tint: t.accentDim, alpha: 0.26, scaleX: 0.8, scaleY: 0.4 }];
  }
}

// ── Mid-size prop art (canvas-baked, real gradients) ────────────────────────
// Same per-instance canvas-bake pattern already proven for obstacles
// (obstacleArt.js): draw once with real createLinearGradient/createRadialGradient
// calls, cache as a texture, display as a single Image — instead of a live
// Graphics object replaying its draw commands every frame (CLAUDE.md rule 8).
// A shared, generous fixed canvas covers every variant's extents (simpler than
// per-variant sizing math for a 10-variant system); local (0,0) after the
// translate below is the ground-contact point, matching the original
// Graphics-local coordinate convention (negative y = up).
const MP_PAD = 10, MP_ABOVE = 72, MP_BELOW = 30, MP_HALFW = 46;
const MP_CW = Math.ceil((MP_HALFW + MP_PAD) * 2);
const MP_CH = Math.ceil(MP_PAD + MP_ABOVE + MP_BELOW);
const MP_OX = MP_CW / 2;
const MP_OY = MP_PAD + MP_ABOVE;

function _mpFillCircle(ctx, x, y, r, color, alpha) {
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}
function _mpFillEllipse(ctx, x, y, w, h, color, alpha) {
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
}
function _mpLine(ctx, x1, y1, x2, y2, width, color, alpha) {
  ctx.strokeStyle = hexToRgba(color, alpha); ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}
function _mpPolyPath(ctx, pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}
function _mpRoundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y,     x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x,     y + h, rr);
  ctx.arcTo(x,     y + h, x,     y,     rr);
  ctx.arcTo(x,     y,     x + w, y,     rr);
  ctx.closePath();
}
// Radial clump dome, lit toward the upper-left — the "real gradient instead of
// a flat same-tone circle" building block reused across the bush/foliage clumps.
function _mpClumpDome(ctx, cx, cy, r, color, alpha) {
  const lx = cx - r * 0.32, ly = cy - r * 0.32;
  const grad = ctx.createRadialGradient(lx, ly, 0, cx, cy, r * 1.15);
  grad.addColorStop(0,   hexToRgba(shade(color, 1.35), alpha));
  grad.addColorStop(0.6, hexToRgba(color, alpha));
  grad.addColorStop(1,   hexToRgba(shade(color, 0.65), alpha));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
}

function _bakeMidPropTexture(scene, key, themeIdx, t, hash) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, MP_CW, MP_CH);
  const ctx = tex.getContext();
  ctx.save();
  ctx.translate(MP_OX, MP_OY);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const v = Math.floor(hash(0) * 2);
  switch (themeIdx) {
    case 0: _mpGreenFields(ctx, t, v, hash);  break;
    case 1: _mpCrystalCaves(ctx, t, v, hash); break;
    case 2: _mpVolcanic(ctx, t, v, hash);     break;
    case 3: _mpCelestial(ctx, t, v, hash);    break;
    case 4: _mpChaos(ctx, t, v, hash);        break;
  }
  ctx.restore();
  tex.refresh();
  return { key, originX: MP_OX / MP_CW, originY: MP_OY / MP_CH };
}

// Theme 0 — Green Fields mid-size
function _mpGreenFields(ctx, t, v, hash) {
  if (v === 0) {
    // Round layered bush — clump domes carry a real lit-upper-left radial
    // gradient (via _mpClumpDome) instead of flat same-tone circles.
    _mpFillEllipse(ctx, 3, 14, 56, 24, 0x000000, 0.13);   // extended occluder shadow
    _mpFillEllipse(ctx, 4, 6,  48, 13, 0x000000, 0.26);   // visual shadow
    _mpClumpDome(ctx, -6, -4, 16, 0x2e6820, 1);
    _mpClumpDome(ctx, 7,  -6, 18, 0x2e6820, 1);
    _mpClumpDome(ctx, 0,  -10, 14, 0x2e6820, 1);
    _mpClumpDome(ctx, -5, -8, 12, 0x4a9030, 1);
    _mpClumpDome(ctx, 6,  -10, 14, 0x4a9030, 1);
    _mpClumpDome(ctx, -2, -13, 9,  0x52aa3e, 1);
    _mpClumpDome(ctx, 8,  -14, 7,  0x52aa3e, 1);
    _mpClumpDome(ctx, 4,  -13, 9,  0x7ec850, 0.9);
    _mpClumpDome(ctx, 2,  -16, 5,  0x9de060, 0.7);
    // Berries — small highlight-core radial each, instead of a flat dot + flat speck
    const berryC = [0xee3322, 0xff5544, 0xcc2211];
    for (let i = 0; i < 6; i++) {
      const s = 20 + i * 10;
      const bx = (hash(s + 1) - 0.5) * 24;
      const by = -4 - hash(s + 2) * 14;
      const br = 1.8 + hash(s + 3) * 0.8;
      const grad = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, 0, bx, by, br);
      grad.addColorStop(0,    hexToRgba(0xffffff, 0.85));
      grad.addColorStop(0.35, hexToRgba(berryC[i % 3], 0.9));
      grad.addColorStop(1,    hexToRgba(shade(berryC[i % 3], 0.7), 0.8));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Tall fern — arcing fronds stay linework (thin natural shapes read fine flat);
    // leaflets get a subtle 2-tone gradient instead of one flat alternating colour.
    _mpFillEllipse(ctx, 2, 14, 44, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 3, 4,  36, 10, 0x000000, 0.20);
    const fronds = 6 + Math.floor(hash(20) * 3);
    for (let i = 0; i < fronds; i++) {
      const s = 30 + i * 20;
      const tf  = fronds > 1 ? i / (fronds - 1) : 0.5;
      const ang = -Math.PI / 2 - Math.PI / 3 + tf * (Math.PI * 2 / 3);
      const len = 18 + hash(s + 1) * 14;
      const bend = 0.22 + hash(s + 2) * 0.18;
      const ctrlX = Math.cos(ang + bend * 0.4) * len * 0.5;
      const ctrlY = Math.sin(ang + bend * 0.4) * len * 0.5;
      const tipX  = Math.cos(ang + bend) * len;
      const tipY  = Math.sin(ang + bend) * len;
      _mpLine(ctx, 1, 1, ctrlX + 1, ctrlY + 1, 2.5, 0x1a3a08, 0.38);
      _mpLine(ctx, ctrlX + 1, ctrlY + 1, tipX + 1, tipY + 1, 2.5, 0x1a3a08, 0.38);
      _mpLine(ctx, 0, 0, ctrlX, ctrlY, 1.8, 0x2a6010, 0.92);
      _mpLine(ctx, ctrlX, ctrlY, tipX, tipY, 1.8, 0x2a6010, 0.92);
      const leafCount = 3 + Math.floor(len / 7);
      for (let j = 1; j < leafCount; j++) {
        const f  = j / leafCount;
        const lx = ctrlX * (1 - f) + tipX * f;
        const ly = ctrlY * (1 - f) + tipY * f;
        const lr = (1 - f) * 5.5 + 1.5;
        const la = ang + Math.PI * 0.45 * (j % 2 === 0 ? 1 : -1);
        const leafCol = j % 2 === 0 ? 0x3a8020 : 0x4a9428;
        const elx = lx + Math.cos(la) * lr, ely = ly + Math.sin(la) * lr;
        const grad = ctx.createLinearGradient(elx - lr, ely - lr * 0.4, elx + lr, ely + lr * 0.4);
        grad.addColorStop(0, hexToRgba(shade(leafCol, 1.3), 0.85));
        grad.addColorStop(1, hexToRgba(shade(leafCol, 0.75), 0.8));
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.ellipse(elx, ely, lr * 1.1, lr * 0.425, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

// Theme 1 — Crystal Caves mid-size
function _mpCrystalCaves(ctx, t, v, hash) {
  if (v === 0) {
    // Crystal spire formation — shards get a length-wise gradient (dark base ->
    // bright tip) instead of a flat fill.
    _mpFillEllipse(ctx, 3, 15, 54, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 4, 6,  50, 15, 0x000000, 0.4);
    _mpFillEllipse(ctx, 0, 2,  42, 18, t.wallInner, 1);
    _mpFillEllipse(ctx, 4, 3,  28, 12, 0x000000, 0.4);
    const shards = [
      { ox: 0,   h: 32, tilt: 0,     c: t.accent      },
      { ox: -9,  h: 22, tilt: -0.22, c: t.accentDim   },
      { ox: 10,  h: 26, tilt: 0.2,   c: t.accent      },
      { ox: -18, h: 15, tilt: -0.4,  c: t.accentDim   },
      { ox: 17,  h: 18, tilt: 0.35,  c: t.wallHighlight},
    ];
    shards.forEach(({ ox, h, tilt, c }, i) => {
      const w   = 4 + hash(20 + i * 10) * 3;
      const tipX = ox + Math.sin(tilt) * h;
      const tipY = -(h - Math.abs(Math.sin(tilt)) * 4);
      const pts  = [{ x: ox - w, y: 0 }, { x: ox + w, y: 0 },
                    { x: tipX + w * 0.3, y: tipY }, { x: tipX - w * 0.3, y: tipY }];
      const grad = ctx.createLinearGradient(ox, 0, tipX, tipY);
      grad.addColorStop(0,   hexToRgba(shade(c, 0.7), 0.85));
      grad.addColorStop(0.6, hexToRgba(c, 0.85));
      grad.addColorStop(1,   hexToRgba(shade(c, 1.4), 0.9));
      _mpPolyPath(ctx, pts); ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = hexToRgba(t.wallHighlight, 0.38); ctx.lineWidth = 1; ctx.stroke();
      _mpFillCircle(ctx, tipX, tipY, 1.8, 0xffffff, 0.5);
    });
  } else {
    // Bioluminescent mushroom — cap gets a real radial gradient instead of flat
    // overlay ellipses.
    _mpFillEllipse(ctx, 2, 14, 48, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 3, 5,  44, 13, 0x000000, 0.3);
    ctx.fillStyle = hexToRgba(t.wallInner, 1);
    _mpRoundRectPath(ctx, -5, -28, 10, 28, 2.5); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const s = 20 + i * 5;
      _mpFillCircle(ctx, (hash(s + 1) - 0.5) * 6, -28 * (0.2 + hash(s + 2) * 0.65), 1.5 + hash(s + 3), t.accentDim, 0.6);
    }
    const capGrad = ctx.createRadialGradient(-8, -33, 2, 0, -28, 20);
    capGrad.addColorStop(0,   hexToRgba(shade(t.accent, 1.5), 0.95));
    capGrad.addColorStop(0.5, hexToRgba(t.accentDim, 0.95));
    capGrad.addColorStop(1,   hexToRgba(shade(t.accentDim, 0.7), 0.9));
    ctx.fillStyle = capGrad;
    ctx.beginPath(); ctx.ellipse(0, -28, 18, 10, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI;
      _mpFillCircle(ctx, Math.cos(a) * 11, -28 + Math.sin(a) * 4 + 3, 2, t.wallHighlight, 0.72);
    }
    ctx.strokeStyle = hexToRgba(t.wallInner, 0.65); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, -28, 18, 10, 0, 0, Math.PI * 2); ctx.stroke();
  }
}

// Theme 2 — Volcanic mid-size
function _mpVolcanic(ctx, t, v, hash) {
  if (v === 0) {
    // Charred dead tree — bare branches stay flat linework; ember tips get a real
    // radial glow instead of 3 stacked flat circles.
    _mpFillEllipse(ctx, 3, 14, 46, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 4, 5,  42, 12, 0x000000, 0.3);
    _mpLine(ctx, 0, 0, -2, -22, 6, 0x1a0800, 1);
    _mpLine(ctx, -2, -22, 12, -36, 4, 0x260e04, 1);
    _mpLine(ctx, -2, -22, -14, -32, 4, 0x260e04, 1);
    _mpLine(ctx, 12, -36, 18, -44, 3, 0x1a0800, 1);
    _mpLine(ctx, 12, -36, 22, -30, 2, 0x1a0800, 1);
    _mpLine(ctx, -1, -5, 1, -18, 0.8, 0x0f0400, 0.6);
    _mpLine(ctx, -2, -10, -4, -20, 0.8, 0x0f0400, 0.6);
    [[18, -44], [22, -30], [-14, -32]].forEach(([ex, ey]) => {
      const grad = ctx.createRadialGradient(ex, ey, 0, ex, ey, 5.5);
      grad.addColorStop(0,    hexToRgba(0xffeeaa, 0.95));
      grad.addColorStop(0.35, hexToRgba(0xff8800, 0.75));
      grad.addColorStop(1,    hexToRgba(0xff4400, 0));
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, Math.PI * 2); ctx.fill();
    });
  } else {
    // Sulfur crystal formation — shards get a length-wise gradient like Crystal Caves.
    _mpFillEllipse(ctx, 3, 15, 50, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 4, 6,  46, 14, 0x000000, 0.35);
    const basePts = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 16 + (i % 2) * 4;
      basePts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.5 + 2 });
    }
    _mpPolyPath(ctx, basePts);
    ctx.fillStyle = hexToRgba(0x0e0806, 1); ctx.fill();
    ctx.strokeStyle = hexToRgba(0x1a1008, 0.8); ctx.lineWidth = 1.5; ctx.stroke();
    [{ ox: -5, h: 24, c: 0xcc8800 }, { ox: 8, h: 18, c: 0xffaa00 },
     { ox: 0,  h: 28, c: 0xdd9900 }, { ox: -14, h: 14, c: 0xbb7700 },
     { ox: 14, h: 16, c: 0xffbb22 }].forEach(({ ox, h, c }, i) => {
      const w = 4 + hash(20 + i * 10) * 3;
      const tilt = (hash(25 + i * 10) - 0.5) * 0.3;
      const tipX = ox + Math.sin(tilt) * h, tipY = -h;
      const grad = ctx.createLinearGradient(ox, 0, tipX, tipY);
      grad.addColorStop(0, hexToRgba(shade(c, 0.6), 0.9));
      grad.addColorStop(1, hexToRgba(shade(c, 1.35), 0.95));
      _mpPolyPath(ctx, [{ x: ox - w, y: 0 }, { x: ox + w, y: 0 }, { x: tipX, y: tipY }]);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = hexToRgba(0xffcc44, 0.28); ctx.lineWidth = 0.8; ctx.stroke();
    });
  }
}

// Theme 3 — Celestial mid-size
function _mpCelestial(ctx, t, v, hash) {
  if (v === 0) {
    // Starlight frond cluster — reads as actual foliage (a "bush"), not architecture.
    // Same arcing-frond technique as the Green Fields fern (_mpGreenFields), recolored
    // for Celestial: cool indigo-blue frond bodies (matching the spire/rock stone tone)
    // with a small glowing gold star-sparkle at each tip instead of green leaflets — a
    // celestial garden shrub rather than a miniature obelisk.
    _mpFillEllipse(ctx, 3, 14, 46, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 4, 5,  40, 12, 0x000000, 0.28);
    const fronds = 7 + Math.floor(hash(10) * 3);
    for (let i = 0; i < fronds; i++) {
      const s = 20 + i * 20;
      const tf  = fronds > 1 ? i / (fronds - 1) : 0.5;
      const ang = -Math.PI / 2 - Math.PI / 2.6 + tf * (Math.PI / 1.3);
      const len = 15 + hash(s + 1) * 15;
      const bend = 0.20 + hash(s + 2) * 0.22;
      const ctrlX = Math.cos(ang + bend * 0.4) * len * 0.5;
      const ctrlY = Math.sin(ang + bend * 0.4) * len * 0.5;
      const tipX  = Math.cos(ang + bend) * len;
      const tipY  = Math.sin(ang + bend) * len;
      // Shadow stroke
      ctx.strokeStyle = 'rgba(8,8,20,0.35)'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(1, 1); ctx.lineTo(ctrlX + 1, ctrlY + 1); ctx.lineTo(tipX + 1, tipY + 1); ctx.stroke();
      // Main frond — gradient along its own body, dark base rising to a lit indigo tip
      const frondG = ctx.createLinearGradient(0, 0, tipX, tipY);
      frondG.addColorStop(0, hexToRgba(shade(t.wallInner, 0.70), 0.95));
      frondG.addColorStop(1, hexToRgba(shade(t.wallInner, 1.70), 0.95));
      ctx.strokeStyle = frondG; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ctrlX, ctrlY); ctx.lineTo(tipX, tipY); ctx.stroke();
      // Star-glow tip
      const glow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 4.5);
      glow.addColorStop(0, hexToRgba(t.wallHighlight, 0.95));
      glow.addColorStop(1, hexToRgba(t.accent, 0));
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(tipX, tipY, 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(tipX, tipY, 1, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    // Cosmic orb on a carved stone pedestal — orb gets a real radial gradient plus
    // a soft outer glow, instead of stacked flat circles.
    _mpFillEllipse(ctx, 3, 14, 40, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 4, 6,  36, 11, 0x000000, 0.3);
    ctx.fillStyle = hexToRgba(t.wallInner, 1);
    _mpRoundRectPath(ctx, -12, -10, 24, 10, 3); ctx.fill();
    ctx.strokeStyle = hexToRgba(t.wallShadow, 0.65); ctx.lineWidth = 1;
    _mpRoundRectPath(ctx, -12, -10, 24, 10, 3); ctx.stroke();
    const or = 14, ocy = -10 - or;
    const glow = ctx.createRadialGradient(0, ocy, or * 0.6, 0, ocy, or * 1.8);
    glow.addColorStop(0, hexToRgba(t.accent, 0.18));
    glow.addColorStop(1, hexToRgba(t.accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, ocy, or * 1.8, 0, Math.PI * 2); ctx.fill();
    const orbGrad = ctx.createRadialGradient(-or * 0.32, ocy - or * 0.32, 1, 0, ocy, or);
    orbGrad.addColorStop(0,   hexToRgba(0xffffff, 0.55));
    orbGrad.addColorStop(0.3, hexToRgba(shade(t.accent, 1.3), 0.55));
    orbGrad.addColorStop(1,   hexToRgba(t.floor, 0.95));
    ctx.fillStyle = orbGrad;
    ctx.beginPath(); ctx.arc(0, ocy, or, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hexToRgba(t.accent, 0.22); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, ocy, or, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = hexToRgba(t.accentDim, 0.18); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(0, ocy, or * 0.7, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 5; i++) {
      const s = 20 + i * 5;
      const sa = hash(s + 1) * Math.PI * 2;
      const sd = hash(s + 2) * or * 0.65;
      _mpFillCircle(ctx, Math.cos(sa) * sd, ocy + Math.sin(sa) * sd, 0.9 + hash(s + 3) * 0.8, t.wallHighlight, 0.7);
    }
  }
}

// Theme 4 — Chaos mid-size
function _mpChaos(ctx, t, v, hash) {
  if (v === 0) {
    // Chaos crystal — body gets a directional gradient instead of a flat fill;
    // crack veining stays flat linework.
    _mpFillEllipse(ctx, 3, 14, 48, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 4, 6,  44, 13, 0x000000, 0.35);
    const body = [
      { x: 0, y: -36 }, { x: 14, y: -24 }, { x: 18, y: -10 },
      { x: 10, y: 2 },  { x: -8, y: 4 },   { x: -18, y: -8 },
      { x: -12, y: -26}, { x: -4, y: -34 },
    ];
    const grad = ctx.createLinearGradient(-18, -36, 18, 4);
    grad.addColorStop(0, hexToRgba(shade(t.wallInner, 1.3), 1));
    grad.addColorStop(1, hexToRgba(shade(t.wallInner, 0.7), 1));
    _mpPolyPath(ctx, body); ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = hexToRgba(t.accent, 0.65); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(6, -18); ctx.lineTo(12, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, -26); ctx.lineTo(-4, -12); ctx.lineTo(6, -18); ctx.stroke();
    ctx.fillStyle = hexToRgba(t.accent, 0.07);
    _mpPolyPath(ctx, body); ctx.fill();
    ctx.strokeStyle = hexToRgba(t.wallShadow, 0.8); ctx.lineWidth = 1.5;
    _mpPolyPath(ctx, body); ctx.stroke();
    ctx.strokeStyle = hexToRgba(0xffffff, 0.32); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-4, -34); ctx.lineTo(14, -24); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, -26); ctx.lineTo(-18, -8); ctx.stroke();
    // Small floating satellite shards near the base — reads as a crystal CLUSTER rather
    // than one lone crystal (mirrors how the Crystal Caves mid-prop formation clusters
    // multiple shards around a base rock).
    const satN = 2 + Math.floor(hash(60) * 2);
    for (let i = 0; i < satN; i++) {
      const s = 62 + i * 6;
      const sang = (i / satN) * Math.PI * 2 + hash(s) * 1.2;
      const sdist = 20 + hash(s + 1) * 6;
      const scx = Math.cos(sang) * sdist, scy = -6 + Math.sin(sang) * sdist * 0.35;
      const ssz = 4 + hash(s + 2) * 3;
      const stilt = (hash(s + 3) - 0.5) * 0.6;
      const stipX = scx + Math.sin(stilt) * ssz, stipY = scy - ssz;
      const spts = [{ x: scx - ssz * 0.4, y: scy }, { x: scx + ssz * 0.4, y: scy }, { x: stipX, y: stipY }];
      const sgrad = ctx.createLinearGradient(scx, scy, stipX, stipY);
      sgrad.addColorStop(0, hexToRgba(shade(t.wallInner, 0.8), 0.9));
      sgrad.addColorStop(1, hexToRgba(shade(t.accent, 1.1), 0.9));
      _mpPolyPath(ctx, spts); ctx.fillStyle = sgrad; ctx.fill();
      ctx.strokeStyle = hexToRgba(t.accent, 0.5); ctx.lineWidth = 0.8;
      _mpPolyPath(ctx, spts); ctx.stroke();
    }
  } else {
    // Reality fragment — flat angular slab gets the same directional-gradient
    // treatment; chaos veining stays flat linework.
    _mpFillEllipse(ctx, 3, 15, 44, 24, 0x000000, 0.11);
    _mpFillEllipse(ctx, 4, 8,  40, 12, 0x000000, 0.3);
    const frag = [
      { x: -16, y: -6 }, { x: 12, y: -18 }, { x: 20, y: -4 },
      { x: 6, y: 8 },    { x: -14, y: 4 },
    ];
    const grad = ctx.createLinearGradient(-16, -18, 20, 8);
    grad.addColorStop(0, hexToRgba(shade(t.wallInner, 1.25), 1));
    grad.addColorStop(1, hexToRgba(shade(t.wallInner, 0.75), 1));
    _mpPolyPath(ctx, frag); ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = hexToRgba(t.accent, 0.06);
    _mpPolyPath(ctx, frag); ctx.fill();
    ctx.strokeStyle = hexToRgba(t.accent, 0.48); ctx.lineWidth = 1.5;
    _mpPolyPath(ctx, frag); ctx.stroke();
    ctx.strokeStyle = hexToRgba(t.accentDim, 0.32); ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(14, -14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8, 2);   ctx.lineTo(10, -8);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-4, 6);   ctx.lineTo(18, 0);   ctx.stroke();
    ctx.fillStyle = hexToRgba(t.wallHighlight, 0.52);
    [frag[0], frag[1], frag[2]].forEach(({ x, y }) => {
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
    });
    // Small debris shard nearby, linked to the main slab by a thin energy-crackle line —
    // reads as "still coming apart" rather than one static static slab.
    const debN = 1 + Math.floor(hash(60) * 2);
    for (let i = 0; i < debN; i++) {
      const s = 62 + i * 6;
      const dang = hash(s) * Math.PI * 2;
      const ddist = 22 + hash(s + 1) * 8;
      const dcx = 2 + Math.cos(dang) * ddist, dcy = -2 + Math.sin(dang) * ddist * 0.5;
      const dsz = 3.5 + hash(s + 2) * 2.5;
      const dtilt = (hash(s + 3) - 0.5) * 0.6;
      const dpts = [
        { x: dcx - dsz * 0.4, y: dcy },
        { x: dcx + dsz * 0.4, y: dcy },
        { x: dcx + Math.sin(dtilt) * dsz, y: dcy - dsz },
      ];
      const dgrad = ctx.createLinearGradient(dcx, dcy, dpts[2].x, dpts[2].y);
      dgrad.addColorStop(0, hexToRgba(shade(t.wallInner, 0.85), 0.9));
      dgrad.addColorStop(1, hexToRgba(shade(t.accent, 1.1), 0.9));
      _mpPolyPath(ctx, dpts); ctx.fillStyle = dgrad; ctx.fill();
      ctx.strokeStyle = hexToRgba(t.accent, 0.5); ctx.lineWidth = 0.8;
      _mpPolyPath(ctx, dpts); ctx.stroke();
      // Crackle line from the nearest frag vertex to the debris shard.
      let nearest = frag[0], best = Infinity;
      for (const p of frag) {
        const d = Math.hypot(p.x - dcx, p.y - dcy);
        if (d < best) { best = d; nearest = p; }
      }
      const midX = (nearest.x + dcx) / 2 + (hash(s + 4) - 0.5) * 4;
      const midY = (nearest.y + dcy) / 2 + (hash(s + 5) - 0.5) * 4;
      ctx.strokeStyle = hexToRgba(t.accent, 0.3); ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(nearest.x, nearest.y); ctx.lineTo(midX, midY); ctx.lineTo(dcx, dcy); ctx.stroke();
    }
  }
}
