import Phaser from 'phaser';
import BossBase from './BossBase.js';
import { BOSS_CONFIGS } from '../../config/bossConfig.js';

/**
 * Charger — chunky comical bulldozer-beast.
 *
 * Drawn as 5 layered Phaser Graphics children (body, jaw, two eyes, energy
 * cracks). Each is drawn ONCE in _buildBody() and never cleared. All animation
 * comes from Phaser tweens on those children — no per-frame redraws.
 */
export default class Charger extends BossBase {
  constructor(scene, x, y, level) {
    super(scene, x, y, BOSS_CONFIGS.charger, level);
    this._charging   = false;
    this._orbitAngle = 0;
    this._facingDir  = 1;       // +1 facing right, -1 facing left (sprite flip)
    this._isMoving   = false;
    this._takingHit  = false;
    this._idleTweens = [];      // refs to perpetual tweens (stopped on death)
    this._steamTimer    = null;  // repeating timer for enrage fire wisps
    this._lastMoveAngle = 0;    // world-space angle of most recent movement (radians)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build — runs once at spawn. Creates the 5 layered Graphics children
  // inside a `flipContainer` (a child of `this.container` so the spawn-tween
  // and enrage pulse on `this.container` still affect everything).
  // ─────────────────────────────────────────────────────────────────────────
  _buildGraphics() {
    this._buildBody();
    this._animIdleStart();
  }

  _buildBody() {
    // Must be initialized here — BossBase calls _buildGraphics() (and therefore
    // this method) from *within* super(), before the Charger constructor body
    // runs and sets this._idleTweens = [].
    this._idleTweens = [];

    const s = this.size;

    // Inner container — flipping this one (not the outer one) keeps the
    // spawn animation and enrage scale pulse untouched.
    this.flipContainer = this.scene.add.container(0, 0);
    this.container.add(this.flipContainer);

    // ── Body sprite (canvas gradient) ────────────────────────────────────────
    this.bodyS = this._buildBodySprite();
    this.flipContainer.add(this.bodyS);

    // ── Eyes — asymmetric (big angry left, small confused right) ──────────
    this.eyeBigG = this.scene.add.graphics();
    this.eyeBigG.fillStyle(0xffffff, 1);
    this.eyeBigG.fillCircle(0, 0, s * 0.20);
    this.eyeBigG.fillStyle(this.accentColor, 1);
    this.eyeBigG.fillCircle(0, 0, s * 0.12);
    this.eyeBigG.fillStyle(0x000000, 1);
    this.eyeBigG.fillCircle(s * 0.03, 0, s * 0.07);
    this.eyeBigG.fillStyle(0xffffff, 0.80);
    this.eyeBigG.fillCircle(0, -s * 0.10, s * 0.06);          // glassy specular (top-center)
    this.eyeBigG.x = -s * 0.30;
    this.eyeBigG.y = -s * 0.18;
    this.flipContainer.add(this.eyeBigG);

    this.eyeSmallG = this.scene.add.graphics();
    this.eyeSmallG.fillStyle(0xffffff, 1);
    this.eyeSmallG.fillCircle(0, 0, s * 0.11);
    this.eyeSmallG.fillStyle(0x000000, 1);
    this.eyeSmallG.fillCircle(s * 0.01, 0, s * 0.06);
    this.eyeSmallG.fillStyle(0xffffff, 0.80);
    this.eyeSmallG.fillCircle(0, -s * 0.06, s * 0.04);          // glassy specular (top-center)
    this.eyeSmallG.x = s * 0.34;
    this.eyeSmallG.y = -s * 0.12;
    this.flipContainer.add(this.eyeSmallG);

    // ── Energy cracks — glowing cyan lightning bolts ─────────────────────────
    // Three deliberate zigzag polylines on face/chest only (no tail/ears).
    // Drawn in three passes (wide glow → mid-line → white-hot core) for a
    // neon electric look that matches the Electric Blue accent theme.
    this.cracksG = this.scene.add.graphics();
    const cracks = [
      // Crack A — left shoulder branching down
      [[-0.50, -0.32], [-0.38, -0.08], [-0.46,  0.14], [-0.33,  0.34]],
      // Crack B — right chest angled inward
      [[ 0.42, -0.28], [ 0.54,  0.00], [ 0.38,  0.20], [ 0.46,  0.36]],
      // Crack C — belly centre, short
      [[-0.07,  0.08], [ 0.06,  0.22], [-0.04,  0.36]],
    ];

    const drawCracks = () => {
      for (const pts of cracks) {
        this.cracksG.beginPath();
        this.cracksG.moveTo(s * pts[0][0], s * pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
          this.cracksG.lineTo(s * pts[i][0], s * pts[i][1]);
        }
        this.cracksG.strokePath();
      }
    };

    this.cracksG.lineStyle(7, this.accentColor, 0.25);  // wide cyan glow halo
    drawCracks();
    this.cracksG.lineStyle(3, this.accentColor, 0.85);  // strong cyan mid-line
    drawCracks();
    this.cracksG.lineStyle(1.5, 0xffffff, 0.95);        // white-hot core
    drawCracks();

    this.flipContainer.add(this.cracksG);

    // ── Hit flash overlay sprite (pixel-perfect tintFill, alpha 0 at rest) ───
    this.hitFlashBodyS = this.scene.add.sprite(0, 0, `charger-body-${s}`);
    this.hitFlashBodyS.setOrigin(0.5, 0.5);
    this.hitFlashBodyS.setTintFill(0xff5500);
    this.hitFlashBodyS.alpha = 0;
    this.flipContainer.add(this.hitFlashBodyS);
  }

  _buildBodySprite() {
    const s   = this.size;
    const key = `charger-body-${s}`;
    const cw  = Math.ceil(s * 2.8);
    const ch  = Math.ceil(s * 2.2);

    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, cw, ch);
      const ctx = tex.getContext();
      const cx  = cw / 2;
      const cy  = ch / 2;
      const colorCSS = '#' + this.color.toString(16).padStart(6, '0');

      // Helper: fill a single ellipse at (cx+ex, cy+ey) with half-radii rx/ry
      const fillEll = (ex, ey, rx, ry) => {
        ctx.beginPath();
        ctx.ellipse(cx + ex, cy + ey, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      // 1. Body silhouette in body colour
      ctx.fillStyle = colorCSS;
      fillEll(0,          0,        s * 1.10,  s * 0.75);  // main mass
      fillEll(0,          s * 0.30, s * 0.975, s * 0.425); // belly bump
      fillEll(-s * 0.75,  s * 0.62, s * 0.19,  s * 0.24);  // left outer leg
      fillEll(-s * 0.28,  s * 0.72, s * 0.15,  s * 0.21);  // left inner leg
      fillEll( s * 0.28,  s * 0.72, s * 0.15,  s * 0.21);  // right inner leg
      fillEll( s * 0.75,  s * 0.62, s * 0.19,  s * 0.24);  // right outer leg
      fillEll(-s * 1.05, -s * 0.05, s * 0.21,  s * 0.13);  // tail stub
      fillEll(-s * 0.55, -s * 0.65, s * 0.15,  s * 0.11);  // left ear nub
      fillEll( s * 0.55, -s * 0.65, s * 0.15,  s * 0.11);  // right ear nub

      // 2. source-atop — all gradient passes stay within body silhouette
      ctx.globalCompositeOperation = 'source-atop';

      // 3a. Linear top-to-bottom gradient: floods the full wide oval with blue-lit top
      //     Blue-tinted highlight (not pure white) reads as "electric glow" on dark navy
      const linGrad = ctx.createLinearGradient(cx, cy - s * 0.80, cx, cy + s * 0.90);
      linGrad.addColorStop(0.00, 'rgba(140, 200, 255, 0.62)'); // bright blue-white top
      linGrad.addColorStop(0.30, 'rgba(140, 200, 255, 0.10)'); // fades quickly
      linGrad.addColorStop(0.55, 'rgba(0, 0, 0, 0)');          // transparent mid
      linGrad.addColorStop(0.80, 'rgba(0, 0, 0, 0.20)');       // underside darkens
      linGrad.addColorStop(1.00, 'rgba(0, 0, 0, 0.50)');       // dark bottom
      ctx.fillStyle = linGrad;
      ctx.fillRect(0, 0, cw, ch);

      // 3b. Radial edge vignette: center transparent → edges darker (3D roundness)
      const vignette = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.40);
      vignette.addColorStop(0.00, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(0.65, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1.00, 'rgba(0, 0, 0, 0.40)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, cw, ch);

      // 4. Angry V brow lines (still source-atop — clipped to body silhouette)
      ctx.strokeStyle = '#000d26';
      ctx.lineWidth   = s * 0.08;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.48, cy - s * 0.42);
      ctx.lineTo(cx - s * 0.12, cy - s * 0.30);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.12, cy - s * 0.30);
      ctx.lineTo(cx + s * 0.48, cy - s * 0.40);
      ctx.stroke();

      // 5. Restore before drawing face features
      ctx.globalCompositeOperation = 'source-over';

      // 6. Open mouth — dark cavity carved into lower face
      ctx.fillStyle = '#000814';
      ctx.beginPath();
      ctx.ellipse(cx, cy + s * 0.30, s * 0.52, s * 0.20, 0, 0, Math.PI * 2);
      ctx.fill();

      // 7. Three bone-colour teeth hanging down from upper jaw into the cavity
      ctx.fillStyle = '#f4d0a8';
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.40, cy + s * 0.08, s * 0.18, s * 0.24, s * 0.04);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.09, cy + s * 0.05, s * 0.18, s * 0.28, s * 0.04);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(cx + s * 0.22,  cy + s * 0.08, s * 0.18, s * 0.24, s * 0.04);
      ctx.fill();

      tex.refresh();
    }

    const sprite = this.scene.add.sprite(0, 0, key);
    sprite.setOrigin(0.5, 0.5);
    return sprite;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANIMATION HELPERS — every tween is created here. No per-frame draw calls.
  // ─────────────────────────────────────────────────────────────────────────

  _animIdleStart() {
    // Breathing wobble — body Y scales up while X scales down (volume preserve)
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.bodyS, scaleY: 1.05,
      duration: 800, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.bodyS, scaleX: 0.97,
      duration: 800, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    this._scheduleBlink();
  }

  _scheduleBlink() {
    if (!this.alive) return;
    const delay = Phaser.Math.Between(2200, 4500);
    this.scene.time.delayedCall(delay, () => {
      this._animBlink();
      this._scheduleBlink();
    });
  }

  _animBlink() {
    if (!this.alive) return;
    this.scene.tweens.add({
      targets: [this.eyeBigG, this.eyeSmallG],
      scaleY: 0.15,
      duration: 70, yoyo: true, ease: 'Quad.easeIn',
    });
  }

  // Wind-up: squish wide, eyes bug out, jaw gapes, container recoils backward.
  _animChargeWindup(chargeAngle) {
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.55, scaleY: 0.58,
      duration: 220, ease: 'Cubic.easeIn',
    });
    this.scene.tweens.add({
      targets: [this.eyeBigG, this.eyeSmallG], scaleX: 1.85, scaleY: 1.85,
      duration: 220, ease: 'Back.easeOut',
    });
    // Recoil 16px opposite the charge direction
    this.scene.tweens.add({
      targets: this.flipContainer,
      x: -Math.cos(chargeAngle) * 16,
      y: -Math.sin(chargeAngle) * 16,
      duration: 220, ease: 'Cubic.easeIn',
    });
  }

  // Burst: snap to a leaning-forward pose, release recoil, strong tilt + launch shake.
  _animChargeBurst(chargeAngle) {
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 0.80, scaleY: 1.28,
      duration: 110, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: [this.eyeBigG, this.eyeSmallG], scaleX: 1, scaleY: 1,
      duration: 110, ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.flipContainer, x: 0, y: 0,
      duration: 110, ease: 'Quad.easeOut',
    });
    // Stronger tilt into the charge direction
    const horiz = Math.cos(chargeAngle);
    const tilt = horiz >= 0 ? 0.22 : -0.22;
    this.scene.tweens.add({
      targets: this.container, rotation: tilt,
      duration: 110, ease: 'Quad.easeOut',
    });
  }

  // Impact: dramatic crush against the impact direction, then elastic settle.
  _animChargeImpact() {
    this.scene.cameras.main.shake(100, 0.005);
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.45, scaleY: 0.60,
      duration: 80, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: this.bodyS, scaleX: 1, scaleY: 1,
          duration: 380, ease: 'Elastic.easeOut',
        });
      },
    });
    this.scene.tweens.add({
      targets: this.container, rotation: 0,
      duration: 380, ease: 'Elastic.easeOut',
    });
  }

  // Spin crash — crouch low, then rapid 2-rotation spin + pulse.
  _animSpinCrashWindup() {
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.2, scaleY: 0.70,
      duration: 250, ease: 'Cubic.easeIn',
    });
    this.scene.tweens.add({
      targets: [this.eyeBigG, this.eyeSmallG], scaleX: 1.3, scaleY: 1.3,
      duration: 250, ease: 'Back.easeOut',
    });
  }

  _animSpinCrashGo() {
    const start = this.container.rotation;
    this.scene.tweens.add({
      targets: this.container,
      rotation: start + Math.PI * 4,
      duration: 360, ease: 'Cubic.easeOut',
      onComplete: () => {
        if (this.alive) this.container.rotation = 0;
      },
    });
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.15, scaleY: 1.15,
      duration: 180, yoyo: true, ease: 'Sine.easeInOut',
    });
    this.scene.tweens.add({
      targets: [this.eyeBigG, this.eyeSmallG], scaleX: 1, scaleY: 1,
      duration: 200, delay: 200, ease: 'Quad.easeOut',
    });
  }

  // Triple charge windup — same as normal but with a shake to telegraph the
  // bigger attack coming.
  _animTripleChargeWindup(chargeAngle) {
    this._animChargeWindup(chargeAngle);
    this.scene.tweens.add({
      targets: this.container, rotation: 0.05,
      duration: 50, yoyo: true, repeat: 7, ease: 'Sine.easeInOut',
    });
  }

  // Hurt flinch — solid orange-red silhouette flash + scale pop.
  _animHurt() {
    if (!this.alive) return;
    // Solid colour flash on both body and jaw sprites
    this.hitFlashBodyS.setAlpha(0.80);
    this.scene.tweens.add({
      targets: this.hitFlashBodyS, alpha: 0,
      duration: 220, ease: 'Quad.easeOut',
    });
    // Body flinch pop
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.18, scaleY: 1.18,
      duration: 70, yoyo: true, ease: 'Back.easeOut',
    });
    // Tiny random knock
    this.scene.tweens.add({
      targets: this.flipContainer, x: Phaser.Math.Between(-5, 5),
      duration: 70, yoyo: true, ease: 'Sine.easeInOut',
    });
  }

  // Enrage burst — cracks flash + continuous steam aura starts.
  _animEnrageBurst() {
    if (!this.alive) return;
    // Energy cracks strobe bright
    this.scene.tweens.add({
      targets: this.cracksG, alpha: 0.4,
      duration: 180, yoyo: true, repeat: 3, ease: 'Sine.easeInOut',
    });
    // Start the continuous fire-wisp spawner (≈4–5 wisps/sec)
    this._steamTimer = this.scene.time.addEvent({
      loop: true, delay: 220,
      callback: this._spawnSteamWisp, callbackScope: this,
    });
  }

  // One fire/smoke wisp — 8 segments drawn along a sine-curve path so the
  // wisp IS wavy by shape, not just by motion. Wide at the base (y=0, nearest
  // the boss), tapering to a narrow tip as y goes negative (upward on screen).
  // Called repeatedly by _steamTimer while the boss is enraged.
  _spawnSteamWisp() {
    if (!this.alive) return;

    // ── Spawn position ──────────────────────────────────────────────────────
    // When moving: emit from the rear hemisphere so the boss leaves a fire trail.
    // When stationary: spread around the full body edge.
    let spawnAngle;
    if (this._isMoving) {
      spawnAngle = this._lastMoveAngle + Math.PI + Phaser.Math.FloatBetween(-1.22, 1.22);
    } else {
      spawnAngle = Math.random() * Math.PI * 2;
    }
    const r  = this.size * Phaser.Math.FloatBetween(0.45, 1.0);
    const wx = this.x + Math.cos(spawnAngle) * r;
    const wy = this.y + Math.sin(spawnAngle) * r;

    // ── Wisp geometry ────────────────────────────────────────────────────────
    // Each segment is a small ellipse placed along a sine curve that runs
    // from y=0 (base, wide, orange) upward to y=-wH (tip, narrow, near-white).
    // The sine gives the column its natural wispy S-curve shape.
    const wH        = Phaser.Math.FloatBetween(42, 78);   // total column height
    const wW        = Phaser.Math.FloatBetween(10, 18);   // base width
    const sineAmp   = wW * Phaser.Math.FloatBetween(0.6, 1.4);  // how far the curve swings
    const sineCycles = Phaser.Math.FloatBetween(0.8, 1.6); // how many S-bends along height
    const sinePhase = Math.random() * Math.PI * 2;         // random start phase → unique shape
    const NUM_SEGS  = 8;

    const wisp = this.scene.add.graphics();

    for (let i = 0; i < NUM_SEGS; i++) {
      const t    = i / (NUM_SEGS - 1);               // 0 = base, 1 = tip
      const segY = -t * wH;                          // upward (negative = up in Phaser)
      const segX = Math.sin(sinePhase + t * Math.PI * sineCycles * 2) * sineAmp;
      const segW = wW * (1 - t * 0.82);              // tapers from full width to 18%
      const segH = segW * 1.55;                      // each blob slightly taller than wide

      // Alpha: ramp up quickly from base, hold through middle, fade toward tip
      let alpha;
      if (t < 0.12)      alpha = (t / 0.12) * 0.55;
      else if (t < 0.70) alpha = 0.55;
      else               alpha = (1 - t) / 0.30 * 0.55;

      // Colour: deep orange at base → bright orange → golden → cream-white tip
      let color;
      if (t < 0.25)      color = 0xff3300;
      else if (t < 0.52) color = 0xff7700;
      else if (t < 0.78) color = 0xffbb00;
      else               color = 0xfff0cc;

      wisp.fillStyle(color, alpha);
      wisp.fillEllipse(segX, segY, segW, segH);
    }

    wisp.x = wx;
    wisp.y = wy;
    wisp.alpha = Phaser.Math.FloatBetween(0.55, 0.85);
    wisp.setDepth(12);

    // ── Overall drift wobble ─────────────────────────────────────────────────
    // The wisp's own shape is already wavy; this adds gentle organic swaying of
    // the whole column as it rises — different frequency per wisp.
    const startX     = wx;
    const wobbleSpd  = Phaser.Math.FloatBetween(1.8, 4.0);
    const wobbleAmp  = Phaser.Math.FloatBetween(5, 13);
    const startTime  = this.scene.time.now;

    const wobble = (time) => {
      if (!wisp.active) { this.scene.events.off('update', wobble); return; }
      wisp.x = startX + Math.sin((time - startTime) * 0.001 * wobbleSpd) * wobbleAmp;
    };
    this.scene.events.on('update', wobble);

    // ── Rise and fade ────────────────────────────────────────────────────────
    // scaleX stays near 1 — the shape itself handles the visual, not stretching.
    const riseHeight = Phaser.Math.Between(80, 160);
    const dur        = Phaser.Math.Between(900, 1550);

    this.scene.tweens.add({
      targets: wisp,
      y:      wy - riseHeight,
      scaleX: Phaser.Math.FloatBetween(1.1, 1.6),  // subtle expansion only
      scaleY: Phaser.Math.FloatBetween(1.0, 1.25),
      alpha:  0,
      duration: dur,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.events.off('update', wobble);
        if (wisp.active) wisp.destroy();
      },
    });

    // Guaranteed cleanup on scene shutdown
    this.scene.events.once('shutdown', () => {
      this.scene.events.off('update', wobble);
      if (wisp.active) wisp.destroy();
    });
  }

  // Death — stop idle tweens, spin-shrink, fade features, then explode.
  _animDeath(onComplete) {
    this._idleTweens.forEach(tw => { if (tw && tw.isPlaying()) tw.stop(); });
    this._idleTweens = [];
    this.scene.tweens.add({
      targets: this.container,
      rotation: this.container.rotation + Math.PI * 3,
      scaleX: 0, scaleY: 0,
      duration: 700, ease: 'Cubic.easeIn',
      onComplete,
    });
    this.scene.tweens.add({
      targets: [this.eyeBigG, this.eyeSmallG],
      alpha: 0, duration: 360, ease: 'Quad.easeIn',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OVERRIDES — wire animation hooks into BossBase lifecycle events
  // ─────────────────────────────────────────────────────────────────────────

  takeDamage(amount) {
    super.takeDamage(amount);
    if (!this.alive) return;
    // BossBase sets container.alpha = 0.4 — cancel it immediately; the hitFlashG
    // overlay handles the visual hit feedback without revealing sub-shapes.
    this.container.setAlpha(1);
    this._takingHit = true;
    this._animHurt();
    this.scene.time.delayedCall(250, () => { this._takingHit = false; });
  }

  _triggerEnrage() {
    super._triggerEnrage();
    this._animEnrageBurst();
  }

  // Override _die so the spin-shrink animation runs before the fragment
  // explosion + container destruction.
  _die() {
    if (!this.alive) return;
    this.alive = false;
    // Stop steam emitter before any graphics are destroyed
    if (this._steamTimer) { this._steamTimer.remove(false); this._steamTimer = null; }
    if (this.shadowG) { this.shadowG.destroy(); this.shadowG = null; }

    this._animDeath(() => {
      // Fragment explosion (copied from BossBase since the original _die
      // destroys the container immediately — we want it after the spin-shrink)
      for (let i = 0; i < 16; i++) {
        const frag = this.scene.add.graphics();
        frag.fillStyle(this.color, 1);
        const sz = Phaser.Math.Between(6, 18);
        frag.fillRect(-sz / 2, -sz / 2, sz, sz);
        frag.x = this.x;
        frag.y = this.y;
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
  // Attacks — unchanged logic, with _anim* calls injected at the right beats
  // ─────────────────────────────────────────────────────────────────────────

  _getAttackPool()    { return ['dashCharge', 'spinCrash']; }
  _getEnrageAttacks() { return ['tripleCharge']; }

  _runAttack(name) {
    switch (name) {
      case 'dashCharge':
        this._attackDashCharge();
        break;
      case 'spinCrash': {
        // Only spin when the player is inside the ring's effective range.
        // Out-of-range → fall back to dashCharge so the boss stays aggressive.
        const p = this.scene.player;
        const inRange = p && p.alive &&
          Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < this.size * 4.2;
        if (inRange) { this._attackSpinCrash(); } else { this._attackDashCharge(); }
        break;
      }
      case 'tripleCharge':
        this._attackTripleCharge();
        break;
      default:
        this._endAttack();
    }
  }

  _clampPathToArena(startX, startY, endX, endY) {
    const arena = this.scene.arena;
    if (!arena) return { x: endX, y: endY };
    const STEPS = 24;
    let lastX = startX, lastY = startY;
    for (let i = 1; i <= STEPS; i++) {
      const t = i / STEPS;
      const cx = startX + (endX - startX) * t;
      const cy = startY + (endY - startY) * t;
      if (arena.containsPoint(cx, cy, this.size * 0.5)) {
        lastX = cx; lastY = cy;
      } else {
        break;
      }
    }
    return { x: lastX, y: lastY };
  }

  _calcChargeDestination(playerX, playerY, isFirst) {
    const overshoot = isFirst
      ? Phaser.Math.Between(300, 400)
      : Phaser.Math.Between(100, 200);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
    const endX  = playerX + Math.cos(angle) * overshoot;
    const endY  = playerY + Math.sin(angle) * overshoot;
    return this._clampPathToArena(playerX, playerY, endX, endY);
  }

  _attackDashCharge() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const dest  = this._calcChargeDestination(p.x, p.y, true);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, dest.x, dest.y);

    this._animChargeWindup(angle);
    this._drawTelegraphRect(this.x, this.y, dest.x, dest.y, this.size + 16, this._telegraphDuration, 0xff4400);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      this._doCharge(dest.x, dest.y, 1);
    });
  }

  _doCharge(tx, ty, count) {
    if (!this.alive) return;
    const angle    = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const dist     = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
    const speed    = 5600 + this.level * 80;
    const duration = (dist / speed) * 1000 + 200;

    this._charging = true;
    this._animChargeBurst(angle);

    let chargeHitLanded = false;
    let obstaclesHit    = 0;

    const afterCharge = () => {
      this._charging = false;
      this._animChargeImpact();
      if (count >= 3 || !this.alive) {
        this._endAttack();
      } else {
        const pl = this.scene.player;
        if (!pl || !pl.alive) { this._endAttack(); return; }
        const REPEAT_TELEGRAPH_MS = this.level < 10 ? 500 : 300;
        const dest      = this._calcChargeDestination(pl.x, pl.y, false);
        const nextAngle = Phaser.Math.Angle.Between(this.x, this.y, dest.x, dest.y);
        this._animChargeWindup(nextAngle);
        this._drawTelegraphRect(this.x, this.y, dest.x, dest.y, this.size + 16, REPEAT_TELEGRAPH_MS, 0xff4400);
        this.scene.time.delayedCall(REPEAT_TELEGRAPH_MS, () => {
          this._doCharge(dest.x, dest.y, count + 1);
        });
      }
    };

    let tween;
    tween = this.scene.tweens.add({
      targets: this.container,
      x: tx, y: ty,
      duration, ease: 'Quad.easeIn',
      onUpdate: () => {
        this.x = this.container.x;
        this.y = this.container.y;

        if (this.scene.obstacles) {
          for (const obs of this.scene.obstacles) {
            if (obs.broken) continue;
            if (Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y)
                < this.size * 0.6 + obs.baseRadius) {
              obs.break();
              obstaclesHit++;
              if (obstaclesHit >= 2) { tween.stop(); afterCharge(); return; }
              break;
            }
          }
        }

        if (chargeHitLanded) return;
        const pl = this.scene.player;
        if (pl && pl.alive && !pl.invincible) {
          if (Phaser.Math.Distance.Between(this.x, this.y, pl.x, pl.y) < this.size + 16) {
            pl.takeDamage(this.damage);
            chargeHitLanded = true;
          }
        }
      },
      onComplete: afterCharge,
    });
  }

  _attackSpinCrash() {
    this._animSpinCrashWindup();
    this._drawTelegraphZone(this.x, this.y, this.size * 4.4, this._telegraphDuration, 0xff4400);

    const bossX = this.x, bossY = this.y;

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      this._animSpinCrashGo();

      const ring = this.scene.add.graphics();
      ring.x = bossX;
      ring.y = bossY;
      ring.setDepth(9);
      const maxR = this.size * 5.0;

      let ringHitLanded = false;
      const ringBrokenObs = [];

      this.scene.tweens.addCounter({
        from: 0, to: maxR, duration: 350,
        onUpdate: (tw) => {
          const r = tw.getValue();
          ring.clear();
          ring.lineStyle(6, this.color, 1 - r / maxR);
          ring.strokeCircle(0, 0, r);

          this.scene.obstacles?.forEach(obs => {
            if (obs.broken) return;
            const d = Phaser.Math.Distance.Between(bossX, bossY, obs.x, obs.y);
            if (d > r + 10 || d < r - obs._origBaseRadius - 10) return;
            const obsAngle = Math.atan2(obs.y - bossY, obs.x - bossX);
            const blocked  = ringBrokenObs.some(prev => {
              const prevAngle = Math.atan2(prev.y - bossY, prev.x - bossX);
              return Math.abs(Phaser.Math.Angle.Wrap(obsAngle - prevAngle)) < 0.5;
            });
            if (!blocked) {
              obs.break();
              ringBrokenObs.push(obs);
            }
          });

          if (ringHitLanded) return;
          const p = this.scene.player;
          if (p && p.alive && !p.invincible) {
            const d = Phaser.Math.Distance.Between(bossX, bossY, p.x, p.y);
            if (d < r + 10 && d > r - 20) {
              p.takeDamage(this.damage * 0.8);
              ringHitLanded = true;
            }
          }
        },
        onComplete: () => { ring.destroy(); this._endAttack(); }
      });

      this.scene.cameras.main.shake(200, 0.003);
    });
  }

  /**
   * Ghost charger used by tripleCharge — lightweight Graphics silhouette
   * matching the blob aesthetic. Fades in during telegraph, charges along a
   * side path, dissolves at end.
   */
  _createGhostCharger(x, y, angle) {
    const g = this.scene.add.graphics();
    const s = this.size;
    g.fillStyle(this.color, 1);
    // Body blob silhouette (no details — it's a ghost)
    g.fillEllipse(0, 0, s * 2.2, s * 1.5);
    g.fillEllipse(0, s * 0.30, s * 1.95, s * 0.85);
    // Jaw bump in front
    g.fillEllipse(0, s * 0.55, s * 1.3, s * 0.55);

    g.x = x;
    g.y = y;
    g.angle = Phaser.Math.RadToDeg(angle);
    g.alpha = 0;
    g.setDepth(9);

    this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
    return g;
  }

  _doTripleCharge(dest, onComplete, damageMult = 1.0) {
    if (!this.alive) { onComplete?.(); return; }

    const angle    = Phaser.Math.Angle.Between(this.x, this.y, dest.x, dest.y);
    const dist     = Phaser.Math.Distance.Between(this.x, this.y, dest.x, dest.y);
    const speed    = 5600 + this.level * 80;
    const duration = (dist / speed) * 1000 + 200;

    this._charging = true;
    this._animChargeBurst(angle);

    let hitLanded    = false;
    let obstaclesHit = 0;

    const afterCharge = () => {
      this._charging = false;
      this._animChargeImpact();
      onComplete?.();
    };

    let tween;
    tween = this.scene.tweens.add({
      targets: this.container,
      x: dest.x, y: dest.y,
      duration, ease: 'Quad.easeIn',
      onUpdate: () => {
        this.x = this.container.x;
        this.y = this.container.y;

        if (this.scene.obstacles) {
          for (const obs of this.scene.obstacles) {
            if (obs.broken) continue;
            if (Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y)
                < this.size * 0.6 + obs.baseRadius) {
              obs.break();
              obstaclesHit++;
              if (obstaclesHit >= 2) { tween.stop(); afterCharge(); return; }
              break;
            }
          }
        }

        if (hitLanded) return;
        const pl = this.scene.player;
        if (pl && pl.alive && !pl.invincible) {
          if (Phaser.Math.Distance.Between(this.x, this.y, pl.x, pl.y) < this.size + 16) {
            pl.takeDamage(this.damage * damageMult);
            hitLanded = true;
          }
        }
      },
      onComplete: afterCharge,
    });
  }

  _doGhostCharge(ghost, dest, damageMult, onComplete) {
    if (!this.alive || !ghost.active) { onComplete?.(); return; }

    const angle    = Phaser.Math.Angle.Between(ghost.x, ghost.y, dest.x, dest.y);
    const dist     = Phaser.Math.Distance.Between(ghost.x, ghost.y, dest.x, dest.y);
    const speed    = 5600 + this.level * 80;
    const duration = (dist / speed) * 1000 + 200;

    ghost.angle = Phaser.Math.RadToDeg(angle);

    let hitLanded    = false;
    let obstaclesHit = 0;

    const dissolve = () => {
      if (ghost.active) {
        this.scene.tweens.add({
          targets: ghost, alpha: 0, duration: 150,
          onComplete: () => { if (ghost.active) ghost.destroy(); }
        });
      }
    };

    let ghostTween;
    ghostTween = this.scene.tweens.add({
      targets: ghost,
      x: dest.x, y: dest.y,
      duration, ease: 'Quad.easeIn',
      onUpdate: () => {
        if (this.scene.obstacles) {
          for (const obs of this.scene.obstacles) {
            if (obs.broken) continue;
            if (Phaser.Math.Distance.Between(ghost.x, ghost.y, obs.x, obs.y)
                < this.size * 0.6 + obs.baseRadius) {
              obs.break();
              obstaclesHit++;
              if (obstaclesHit >= 2) { ghostTween.stop(); dissolve(); onComplete?.(); return; }
              break;
            }
          }
        }

        if (hitLanded) return;
        const pl = this.scene.player;
        if (pl && pl.alive && !pl.invincible) {
          if (Phaser.Math.Distance.Between(ghost.x, ghost.y, pl.x, pl.y) < this.size + 16) {
            pl.takeDamage(this.damage * damageMult);
            hitLanded = true;
          }
        }
      },
      onComplete: () => { dissolve(); onComplete?.(); },
    });
  }

  _attackTripleCharge() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const dist      = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
    const reach     = dist + 200;

    const dest0 = this._calcChargeDestination(p.x, p.y, true);

    const leftAngle  = baseAngle - 0.30;
    const dest1 = this._clampPathToArena(
      this.x, this.y,
      this.x + Math.cos(leftAngle)  * reach,
      this.y + Math.sin(leftAngle)  * reach
    );

    const rightAngle = baseAngle + 0.30;
    const dest2 = this._clampPathToArena(
      this.x, this.y,
      this.x + Math.cos(rightAngle) * reach,
      this.y + Math.sin(rightAngle) * reach
    );

    this._animTripleChargeWindup(baseAngle);

    this._drawTelegraphRect(this.x, this.y, dest0.x, dest0.y, this.size + 16, this._telegraphDuration, 0xff8800);
    this._drawTelegraphRect(this.x, this.y, dest1.x, dest1.y, this.size + 16, this._telegraphDuration, 0xff8800);
    this._drawTelegraphRect(this.x, this.y, dest2.x, dest2.y, this.size + 16, this._telegraphDuration, 0xff8800);

    const ghost1 = this._createGhostCharger(
      this.x + (dest1.x - this.x) * 0.4,
      this.y + (dest1.y - this.y) * 0.4,
      leftAngle
    );
    const ghost2 = this._createGhostCharger(
      this.x + (dest2.x - this.x) * 0.4,
      this.y + (dest2.y - this.y) * 0.4,
      rightAngle
    );

    this.scene.tweens.add({ targets: ghost1, alpha: 0.35, duration: this._telegraphDuration, ease: 'Linear' });
    this.scene.tweens.add({ targets: ghost2, alpha: 0.35, duration: this._telegraphDuration, ease: 'Linear' });

    const fadeOut = (ghost) => {
      if (ghost.active) {
        this.scene.tweens.add({
          targets: ghost, alpha: 0, duration: 150,
          onComplete: () => { if (ghost.active) ghost.destroy(); }
        });
      }
    };

    const MINI_TEL = 300;

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

      this._doTripleCharge(dest0, () => {
        if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

        this._drawTelegraphRect(ghost1.x, ghost1.y, dest1.x, dest1.y, this.size + 16, MINI_TEL, 0xff8800);
        this._drawTelegraphRect(ghost2.x, ghost2.y, dest2.x, dest2.y, this.size + 16, MINI_TEL, 0xff8800);

        this.scene.time.delayedCall(MINI_TEL, () => {
          if (!this.alive) { fadeOut(ghost1); fadeOut(ghost2); return; }

          let remaining = 2;
          const checkDone = () => { if (--remaining === 0) this._endAttack(); };

          this._doGhostCharge(ghost1, dest1, 0.6, checkDone);
          this._doGhostCharge(ghost2, dest2, 0.6, checkDone);
        });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // update — orbit when idle, track horizontal facing, no visual redraw
  // ─────────────────────────────────────────────────────────────────────────
  update(time, delta) {
    const prevX = this.x;
    const prevY = this.y;
    super.update(time, delta);
    if (!this.alive) return;

    // Orbit the player when idle
    if (this._state === 'idle' && !this._charging) {
      const p = this.scene.player;
      if (p && p.alive) {
        this._orbitAngle += (delta / 1000) * 1.7;
        const tx = p.x + Math.cos(this._orbitAngle) * 200;
        const ty = p.y + Math.sin(this._orbitAngle) * 200;
        this._moveToward(tx, ty, this.moveSpeed * 0.5, delta / 1000);
      }
    }

    const moveDx   = this.x - prevX;
    const moveDy   = this.y - prevY;
    const moveDist = Math.hypot(moveDx, moveDy);
    this._isMoving = moveDist > 0.4;

    // Track movement direction so fire wisps can spawn from the rear of the boss
    if (this._isMoving) {
      this._lastMoveAngle = Math.atan2(moveDy, moveDx);
    }

    // Determine horizontal facing from current movement / charge direction
    if (!this._charging && Math.abs(moveDx) > 0.5) {
      const sign = moveDx >= 0 ? 1 : -1;
      if (sign !== this._facingDir) {
        this._facingDir = sign;
        // Flip the inner container — preserves the outer spawn/enrage tweens
        this.flipContainer.scaleX = sign;
      }
    }
  }
}
