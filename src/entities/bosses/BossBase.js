import Phaser from 'phaser';
import { SCALING } from '../../config/gameConfig.js';
import { spawnBurst, spawnBlood, spawnSparks, spawnImpactRing } from '../../systems/ParticleHelper.js';

/*
  BossBase — all bosses extend this.
  Subclasses must implement:
    _buildGraphics()      — draw the boss shape
    _getAttackPool()      — return array of attack method names for normal phase
    _getEnrageAttacks()   — return array of enrage-only attack method names
    _runAttack(name)      — execute a named attack
*/
export default class BossBase {
  constructor(scene, x, y, config, level) {
    this.scene = scene;
    this.bossName = config.name;
    this.size = Math.round((config.size + Math.floor(level * 0.4)) * 1.725);
    this.level = level;

    // Scale stats
    this.maxHp = config.baseHp + (level - 1) * SCALING.BOSS_HP_PER_LEVEL;
    this.hp = this.maxHp;
    this.damage = config.baseDamage + (level - 1) * SCALING.BOSS_DAMAGE_PER_LEVEL;
    this.moveSpeed = config.baseSpeed + (level - 1) * SCALING.BOSS_SPEED_PER_LEVEL;
    this.color = config.color;
    this.accentColor = config.accentColor;

    this.x = x;
    this.y = y;
    this.alive = true;
    this.enraged = false;
    this.enrageCount = 0;
    this.enrageThresholds = config.enrageThresholds || [0.5];
    this.arenaBounds = null;
    this.onDeath = null;

    // Attack state machine
    this._state = 'spawn'; // spawn | idle | telegraph | attack | cooldown
    this._stateTimer = 0;
    this._currentAttack = null;
    this._attackCooldown = 1800; // base ms between attacks (decreases on enrage)
    this._telegraphDuration = 900; // ms players have to react (decreases on enrage)
    this._spawnImmunity = 600; // ms

    // Event emitter for HP changes
    this.events = new Phaser.Events.EventEmitter();

    // Ground shadow
    this.shadowG = scene.add.graphics();
    this.shadowG.setDepth(9);

    // Build visuals
    this.container = scene.add.container(x, y);
    this.container.setDepth(10);
    this._buildGraphics();

    // Spawn animation
    this.container.setAlpha(0);
    this.container.setScale(0.2);
    scene.tweens.add({
      targets: this.container,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 500, ease: 'Back.easeOut',
      onComplete: () => {
        this._state = 'idle';
        this._stateTimer = 800;
        // B — spawn materialization burst
        spawnBurst(scene, x, y, {
          color: this.accentColor, count: 14,
          minDist: 30, maxDist: 90, duration: 500,
        });
      }
    });
  }

  setArenaBounds(rect) {
    this.arenaBounds = rect;
  }

  /** Extra hit zones beyond the main body circle, in world coords: [{x,y,r}].
   *  Subclasses with limbs (e.g. Stomper) override this. */
  getAuxHitZones() { return []; }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.events.emit('hpChanged', this.hp);

    // Hit flash
    this.container.setAlpha(0.4);
    this.scene.time.delayedCall(80, () => this.container.setAlpha(1));

    // A — blood splatter on hit
    spawnBlood(this.scene, this.x, this.y, 10);

    // Check enrage thresholds
    const ratio = this.hp / this.maxHp;
    if (this.enrageCount < this.enrageThresholds.length &&
        ratio <= this.enrageThresholds[this.enrageCount]) {
      this.enrageCount++;
      this._triggerEnrage();
    }

    if (this.hp <= 0) this._die();
  }

  _triggerEnrage() {
    if (this.enraged) return;
    this.enraged = true;
    this._attackCooldown = Math.max(800, this._attackCooldown - 400);
    this._telegraphDuration = Math.max(400, this._telegraphDuration - 200);
    this.events.emit('enraged');

    // Visual enrage pulse
    this.scene.tweens.add({
      targets: this.container,
      scaleX: 1.15, scaleY: 1.15,
      duration: 200, yoyo: true, repeat: 2,
    });

    // Red glow flash
    const glow = this.scene.add.graphics();
    glow.fillStyle(0xff0000, 0.25);
    glow.fillCircle(0, 0, this.size + 30);
    glow.x = this.x;
    glow.y = this.y;
    glow.setDepth(9);
    this.scene.tweens.add({
      targets: glow, alpha: 0, duration: 600,
      onComplete: () => glow.destroy()
    });

    // C — dramatic enrage aura burst
    spawnBurst(this.scene, this.x, this.y, {
      color: 0xff2200, count: 16,
      minDist: 40, maxDist: 110,
      minSize: 5, maxSize: 14,
      duration: 350,
    });
  }

  _updateShadow() {
    if (!this.shadowG || !this.shadowG.active) return;
    this.shadowG.clear();
    this.shadowG.fillStyle(0x000000, 0.32);
    this.shadowG.fillEllipse(this.x + 5, this.y + this.size * 0.62, this.size * 2.1, this.size * 0.5);
  }

  _die() {
    if (!this.alive) return;
    this.alive = false;
    if (this.shadowG) { this.shadowG.destroy(); this.shadowG = null; }

    // Death explosion
    for (let i = 0; i < 16; i++) {
      const frag = this.scene.add.graphics();
      frag.fillStyle(this.color, 1);
      const sz = Phaser.Math.Between(6, 18);
      frag.fillRect(-sz / 2, -sz / 2, sz, sz);
      frag.x = this.x;
      frag.y = this.y;
      frag.setDepth(20);
      const angle = (i / 16) * Math.PI * 2;
      const dist = Phaser.Math.Between(50, 150);
      this.scene.tweens.add({
        targets: frag,
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
        alpha: 0, angle: Phaser.Math.Between(-360, 360),
        duration: Phaser.Math.Between(500, 900),
        ease: 'Quad.easeOut',
        onComplete: () => frag.destroy()
      });
    }

    this.container.destroy(true);
    if (this.onDeath) this.onDeath();
  }

  /** Arena-aware wall-slide movement for boss. Updates this.x / this.y. */
  _tryMove(nx, ny) {
    const arena = this.scene.arena;
    const r = this.size;
    if (!arena) { this.x = nx; this.y = ny; return; }
    if (arena.containsPoint(nx, ny, r)) {
      this.x = nx; this.y = ny;
    } else if (arena.containsPoint(nx, this.y, r)) {
      this.x = nx;
    } else if (arena.containsPoint(this.x, ny, r)) {
      this.y = ny;
    }
    // else: fully blocked — stay put
  }

  /** Push the boss out of any overlapping obstacle bases. */
  _pushOutObstacles() {
    const r = this.size;
    this.scene.obstacles?.forEach(obs => {
      const ocy = obs.y + (obs.colOffsetY || 0);
      const dx = this.x - obs.x, dy = this.y - ocy;
      const dist = Math.hypot(dx, dy);
      const min = r + obs.baseRadius;
      if (dist < min && dist > 0.01) {
        const push = (min - dist) / dist;
        this.x += dx * push;
        this.y += dy * push;
      }
    });
  }

  _moveToward(targetX, targetY, speed, dt) {
    const dist = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    if (dist < 2) return;

    // Base direction toward target
    let dx = (targetX - this.x) / dist;
    let dy = (targetY - this.y) / dist;

    // Obstacle repulsion — steer around nearby obstacles rather than getting pinned
    const AVOID_R = this.size + 90;
    this.scene.obstacles?.forEach(obs => {
      const ox = this.x - obs.x, oy = this.y - obs.y;
      const od = Math.hypot(ox, oy);
      if (od < AVOID_R && od > 0.01) {
        const strength = (1 - od / AVOID_R) * 2.8;
        dx += (ox / od) * strength;
        dy += (oy / od) * strength;
      }
    });

    const len = Math.hypot(dx, dy) || 1;
    this._tryMove(this.x + (dx / len) * speed * dt, this.y + (dy / len) * speed * dt);
    this._pushOutObstacles();
    this.container.x = this.x;
    this.container.y = this.y;
  }

  // Spawn a boss projectile. maxDist=0 means unlimited range.
  // spawnX/spawnY default to boss center; pass rift position for projectile attacks.
  _spawnProjectile(angle, speed, color, radius, damage, homing = false, maxDist = 0, spawnX = null, spawnY = null) {
    const texKey = this._getProjectileTexture(color, radius);
    const proj = this.scene.add.image(spawnX ?? this.x, spawnY ?? this.y, texKey);
    proj.setOrigin(0.5, 0.5).setDepth(8);

    proj._vx = Math.cos(angle) * speed;
    proj._vy = Math.sin(angle) * speed;
    proj._damage = damage;
    proj._homing = homing;
    proj._alive = true;
    proj._radius = radius;
    proj._color = color;
    proj._isSpecial = radius >= 35;   // large shots get an impact ring on hit
    proj._distTraveled = 0;

    const _destroy = () => {
      if (!proj.active) return;
      proj._alive = false;
      proj.destroy();
      this.scene.events.off('update', update);
    };

    const update = (time, delta) => {
      if (!proj._alive || !proj.active) {
        this.scene.events.off('update', update);
        return;
      }
      const dt = delta / 1000;
      if (proj._homing && this.scene.player) {
        const px = this.scene.player.x, py = this.scene.player.y;
        const homeAngle = Phaser.Math.Angle.Between(proj.x, proj.y, px, py);
        proj._vx = Phaser.Math.Linear(proj._vx, Math.cos(homeAngle) * speed * 0.6, 0.04);
        proj._vy = Phaser.Math.Linear(proj._vy, Math.sin(homeAngle) * speed * 0.6, 0.04);
      }
      proj.x += proj._vx * dt;
      proj.y += proj._vy * dt;
      proj._distTraveled += speed * dt;

      // Range limit — fizzle out at max distance
      if (maxDist > 0 && proj._distTraveled > maxDist) {
        proj._alive = false;
        this.scene.tweens.add({ targets: proj, alpha: 0, duration: 120, onComplete: () => proj.destroy() });
        this.scene.events.off('update', update);
        return;
      }

      // Arena bounds check
      const sceneArena = this.scene.arena;
      if (sceneArena && !sceneArena.containsPoint(proj.x, proj.y, 0)) {
        _destroy(); return;
      }

      // Obstacle collision — projectile breaks the obstacle then disappears
      if (this.scene.obstacles) {
        for (const obs of this.scene.obstacles) {
          const ocy = obs.y + (obs.colOffsetY || 0);
          if (Phaser.Math.Distance.Between(proj.x, proj.y, obs.x, ocy) < obs.baseRadius + radius) {
            obs.break();
            _destroy(); return;
          }
        }
      }

      // Hit player
      const p = this.scene.player;
      if (p && p.alive && !p.invincible) {
        if (Phaser.Math.Distance.Between(proj.x, proj.y, p.x, p.y) < radius + 16) {
          // Impact sparks at player surface + ring for special shots
          const hitAngle = Math.atan2(proj.y - p.y, proj.x - p.x);
          const sx = p.x + Math.cos(hitAngle) * 16;
          const sy = p.y + Math.sin(hitAngle) * 16;
          spawnSparks(this.scene, sx, sy, proj._color || 0xff8800, 7);
          if (proj._isSpecial) spawnImpactRing(this.scene, sx, sy, proj._color || 0xff8800);
          p.takeDamage(proj._damage);
          _destroy();
        }
      }
    };
    this.scene.events.on('update', update);

    // Guaranteed cleanup when scene shuts down — prevents listener accumulation across levels
    this.scene.events.once('shutdown', _destroy);

    return proj;
  }

  // Bake a gradient fill texture for telegraphs using Canvas 2D API.
  // Generated once per (shape, color) pair and cached as a Phaser texture.
  _getTelegraphTexture(shape, color) {
    const key = `tele-${shape}-${color.toString(16)}`;
    if (this.scene.textures.exists(key)) return key;

    const SIZE = 512;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE; canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const R = (color >> 16) & 0xff;
    const G = (color >> 8)  & 0xff;
    const B =  color        & 0xff;

    if (shape === 'circle') {
      const cx = SIZE / 2, cy = SIZE / 2, r = SIZE / 2;
      // Clip to circle so outside stays transparent
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0.00, `rgba(${R},${G},${B},0.00)`);
      grad.addColorStop(0.55, `rgba(${R},${G},${B},0.03)`);
      grad.addColorStop(0.75, `rgba(${R},${G},${B},0.10)`);
      grad.addColorStop(0.88, `rgba(${R},${G},${B},0.28)`);
      grad.addColorStop(0.95, `rgba(${R},${G},${B},0.55)`);
      grad.addColorStop(1.00, `rgba(${R},${G},${B},0.00)`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.restore();
      // Baked ring strokes (inner glow + bright edge)
      ctx.strokeStyle = `rgba(${R},${G},${B},0.25)`; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(${R},${G},${B},0.85)`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, Math.PI * 2); ctx.stroke();
    }

    if (shape === 'rect') {
      // Symmetric horizontal gradient: bright at x=0 and x=512, dark at x=256
      const grad = ctx.createLinearGradient(0, 0, SIZE, 0);
      grad.addColorStop(0.00, `rgba(${R},${G},${B},0.55)`);
      grad.addColorStop(0.15, `rgba(${R},${G},${B},0.28)`);
      grad.addColorStop(0.35, `rgba(${R},${G},${B},0.10)`);
      grad.addColorStop(0.50, `rgba(${R},${G},${B},0.03)`);
      grad.addColorStop(0.65, `rgba(${R},${G},${B},0.10)`);
      grad.addColorStop(0.85, `rgba(${R},${G},${B},0.28)`);
      grad.addColorStop(1.00, `rgba(${R},${G},${B},0.55)`);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, SIZE, SIZE);
    }

    this.scene.textures.addCanvas(key, canvas);
    return key;
  }

  // Bake a sphere-shaded texture for projectiles using Canvas 2D API.
  // Generated once per (color, radius) pair and cached as a Phaser texture.
  _getProjectileTexture(color, radius) {
    const key = `fx-proj-${color.toString(16)}-${radius}`;
    if (this.scene.textures.exists(key)) return key;

    const PAD = 14;
    const S = (radius + PAD) * 2;
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d');
    const cx = S / 2, cy = S / 2;
    const R = (color >> 16) & 0xff;
    const G = (color >> 8)  & 0xff;
    const B =  color        & 0xff;

    // Layer 1 — outer energy halo
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius + PAD);
    glow.addColorStop(0, `rgba(${R},${G},${B},0.50)`);
    glow.addColorStop(1, `rgba(${R},${G},${B},0.00)`);
    ctx.fillStyle = glow; ctx.fillRect(0, 0, S, S);

    // Layer 2 — sphere body (offset focal point for 3D shading)
    const sx = cx - radius * 0.3, sy = cy - radius * 0.3;
    const lr = Math.min(255, Math.round(R * 1.5 + 80));
    const lg = Math.min(255, Math.round(G * 1.5 + 80));
    const lb = Math.min(255, Math.round(B * 1.5 + 80));
    const dr = Math.round(R * 0.3), dg = Math.round(G * 0.3), db = Math.round(B * 0.3);
    const sphere = ctx.createRadialGradient(sx, sy, 0, cx, cy, radius);
    sphere.addColorStop(0.00, 'rgba(255,255,255,0.95)');
    sphere.addColorStop(0.18, `rgba(${lr},${lg},${lb},0.90)`);
    sphere.addColorStop(0.48, `rgba(${R},${G},${B},0.95)`);
    sphere.addColorStop(0.80, `rgba(${dr},${dg},${db},0.90)`);
    sphere.addColorStop(1.00, `rgba(${dr},${dg},${db},0.00)`);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = sphere; ctx.fillRect(0, 0, S, S);
    ctx.restore();

    this.scene.textures.addCanvas(key, canvas);
    return key;
  }

  // Draw a telegraph zone on the floor — Canvas 2D gradient fill + animated ring overlay
  _drawTelegraphZone(x, y, radius, duration, color = 0xff4400) {
    const texKey = this._getTelegraphTexture('circle', color);
    const container = this.scene.add.container(x, y);
    container.setDepth(5);

    // Gradient fill sprite (texture half-size = 256, scaled to match radius)
    const spr = this.scene.add.image(0, 0, texKey).setAlpha(0);
    // Ring overlay Graphics — only pulsing strokes, no fill drawn here
    const ring = this.scene.add.graphics();
    container.add([spr, ring]);

    this.scene.tweens.addCounter({
      from: 0, to: 1, duration,
      onUpdate: (tween) => {
        const t = tween.getValue();

        // Animated radius: expand → overshoot → settle
        let rMult;
        if      (t < 0.35) { rMult = (t / 0.35) * 1.12; }
        else if (t < 0.55) { rMult = 1.12 - 0.12 * ((t - 0.35) / 0.20); }
        else               { rMult = 1.0; }
        const r = radius * rMult;

        // Scale sprite to current radius (texture radius = 256px)
        spr.setScale(r / 256);

        // Pulse signal: starts after settle, frequency doubles in urgency window
        const pulsePhase = Math.max(0, (t - 0.55) / 0.45);
        const freq = t > 0.85 ? 10 : 5;
        const pulse = pulsePhase * 0.25 * Math.abs(Math.sin(pulsePhase * freq * Math.PI));

        // Ramp sprite alpha in during expand, add slight pulse boost after settle
        spr.setAlpha(Math.min(1, t * 2.2 + pulse * 0.15));

        // Ring overlay: pulsing halo + bright ring + inner accent + urgency flash
        ring.clear();
        ring.lineStyle(6, color, 0.08 + pulse * 0.3); ring.strokeCircle(0, 0, r + 3);
        ring.lineStyle(4, color, 0.15 + pulse * 0.4); ring.strokeCircle(0, 0, r + 1);
        ring.lineStyle(2.5 + pulse * 1.5, color, Math.min(1, 0.55 + t * 0.35 + pulse));
        ring.strokeCircle(0, 0, r);
        if (t > 0.5) {
          ring.lineStyle(1.2, color, (t - 0.5) / 0.5 * 0.35);
          ring.strokeCircle(0, 0, r - 9);
        }
        if (t > 0.85) {
          ring.lineStyle(2, 0xffffff, ((t - 0.85) / 0.15) * 0.5);
          ring.strokeCircle(0, 0, r);
        }
      },
      onComplete: () => container.destroy(true)
    });
    return container;
  }

  // Draw a telegraph rectangle — Canvas 2D gradient fill sprite + Graphics outline/markers
  // fromX/Y = boss position, toX/Y = charge destination, halfWidth = contact radius.
  _drawTelegraphRect(fromX, fromY, toX, toY, halfWidth, duration, color = 0xff4400) {
    const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    const px = Math.cos(angle + Math.PI / 2);
    const py = Math.sin(angle + Math.PI / 2);
    const len = Phaser.Math.Distance.Between(fromX, fromY, toX, toY);
    const mx = (fromX + toX) / 2;
    const my = (fromY + toY) / 2;

    const corners = (hw) => [
      { x: fromX + px * hw, y: fromY + py * hw },
      { x: fromX - px * hw, y: fromY - py * hw },
      { x: toX   - px * hw, y: toY   - py * hw },
      { x: toX   + px * hw, y: toY   + py * hw },
    ];

    // Gradient fill sprite — X axis = width direction (gradient), Y axis = length direction
    // rotation = angle - π/2 maps texture X → perpendicular-to-attack in world space
    const texKey = this._getTelegraphTexture('rect', color);
    const spr = this.scene.add.image(mx, my, texKey);
    spr.setDepth(5).setAlpha(0);
    spr.setRotation(angle - Math.PI / 2);
    spr.setScale((halfWidth * 2) / 512, len / 512);

    // Graphics for outline, corner markers, leading edge, urgency flash only
    const rect = this.scene.add.graphics();
    rect.setDepth(6);

    this.scene.tweens.addCounter({
      from: 0, to: 1, duration,
      onUpdate: (tween) => {
        const t = tween.getValue();
        rect.clear();

        // Animated halfWidth: slash open → overshoot → settle
        let hwMult;
        if      (t < 0.30) { hwMult = (t / 0.30) * 1.15; }
        else if (t < 0.50) { hwMult = 1.15 - 0.15 * ((t - 0.30) / 0.20); }
        else               { hwMult = 1.0; }
        const hw = halfWidth * hwMult;
        const pts = corners(hw);

        // Pulse signal: starts after settle, frequency doubles in urgency window
        const pulsePhase = Math.max(0, (t - 0.50) / 0.50);
        const freq = t > 0.85 ? 10 : 5;
        const pulse = pulsePhase * 0.3 * Math.abs(Math.sin(pulsePhase * freq * Math.PI));

        // Animate gradient sprite width (scaleX) with hwMult for slash-open effect
        spr.scaleX = (hw * 2) / 512;
        spr.setAlpha(Math.min(1, t * 2 + pulse * 0.1));

        // Main outline
        rect.lineStyle(2 + pulse, color, Math.min(1, 0.5 + t * 0.4 + pulse));
        rect.strokePoints(pts, true);

        // Leading edge (far end) — brighter accent line
        rect.lineStyle(2.5 + pulse, color, Math.min(1, 0.7 + pulse));
        rect.lineBetween(pts[2].x, pts[2].y, pts[3].x, pts[3].y);

        // Corner markers
        const dotAlpha = Math.min(1, 0.4 + t * 0.5 + pulse);
        for (const pt of pts) {
          rect.fillStyle(color, dotAlpha);
          rect.fillCircle(pt.x, pt.y, 2.5 + pulse);
        }

        // Urgency white flash on outline
        if (t > 0.85) {
          rect.lineStyle(1.5, 0xffffff, ((t - 0.85) / 0.15) * 0.45);
          rect.strokePoints(pts, true);
        }
      },
      onComplete: () => { spr.destroy(); rect.destroy(); },
    });
    return rect;
  }

  // Draw a telegraph line (laser warning)
  _drawTelegraphLine(x1, y1, x2, y2, duration, color = 0xff4400) {
    const line = this.scene.add.graphics();
    line.setDepth(5);
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration,
      onUpdate: (tween) => {
        line.clear();
        line.lineStyle(2 + tween.getValue() * 3, color, 0.4 + tween.getValue() * 0.6);
        line.lineBetween(x1, y1, x2, y2);
      },
      onComplete: () => line.destroy()
    });
    return line;
  }

  update(time, delta) {
    if (!this.alive) return;
    const dt = delta / 1000;
    this._stateTimer -= delta;
    this._updateShadow();

    switch (this._state) {
      case 'spawn':
        break;
      case 'idle':
        if (this._stateTimer <= 0) {
          this._chooseAttack();
        }
        break;
      case 'telegraph':
        // Telegraph handled in attack methods with callbacks
        break;
      case 'attack':
        // Attack execution handled in subclass
        break;
      case 'cooldown':
        if (this._stateTimer <= 0) {
          this._state = 'idle';
          this._stateTimer = this.enraged ? this._attackCooldown * 0.6 : this._attackCooldown;
        }
        break;
    }
  }

  _chooseAttack() {
    const pool = [...this._getAttackPool()];
    if (this.enraged) pool.push(...this._getEnrageAttacks());
    const choice = pool[Math.floor(Math.random() * pool.length)];
    this._state = 'telegraph';
    this._runAttack(choice);
  }

  _endAttack() {
    this._state = 'cooldown';
    this._stateTimer = this.enraged ? this._attackCooldown * 0.7 : this._attackCooldown;
  }

  // Subclass stubs
  _buildGraphics() {}
  _getAttackPool() { return []; }
  _getEnrageAttacks() { return []; }
  _runAttack(name) { this._endAttack(); }
}
