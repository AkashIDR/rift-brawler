import Phaser from 'phaser';
import {
  PLAYER, SKILLS, COLORS, SCALING,
  GAME_WIDTH, GAME_HEIGHT
} from '../config/gameConfig.js';

export default class Player {
  constructor(scene, x, y, level = 1, incomingHp = null) {
    this.scene = scene;
    this.level = level;

    // --- Stats (scaled by level) ---
    const hpBonus = (level - 1) * SCALING.HP_PER_LEVEL;
    this.maxHp = PLAYER.BASE_HP + hpBonus;
    this.hp = incomingHp !== null ? Math.min(incomingHp, this.maxHp) : this.maxHp;
    this.speed = PLAYER.BASE_SPEED + (level - 1) * SCALING.BOSS_SPEED_PER_LEVEL * 0.5;
    this.staminaMax = PLAYER.STAMINA_MAX;
    this.stamina = this.staminaMax;
    this.baseDamage = PLAYER.BASE_DAMAGE * (1 + (level - 1) * SCALING.DAMAGE_MULTIPLIER_PER_LEVEL);

    // --- Position ---
    this.x = x;
    this.y = y;

    // --- State ---
    this.alive = true;
    this.invincible = false;
    this.moving = false;
    this.targetX = x;
    this.targetY = y;
    this.facingAngle = 0; // radians, toward mouse

    // --- Cooldowns (timestamps) ---
    this.skillCooldowns = { Q: 0, W: 0, E: 0, SPACE: 0 };
    this.skillCooldownDurations = {
      Q: SKILLS.Q.cooldown,
      W: SKILLS.W.cooldown,
      E: SKILLS.E.cooldown,
      SPACE: PLAYER.DODGE_COOLDOWN,
    };
    this.basicAttackCooldown = 0;
    this.isDodging = false;

    // --- Bounds ---
    this.arenaBounds = null;

    // --- Graphics ---
    this._buildGraphics();
    this._buildFloatingHPBar();

    // --- Projectile group ---
    this.projectiles = scene.add.group();

    // --- Input ---
    this._setupInput();

    // --- Animations ---
    this._idleTimer = 0;
    this._legPhase = 0;
    this._hitFlashTimer = 0;
  }

  setArenaBounds(rect) {
    this.arenaBounds = rect;
  }

  _buildGraphics() {
    // Ground shadow (below everything)
    this.shadowG = this.scene.add.graphics();
    this.shadowG.setDepth(9);

    this.container = this.scene.add.container(this.x, this.y);
    this.container.setDepth(10);

    // All parts drawn as Graphics children of the container
    this.gBody = this.scene.add.graphics();
    this.gHead = this.scene.add.graphics();
    this.gHelmet = this.scene.add.graphics();
    this.gArmL = this.scene.add.graphics();
    this.gArmR = this.scene.add.graphics();
    this.gLegL = this.scene.add.graphics();
    this.gLegR = this.scene.add.graphics();
    this.gShield = this.scene.add.graphics();

    this.container.add([
      this.gLegL, this.gLegR,
      this.gBody,
      this.gArmL, this.gArmR,
      this.gShield,
      this.gHead,
      this.gHelmet,
    ]);

    this.container.setScale(0.765);
    this._drawCharacter(0);
  }

  _drawCharacter(legSwing) {
    const outline = 0x1a1a2a;

    // --- Legs: horizontal crossing (left swings right, right swings left) ---
    this.gLegL.clear();
    this.gLegL.fillStyle(0x2277cc, 1);
    this.gLegL.fillRoundedRect(-14 + legSwing, 18, 10, 16, 3);
    this.gLegL.lineStyle(1.5, outline, 1);
    this.gLegL.strokeRoundedRect(-14 + legSwing, 18, 10, 16, 3);

    this.gLegR.clear();
    this.gLegR.fillStyle(0x2277cc, 1);
    this.gLegR.fillRoundedRect(4 - legSwing, 18, 10, 16, 3);
    this.gLegR.lineStyle(1.5, outline, 1);
    this.gLegR.strokeRoundedRect(4 - legSwing, 18, 10, 16, 3);

    // --- Body ---
    this.gBody.clear();
    this.gBody.fillStyle(COLORS.PLAYER_BODY, 1);
    this.gBody.fillRoundedRect(-16, -10, 32, 28, 6);
    this.gBody.lineStyle(2, outline, 1);
    this.gBody.strokeRoundedRect(-16, -10, 32, 28, 6);
    // Chest emblem (small cross)
    this.gBody.fillStyle(COLORS.PLAYER_HELMET, 0.7);
    this.gBody.fillRect(-2, -2, 4, 10);
    this.gBody.fillRect(-5, 1, 10, 4);

    // --- Arms (will be rotated separately toward cursor) ---
    this.gArmL.clear();
    this.gArmL.fillStyle(0x2277cc, 1);
    this.gArmL.fillRoundedRect(-24, -4, 10, 18, 4);
    this.gArmL.lineStyle(1.5, outline, 1);
    this.gArmL.strokeRoundedRect(-24, -4, 10, 18, 4);

    this.gArmR.clear();
    this.gArmR.fillStyle(0x2277cc, 1);
    this.gArmR.fillRoundedRect(14, -4, 10, 18, 4);
    this.gArmR.lineStyle(1.5, outline, 1);
    this.gArmR.strokeRoundedRect(14, -4, 10, 18, 4);

    // --- Shield on left arm ---
    this.gShield.clear();
    this.gShield.fillStyle(COLORS.PLAYER_SHIELD, 1);
    this.gShield.fillRoundedRect(-30, -2, 14, 16, 3);
    this.gShield.lineStyle(1.5, 0xaa7700, 1);
    this.gShield.strokeRoundedRect(-30, -2, 14, 16, 3);

    // --- Head ---
    this.gHead.clear();
    this.gHead.fillStyle(COLORS.PLAYER_HEAD, 1);
    this.gHead.fillCircle(0, -18, 13);
    this.gHead.lineStyle(2, outline, 1);
    this.gHead.strokeCircle(0, -18, 13);

    // --- Helmet ---
    this.gHelmet.clear();
    this.gHelmet.fillStyle(COLORS.PLAYER_HELMET, 1);
    this.gHelmet.fillRoundedRect(-13, -30, 26, 14, { tl: 5, tr: 5, bl: 0, br: 0 });
    this.gHelmet.lineStyle(2, 0x667788, 1);
    this.gHelmet.strokeRoundedRect(-13, -30, 26, 14, { tl: 5, tr: 5, bl: 0, br: 0 });
    // Visor slit
    this.gHelmet.fillStyle(0x334455, 1);
    this.gHelmet.fillRect(-8, -22, 16, 4);
  }

  _buildFloatingHPBar() {
    this.floatHPBg = this.scene.add.graphics();
    this.floatHPFill = this.scene.add.graphics();
    this.floatHPBg.setDepth(15);
    this.floatHPFill.setDepth(16);
    this._updateFloatingHP();
  }

  _updateFloatingHP() {
    const bw = PLAYER.HP_BAR_WIDTH;
    const bh = PLAYER.HP_BAR_HEIGHT;
    const bx = this.x - bw / 2;
    const by = this.y + PLAYER.HP_BAR_OFFSET_Y;

    this.floatHPBg.clear();
    this.floatHPBg.fillStyle(0x220000, 1);
    this.floatHPBg.fillRoundedRect(bx, by, bw, bh, 2);

    this.floatHPFill.clear();
    const ratio = Math.max(0, this.hp / this.maxHp);
    const fillW = (bw - 2) * ratio;
    if (fillW > 1) {
      const col = ratio < 0.25 ? 0xff0000 : 0xe74c3c;
      this.floatHPFill.fillStyle(col, 1);
      this.floatHPFill.fillRoundedRect(bx + 1, by + 1, fillW, bh - 2, 2);
    }
  }

  _setupInput() {
    const scene = this.scene;

    // Right-click: move (use worldX/Y so coordinates work in large camera-followed worlds)
    scene.input.on('pointerdown', (ptr) => {
      if (ptr.rightButtonDown()) {
        this.targetX = ptr.worldX;
        this.targetY = ptr.worldY;
        this.moving = true;
      }
      if (ptr.leftButtonDown()) {
        this._handleLeftClick(ptr);
      }
    });

    scene.input.on('pointermove', (ptr) => {
      // Continuous right-click hold movement
      if (ptr.rightButtonDown()) {
        this.targetX = ptr.worldX;
        this.targetY = ptr.worldY;
        this.moving = true;
      }
      // Always track facing angle (world coords)
      this.facingAngle = Phaser.Math.Angle.Between(this.x, this.y, ptr.worldX, ptr.worldY);
    });

    // Do NOT stop movement on right-click release —
    // player continues to the last registered target and stops on arrival.

    // Skill keys
    scene.input.keyboard.on('keydown-Q', () => this._useSkill('Q'));
    scene.input.keyboard.on('keydown-W', () => this._useSkill('W'));
    scene.input.keyboard.on('keydown-E', () => this._useSkill('E'));
    scene.input.keyboard.on('keydown-SPACE', (e) => {
      e.preventDefault();
      this._dodge();
    });
  }

  _handleLeftClick(ptr) {
    this._basicAttack(ptr);
  }

  _basicAttack(ptr) {
    const now = this.scene.time.now;
    if (now < this.basicAttackCooldown) return;
    this.basicAttackCooldown = now + PLAYER.BASIC_ATTACK_COOLDOWN;

    const angle = Phaser.Math.Angle.Between(this.x, this.y, ptr.worldX, ptr.worldY);
    this._fireProjectile(angle, this.baseDamage, 0x88ddff, 7, PLAYER.BASIC_ATTACK_SPEED, false);

    // Arm recoil animation
    this.scene.tweens.add({
      targets: this.gArmR,
      x: Math.cos(angle) * 6,
      y: Math.sin(angle) * 6,
      duration: 80,
      yoyo: true,
    });
  }

  _fireProjectile(angle, damage, color, radius, speed, isSkill) {
    const proj = this.scene.add.graphics();

    // Outer glow
    proj.fillStyle(color, 0.18);
    proj.fillCircle(0, 0, radius * 3.2);
    // Mid glow
    proj.fillStyle(color, 0.42);
    proj.fillCircle(0, 0, radius * 1.9);
    // Main body
    proj.fillStyle(color, 1);
    proj.fillCircle(0, 0, radius);
    // Bright white core
    proj.fillStyle(0xffffff, 0.9);
    proj.fillCircle(0, 0, radius * 0.42);

    if (isSkill) {
      proj.lineStyle(2.5, 0xffffff, 0.75);
      proj.strokeCircle(0, 0, radius * 1.15);
    }

    proj.x = this.x;
    proj.y = this.y;
    proj.setDepth(8);

    proj._vx = Math.cos(angle) * speed;
    proj._vy = Math.sin(angle) * speed;
    proj._damage = damage;
    proj._isSkill = isSkill;
    proj._alive = true;
    proj._color = color;
    proj._radius = radius;
    proj._trailTimer = 0;

    this.projectiles.add(proj);
  }

  _useSkill(key) {
    const now = this.scene.time.now;
    if (now < this.skillCooldowns[key]) return;

    const skill = SKILLS[key];
    if (this.stamina < skill.staminaCost) return;

    this.stamina -= skill.staminaCost;
    this.skillCooldowns[key] = now + skill.cooldown;

    const angle = this.facingAngle;
    const dmg = skill.damage * (1 + (this.level - 1) * SCALING.DAMAGE_MULTIPLIER_PER_LEVEL);

    if (key === 'Q') {
      // Power Strike — big fast projectile
      this._fireProjectile(angle, dmg, SKILLS.Q.color, 11, SKILLS.Q.projectileSpeed, true);
      this.scene.cameras.main.shake(80, 0.0015);
    } else if (key === 'W') {
      // Shield Dash — dash + i-frames + contact damage
      this._doDash(angle, SKILLS.W.dashDistance, SKILLS.W.dashSpeed, SKILLS.W.iframeDuration, dmg, 0x44aaff);
    } else if (key === 'E') {
      // Ground Slam — AoE around player
      this._groundSlam(dmg, SKILLS.E.radius);
    }
  }

  _dodge() {
    const now = this.scene.time.now;
    if (now < this.skillCooldowns['SPACE']) return;
    if (this.stamina < PLAYER.DODGE_STAMINA_COST) return;
    this.stamina -= PLAYER.DODGE_STAMINA_COST;
    this.skillCooldowns['SPACE'] = now + PLAYER.DODGE_COOLDOWN;

    this._doDash(this.facingAngle, PLAYER.DODGE_DISTANCE, PLAYER.DODGE_SPEED, PLAYER.DODGE_IFRAME_DURATION, 0, 0x44ff88);
  }

  _doDash(angle, distance, speed, iframeDur, contactDmg, trailColor) {
    if (this.isDodging) return;
    this.isDodging = true;
    this.invincible = true;

    const dashEnd = this._findLastValidDashPoint(angle, distance);
    const targetX = dashEnd.x;
    const targetY = dashEnd.y;
    const duration = (distance / speed) * 1000;

    // Ghost trail
    this._spawnGhostTrail(trailColor);

    // One-hit flag — contact damage fires at most once per dash
    let dashHitLanded = false;

    this.scene.tweens.add({
      targets: this.container,
      x: targetX,
      y: targetY,
      duration,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        this.x = this.container.x;
        this.y = this.container.y;
        this._updateFloatingHP();
        // Contact damage on dash through boss — only once per dash
        if (contactDmg > 0 && !dashHitLanded) {
          if (this._checkContactDamage(contactDmg)) dashHitLanded = true;
        }
      },
      onComplete: () => {
        this.isDodging = false;
        const ptr = this.scene.input.activePointer;
        // Dot-product tells us whether the cursor is still ahead of the landing
        // point in the dash direction.  Positive → ahead, resume.  Zero/negative
        // → player overshot the cursor, stop here instead of walking backward.
        const dot = (ptr.worldX - this.x) * Math.cos(angle)
                  + (ptr.worldY - this.y) * Math.sin(angle);
        if (ptr.rightButtonDown() && dot > 0) {
          this.targetX = ptr.worldX;
          this.targetY = ptr.worldY;
          this.moving = true;
        } else {
          this.moving = false;
        }
        // i-frames outlast the dash slightly
        this.scene.time.delayedCall(iframeDur - duration, () => {
          this.invincible = false;
          this.container.setAlpha(1);
        });
      }
    });

    // Flicker during i-frames
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      repeat: Math.floor(iframeDur / 160),
    });
  }

  _spawnGhostTrail(color) {
    for (let i = 0; i < 4; i++) {
      const delay = i * 50;
      this.scene.time.delayedCall(delay, () => {
        const ghost = this.scene.add.graphics();
        ghost.fillStyle(color, 0.35);
        ghost.fillRoundedRect(this.x - 16, this.y - 10, 32, 28, 6);
        ghost.fillCircle(this.x, this.y - 18, 13);
        ghost.setDepth(7);
        this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 300, onComplete: () => ghost.destroy() });
      });
    }
  }

  // Returns true if contact damage actually landed (boss was hit).
  _checkContactDamage(dmg) {
    const arena = this.scene;
    if (arena.altar) {
      const altarDist = Phaser.Math.Distance.Between(this.x, this.y, arena.altar.x, arena.altar.y);
      if (altarDist < 55) arena.altar.interact();
    }
    if (arena.boss && arena.bossAlive) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, arena.boss.x, arena.boss.y);
      if (dist < 55) {
        arena.boss.takeDamage(dmg);
        return true;
      }
    }
    return false;
  }

  _groundSlam(dmg, radius) {
    // Visual: expanding ring
    const ring = this.scene.add.graphics();
    ring.x = this.x;
    ring.y = this.y;
    ring.setDepth(9);

    this.scene.tweens.addCounter({
      from: 0,
      to: radius,
      duration: 280,
      ease: 'Quad.easeOut',
      onUpdate: (tween) => {
        const r = tween.getValue();
        ring.clear();
        ring.lineStyle(4, SKILLS.E.color, 1 - r / radius);
        ring.strokeCircle(0, 0, r);
      },
      onComplete: () => ring.destroy()
    });

    // Stomp animation: jump then land
    this.scene.tweens.add({
      targets: this.container,
      y: this.container.y - 18,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    this.scene.cameras.main.shake(150, 0.0024);

    const arena = this.scene;
    if (arena.altar) {
      const altarDist = Phaser.Math.Distance.Between(this.x, this.y, arena.altar.x, arena.altar.y);
      if (altarDist < radius + 20) arena.altar.interact();
    }
    if (arena.boss && arena.bossAlive) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, arena.boss.x, arena.boss.y);
      if (dist < radius + 30) arena.boss.takeDamage(dmg);
    }
  }

  takeDamage(amount) {
    if (!this.alive || this.invincible) return;
    this.hp = Math.max(0, this.hp - amount);

    // Brief invincibility after hit
    this.invincible = true;
    this.scene.time.delayedCall(500, () => { this.invincible = false; });

    // Red flash
    this._hitFlash();
    this._updateFloatingHP();

    if (this.hp <= 0) this._die();
  }

  _hitFlash() {
    // Flash all graphics red
    [this.gBody, this.gHead, this.gHelmet].forEach(g => {
      this.scene.tweens.add({
        targets: g, alpha: 0.3, duration: 60, yoyo: true, repeat: 2,
        onComplete: () => g.setAlpha(1),
      });
    });
  }

  _die() {
    this.alive = false;
    this.container.setAlpha(0);
    this.floatHPBg.destroy();
    this.floatHPFill.destroy();
    if (this.shadowG) { this.shadowG.destroy(); this.shadowG = null; }

    // Death particles
    for (let i = 0; i < 12; i++) {
      const frag = this.scene.add.graphics();
      frag.fillStyle(COLORS.PLAYER_BODY, 1);
      frag.fillRect(-5, -5, 10, 10);
      frag.x = this.x;
      frag.y = this.y;
      const angle = (i / 12) * Math.PI * 2;
      const dist = Phaser.Math.Between(40, 100);
      this.scene.tweens.add({
        targets: frag,
        x: this.x + Math.cos(angle) * dist,
        y: this.y + Math.sin(angle) * dist,
        alpha: 0, angle: Phaser.Math.Between(-180, 180),
        duration: 600, ease: 'Quad.easeOut',
        onComplete: () => frag.destroy()
      });
    }

    this.scene.time.delayedCall(700, () => this.scene.playerDied());
  }

  /** Arena-aware wall-slide movement. Updates this.x / this.y. */
  _tryMove(nx, ny) {
    const arena = this.scene.arena;
    const r = 14;
    if (!arena) { this.x = nx; this.y = ny; return; }
    if (arena.containsPoint(nx, ny, r)) {
      this.x = nx; this.y = ny;
    } else if (arena.containsPoint(nx, this.y, r)) {
      this.x = nx;                        // slide along Y wall
    } else if (arena.containsPoint(this.x, ny, r)) {
      this.y = ny;                        // slide along X wall
    }
    // else: fully blocked — stay put
  }

  /** Push the player out of any overlapping obstacle bases. */
  _pushOutObstacles() {
    const r = 14;
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

  /**
   * Walk along the dash path and return the last world position that passes
   * arena.containsPoint. This prevents dashing through walls.
   */
  _findLastValidDashPoint(angle, distance) {
    const arena = this.scene.arena;
    if (!arena) {
      return { x: this.x + Math.cos(angle) * distance, y: this.y + Math.sin(angle) * distance };
    }
    const STEPS = 24;
    let lastX = this.x, lastY = this.y;
    for (let i = 1; i <= STEPS; i++) {
      const t = (i / STEPS) * distance;
      const tx = this.x + Math.cos(angle) * t;
      const ty = this.y + Math.sin(angle) * t;
      if (arena.containsPoint(tx, ty, 16)) {
        lastX = tx; lastY = ty;
      } else {
        break; // wall hit — stop here
      }
    }
    return { x: lastX, y: lastY };
  }

  update(time, delta) {
    if (!this.alive) return;
    const dt = delta / 1000;

    // Passive stamina regen
    this.stamina = Math.min(this.staminaMax, this.stamina + PLAYER.STAMINA_REGEN_RATE * dt);

    // Movement — skip while dash tween owns the container
    if (this.moving && !this.isDodging) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, this.targetX, this.targetY);
      if (dist > 4) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.targetX, this.targetY);
        const step = Math.min(this.speed * dt, dist);
        this._tryMove(this.x + Math.cos(angle) * step, this.y + Math.sin(angle) * step);
        this._pushOutObstacles();
        this.container.x = this.x;
        this.container.y = this.y;
        this._legPhase += dt * 12;
      } else {
        this.moving = false;
      }
    }

    // Idle bob
    this._idleTimer += dt;
    const bobOffset = this.moving ? 0 : Math.sin(this._idleTimer * 2.2) * 2;
    this.gHead.y = bobOffset;
    this.gHelmet.y = bobOffset;

    // Leg stride animation — horizontal crossing swing
    const legSwing = this.moving ? Math.sin(this._legPhase) * 6 : 0;
    this._drawCharacter(legSwing);

    // Update floating HP bar position
    this._updateFloatingHP();

    // Update ground shadow
    if (this.shadowG && this.shadowG.active) {
      this.shadowG.clear();
      this.shadowG.fillStyle(0x000000, 0.28);
      this.shadowG.fillEllipse(this.x + 3, this.y + 26, 34, 10);
    }

    // Update projectiles
    this._updateProjectiles(dt);

    // Check boss proximity for altar interaction hint
    this._checkAltarProximity();
  }

  _updateProjectiles(dt) {
    const scene = this.scene;
    const sceneArena = scene.arena;

    this.projectiles.getChildren().forEach(proj => {
      if (!proj._alive) return;
      proj.x += proj._vx * dt;
      proj.y += proj._vy * dt;

      // Trail particle
      proj._trailTimer = (proj._trailTimer || 0) + dt;
      if (proj._trailTimer > 0.028) {
        proj._trailTimer = 0;
        const trail = this.scene.add.graphics();
        trail.fillStyle(proj._color || 0x88ddff, 0.5);
        trail.fillCircle(0, 0, (proj._radius || 5) * 0.8);
        trail.x = proj.x;
        trail.y = proj.y;
        trail.setDepth(7);
        this.scene.tweens.add({
          targets: trail, alpha: 0, scaleX: 0.2, scaleY: 0.2,
          duration: 100, onComplete: () => trail.destroy()
        });
      }

      // Out of arena bounds — destroy
      if (sceneArena && !sceneArena.containsPoint(proj.x, proj.y, 0)) {
        proj._alive = false;
        proj.destroy();
        return;
      }

      // Hit obstacle base — destroy (projectiles can't pass through obstacle bases)
      if (scene.obstacles) {
        for (const obs of scene.obstacles) {
          const od = Phaser.Math.Distance.Between(proj.x, proj.y, obs.x, obs.y);
          if (od < obs.baseRadius + (proj._radius || 5)) {
            proj._alive = false;
            proj.destroy();
            return;
          }
        }
      }

      // Hit altar
      if (scene.altar) {
        const altarDist = Phaser.Math.Distance.Between(proj.x, proj.y, scene.altar.x, scene.altar.y);
        if (altarDist < 40) {
          scene.altar.interact();
          proj._alive = false;
          proj.destroy();
          return;
        }
      }

      // Hit boss
      if (scene.boss && scene.bossAlive) {
        const dist = Phaser.Math.Distance.Between(proj.x, proj.y, scene.boss.x, scene.boss.y);
        if (dist < scene.boss.size + 6) {
          // Stamina regen on hit (basic attack only)
          if (!proj._isSkill) {
            this.stamina = Math.min(this.staminaMax, this.stamina + PLAYER.STAMINA_REGEN_PER_HIT);
          }
          scene.boss.takeDamage(proj._damage);
          proj._alive = false;
          proj.destroy();
        }
      }
    });
  }

  _checkAltarProximity() {
    const arena = this.scene;
    if (!arena.altar) return;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, arena.altar.x, arena.altar.y);
    if (dist < 55) {
      arena.altar.interact();
    }
  }

  destroy() {
    this.container.destroy(true);
    this.floatHPBg.destroy();
    this.floatHPFill.destroy();
    this.projectiles.clear(true, true);
  }
}
