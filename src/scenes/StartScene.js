import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from '../config/gameConfig.js';

const CX = GAME_WIDTH / 2;
const CY = GAME_HEIGHT / 2;

export default class StartScene extends Phaser.Scene {
  constructor() {
    super({ key: 'StartScene' });
    this.settingsOpen  = false;
    this.controlsOpen  = false;
  }

  create() {
    this.cameras.main.setBackgroundColor('#06060f');
    this._drawBackground();
    this._drawRiftCore();
    this._drawTitle();
    this._drawButtons();
    this._drawParticles();

    // Fade in
    this.cameras.main.fadeIn(600, 0, 0, 0);
  }

  // ─── Background ──────────────────────────────────────────────────────────────

  _drawBackground() {
    // Fine grid — slightly larger cell to suit 1080p
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x12122a, 1);
    for (let x = 0; x <= GAME_WIDTH;  x += 80) grid.lineBetween(x, 0, x, GAME_HEIGHT);
    for (let y = 0; y <= GAME_HEIGHT; y += 80) grid.lineBetween(0, y, GAME_WIDTH, y);

    // Radial vignette — darkens toward edges, bright at center
    const vig = this.add.graphics();
    const steps = 8;
    for (let i = steps; i >= 0; i--) {
      const t     = i / steps;
      const r     = GAME_WIDTH * 0.72 * t;
      const alpha = 0.045 * (1 - t);
      vig.fillStyle(0x2200aa, alpha);
      vig.fillEllipse(CX, CY, r * 2, r * 1.2);
    }

    // Scattered dimensional shards — thin glowing rectangles at random angles
    const shardColors = [0x4422cc, 0x8833ff, 0xff4400, 0xffaa00, 0x2266ff];
    for (let i = 0; i < 22; i++) {
      const g   = this.add.graphics();
      const col = shardColors[i % shardColors.length];
      const x   = Phaser.Math.Between(40, GAME_WIDTH  - 40);
      const y   = Phaser.Math.Between(40, GAME_HEIGHT - 40);
      const len = Phaser.Math.Between(30, 100);
      const w2  = Phaser.Math.Between(1, 3);
      g.fillStyle(col, Phaser.Math.FloatBetween(0.06, 0.18));
      g.fillRect(-len / 2, -w2, len, w2 * 2);
      g.x = x; g.y = y;
      g.angle = Phaser.Math.Between(-60, 60);

      // Gentle float tween
      this.tweens.add({
        targets: g,
        alpha: { from: g.alpha * 0.3, to: g.alpha },
        angle: g.angle + Phaser.Math.Between(-8, 8),
        duration: Phaser.Math.Between(2800, 5500),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 2500),
      });
    }

    // Rift crack lines radiating from center
    const cracks = this.add.graphics();
    const crackAngles = [0.15, 0.6, 1.2, 1.9, 2.7, 3.5, 4.1, 4.8, 5.5];
    crackAngles.forEach(a => {
      const len = Phaser.Math.Between(180, 420);
      cracks.lineStyle(Phaser.Math.Between(1, 2), 0x6622dd, Phaser.Math.FloatBetween(0.08, 0.22));
      cracks.lineBetween(
        CX, CY,
        CX + Math.cos(a) * len,
        CY + Math.sin(a) * len
      );
    });
  }

  // ─── Rift portal orb behind the title ────────────────────────────────────────

  _drawRiftCore() {
    const riftY = CY - 120;
    // Reference ellipse radii used by all sub-effects
    const ERX = 280, ERY = 90;

    // ── Layered concentric ellipses ─────────────────────────────────────────────
    const riftG = this.add.graphics();
    [
      { rx: 620, ry: 200, col: 0x110022, a: 1    },
      { rx: 500, ry: 160, col: 0x1a0033, a: 0.9  },
      { rx: 380, ry: 120, col: 0x220044, a: 0.8  },
      { rx: 260, ry:  80, col: 0x3300aa, a: 0.55 },
      { rx: 160, ry:  50, col: 0x5522cc, a: 0.4  },
      { rx:  80, ry:  26, col: 0x9944ff, a: 0.3  },
    ].forEach(({ rx, ry, col, a }) => {
      riftG.fillStyle(col, a);
      riftG.fillEllipse(CX, riftY, rx * 2, ry * 2);
    });


    // ── A — Rotating rune ring ──────────────────────────────────────────────────
    // 10 small rune glyphs placed on an ellipse slightly outside the rift rim.
    // Their (x,y) position is recalculated every frame as a shared angle offset
    // advances, giving smooth elliptical orbit.
    const RUNE_COUNT = 10;
    const RUNE_RX = ERX + 40, RUNE_RY = ERY + 14;
    const runeGraphics = [];

    for (let i = 0; i < RUNE_COUNT; i++) {
      const g = this.add.graphics();
      const shapes = ['diamond', 'cross', 'tri'][i % 3];

      if (shapes === 'diamond') {
        g.fillStyle(0xcc88ff, 1);
        g.fillTriangle(0, -7,  7, 0,  0, 7);
        g.fillTriangle(0, -7, -7, 0,  0, 7);
      } else if (shapes === 'cross') {
        g.fillStyle(0xff9944, 1);
        g.fillRect(-5, -2, 10, 4);
        g.fillRect(-2, -5, 4, 10);
      } else {
        g.fillStyle(0x88ccff, 1);
        g.fillTriangle(0, -7, 6, 5, -6, 5);
      }

      g.setAlpha(0.55);
      runeGraphics.push({ g, baseAngle: (i / RUNE_COUNT) * Math.PI * 2 });
    }

    let runeOffset = 0;
    const runeUpdate = (_time, delta) => {
      runeOffset += delta * 0.00028; // ~1 full orbit per 22s
      runeGraphics.forEach(({ g, baseAngle }) => {
        const a = baseAngle + runeOffset;
        g.x = CX    + Math.cos(a) * RUNE_RX;
        g.y = riftY + Math.sin(a) * RUNE_RY;
        g.angle = Phaser.Math.RadToDeg(a);
        // Brighten as each rune crosses the "top" of the orbit
        g.alpha = 0.3 + 0.5 * ((Math.sin(a - Math.PI / 2) + 1) * 0.5);
      });
    };
    this.events.on('update', runeUpdate);
    this.events.once('shutdown', () => this.events.off('update', runeUpdate));

    // ── C — Orbiting ember sparks ───────────────────────────────────────────────
    // 14 small coloured sparks orbit at varying radii, speeds, and directions.
    // Alpha rises when a spark is "near" the viewer (bottom of orbit) and dims
    // when it passes behind (top), giving a sense of depth.
    const SPARK_COLS  = [0xaa44ff, 0xff6600, 0xffcc00, 0x44aaff, 0xff4488, 0x44ffaa];
    const sparkDefs   = Array.from({ length: 14 }, (_, i) => {
      const rx  = Phaser.Math.Between(140, ERX + 60);
      const ry  = Math.round(rx * (ERY / ERX) * Phaser.Math.FloatBetween(0.85, 1.15));
      return {
        g:     this.add.graphics(),
        rx, ry,
        speed: Phaser.Math.FloatBetween(0.35, 1.0) * (i % 2 === 0 ? 1 : -1),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        sz:    Phaser.Math.FloatBetween(2, 5),
        col:   SPARK_COLS[i % SPARK_COLS.length],
      };
    });

    // Draw each spark shape once (they move, not redraw)
    sparkDefs.forEach(s => {
      s.g.fillStyle(s.col, 1);
      s.g.fillCircle(0, 0, s.sz);
      // Tiny glow ring
      s.g.lineStyle(1, s.col, 0.4);
      s.g.strokeCircle(0, 0, s.sz + 2);
    });

    const sparkUpdate = (time) => {
      sparkDefs.forEach(s => {
        const a = s.phase + time * 0.001 * s.speed;
        s.g.x = CX    + Math.cos(a) * s.rx;
        s.g.y = riftY + Math.sin(a) * s.ry;
        // Depth cue: brighter at bottom (sin=+1), dimmer at top (sin=-1)
        s.g.alpha = 0.25 + 0.75 * ((Math.sin(a) + 1) * 0.5);
      });
    };
    this.events.on('update', sparkUpdate);
    this.events.once('shutdown', () => this.events.off('update', sparkUpdate));

    // ── E — Breathing edge shimmers ─────────────────────────────────────────────
    // Multiple arc segments sweeping around the rift rim at different speeds,
    // radii, and directions — like charged particles looping the portal.
    const shimmerG = this.add.graphics();
    shimmerG.setDepth(2);
    const SHIMMER_RX = ERX + 8, SHIMMER_RY = ERY + 3;
    const STEPS = 20;

    // Each entry: { speed, dir, offset, arcLen, rx, ry, col, width, bright }
    const shimDefs = [
      // Clockwise
      { speed: 0.00095, dir:  1, offset: 0,              arcLen: 0.45, rx: SHIMMER_RX,      ry: SHIMMER_RY,      col: 0xeeccff, width: 3,   bright: 1.0  },
      { speed: 0.00065, dir:  1, offset: Math.PI * 0.7,  arcLen: 0.30, rx: SHIMMER_RX + 6,  ry: SHIMMER_RY + 2,  col: 0xff99ff, width: 2,   bright: 0.7  },
      { speed: 0.00130, dir:  1, offset: Math.PI * 1.4,  arcLen: 0.20, rx: SHIMMER_RX - 4,  ry: SHIMMER_RY - 1,  col: 0xffffff, width: 1.5, bright: 0.55 },
      // Counter-clockwise
      { speed: 0.00080, dir: -1, offset: Math.PI + 0.8,  arcLen: 0.40, rx: SHIMMER_RX,      ry: SHIMMER_RY,      col: 0xaa66ff, width: 2,   bright: 0.5  },
      { speed: 0.00110, dir: -1, offset: Math.PI * 0.3,  arcLen: 0.25, rx: SHIMMER_RX + 4,  ry: SHIMMER_RY + 1,  col: 0xff6644, width: 1.5, bright: 0.45 },
      { speed: 0.00055, dir: -1, offset: Math.PI * 1.7,  arcLen: 0.35, rx: SHIMMER_RX - 6,  ry: SHIMMER_RY - 2,  col: 0xcc88ff, width: 1,   bright: 0.35 },
    ];

    const shimAngles = new Array(shimDefs.length).fill(0);

    const shimmerUpdate = (_time, delta) => {
      shimmerG.clear();
      shimDefs.forEach((s, i) => {
        shimAngles[i] += delta * s.speed * s.dir;
        const base = shimAngles[i] + s.offset;

        let px = CX    + Math.cos(base) * s.rx;
        let py = riftY + Math.sin(base) * s.ry;

        for (let step = 1; step <= STEPS; step++) {
          const t  = step / STEPS;
          const a  = base + t * s.arcLen * s.dir;
          const nx = CX    + Math.cos(a) * s.rx;
          const ny = riftY + Math.sin(a) * s.ry;
          const alpha = Math.sin(t * Math.PI) * s.bright;
          shimmerG.lineStyle(s.width, s.col, alpha);
          shimmerG.lineBetween(px, py, nx, ny);
          px = nx; py = ny;
        }
      });
    };
    this.events.on('update', shimmerUpdate);
    this.events.once('shutdown', () => this.events.off('update', shimmerUpdate));
  }

  // ─── Title ───────────────────────────────────────────────────────────────────

  _drawTitle() {
    const titleY    = CY - 155;
    const subtitleY = CY - 52;

    // ── Glow layers (largest → smallest, purple → orange core) ─────────────────
    const glowConfigs = [
      { scale: 1.10, color: '#5500ff', alpha: 0.12 },
      { scale: 1.07, color: '#8800ff', alpha: 0.18 },
      { scale: 1.04, color: '#cc44ff', alpha: 0.28 },
      { scale: 1.02, color: '#ff8800', alpha: 0.18 },
    ];

    const glowLayers = glowConfigs.map(({ scale, color, alpha }) => {
      const t = this.add.text(CX, titleY, 'RIFT BRAWLER', {
        fontFamily: "'Fredoka One', sans-serif",
        fontSize: '148px',
        color,
        stroke: color,
        strokeThickness: 20,
      }).setOrigin(0.5).setAlpha(alpha).setScale(scale);
      return t;
    });

    // ── Drop shadow ─────────────────────────────────────────────────────────────
    this.add.text(CX + 6, titleY + 8, 'RIFT BRAWLER', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '148px',
      color: '#110022',
    }).setOrigin(0.5).setAlpha(0.8);

    // ── Main title ──────────────────────────────────────────────────────────────
    const title = this.add.text(CX, titleY, 'RIFT BRAWLER', {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '148px',
      color: '#ffffff',
      stroke: '#cc44ff',
      strokeThickness: 8,
    }).setOrigin(0.5);

    // ── Pulsing glow animation — all layers pulse together ──────────────────────
    this.tweens.add({
      targets: glowLayers,
      alpha: (target, _key, _value, _i, _total, tween) => {
        const baseAlpha = glowConfigs[glowLayers.indexOf(target)]?.alpha ?? 0.15;
        return { from: baseAlpha * 0.4, to: baseAlpha };
      },
      scaleX: (target) => {
        const base = glowConfigs[glowLayers.indexOf(target)]?.scale ?? 1;
        return { from: base * 0.98, to: base * 1.02 };
      },
      scaleY: (target) => {
        const base = glowConfigs[glowLayers.indexOf(target)]?.scale ?? 1;
        return { from: base * 0.97, to: base * 1.03 };
      },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // Subtle breathe on the main title
    this.tweens.add({
      targets: title,
      scaleX: 1.015, scaleY: 1.015,
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ── Subtitle ────────────────────────────────────────────────────────────────
    const sub = this.add.text(CX, subtitleY, 'Summon. Slay. Survive.', {
      fontFamily: "'Nunito', sans-serif",
      fontSize: '34px',
      color: '#ccaaff',
      fontStyle: 'italic',
      stroke: '#33004d',
      strokeThickness: 3,
    }).setOrigin(0.5).setAlpha(0);

    // Fade subtitle in after a short delay
    this.tweens.add({ targets: sub, alpha: 1, duration: 900, delay: 400, ease: 'Quad.easeOut' });

    // Gentle subtitle pulse
    this.tweens.add({
      targets: sub, alpha: { from: 0.65, to: 1 },
      duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: 1400,
    });
  }

  // ─── Buttons ─────────────────────────────────────────────────────────────────

  _drawButtons() {
    const startY = CY + 100;
    const gap    = 90;

    this._makeButton(CX, startY,           'START',    0xaa44ff, 0xffffff, () => this._startGame());
    this._makeButton(CX, startY + gap,     'CONTROLS', 0x1e1e44, 0xccaaff, () => this._showControls());
    this._makeButton(CX, startY + gap * 2, 'SETTINGS', 0x1e1e44, 0xccaaff, () => this._showSettings());
  }

  _makeButton(x, y, label, bgColor, textColor, onClick) {
    const w = 360, h = 66, r = 16;
    const container = this.add.container(x, y);

    // Drop shadow
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.5);
    shadow.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w, h, r);

    const bg = this.add.graphics();
    bg.fillStyle(bgColor, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    // Shine strip
    bg.fillStyle(0xffffff, 0.09);
    bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h / 2 - 2, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });
    // Border
    bg.lineStyle(1.5, 0xffffff, 0.18);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);

    // Glow border for primary button
    if (bgColor === 0xaa44ff) {
      bg.lineStyle(3, 0xdd88ff, 0.5);
      bg.strokeRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, r + 1);
    }

    const hoverG = this.add.graphics();
    hoverG.fillStyle(0xffffff, 0.14);
    hoverG.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    hoverG.setAlpha(0);

    const text = this.add.text(0, 1, label, {
      fontFamily: "'Fredoka One', sans-serif",
      fontSize: '34px',
      color: Phaser.Display.Color.IntegerToColor(textColor).rgba,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5);

    container.add([shadow, bg, hoverG, text]);
    container.setSize(w, h);
    container.setInteractive({ cursor: 'pointer' });
    container.setAlpha(0);

    // Staggered fade-in
    const idx = ['START', 'CONTROLS', 'SETTINGS'].indexOf(label);
    this.tweens.add({ targets: container, alpha: 1, duration: 500, delay: 600 + idx * 120, ease: 'Quad.easeOut' });

    container.on('pointerover', () => {
      this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 110, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: hoverG, alpha: 1, duration: 110 });
    });
    container.on('pointerout', () => {
      this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 110, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: hoverG, alpha: 0, duration: 110 });
    });
    container.on('pointerdown', onClick);

    return container;
  }

  // ─── Particles ───────────────────────────────────────────────────────────────

  _drawParticles() {
    const cols = [0x9933ff, 0xcc44ff, 0xff6600, 0xffaa00, 0x4455ff, 0x22ddff];

    // Rising embers / energy sparks
    for (let i = 0; i < 40; i++) {
      const g   = this.add.graphics();
      const col = cols[i % cols.length];
      const sz  = Phaser.Math.FloatBetween(1.5, 4.5);
      g.fillStyle(col, 0.7);
      g.fillCircle(0, 0, sz);
      g.x = Phaser.Math.Between(0, GAME_WIDTH);
      g.y = Phaser.Math.Between(0, GAME_HEIGHT);

      const dur   = Phaser.Math.Between(3000, 7000);
      const riseY = Phaser.Math.Between(120, 320);

      this.tweens.add({
        targets: g,
        y: g.y - riseY,
        alpha: { from: 0.7, to: 0 },
        duration: dur,
        delay: Phaser.Math.Between(0, 4000),
        repeat: -1,
        ease: 'Quad.easeIn',
        onRepeat: () => {
          g.x = Phaser.Math.Between(0, GAME_WIDTH);
          g.y = GAME_HEIGHT + 20;
          g.alpha = 0.7;
        },
      });
    }

    // Large slow-drifting glowing orbs in the far background
    for (let i = 0; i < 6; i++) {
      const orb = this.add.graphics();
      const col = [0x330066, 0x220044, 0x440011, 0x002244][i % 4];
      const r   = Phaser.Math.Between(60, 130);
      orb.fillStyle(col, 0.25);
      orb.fillCircle(0, 0, r);
      orb.x = Phaser.Math.Between(100, GAME_WIDTH  - 100);
      orb.y = Phaser.Math.Between(100, GAME_HEIGHT - 100);
      orb.setDepth(-1);

      this.tweens.add({
        targets: orb,
        x: orb.x + Phaser.Math.Between(-180, 180),
        y: orb.y + Phaser.Math.Between(-120, 120),
        alpha: { from: 0.1, to: 0.35 },
        duration: Phaser.Math.Between(6000, 12000),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 5000),
      });
    }
  }

  // ─── Game start ──────────────────────────────────────────────────────────────

  _startGame() {
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('ArenaScene', { level: 1, score: 0, playerHp: null });
    });
  }

  // ─── Overlays ────────────────────────────────────────────────────────────────

  _showControls() {
    if (this.controlsOpen) return;
    this.controlsOpen = true;
    this._openOverlay('CONTROLS', [
      ['Right-click',       'Move to position'],
      ['Right-click + Hold','Continuous movement'],
      ['Left-click',        'Basic attack'],
      ['Altar',             'Walk up or attack to summon'],
      ['Portal',            'Walk into to advance'],
      ['Spacebar',          'Dodge (i-frames)'],
      ['Q',                 'Skill 1 — Power Strike'],
      ['W',                 'Skill 2 — Shield Dash'],
      ['E',                 'Skill 3 — Ground Slam'],
      ['ESC',               'Pause / Unpause'],
    ], () => { this.controlsOpen = false; });
  }

  _showSettings() {
    if (this.settingsOpen) return;
    this.settingsOpen = true;
    this._openOverlay('SETTINGS', [
      ['Master Volume', '— coming soon —'],
      ['Music Volume',  '— coming soon —'],
      ['SFX Volume',    '— coming soon —'],
    ], () => { this.settingsOpen = false; });
  }

  _openOverlay(title, rows, onClose) {
    const rowSpacing = 42;
    const w = 680, r = 20;
    const h = 100 + rows.length * rowSpacing + 80;
    const container = this.add.container(CX, CY);

    // Backdrop blur panel
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x000000, 0.55);
    backdrop.fillRect(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);

    const bg = this.add.graphics();
    bg.fillStyle(0x0d0d1e, 0.97);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(2, 0xaa44ff, 0.85);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    bg.lineStyle(1, 0xdd88ff, 0.12);
    bg.strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, r - 1);
    // Shine strip
    bg.fillStyle(0xffffff, 0.03);
    bg.fillRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, 18, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });

    const titleText = this.add.text(0, -h / 2 + 42, title, {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '36px', color: '#ccaaff',
      stroke: '#33004d', strokeThickness: 4,
    }).setOrigin(0.5);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xaa44ff, 0.35);
    divider.lineBetween(-w / 2 + 30, -h / 2 + 72, w / 2 - 30, -h / 2 + 72);

    container.add([backdrop, bg, titleText, divider]);

    rows.forEach(([key, val], i) => {
      const y = -h / 2 + 100 + i * rowSpacing;
      if (i % 2 === 0) {
        const rowBg = this.add.graphics();
        rowBg.fillStyle(0xffffff, 0.03);
        rowBg.fillRoundedRect(-w / 2 + 16, y - rowSpacing / 2 + 3, w - 32, rowSpacing - 6, 4);
        container.add(rowBg);
      }
      container.add(this.add.text(-w / 2 + 30, y, key, {
        fontFamily: "'Nunito', sans-serif", fontSize: '22px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0, 0.5));
      container.add(this.add.text(w / 2 - 30, y, val, {
        fontFamily: "'Nunito', sans-serif", fontSize: '22px', color: '#aa88ff',
      }).setOrigin(1, 0.5));
    });

    // Close button
    const closeBg = this.add.graphics();
    closeBg.fillStyle(0xaa44ff, 1);
    closeBg.fillRoundedRect(-70, -24, 140, 48, 12);
    closeBg.lineStyle(1.5, 0xdd88ff, 0.5);
    closeBg.strokeRoundedRect(-70, -24, 140, 48, 12);
    const closeText = this.add.text(0, 0, 'CLOSE', {
      fontFamily: "'Fredoka One', sans-serif", fontSize: '26px', color: '#ffffff',
    }).setOrigin(0.5);

    const closeBtn = this.add.container(0, h / 2 - 42, [closeBg, closeText]);
    closeBtn.setSize(140, 48);
    closeBtn.setInteractive({ cursor: 'pointer' });
    closeBtn.on('pointerover', () => {
      closeBg.clear();
      closeBg.fillStyle(0xcc66ff, 1);
      closeBg.fillRoundedRect(-70, -24, 140, 48, 12);
    });
    closeBtn.on('pointerout', () => {
      closeBg.clear();
      closeBg.fillStyle(0xaa44ff, 1);
      closeBg.fillRoundedRect(-70, -24, 140, 48, 12);
    });
    closeBtn.on('pointerdown', () => { container.destroy(true); onClose(); });
    container.add(closeBtn);

    container.setDepth(100).setAlpha(0);
    this.tweens.add({ targets: container, alpha: 1, duration: 220, ease: 'Quad.easeOut' });
  }
}
