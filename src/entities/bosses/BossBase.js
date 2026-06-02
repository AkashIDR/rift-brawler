import Phaser from 'phaser';
import { SCALING } from '../../config/gameConfig.js';

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
      onComplete: () => { this._state = 'idle'; this._stateTimer = 800; }
    });
  }

  setArenaBounds(rect) {
    this.arenaBounds = rect;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.events.emit('hpChanged', this.hp);

    // Hit flash
    this.container.setAlpha(0.4);
    this.scene.time.delayedCall(80, () => this.container.setAlpha(1));

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
      const dx = this.x - obs.x, dy = this.y - obs.y;
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
    const proj = this.scene.add.graphics();
    proj.fillStyle(color, 1);
    proj.fillCircle(0, 0, radius);
    proj.lineStyle(2, 0xffffff, 0.4);
    proj.strokeCircle(0, 0, radius);
    proj.x = spawnX ?? this.x;
    proj.y = spawnY ?? this.y;
    proj.setDepth(8);

    proj._vx = Math.cos(angle) * speed;
    proj._vy = Math.sin(angle) * speed;
    proj._damage = damage;
    proj._homing = homing;
    proj._alive = true;
    proj._radius = radius;
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
          if (Phaser.Math.Distance.Between(proj.x, proj.y, obs.x, obs.y) < obs.baseRadius + radius) {
            obs.break();
            _destroy(); return;
          }
        }
      }

      // Hit player
      const p = this.scene.player;
      if (p && p.alive && !p.invincible) {
        if (Phaser.Math.Distance.Between(proj.x, proj.y, p.x, p.y) < radius + 16) {
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

  // Draw a telegraph zone on the floor
  _drawTelegraphZone(x, y, radius, duration, color = 0xff4400) {
    const zone = this.scene.add.graphics();
    zone.x = x;
    zone.y = y;
    zone.setDepth(5);

    this.scene.tweens.addCounter({
      from: 0, to: 1, duration,
      onUpdate: (tween) => {
        const t = tween.getValue();
        zone.clear();
        zone.fillStyle(color, 0.15 + t * 0.2);
        zone.fillCircle(0, 0, radius);
        zone.lineStyle(3, color, 0.5 + t * 0.5);
        zone.strokeCircle(0, 0, radius);
      },
      onComplete: () => zone.destroy()
    });
    return zone;
  }

  // Draw a telegraph rectangle showing the exact hitbox path of a charge attack.
  // fromX/Y = boss position, toX/Y = charge destination, halfWidth = contact radius.
  _drawTelegraphRect(fromX, fromY, toX, toY, halfWidth, duration, color = 0xff4400) {
    const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    const px = Math.cos(angle + Math.PI / 2);
    const py = Math.sin(angle + Math.PI / 2);

    const corners = () => [
      { x: fromX + px * halfWidth, y: fromY + py * halfWidth },
      { x: fromX - px * halfWidth, y: fromY - py * halfWidth },
      { x: toX   - px * halfWidth, y: toY   - py * halfWidth },
      { x: toX   + px * halfWidth, y: toY   + py * halfWidth },
    ];

    const rect = this.scene.add.graphics();
    rect.setDepth(5);

    this.scene.tweens.addCounter({
      from: 0, to: 1, duration,
      onUpdate: (tween) => {
        const t = tween.getValue();
        rect.clear();
        rect.fillStyle(color, 0.08 + t * 0.18);
        rect.fillPoints(corners(), true);
        rect.lineStyle(2, color, 0.45 + t * 0.55);
        rect.strokePoints(corners(), true);
      },
      onComplete: () => rect.destroy(),
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
