import Phaser from 'phaser';
import BossBase from './BossBase.js';
import { BOSS_CONFIGS } from '../../config/bossConfig.js';

export default class Stomper extends BossBase {
  constructor(scene, x, y, level) {
    super(scene, x, y, BOSS_CONFIGS.stomper, level);
    this._idleTweens = [];
    this._bobPhase = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BODY CONSTRUCTION
  // ─────────────────────────────────────────────────────────────────────────

  _buildGraphics() {
    this._buildBody();
    this._animIdleStart();
  }

  _buildBody() {
    // _idleTweens must be initialised here — BossBase calls _buildGraphics()
    // from within super(), before the Stomper constructor body runs.
    this._idleTweens = [];
    const s = this.size;

    this.flipContainer = this.scene.add.container(0, 0);
    this.container.add(this.flipContainer);

    // ── Arm-boulders — live Graphics so they can animate independently ────
    // Positioned at shoulder attachment points; polygon drawn in local coords
    // (body-space armL vertices shifted by +0.90, -0.50 to center the pivot).
    const armLocalPts = [
      [-0.60, -0.32], [-0.22, -0.44], [0.12, -0.16],
      [ 0.16,  0.30], [-0.10,  0.64], [-0.60,  0.60], [-0.76, 0.12],
    ];
    this.armLeftG  = this._buildArmGraphic(s, armLocalPts, false);
    this.armRightG = this._buildArmGraphic(s, armLocalPts, true);
    this.armLeftG.x  = -s * 0.90;  this.armLeftG.y  = s * 0.50;
    this.armRightG.x =  s * 0.90;  this.armRightG.y = s * 0.50;
    // Arms go in BEFORE bodyS so they render behind the torso
    this.flipContainer.add(this.armLeftG);
    this.flipContainer.add(this.armRightG);

    // ── Body sprite (baked faceted stone golem — torso + feet only) ──────
    this.bodyS = this._buildBodySprite();
    this.flipContainer.add(this.bodyS);

    // ── Eyes — deep-set amber glowing orbs ───────────────────────────────
    this.eyeLeftG  = this._buildEye(s);
    this.eyeRightG = this._buildEye(s);
    this.eyeLeftG.x  = -s * 0.30;
    this.eyeRightG.x =  s * 0.30;
    this.eyeLeftG.y  = this.eyeRightG.y = -s * 0.26;
    this.flipContainer.add(this.eyeLeftG);
    this.flipContainer.add(this.eyeRightG);

    // ── Lower jaw — upward stone teeth + chin, translates down to open ────
    // Coords are in absolute body-space so they interlock with the baked
    // upper teeth. Opening tweens translate lowerJawG.y downward.
    this._jawRestY = 0;
    this.lowerJawG = this.scene.add.graphics();
    this.lowerJawG.x = 0;
    this.lowerJawG.y = this._jawRestY;
    // Chin bar — sits BELOW the baked cavity (which ends at y≈0.55)
    this.lowerJawG.fillStyle(0x0a1f0a, 1);
    this.lowerJawG.fillPoints([
      { x: -s * 0.42, y: s * 0.54 }, { x: s * 0.42, y: s * 0.54 },
      { x: s * 0.34, y: s * 0.68 }, { x: -s * 0.34, y: s * 0.68 },
    ], true);
    // Lower teeth — 3 upward triangles, bases at y=0.50, tips at y=0.24
    // (offset between the 4 upper teeth so the rows interlock like a zipper)
    this.lowerJawG.fillStyle(0xcfc19a, 1);
    const lower = [-0.24, 0.0, 0.24];
    for (const tx of lower) {
      this.lowerJawG.fillTriangle(
        s * (tx - 0.10), s * 0.50,
        s * (tx + 0.10), s * 0.50,
        s * tx,          s * 0.24,
      );
    }
    this.flipContainer.add(this.lowerJawG);

    // ── Hit flash overlay ─────────────────────────────────────────────────
    this.hitFlashBodyS = this.scene.add.sprite(0, 0, `stomper-body-${s}`);
    this.hitFlashBodyS.setOrigin(0.5, 0.5);
    this.hitFlashBodyS.setTintFill(0xff4400);
    this.hitFlashBodyS.alpha = 0;
    this.flipContainer.add(this.hitFlashBodyS);
  }

  _buildEye(s) {
    // Amber glowing orb — concentric circles fading out to read as a glow set
    // into the dark baked eye socket.
    const g = this.scene.add.graphics();
    g.fillStyle(0xff9500, 0.22); g.fillCircle(0, 0, s * 0.17);   // outer glow
    g.fillStyle(0xffb020, 0.55); g.fillCircle(0, 0, s * 0.11);   // mid glow
    g.fillStyle(0xffd060, 1.00); g.fillCircle(0, 0, s * 0.07);   // amber core
    g.fillStyle(0xfff2c0, 1.00); g.fillCircle(0, 0, s * 0.035);  // white-hot center
    return g;
  }

  _buildArmGraphic(s, pts, mirrorX) {
    // Live Graphics arm-boulder. pts are the LEFT arm's local coords; mirrorX
    // flips x to produce the right arm. Pivot at (0,0) = shoulder attachment.
    const g = this.scene.add.graphics();
    const p = mirrorX ? pts.map(([x, y]) => [-x, y]) : pts;
    const toPt = ([x, y]) => ({ x: x * s, y: y * s });
    // Base fill in body color
    g.fillStyle(this.color, 1);
    g.fillPoints(p.map(toPt), true);
    // Dark underside / right-side tint (the shadow plane)
    g.fillStyle(0x000000, 0.22);
    const dark = mirrorX
      ? [[ 0.16, 0.30], [-0.10, 0.64], [-0.60, 0.60], [-0.76, 0.12]]
      : [[-0.16, 0.30], [ 0.10, 0.64], [ 0.60, 0.60], [ 0.76, 0.12]];
    g.fillPoints(dark.map(toPt), true);
    // Moss dab on the sunlit top face
    g.fillStyle(0x78c846, 0.50);
    const moss = mirrorX
      ? [[ 0.12, -0.16], [-0.22, -0.44], [-0.50, -0.28], [-0.20, 0.05]]
      : [[-0.12, -0.16], [ 0.22, -0.44], [ 0.50, -0.28], [ 0.20, 0.05]];
    g.fillPoints(moss.map(toPt), true);
    return g;
  }

  _buildBodySprite() {
    const s   = this.size;
    const key = `stomper-body-${s}`;
    const cw  = Math.ceil(s * 3.9);
    const ch  = Math.ceil(s * 2.9);

    if (!this.scene.textures.exists(key)) {
      const tex = this.scene.textures.createCanvas(key, cw, ch);
      const ctx = tex.getContext();
      const cx  = cw / 2;
      const cy  = ch / 2;
      const colorCSS = '#' + this.color.toString(16).padStart(6, '0');

      // Angular polygon helper — pts are [ex, ey] in body-space s-units.
      const poly = (pts) => {
        ctx.beginPath();
        ctx.moveTo(cx + pts[0][0] * s, cy + pts[0][1] * s);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(cx + pts[i][0] * s, cy + pts[i][1] * s);
        ctx.closePath();
        ctx.fill();
      };
      // Mirror a point set across x
      const mirror = (pts) => pts.map(([x, y]) => [-x, y]);

      // Torso — chunky angular boulder, flat-faceted crown, widening at bottom.
      // (Arm-boulders are now live Graphics in _buildBody, not baked here.)
      const torso = [
        [-0.85, -0.70], [-0.55, -0.95], [-0.25, -1.02], [0.30, -1.00],
        [0.60, -0.90], [0.92, -0.60], [1.05, -0.10], [0.95, 0.45],
        [0.62, 0.85], [0.25, 0.95], [-0.25, 0.95], [-0.62, 0.85],
        [-0.98, 0.45], [-1.05, -0.10],
      ];
      // Feet — small angular toe trapezoids (left); mirror for right.
      const footL = [[-0.50, 0.90], [-0.18, 0.90], [-0.15, 1.16], [-0.52, 1.16]];

      // 1. Silhouette — torso + feet only (arms are live elements)
      ctx.fillStyle = colorCSS;
      poly(torso);
      poly(footL);
      poly(mirror(footL));

      // 2. Gradient — source-atop clips to silhouette pixels only
      ctx.globalCompositeOperation = 'source-atop';

      const ar = 1.30;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(ar, 1.0);
      const grad = ctx.createRadialGradient(0, -s * 0.55, 0, 0, -s * 0.30, s * 1.00);
      grad.addColorStop(0.00, 'rgba(180, 255, 90, 0.50)');  // lime sunlit crown
      grad.addColorStop(0.32, 'rgba(90, 190, 50, 0.12)');
      grad.addColorStop(0.60, 'rgba(0, 0, 0, 0)');           // body colour shows
      grad.addColorStop(1.00, 'rgba(0, 18, 0, 0.68)');       // dark earth shadow
      ctx.fillStyle = grad;
      ctx.fillRect(-cw, -ch, cw * 2, ch * 2);
      ctx.restore();

      // 3. Facet shading — dark shadow planes only (torso only; arms handled in live Graphics)
      // Light facets removed — they caused a hard-edge artifact on the crown.
      // The gradient already provides the top-lit crown highlight.
      ctx.fillStyle = 'rgba(0, 20, 0, 0.22)';
      poly([[0.30, 0.10], [1.05, -0.10], [0.95, 0.45], [0.62, 0.85], [0.25, 0.95]]); // torso lower-right

      // 4. Seam crack — one diagonal across the torso body
      ctx.strokeStyle = 'rgba(0, 20, 0, 0.5)';
      ctx.lineWidth   = s * 0.05;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.55, cy - s * 0.55);
      ctx.lineTo(cx + s * 0.10, cy - s * 0.30);
      ctx.stroke();

      // 5. Moss patches on the crown (source-atop — clipped to torso silhouette)
      ctx.fillStyle = 'rgba(120, 200, 70, 0.55)';
      poly([[-0.55, -0.95], [-0.05, -1.00], [0.10, -0.78], [-0.45, -0.72]]); // crown centre-left
      poly([[0.10, -0.98], [0.55, -0.92], [0.60, -0.70], [0.18, -0.74]]);    // crown centre-right

      // 6. Heavy stone brow ridge (dark V) + recessed eye sockets
      ctx.strokeStyle = 'rgba(8, 40, 15, 1)';
      ctx.lineWidth   = s * 0.13;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.56, cy - s * 0.46);
      ctx.lineTo(cx - s * 0.08, cy - s * 0.34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.08, cy - s * 0.34);
      ctx.lineTo(cx + s * 0.56, cy - s * 0.46);
      ctx.stroke();
      // Dark recessed sockets behind the glowing eyes
      ctx.fillStyle = 'rgba(0, 15, 0, 0.55)';
      poly([[-0.46, -0.34], [-0.14, -0.34], [-0.16, -0.10], [-0.46, -0.12]]);
      poly([[0.14, -0.34], [0.46, -0.34], [0.46, -0.12], [0.16, -0.10]]);

      // 7. Maw cavity + upper teeth (source-over) — co-designed with lower row
      ctx.globalCompositeOperation = 'source-over';
      // Dark throat cavity (angular trapezoid)
      ctx.fillStyle = '#050a05';
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.46, cy + s * 0.08);
      ctx.lineTo(cx + s * 0.46, cy + s * 0.08);
      ctx.lineTo(cx + s * 0.40, cy + s * 0.55);
      ctx.lineTo(cx - s * 0.40, cy + s * 0.55);
      ctx.closePath();
      ctx.fill();
      // Upper teeth — 4 downward angular triangles from the top rim
      ctx.fillStyle = '#cfc19a';
      const upper = [-0.36, -0.12, 0.12, 0.36];
      for (const tx of upper) {
        ctx.beginPath();
        ctx.moveTo(cx + (tx - 0.07) * s, cy + 0.08 * s);
        ctx.lineTo(cx + (tx + 0.07) * s, cy + 0.08 * s);
        ctx.lineTo(cx + tx * s,          cy + 0.30 * s);
        ctx.closePath();
        ctx.fill();
      }

      // 8. Grass blades — thin green triangles poking up above the crown
      ctx.fillStyle = '#6abf3c';
      const blades = [
        [-0.45, -0.78, -0.40, -1.10], [-0.20, -0.95, -0.12, -1.28],
        [0.05, -0.98, 0.10, -1.30], [0.30, -0.94, 0.40, -1.22],
        [0.50, -0.82, 0.58, -1.06],
      ];
      for (const [bx, by, tx, ty] of blades) {
        ctx.beginPath();
        ctx.moveTo(cx + (bx - 0.06) * s, cy + by * s);
        ctx.lineTo(cx + (bx + 0.06) * s, cy + by * s);
        ctx.lineTo(cx + tx * s,          cy + ty * s);
        ctx.closePath();
        ctx.fill();
      }

      tex.refresh();
    }

    const sprite = this.scene.add.sprite(0, 0, key);
    sprite.setOrigin(0.5, 0.5);
    return sprite;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANIMATION HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  _animIdleStart() {
    // Heavy breathing — slow, weighted scale pulse
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.bodyS, scaleY: 1.04,
      duration: 1400, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.bodyS, scaleX: 0.98,
      duration: 1400, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    // Lazy jaw grind
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.lowerJawG, y: this._jawRestY + this.size * 0.12,
      duration: 2200, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    // Slow gorilla arm sway — alternating forward/back with 900ms phase offset
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.armLeftG, rotation: 0.12,
      duration: 1800, ease: 'Sine.easeInOut', yoyo: true, repeat: -1,
    }));
    this._idleTweens.push(this.scene.tweens.add({
      targets: this.armRightG, rotation: -0.12,
      duration: 1800, ease: 'Sine.easeInOut', yoyo: true, repeat: -1, delay: 900,
    }));
    this._scheduleBlink();
  }

  _scheduleBlink() {
    if (!this.alive) return;
    const delay = Phaser.Math.Between(2800, 5500);
    this.scene.time.delayedCall(delay, () => {
      this._animBlink();
      this._scheduleBlink();
    });
  }

  _animBlink() {
    if (!this.alive) return;
    this.scene.tweens.add({
      targets: [this.eyeLeftG, this.eyeRightG],
      scaleY: 0.10,
      duration: 80, yoyo: true, ease: 'Quad.easeIn',
    });
  }

  // Stomp windup — body crouches low (wide flat pancake), arms raise to pound
  _animStompWindup() {
    const s = this.size;
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.45, scaleY: 0.58,
      duration: 180, ease: 'Cubic.easeIn',
    });
    this.scene.tweens.add({
      targets: [this.eyeLeftG, this.eyeRightG], scaleY: 0.40,
      duration: 180, ease: 'Cubic.easeIn',
    });
    this.scene.tweens.add({
      targets: this.lowerJawG, y: this._jawRestY + s * 0.25,
      duration: 180, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.flipContainer, y: 8,
      duration: 180, ease: 'Cubic.easeIn',
    });
    // Arms raise up/back — gorilla about to pound
    this.scene.tweens.add({
      targets: [this.armLeftG, this.armRightG], rotation: -0.65,
      duration: 180, ease: 'Cubic.easeIn',
    });
  }

  // Stomp impact — elastic bounce back; arms slam forward then return
  _animStompImpact() {
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1, scaleY: 1,
      duration: 400, ease: 'Elastic.easeOut',
    });
    this.scene.tweens.add({
      targets: [this.eyeLeftG, this.eyeRightG], scaleY: 1,
      duration: 400, ease: 'Elastic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.lowerJawG, y: this._jawRestY,
      duration: 400, ease: 'Elastic.easeOut',
    });
    this.scene.tweens.add({
      targets: this.flipContainer, y: 0,
      duration: 400, ease: 'Elastic.easeOut',
    });
    // Arms slam forward then elastic back to neutral
    this.scene.tweens.add({
      targets: [this.armLeftG, this.armRightG], rotation: 0.35,
      duration: 80, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: [this.armLeftG, this.armRightG], rotation: 0,
          duration: 400, ease: 'Elastic.easeOut',
        });
      },
    });
  }

  // Leap windup — body stretches tall; arms raise dramatically overhead
  _animLeapWindup() {
    const s = this.size;
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 0.78, scaleY: 1.30,
      duration: 250, ease: 'Cubic.easeIn',
    });
    this.scene.tweens.add({
      targets: [this.eyeLeftG, this.eyeRightG], scaleX: 1.20, scaleY: 1.20,
      duration: 250, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.lowerJawG, y: this._jawRestY + s * 0.32,
      duration: 250, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.flipContainer, y: -10,
      duration: 250, ease: 'Cubic.easeIn',
    });
    // Arms raise overhead before the leap
    this.scene.tweens.add({
      targets: [this.armLeftG, this.armRightG], rotation: -1.0,
      duration: 250, ease: 'Back.easeOut',
    });
  }

  // Leap landing — massive impact squish then elastic recovery
  _animLeapLanding() {
    const s = this.size;
    // Phase 1: slam squish (fast)
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.55, scaleY: 0.45,
      duration: 100, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: this.bodyS, scaleX: 1, scaleY: 1,
          duration: 420, ease: 'Elastic.easeOut',
        });
      },
    });
    this.scene.tweens.add({
      targets: [this.eyeLeftG, this.eyeRightG], scaleX: 1, scaleY: 0.30,
      duration: 100, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: [this.eyeLeftG, this.eyeRightG], scaleX: 1, scaleY: 1,
          duration: 420, ease: 'Elastic.easeOut',
        });
      },
    });
    this.scene.tweens.add({
      targets: this.lowerJawG, y: this._jawRestY + s * 0.15,
      duration: 100, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: this.lowerJawG, y: this._jawRestY,
          duration: 420, ease: 'Elastic.easeOut',
        });
      },
    });
    this.scene.tweens.add({
      targets: this.flipContainer, y: 10,
      duration: 100, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: this.flipContainer, y: 0,
          duration: 420, ease: 'Elastic.easeOut',
        });
      },
    });
    // Arms slam to ground on impact then elastic back
    this.scene.tweens.add({
      targets: [this.armLeftG, this.armRightG], rotation: 0.55,
      duration: 100, ease: 'Quad.easeIn',
      onComplete: () => {
        if (!this.alive) return;
        this.scene.tweens.add({
          targets: [this.armLeftG, this.armRightG], rotation: 0,
          duration: 420, ease: 'Elastic.easeOut',
        });
      },
    });
  }

  // Hurt flinch — solid colour flash + scale pop + arm twitch
  _animHurt() {
    if (!this.alive) return;
    this.hitFlashBodyS.setAlpha(0.80);
    this.scene.tweens.add({
      targets: this.hitFlashBodyS, alpha: 0,
      duration: 200, ease: 'Quad.easeOut',
    });
    this.scene.tweens.add({
      targets: this.bodyS, scaleX: 1.14, scaleY: 1.14,
      duration: 70, yoyo: true, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: this.flipContainer, x: Phaser.Math.Between(-5, 5),
      duration: 70, yoyo: true, ease: 'Sine.easeInOut',
    });
    // Arms twitch outward on flinch
    this.scene.tweens.add({
      targets: this.armLeftG, rotation: -0.20,
      duration: 70, yoyo: true, ease: 'Sine.easeInOut',
    });
    this.scene.tweens.add({
      targets: this.armRightG, rotation: 0.20,
      duration: 70, yoyo: true, ease: 'Sine.easeInOut',
    });
  }

  // Enrage burst — pulsing teal ring appears outside body
  _animEnrageBurst() {
    if (!this.alive) return;
    // Ring added to outer container so it doesn't squish with flipContainer
    this.enrageRingG = this.scene.add.graphics();
    this.enrageRingG.lineStyle(4, this.accentColor, 0.55);
    this.enrageRingG.strokeCircle(0, 0, this.size + 10);
    this.container.add(this.enrageRingG);
    this.scene.tweens.add({
      targets: this.enrageRingG, alpha: 0.20,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    this.scene.events.once('shutdown', () => {
      if (this.enrageRingG?.active) this.enrageRingG.destroy();
    });
  }

  // Death — stop idle tweens, spin-shrink, fade features, then explode
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
      targets: [this.eyeLeftG, this.eyeRightG, this.lowerJawG, this.armLeftG, this.armRightG],
      alpha: 0, duration: 360, ease: 'Quad.easeIn',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OVERRIDES
  // ─────────────────────────────────────────────────────────────────────────

  takeDamage(amount) {
    super.takeDamage(amount);
    if (!this.alive) return;
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
    if (this.enrageRingG) { this.enrageRingG.destroy(); this.enrageRingG = null; }
    if (this.shadowG) { this.shadowG.destroy(); this.shadowG = null; }

    this._animDeath(() => {
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
  // ATTACKS
  // ─────────────────────────────────────────────────────────────────────────

  _getAttackPool()    { return ['bigStomp', 'quakeLine']; }
  _getEnrageAttacks() { return ['tremorField', 'leapSlam']; }

  _runAttack(name) {
    switch (name) {
      case 'bigStomp':    this._attackBigStomp();    break;
      case 'quakeLine':   this._attackQuakeLine();   break;
      case 'tremorField': this._attackTremorField(); break;
      case 'leapSlam':    this._attackLeapSlam();    break;
      default:            this._endAttack();
    }
  }

  _attackBigStomp() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const radius = this.size * 2.53;

    if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) > radius) {
      this._state = 'idle';
      this._stateTimer = 300;
      return;
    }

    this._animStompWindup();
    this._drawTelegraphZone(this.x, this.y, radius, this._telegraphDuration, 0x00ff77);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      this._animStompImpact();
      this.scene.cameras.main.shake(250, 0.0042);

      this.scene.obstacles?.forEach(obs => {
        if (!obs.broken &&
            Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y) < radius + obs.baseRadius)
          obs.break();
      });

      const p = this.scene.player;
      if (p && p.alive && !p.invincible) {
        if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < radius + 16)
          p.takeDamage(this.damage);
      }

      // Radial ground cracks — 8 fissures radiating outward from stomp center
      const crackG = this.scene.add.graphics();
      crackG.setDepth(6);
      for (let i = 0; i < 8; i++) {
        const a   = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const len = radius * (0.72 + Math.random() * 0.32);
        const perp = a + Math.PI / 2;
        const pts = [{ x: this.x, y: this.y }];
        for (let s = 1; s <= 5; s++) {
          const t = s / 5;
          const jitter = (Math.random() - 0.5) * 18;
          pts.push({ x: this.x + Math.cos(a) * t * len + Math.cos(perp) * jitter,
                     y: this.y + Math.sin(a) * t * len + Math.sin(perp) * jitter });
        }
        [{ w: 16, al: 0.12, c: 0x00ff77 }, { w: 6, al: 0.42, c: 0x00ff77 }, { w: 2, al: 0.88, c: 0xaaffcc }]
          .forEach(({ w, al, c }) => {
            crackG.lineStyle(w, c, al);
            for (let k = 0; k < pts.length - 1; k++) crackG.lineBetween(pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y);
          });
        if (Math.random() < 0.55) {
          const bt = 0.45 + Math.random() * 0.3;
          const bx = this.x + Math.cos(a) * bt * len, by = this.y + Math.sin(a) * bt * len;
          const bAng = a + (Math.random() - 0.5) * 1.1;
          const bLen = len * 0.28;
          crackG.lineStyle(5, 0x00ff77, 0.28); crackG.lineBetween(bx, by, bx + Math.cos(bAng) * bLen, by + Math.sin(bAng) * bLen);
          crackG.lineStyle(1.5, 0xaaffcc, 0.62); crackG.lineBetween(bx, by, bx + Math.cos(bAng) * bLen, by + Math.sin(bAng) * bLen);
        }
      }
      this.scene.tweens.add({ targets: crackG, alpha: 0, duration: 350, delay: 950, onComplete: () => crackG.destroy() });
      this.scene.events.once('shutdown', () => { if (crackG.active) crackG.destroy(); });

      this._endAttack();
    });
  }

  _attackQuakeLine() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const angle = Phaser.Math.Angle.Between(this.x, this.y, p.x, p.y);
    const lineLen = 400;
    const halfWidth = 100;
    const sx = this.x, sy = this.y;
    const ex = sx + Math.cos(angle) * lineLen;
    const ey = sy + Math.sin(angle) * lineLen;

    // Honest rectangle telegraph — shows full 200px width
    this._drawTelegraphRect(sx, sy, ex, ey, halfWidth, this._telegraphDuration, 0x00ff77);

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;
      this.scene.cameras.main.shake(180, 0.0027);

      // Fissure crack visual — jagged main crack + branching fissures
      const g = this.scene.add.graphics();
      g.setDepth(6);

      const cos = Math.cos(angle), sin = Math.sin(angle);
      const px = Math.cos(angle + Math.PI / 2), py = Math.sin(angle + Math.PI / 2);

      // Main crack — 10-segment zigzag along the line
      const pts = [];
      const SEG = 10;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG;
        const jitter = (i === 0 || i === SEG) ? 0 : (Math.random() - 0.5) * 22;
        pts.push({ x: sx + cos * t * lineLen + px * jitter, y: sy + sin * t * lineLen + py * jitter });
      }

      [{ w: 24, a: 0.12, c: 0x00ff77 }, { w: 10, a: 0.45, c: 0x00ff77 }, { w: 2.5, a: 0.95, c: 0xaaffcc }]
        .forEach(({ w, a, c }) => {
          g.lineStyle(w, c, a);
          for (let i = 0; i < pts.length - 1; i++) g.lineBetween(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        });

      // Branch fissures — 8 cracks spreading sideways off the main line
      for (let b = 0; b < 8; b++) {
        const t  = (b + 0.5) / 8;
        const bx = sx + cos * t * lineLen;
        const by = sy + sin * t * lineLen;
        const side  = b % 2 === 0 ? 1 : -1;
        const bLen  = 30 + Math.random() * 55;
        const bAng  = angle + side * (0.35 + Math.random() * 0.55);
        const bex   = bx + Math.cos(bAng) * bLen;
        const bey   = by + Math.sin(bAng) * bLen;

        g.lineStyle(7, 0x00ff77, 0.28); g.lineBetween(bx, by, bex, bey);
        g.lineStyle(2, 0xaaffcc, 0.75); g.lineBetween(bx, by, bex, bey);

        if (Math.random() < 0.5) {
          const bLen2 = bLen * 0.5;
          const bAng2 = bAng + (Math.random() - 0.5) * 0.6;
          g.lineStyle(4, 0x00ff77, 0.18); g.lineBetween(bex, bey, bex + Math.cos(bAng2) * bLen2, bey + Math.sin(bAng2) * bLen2);
          g.lineStyle(1.5, 0xaaffcc, 0.55); g.lineBetween(bex, bey, bex + Math.cos(bAng2) * bLen2, bey + Math.sin(bAng2) * bLen2);
        }
      }

      this.scene.tweens.add({ targets: g, alpha: 0, duration: 350, delay: 950, onComplete: () => g.destroy() });
      this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });

      const dx = ex - sx, dy = ey - sy;
      const lenSq = dx * dx + dy * dy;

      this.scene.obstacles?.forEach(obs => {
        if (obs.broken) return;
        const t2 = lenSq > 0
          ? Math.max(0, Math.min(1, ((obs.x - sx) * dx + (obs.y - sy) * dy) / lenSq))
          : 0;
        if (Phaser.Math.Distance.Between(obs.x, obs.y, sx + t2 * dx, sy + t2 * dy) < obs.baseRadius + halfWidth)
          obs.break();
      });

      if (p.alive && !p.invincible) {
        const t = lenSq > 0
          ? Math.max(0, Math.min(1, ((p.x - sx) * dx + (p.y - sy) * dy) / lenSq))
          : 0;
        const nearX = sx + t * dx, nearY = sy + t * dy;
        if (Phaser.Math.Distance.Between(p.x, p.y, nearX, nearY) < halfWidth)
          p.takeDamage(this.damage * 0.9);
      }
      this._endAttack();
    });
  }

  _attackTremorField() {
    const arena = this.scene.arena;
    if (!arena) { this._endAttack(); return; }
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    const tdur = this._telegraphDuration * 1.4;
    const count = this.enraged ? 6 : 4;
    const zones = [];

    const SCATTER_MAX = 320;
    const SCATTER_MIN = 60;

    for (let i = 0; i < count; i++) {
      let zx = p.x, zy = p.y;
      for (let tries = 0; tries < 30; tries++) {
        const a = Math.random() * Math.PI * 2;
        const d = SCATTER_MIN + Math.random() * (SCATTER_MAX - SCATTER_MIN);
        const tx = p.x + Math.cos(a) * d;
        const ty = p.y + Math.sin(a) * d;
        if (arena.containsPoint(tx, ty, 60)) { zx = tx; zy = ty; break; }
      }
      const r = Phaser.Math.Between(55, 90);
      this._drawTelegraphZone(zx, zy, r, tdur, 0x00ff77);
      zones.push({ x: zx, y: zy, r });
    }

    this.scene.time.delayedCall(tdur, () => {
      if (!this.alive) return;
      this.scene.cameras.main.shake(300, 0.0036);
      const p = this.scene.player;
      zones.forEach(z => {
        this.scene.obstacles?.forEach(obs => {
          if (!obs.broken &&
              Phaser.Math.Distance.Between(obs.x, obs.y, z.x, z.y) < z.r + obs.baseRadius)
            obs.break();
        });

        if (p && p.alive && !p.invincible) {
          if (Phaser.Math.Distance.Between(p.x, p.y, z.x, z.y) < z.r + 16)
            p.takeDamage(this.damage * 0.7);
        }

        for (let ri = 0; ri < 3; ri++) {
          const ring = this.scene.add.graphics();
          ring.setDepth(7);
          this.scene.events.once('shutdown', () => { if (ring.active) ring.destroy(); });
          this.scene.time.delayedCall(ri * 120, () => {
            if (!this.alive && ring.active) { ring.destroy(); return; }
            this.scene.tweens.addCounter({
              from: 0, to: 1, duration: 380, ease: 'Quad.easeOut',
              onUpdate: (tw) => {
                const t = tw.getValue();
                ring.clear();
                ring.lineStyle(1.5 + t * 12.5, 0x00ff77, (1 - t) * 0.85);
                ring.strokeCircle(z.x, z.y, z.r * (0.15 + t * 0.85));
              },
              onComplete: () => { if (ring.active) ring.destroy(); },
            });
          });
        }
      });
      this._endAttack();
    });
  }

  _attackLeapSlam() {
    const p = this.scene.player;
    if (!p || !p.alive) { this._endAttack(); return; }

    this._drawTelegraphZone(p.x, p.y, 100, this._telegraphDuration, 0x00ff77);
    this._animLeapWindup();

    this.scene.time.delayedCall(this._telegraphDuration, () => {
      if (!this.alive) return;

      const startX = this.x, startY = this.y;
      const targetX = p.x, targetY = p.y;
      const ARC_HEIGHT = 200;

      this.scene.tweens.addCounter({
        from: 0, to: 1, duration: 420, ease: 'Sine.easeIn',
        onUpdate: (tw) => {
          const t = tw.getValue();
          this.x = startX + (targetX - startX) * t;
          this.y = startY + (targetY - startY) * t - ARC_HEIGHT * 4 * t * (1 - t);
          this.container.x = this.x;
          this.container.y = this.y;
        },
        onComplete: () => {
          const slamRadius = 120;
          this.scene.cameras.main.shake(350, 0.0054);
          this._animLeapLanding();

          this._spawnCrater(this.x, this.y, slamRadius);

          this.scene.obstacles?.forEach(obs => {
            if (!obs.broken &&
                Phaser.Math.Distance.Between(this.x, this.y, obs.x, obs.y) < slamRadius + obs.baseRadius)
              obs.break();
          });

          if (p.alive && !p.invincible) {
            if (Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y) < slamRadius)
              p.takeDamage(this.damage * 1.2);
          }

          this._endAttack();
        },
      });
    });
  }

  _spawnCrater(cx, cy, radius) {
    const g = this.scene.add.graphics();
    g.x = cx; g.y = cy;
    g.setDepth(6);
    g.setScale(0);

    g.fillStyle(0x0f0705, 0.95); g.fillCircle(0, 0, radius);
    g.fillStyle(0x1e100a, 0.75); g.fillCircle(0, 0, radius * 0.68);
    g.lineStyle(14, 0x5c3618, 1.0); g.strokeCircle(0, 0, radius);
    g.lineStyle(2.5, 0x8a5a30, 0.70); g.strokeCircle(0, 0, radius);
    g.lineStyle(5, 0x3d2010, 0.55); g.strokeCircle(0, 0, radius + 11);

    for (let i = 0; i < 7; i++) {
      const a  = (i / 7) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const r1 = radius * 0.30;
      const r2 = radius * (0.92 + Math.random() * 0.18);
      g.lineStyle(9, 0x2d1a0a, 0.45); g.lineBetween(Math.cos(a) * r1, Math.sin(a) * r1, Math.cos(a) * r2, Math.sin(a) * r2);
      g.lineStyle(2, 0x5c3d28, 0.80); g.lineBetween(Math.cos(a) * r1, Math.sin(a) * r1, Math.cos(a) * r2, Math.sin(a) * r2);
    }

    this.scene.tweens.add({ targets: g, scaleX: 1, scaleY: 0.82, duration: 90, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 400, delay: 900, onComplete: () => g.destroy() });

    for (let i = 0; i < 9; i++) {
      const a    = (i / 9) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const frag = this.scene.add.graphics();
      const isRock = i % 2 === 0;
      frag.fillStyle(isRock ? 0x5a5550 : 0x4a3018, 1);
      const sz = 4 + Math.random() * 9;
      frag.fillRect(-sz / 2, -sz / 2, sz, sz);
      frag.x = cx + Math.cos(a) * radius * 0.25;
      frag.y = cy + Math.sin(a) * radius * 0.25;
      frag.setDepth(7);
      const dist = radius * (0.6 + Math.random() * 0.8);
      this.scene.tweens.add({
        targets: frag,
        x: cx + Math.cos(a) * (radius + dist),
        y: cy + Math.sin(a) * (radius + dist),
        alpha: 0, angle: Phaser.Math.Between(-200, 200),
        duration: 380 + Math.random() * 180, ease: 'Quad.easeOut',
        onComplete: () => frag.destroy(),
      });
      this.scene.events.once('shutdown', () => { if (frag.active) frag.destroy(); });
    }

    this.scene.events.once('shutdown', () => { if (g.active) g.destroy(); });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE LOOP — movement only; no per-frame redraw
  // ─────────────────────────────────────────────────────────────────────────

  update(time, delta) {
    super.update(time, delta);
    if (!this.alive) return;

    const p = this.scene.player;
    if (p && p.alive && this._state === 'idle') {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, p.x, p.y);
      if (dist > 120) {
        this._moveToward(p.x, p.y, this.moveSpeed, delta / 1000);
        // Walk animation — bob body + swing arms alternately
        this._bobPhase += delta / 1000;
        const bob   = Math.sin(this._bobPhase * 5.5) * 5;
        const swing = Math.sin(this._bobPhase * 5.5) * 0.18;
        this.bodyS.y            =  bob;
        this.armLeftG.rotation  =  swing;
        this.armRightG.rotation = -swing;
      } else {
        // Standing still — snap body/arms back to neutral
        this.bodyS.y            = 0;
        this.armLeftG.rotation  = 0;
        this.armRightG.rotation = 0;
      }
    }
  }
}
