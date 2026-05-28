import Phaser from 'phaser';
import BossBase from './BossBase.js';
import { BOSS_CONFIGS } from '../../config/bossConfig.js';

/**
 * Gunner — smug floating eye-creature that strafes at mid-range and snipes.
 *
 * Drawn as layered Phaser Graphics children (body, charge rings, main eye,
 * two side eyes, hit-flash overlay). Each drawn ONCE in _buildBody() and
 * never cleared. All animation comes from Phaser tweens. Zero per-frame redraws.
 */
export default class Gunner extends BossBase {
  constructor(scene, x, y, level) {
    super(scene, x, y, BOSS_CONFIGS.gunner, level);
    this._idleTweens    = [];
    this._wispTimer     = null;
    this._facingDir     = 1;
    this._lastMoveAngle = 0;
    this._isMoving      = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build — runs once at spawn
  // ─────────────────────────────────────────────────────────────────────────
  _buildGraphics() {
    this._buildBody();
    this._animIdleStart();
  }

  _buildBody() {
    // Must be initialised here — BossBase calls _buildGraphics() from within
    // super(), before the Gunner constructor body sets this._idleTweens = [].
    this._idleTweens = [];

    const s = this.size;

    // Inner container — flipping this (not the outer one) leaves the BossBase
    // spawn-tween and enrage scale-pulse on this.container untouched.
    this.flipContainer = this.scene.add.container(0, 0);
    this.container.add(this.flipContainer);

    // ── Body sprite — canvas-rendered with true radial gradient ─────────────
    this.bodyS = this._buildBodySprite();
    this.flipContainer.add(this.bodyS);

    // ── Specular glow — separate sprite so body idle scale-tweens can't
    //    distort it from circular to oval at runtime ───────────────────────
    this.specularS = this._buildSpecularSprite();
    this.flipContainer.add(this.specularS);

    // ── Charge rings — drawn once at alpha=0; pulsed during attacks ──────
    this.chargeRingsG = this.scene.add.graphics();
    this.chargeRingsG.lineStyle(2, this.accentColor, 0.55);
    this.chargeRingsG.strokeCircle(0, 0, s * 1.15);
    this.chargeRingsG.lineStyle(1, this.accentColor, 0.35);
    this.chargeRingsG.strokeCircle(0, 0, s * 1.38);
    this.chargeRingsG.alpha = 0;
    this.flipContainer.add(this.chargeRingsG);

    // ── Main eye (container so pupil child can translate without redraw) ──
    // pupilG.x / pupilG.y are updated via lerp in update() each frame —
    // no Graphics.clear() involved, just a transform update on static content.
    this.mainEyeContainer = this.scene.add.container(-s * 0.10, -s * 0.14);

    this.eyeBaseG = this.scene.add.graphics();
    this.eyeBaseG.fillStyle(0xffffff, 1);
    this.eyeBaseG.fillCircle(0, 0, s * 0.30);           // white sclera
    this.eyeBaseG.fillStyle(this.accentColor, 1);
    this.eyeBaseG.fillCircle(0, 0, s * 0.19);           // gold iris
    this.eyeBaseG.fillStyle(0xffffff, 0.80);
    this.eyeBaseG.fillCircle(0, -s * 0.13, s * 0.07);          // glassy specular (top-center)
    this.eyeBaseG.lineStyle(2, 0xaa7700, 0.8);
    this.eyeBaseG.strokeCircle(0, 0, s * 0.30);         // iris ring stroke
    this.mainEyeContainer.add(this.eyeBaseG);

    this.pupilG = this.scene.add.graphics();
    this.pupilG.fillStyle(0x110022, 1);
    this.pupilG.fillCircle(0, 0, s * 0.10);
    this.mainEyeContainer.add(this.pupilG);

    this.flipContainer.add(this.mainEyeContainer);

    // ── Side eyes — small and asymmetrically placed ───────────────────────
    this.sideEye1G = this.scene.add.graphics();
    this.sideEye1G.fillStyle(0xffffff, 1);
    this.sideEye1G.fillCircle(0, 0, s * 0.13);
    this.sideEye1G.fillStyle(0x220044, 1);
    this.sideEye1G.fillCircle(s * 0.02, 0, s * 0.07);
    this.sideEye1G.fillStyle(0xffffff, 0.75);
    this.sideEye1G.fillCircle(0, -s * 0.06, s * 0.04);          // specular (top-center)
    this.sideEye1G.x =  s * 0.52;
    this.sideEye1G.y = -s * 0.08;
    this.flipContainer.add(this.sideEye1G);

    this.sideEye2G = this.scene.add.graphics();
    this.sideEye2G.fillStyle(0xffffff, 1);
    this.sideEye2G.fillCircle(0, 0, s * 0.09);
    this.sideEye2G.fillStyle(0x220044, 1);
    this.sideEye2G.fillCircle(s * 0.01, 0, s * 0.05);
    this.sideEye2G.fillStyle(0xffffff, 0.75);
    this.sideEye2G.fillCircle(0, -s * 0.04, s * 0.03);          // specular (top-center)
    this.sideEye2G.x = -s * 0.48;
    this.sideEye2G.y =  s * 0.28;
    this.flipContainer.add(this.sideEye2G);

    // ── Hit flash overlay — same body silhouette via setTintFill, alpha=0 at rest ──
    // Reuses the body sprite's texture for a pixel-perfect silhouette match.
    // setTintFill replaces all non-transparent pixels with a single colour, so
    // the gradient and smirk disappear during the flash (same intent as before).
    this.hitFlashS = this.scene.add.sprite(0, 0, this.bodyS.texture.key);
    this.hitFlashS.setOrigin(0.5, 0.5);
    this.hitFlashS.setTintFill(0xcc44ff);
    this.hitFlashS.alpha = 0;
    this.flipContainer.add(this.hitFlashS);
  }

  /**
   * Build (or fetch from cache) the gradient-shaded body sprite.
   *
   * Procedure:
   *   1. Paint the full body silhouette (main blob + belly + 3 tentacle stubs)
   *      in the base body colour onto an offscreen canvas
   *   2. Switch to `source-atop` composite mode — subsequent draws only affect
   *      pixels that already exist (i.e. they stay inside the silhouette)
   *   3. Paint a large radial gradient: bright at top-centre → transparent
   *      mid-body → dark at lower edge. This gives the smooth top-lit gradient
   *      that ellipse-stacking can't produce.
   *   4. Paint a small specular highlight gradient (bright white spot at top)
   *   5. Stroke the smirk arc as a feature on top
   *   6. Refresh the Phaser CanvasTexture so the GPU sees the result
   */
  _buildBodySprite() {
    const s   = this.size;
    const key = `gunner-body-${s}`;
    // Canvas: tight bounding box with a small padding so anti-aliased edges
    // are not clipped. Main blob is s*2.0 wide, tentacle stubs reach y ≈ s*1.0.
    const cw  = Math.ceil(s * 2.4);
    const ch  = Math.ceil(s * 2.4);

    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, cw, ch);
      const ctx = tex.getContext();
      const cx  = cw / 2;
      const cy  = ch / 2;

      const toHex = (c) => '#' + c.toString(16).padStart(6, '0');
      const ell   = (ex, ey, rx, ry) => {
        ctx.beginPath();
        ctx.ellipse(cx + ex, cy + ey, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      // ── 1. Body silhouette in base colour ──
      ctx.fillStyle = toHex(this.color);
      ell(0,           0,         s * 1.00, s * 0.90);   // main blob
      ell(0,           s * 0.18,  s * 0.875, s * 0.45);  // saggy belly
      ell(-s * 0.72,   s * 0.68,  s * 0.14, s * 0.22);   // tentacle L
      ell( 0,          s * 0.80,  s * 0.12, s * 0.20);   // tentacle M
      ell( s * 0.72,   s * 0.68,  s * 0.14, s * 0.22);   // tentacle R

      // ── 2. Gradient overlay — only affects existing (body) pixels ──
      ctx.globalCompositeOperation = 'source-atop';

      const grad = ctx.createRadialGradient(
        cx,            cy - s * 0.70, 0,              // inner: top-of-head, above the eye
        cx,            cy + s * 0.30, s * 1.35        // outer: large, biased downward
      );
      grad.addColorStop(0.00, 'rgba(255, 255, 255, 0.45)');
      grad.addColorStop(0.30, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(0.65, 'rgba(20,  0,  40, 0.25)');
      grad.addColorStop(1.00, 'rgba(20,  0,  40, 0.65)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);

      // Specular is NOT baked here — it lives on a separate sprite (specularS)
      // so that the body's idle scale-bob tweens (scaleX: 0.97, scaleY: 1.04)
      // cannot distort it from circular into an oval at runtime.

      // ── 4. Smirk arc — drawn over the gradient as a feature ──
      ctx.strokeStyle = toHex(0x3d1558);
      ctx.lineWidth   = 3;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      // 15° → 155° passes through 90° (downward in Y-down canvas) = smile
      ctx.arc(cx + s * 0.12, cy + s * 0.42, s * 0.18,
              Phaser.Math.DegToRad(15), Phaser.Math.DegToRad(155));
      ctx.stroke();

      ctx.globalCompositeOperation = 'source-over';
      tex.refresh();
    }

    const sprite = this.scene.add.sprite(0, 0, key);
    sprite.setOrigin(0.5, 0.5);
    return sprite;
  }

  /**
   * Separate specular glow sprite — NOT inside the body texture.
   *
   * Keeping it separate means the body's idle bob tweens (scaleX 0.97, scaleY 1.04)
   * cannot distort it. A circular gradient on a square canvas stays circular on
   * screen regardless of how the body sprite is animated.
   */
  _buildSpecularSprite() {
    const s   = this.size;
    const key = `gunner-specular-${s}`;
    const dim = Math.ceil(s * 2.0);   // big enough for s*0.72 glow radius with room to spare

    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, dim, dim);
      const ctx = tex.getContext();
      const cx  = dim / 2;
      const cy  = dim / 2;

      // Plain circular gradient — square canvas, no transform needed; renders circular
      // Radius s*0.72 → visible ring width = (0.72-0.30)*s ≈ 14px around the eye sclera
      const spec = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.72);
      spec.addColorStop(0.00, 'rgba(255, 255, 255, 0.65)');
      spec.addColorStop(0.50, 'rgba(255, 255, 255, 0.25)');
      spec.addColorStop(1.00, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = spec;
      ctx.fillRect(0, 0, dim, dim);
      tex.refresh();
    }

    const sprite = this.scene.add.sprite(0, 0, key);
    sprite.setOrigin(0.5, 0.5);
    sprite.x = -s * 0.10;   // eye horizontal offset
    sprite.y = -s * 0.14;   // exact eye center (mainEyeContainer y position)
    return sprite;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANIMATION HELPERS — no per-frame draw calls; only tweens and transforms
  // ─────────────────────────────────────────────────────────────────────────

  _animIdleStart() {
    // Gentle floating bob
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.bodyS, scaleY: 1.04,
      duration: 700, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.bodyS, scaleX: 0.97,
      duration: 700, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    // Charge rings barely visible at rest
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0.06,
      duration: 1200, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    this._scheduleBlink();
  }

  _scheduleBlink() {
    if (!this.alive) return;
    const delay = Phaser.Math.Between(2000, 5000);
    this.scene.time.delayedCall(delay, () => {
      this._animBlink();
      this._scheduleBlink();
    });
  }

  _animBlink() {
    if (!this.alive) return;
    this.scene.tweens.add({
      targets: [this.mainEyeContainer, this.sideEye1G, this.sideEye2G],
      scaleY: 0.12,
      duration: 55, yoyo: true, ease: 'Quad.easeIn',
    });
  }

  // ── Aimed shot: central eye dilates + rings glow → recoil on fire ────────

  _animAimedShotWindup() {
    this.scene.tweens.add({
      targets: this.mainEyeContainer, scaleX: 1.5, scaleY: 1.5,
      duration: 200, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0.72,
      duration: 200, ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 0.94, scaleY: 1.06,
      duration: 200, ease: 'Quad.easeIn',
    });
  }

  _animAimedShotRecoil() {
    this.scene.tweens.add({
      targets: this.mainEyeContainer, scaleX: 1, scaleY: 1,
      duration: 180, ease: 'Elastic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0,
      duration: 350, ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1, scaleY: 1,
      duration: 250, ease: 'Elastic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.flipContainer, x: -14,
      duration: 60, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: this.flipContainer, x: 0,
          duration: 220, ease: 'Elastic.easeOut',
        });
      },
    });
  }

  // ── Spread burst: all 3 eyes dilate simultaneously ───────────────────────

  _animSpreadBurstWindup() {
    this.scene.tweens.add({
      targets: this.mainEyeContainer, scaleX: 1.35, scaleY: 1.35,
      duration: 220, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: [this.sideEye1G, this.sideEye2G], scaleX: 1.5, scaleY: 1.5,
      duration: 220, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0.58,
      duration: 220, ease: 'Quad.easeOut',
    });
  }

  _animSpreadBurstRecoil() {
    this.scene.tweens.add({
      targets: [this.mainEyeContainer, this.sideEye1G, this.sideEye2G],
      scaleX: 1, scaleY: 1,
      duration: 220, ease: 'Elastic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0,
      duration: 350, ease: 'Quad.easeOut',
    });
  }

  // ── Full rotation: body spins 360° during the entire telegraph ───────────

  _animFullRotationWindup(duration) {
    this.scene.tweens.add({
      targets: this.flipContainer,
      rotation: Math.PI * 2,
      duration, ease: 'Linear',
      onComplete: () => { if (this.flipContainer) this.flipContainer.rotation = 0; },
    });
    this.scene.tweens.add({
      targets: [this.mainEyeContainer, this.sideEye1G, this.sideEye2G],
      scaleX: 1.3, scaleY: 1.3,
      duration: 250, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0.85,
      duration: 250, ease: 'Quad.easeOut',
    });
  }

  _animFullRotationRecoil() {
    this.scene.tweens.add({
      targets: [this.mainEyeContainer, this.sideEye1G, this.sideEye2G],
      scaleX: 1, scaleY: 1,
      duration: 300, ease: 'Elastic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0,
      duration: 400, ease: 'Quad.easeOut',
    });
  }

  // ── Barrage: eye + body pulse with every individual shot ─────────────────

  _animBarrageShot() {
    if (!this.alive) return;
    this.scene.tweens.add({
      targets: this.mainEyeContainer, scaleX: 1.22, scaleY: 1.22,
      duration: 50, yoyo: true, ease: 'Quad.easeIn',
    });
    this.scene.tweens.add({
      targets: this.flipContainer, x: -10,
      duration: 50, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: this.flipContainer, x: 0,
          duration: 160, ease: 'Elastic.easeOut',
        });
      },
    });
  }

  // ── Hurt ─────────────────────────────────────────────────────────────────

  _animHurt() {
    if (!this.alive) return;
    // Solid colour flash — no alpha dip on container so sub-shapes stay hidden
    this.hitFlashS.setAlpha(0.80);
    this.scene.tweens.add({
      targets: this.hitFlashS, alpha: 0,
      duration: 220, ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.18, scaleY: 1.18,
      duration: 70, yoyo: true, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.flipContainer, x: Phaser.Math.Between(-5, 5),
      duration: 70, yoyo: true, ease: 'Sine.easeInOut',
    });
  }

  // ── Enrage ────────────────────────────────────────────────────────────────

  _animEnrageBurst() {
    if (!this.alive) return;
    // Charge rings strobe bright on enrage
    this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0.75,
      duration: 120, yoyo: true, repeat: 4, ease: 'Sine.easeInOut',
    });
    // Settle to a persistent low-alpha glow for the rest of the fight
    this.scene.tweens.add({
      targets: this.chargeRingsG, alpha: 0.18,
      duration: 600, ease: 'Quad.easeOut', delay: 1200,
    });
    // Start arcane wisp spawner
    this._wispTimer = this.scene.time.addEvent({
      loop: true, delay: 220,
      callback: this._spawnElectricWisp, callbackScope: this,
    });
  }

  // Arcane wisps — same sine-path-segment architecture as Charger fire wisps,
  // but in deep violet → bright purple → gold → pale-gold palette to match
  // the Gunner's arcane theme.
  _spawnElectricWisp() {
    if (!this.alive) return;

    // Directional spawn: rear hemisphere when moving, full spread when still
    let spawnAngle;
    if (this._isMoving) {
      spawnAngle = this._lastMoveAngle + Math.PI + Phaser.Math.FloatBetween(-1.22, 1.22);
    } else {
      spawnAngle = Math.random() * Math.PI * 2;
    }
    const r  = this.size * Phaser.Math.FloatBetween(0.45, 1.0);
    const wx = this.x + Math.cos(spawnAngle) * r;
    const wy = this.y + Math.sin(spawnAngle) * r;

    const wH        = Phaser.Math.FloatBetween(38, 72);
    const wW        = Phaser.Math.FloatBetween(9, 17);
    const sineAmp   = wW * Phaser.Math.FloatBetween(0.5, 1.3);
    const sineCyc   = Phaser.Math.FloatBetween(0.8, 1.6);
    const sinePhase = Math.random() * Math.PI * 2;
    const NUM_SEGS  = 8;

    const wisp = this.scene.add.graphics();

    for (let i = 0; i < NUM_SEGS; i++) {
      const t    = i / (NUM_SEGS - 1);
      const segY = -t * wH;
      const segX = Math.sin(sinePhase + t * Math.PI * sineCyc * 2) * sineAmp;
      const segW = wW * (1 - t * 0.82);
      const segH = segW * 1.55;

      let alpha;
      if (t < 0.12)      alpha = (t / 0.12) * 0.55;
      else if (t < 0.70) alpha = 0.55;
      else               alpha = (1 - t) / 0.30 * 0.55;

      let color;
      if (t < 0.30)      color = 0x6600bb;   // deep violet base
      else if (t < 0.58) color = 0xcc44ff;   // bright purple mid
      else if (t < 0.82) color = 0xffaa00;   // gold upper
      else               color = 0xfff0aa;   // pale gold tip

      wisp.fillStyle(color, alpha);
      wisp.fillEllipse(segX, segY, segW, segH);
    }

    wisp.x = wx;
    wisp.y = wy;
    wisp.alpha = Phaser.Math.FloatBetween(0.55, 0.85);
    wisp.setDepth(12);

    const startX    = wx;
    const wobSpd    = Phaser.Math.FloatBetween(1.8, 4.0);
    const wobAmp    = Phaser.Math.FloatBetween(5, 13);
    const startTime = this.scene.time.now;

    const wobble = (time) => {
      if (!wisp.active) { this.scene.events.off('update', wobble); return; }
      wisp.x = startX + Math.sin((time - startTime) * 0.001 * wobSpd) * wobAmp;
    };
    this.scene.events.on('update', wobble);

    const riseH = Phaser.Math.Between(70, 145);
    const dur   = Phaser.Math.Between(850, 1450);

    this.scene.tweens.add({
      targets: wisp,
      y:      wy - riseH,
      scaleX: Phaser.Math.FloatBetween(1.1, 1.6),
      scaleY: Phaser.Math.FloatBetween(1.0, 1.25),
      alpha:  0,
      duration: dur, ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.events.off('update', wobble);
        if (wisp.active) wisp.destroy();
      },
    });
    this.scene.events.once('shutdown', () => {
      this.scene.events.off('update', wobble);
      if (wisp.active) wisp.destroy();
    });
  }

  // ── Death ─────────────────────────────────────────────────────────────────

  _animDeath(onComplete) {
    this._idleTweens.forEach(tw => { if (tw?.isPlaying()) tw.stop(); });
    this._idleTweens = [];
    this.scene.tweens.add({
      targets: this.container,
      rotation: this.container.rotation + Math.PI * 3,
      scaleX: 0, scaleY: 0,
      duration: 700, ease: 'Cubic.easeIn',
      onComplete,
    });
    this.scene.tweens.add({
      targets: [this.mainEyeContainer, this.sideEye1G, this.sideEye2G],
      alpha: 0, duration: 360, ease: 'Quad.easeIn',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LIFECYCLE OVERRIDES
  // ─────────────────────────────────────────────────────────────────────────

  takeDamage(amount) {
    super.takeDamage(amount);
    if (!this.alive) return;
    // BossBase sets container.alpha = 0.4 — cancel immediately so the
    // hitFlashS overlay handles feedback without revealing sub-shapes.
    this.container.setAlpha(1);
    this._animHurt();
  }

  _triggerEnrage() {
    super._triggerEnrage();
    this._animEnrageBurst();
  }

  _die() {
    if (!this.alive) return;
    this.alive = false;
    if (this._wispTimer) { this._wispTimer.remove(false); this._wispTimer = null; }
    if (this.shadowG) { this.shadowG.destroy(); this.shadowG = null; }

    this._animDeath(() => {
      for (let i = 0; i < 16; i++) {
        const frag = this.scene.add.graphics();
        frag.fillStyle(this.color, 1);
        const sz = Phaser.Math.Between(6, 18);
        frag.fillRect(-sz / 2, -sz / 2, sz, sz);
        frag.x = this.x; frag.y = this.y;
        frag.setDepth(20);
        const angle = (i / 16) * Math.PI * 2;
        const dist  = Phaser.Math.Between(50, 150);
        this.scene.tweens.add({
          targets: frag,
          x: this.x + Math.cos(angle) * dist,
          y: this.y + Math.sin(angle) * dist,
          alpha: 0, angle: Phaser.Math.Between(-360, 360),
          duration: Phaser.Math.Between(500, 900),
          ease: 'Quad.easeOut',
          onComplete: () => frag.destroy(),
        });
      }
      this.container.destroy(true);
      if (this.onDeath) this.onDeath();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RIFT TELEGRAPH HELPERS (logic identical to original)
  // ─────────────────────────────────────────────────────────────────────────

  /** World position just beyond the boss outline in the given direction. */
  _riftPos(angle) {
    const r = this.size + 18;
    return { x: this.x + Math.cos(angle) * r, y: this.y + Math.sin(angle) * r };
  }

  _spawnRiftTelegraph(x, y, angle, duration, color = 0xaa44ff, projDiameter = 22) {
    const g = this.scene.add.graphics();
    g.x = x; g.y = y;
    g.angle = Phaser.Math.RadToDeg(angle) + 90;
    g.setDepth(6).setScale(0);

    const w = projDiameter;
    const h = Math.max(8, Math.round(w * 0.22));

    g.fillStyle(color, 0.20); g.fillEllipse(0, 0, w + 24, h + 10);
    g.fillStyle(color, 0.50); g.fillEllipse(0, 0, w + 10, h + 5);
    g.fillStyle(0xffffff, 0.90); g.fillEllipse(0, 0, w, h);
    g.lineStyle(1, 0xffffff, 0.70); g.strokeEllipse(0, 0, w, h);

    this.scene.tweens.add({
      targets: g, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: g, alpha: { from: 0.75, to: 1.0 },
      duration: 160, yoyo: true, repeat: Math.ceil(duration / 320),
      delay: 200, ease: 'Sine.easeInOut',
    });

    this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    return g;
  }

  _closeRift(g, onClosed) {
    if (!g || !g.active) { onClosed?.(); return; }
    this.scene.tweens.killTweensOf(g);
    this.scene.tweens.add({
      targets: g, scaleX: 0, scaleY: 0, duration: 80, ease: 'Quad.easeIn',
      onComplete: () => { if (g.active) g.destroy(); onClosed?.(); },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ATTACKS — logic unchanged, _anim* calls injected at the right beats
  // ─────────────────────────────────────────────────────────────────────────

  _getAttackPool()    { return ['aimedShot', 'spreadBurst']; }
  _getEnrageAttacks() { return ['fullRotation', 'barrage']; }

  _runAttack(name) {
    switch (name) {
      case 'aimedShot':    this._attackAimedShot();    break;
      case 'spreadBurst':  this._attackSpreadBurst();  break;
      case 'fullRotation': this._attackFullRotation(); break;
      case 'barrage':      this._attackBarrage();      break;
      default: this._endAttack();
    }
  }

  _attackAimedShot() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const TEL_MS = 700;
    let angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    let rp    = this._riftPos(angle);
    const rift = this._spawnRiftTelegraph(rp.x, rp.y, angle, TEL_MS, this.accentColor, 100);

    this._animAimedShotWindup();

    const track = () => {
      if (!p.alive || !rift.active) return;
      angle  = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      rp     = this._riftPos(angle);
      rift.x = rp.x; rift.y = rp.y;
      rift.angle = Phaser.Math.RadToDeg(angle) + 90;
    };
    this.scene.events.on('update', track);
    this.scene.events.once('shutdown', () => this.scene.events.off('update', track));

    this.scene.time.delayedCall(TEL_MS, () => {
      this.scene.events.off('update', track);
      this._closeRift(rift, () => {
        if (!this.alive) return;
        this._animAimedShotRecoil();
        this._spawnProjectile(angle, 500, 0xffcc00, 50, this.damage, false, 500, rp.x, rp.y);
        this._endAttack();
      });
    });
  }

  _attackSpreadBurst() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const OFFSETS = [-0.35, 0, 0.35];
    let baseA = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);

    const rifts = OFFSETS.map(off => {
      const a  = baseA + off;
      const rp = this._riftPos(a);
      return { g: this._spawnRiftTelegraph(rp.x, rp.y, a, this._telegraphDuration, this.accentColor, 50), off };
    });

    this._animSpreadBurstWindup();

    const track = () => {
      if (!p.alive) return;
      baseA = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      rifts.forEach(({ g, off }) => {
        if (!g.active) return;
        const a  = baseA + off;
        const rp = this._riftPos(a);
        g.x = rp.x; g.y = rp.y;
        g.angle = Phaser.Math.RadToDeg(a) + 90;
      });
    };
    this.scene.events.on('update', track);
    this.scene.events.once('shutdown', () => this.scene.events.off('update', track));

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      this.scene.events.off('update', track);
      if (!this.alive) { rifts.forEach(({ g }) => { if (g.active) g.destroy(); }); return; }

      const finalAngles = rifts.map(({ off }) => ({
        a: baseA + off, rp: this._riftPos(baseA + off),
      }));
      let closed = 0;
      rifts.forEach(({ g }, i) => {
        const { a, rp } = finalAngles[i];
        this._closeRift(g, () => {
          this._spawnProjectile(a, 400, 0xffcc00, 25, this.damage * 0.8, false, 500, rp.x, rp.y);
          if (++closed === rifts.length) {
            this._animSpreadBurstRecoil();
            this._endAttack();
          }
        });
      });
    });
  }

  _attackFullRotation() {
    const rifts = Array.from({ length: 8 }, (_, i) => {
      const a  = (i / 8) * Math.PI * 2;
      const rp = this._riftPos(a);
      return {
        g: this._spawnRiftTelegraph(rp.x, rp.y, a, this._telegraphDuration, 0xff44ff, 35),
        a, rp,
      };
    });

    this._animFullRotationWindup(this._telegraphDuration);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) { rifts.forEach(({ g }) => { if (g.active) g.destroy(); }); return; }
      let closed = 0;
      rifts.forEach(({ g, a, rp }) => {
        this._closeRift(g, () => {
          this._spawnProjectile(a, 400, 0xff44ff, 18, this.damage * 0.8, false, 500, rp.x, rp.y);
          if (++closed === rifts.length) {
            this._animFullRotationRecoil();
            this._endAttack();
          }
        });
      });
    });
  }

  _attackBarrage() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    let angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    let rp    = this._riftPos(angle);
    const rift = this._spawnRiftTelegraph(rp.x, rp.y, angle, 99999, 0xff88ff, 70);

    const maxShots = this.enraged ? 6 : 4;
    let shots = 0;

    const aimAndFire = () => {
      if (!this.alive || !p.alive || shots >= maxShots) {
        this._closeRift(rift, () => this._endAttack());
        return;
      }

      const newAngle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
      const newRp    = this._riftPos(newAngle);

      this.scene.tweens.killTweensOf(rift);
      this.scene.tweens.add({
        targets: rift,
        x: newRp.x, y: newRp.y,
        angle: Phaser.Math.RadToDeg(newAngle) + 90,
        duration: 150, ease: 'Quad.easeOut',
        onComplete: () => {
          angle = newAngle; rp = newRp;

          this.scene.tweens.add({
            targets: rift, alpha: { from: 1, to: 0.3 },
            duration: 60, yoyo: true, ease: 'Quad.easeOut',
          });

          this._animBarrageShot();
          this._spawnProjectile(angle, 440, 0xff88ff, 35, this.damage * 0.6, false, 520, rp.x, rp.y);
          shots++;
          this.scene.time.delayedCall(280, aimAndFire);
        },
      });
    };

    this.scene.time.delayedCall(400, aimAndFire);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // update — strafe logic + facing flip + pupil tracking; no _redraw()
  // ─────────────────────────────────────────────────────────────────────────
  update(time, delta) {
    const prevX = this.x;
    const prevY = this.y;
    super.update(time, delta);
    if (!this.alive) return;

    // Strafe at mid-range (behaviour identical to original)
    const p = this.scene.player;
    if (p && p.alive && this._state === 'idle') {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (dist < 160) {
        const a = Phaser.Math.Angle.Between(p.x, p.y, this.x, this.y);
        this._moveToward(
          this.x + Math.cos(a) * 80,
          this.y + Math.sin(a) * 80,
          this.moveSpeed, delta / 1000
        );
      } else if (dist > 280) {
        this._moveToward(p.x, p.y, this.moveSpeed * 0.6, delta / 1000);
      }
    }

    // Movement tracking for facing flip + wisp spawn direction
    const moveDx   = this.x - prevX;
    const moveDy   = this.y - prevY;
    const moveDist = Math.hypot(moveDx, moveDy);
    this._isMoving = moveDist > 0.4;
    if (this._isMoving) this._lastMoveAngle = Math.atan2(moveDy, moveDx);

    if (Math.abs(moveDx) > 0.5) {
      const sign = moveDx >= 0 ? 1 : -1;
      if (sign !== this._facingDir) {
        this._facingDir = sign;
        this.flipContainer.scaleX = sign;
      }
    }

    // Pupil tracking — cheap transform update on a static-content Graphics object;
    // no Graphics.clear() is called, no draw commands are replayed.
    if (p && p.alive && this.pupilG) {
      const s         = this.size;
      const eyeWorldX = this.x + (-s * 0.10) * this._facingDir;
      const eyeWorldY = this.y + (-s * 0.14);
      const aimAngle  = Phaser.Math.Angle.Between(eyeWorldX, eyeWorldY, p.x, p.y);
      const maxDrift  = s * 0.08;
      this.pupilG.x   = Phaser.Math.Linear(this.pupilG.x, Math.cos(aimAngle) * maxDrift * this._facingDir, 0.08);
      this.pupilG.y   = Phaser.Math.Linear(this.pupilG.y, Math.sin(aimAngle) * maxDrift, 0.08);
    }
  }
}
