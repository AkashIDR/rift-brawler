import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { getSettings, saveSetting, resetSettings, displayKey, domKeyToCode } from '../config/settings.js';
import { S, stoneTextStyle, makeStoneTexture, FONT, LETTER_SPACING } from './StoneStyle.js';

const SLOT_LABELS = { skill1: 'Skill 1', skill2: 'Skill 2', skill3: 'Skill 3', dodge: 'Dodge', pause: 'Pause' };
const SLOT_ORDER  = ['skill1', 'skill2', 'skill3', 'dodge', 'pause'];
const PANEL_W     = 520;
const PANEL_R     = 18;

// Opens a settings overlay on `scene`. Pass `player` (Player instance) when called
// from an active game session so rebinds apply immediately. `onClose` fires when
// the overlay is dismissed.
export function openSettingsOverlay(scene, { player = null, onClose = null } = {}) {
  let listeningSlot = null;
  let keyListener   = null;

  const container = scene.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(500).setScale(1.08);

  // Full-screen backdrop — blocks clicks to scene below
  const backdrop = scene.add.graphics();
  backdrop.fillStyle(0x000000, 0.72);
  backdrop.fillRect(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
  backdrop.setInteractive(
    new Phaser.Geom.Rectangle(-GAME_WIDTH / 2, -GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT),
    Phaser.Geom.Rectangle.Contains
  );
  container.add(backdrop);

  function cancelListen() {
    if (keyListener) {
      scene.input.keyboard.off('keydown', keyListener);
      keyListener = null;
    }
    listeningSlot = null;
  }

  function close() {
    cancelListen();
    scene.tweens.add({
      targets: container, alpha: 0, duration: 160, ease: 'Quad.easeIn',
      onComplete: () => { container.destroy(true); if (onClose) onClose(); },
    });
  }

  function buildContent() {
    // Remove all children except backdrop (index 0)
    const toRemove = container.list.slice(1);
    toRemove.forEach(c => container.remove(c, true));

    const s   = getSettings();
    const ROW = 56;
    // panel height: title(80) + section label(28) + mode pills(52) + gap(20)
    //             + fps section label(28) + fps pills(52) + gap(20)
    //             + binding header(28) + 5 rows(ROW*5) + divider(24) + reset(52) + close(64)
    const h   = 80 + 28 + 52 + 20 + 28 + 52 + 20 + 28 + ROW * 5 + 24 + 52 + 64;

    // Stone panel — canvas-baked gradient texture; no-op on rebuild so only created once
    const panelTexKey = `stone-settings-panel-${PANEL_W}x${h}`;
    makeStoneTexture(scene, panelTexKey, { w: PANEL_W, h, shape: 'rounded', radius: PANEL_R, bevel: 12, seed: 30 });
    container.add(scene.add.image(0, 0, panelTexKey).setOrigin(0.5));

    // Title
    container.add(scene.add.text(0, -h / 2 + 44, 'SETTINGS',
      stoneTextStyle(40, '#e8e0ff')).setOrigin(0.5));

    // Carved groove divider
    const divider = scene.add.graphics();
    divider.lineStyle(1, S.CRACK, 0.60);
    divider.lineBetween(-PANEL_W / 2 + 30, -h / 2 + 76, PANEL_W / 2 - 30, -h / 2 + 76);
    divider.lineStyle(1, S.BEVEL_LIGHT, 0.30);
    divider.lineBetween(-PANEL_W / 2 + 30, -h / 2 + 77, PANEL_W / 2 - 30, -h / 2 + 77);
    container.add(divider);

    // ── Movement mode ──────────────────────────────────────────────────────
    let curY = -h / 2 + 100;

    container.add(scene.add.text(-PANEL_W / 2 + 26, curY, 'Movement Mode', {
      fontFamily: FONT, fontSize: '21px', letterSpacing: LETTER_SPACING, color: '#9090b8',
    }).setOrigin(0, 0.5));
    curY += 36;

    const modeOptions = [
      { id: 'rightclick', label: 'Right-Click to Move' },
      { id: 'wasd',       label: 'WASD to Move'        },
    ];
    const pillTotalW = 470, pillH = 40, pillR = 10;
    const pillW = (pillTotalW - 12) / 2;
    const pillStartX = -pillTotalW / 2;

    modeOptions.forEach(({ id, label }, idx) => {
      const isActive = s.movementMode === id;
      const px = pillStartX + idx * (pillW + 12);
      const pillTexKey = `stone-settings-pill-${Math.round(pillW)}x${pillH}`;
      makeStoneTexture(scene, pillTexKey, { w: pillW, h: pillH, shape: 'rounded', radius: pillR, bevel: 4, seed: 35 });
      const pillImg = scene.add.image(px + pillW / 2, curY, pillTexKey).setOrigin(0.5);
      const pillG = scene.add.graphics(); // active-state overlay only
      if (isActive) {
        pillG.fillStyle(S.BEVEL_LIGHT, 0.18);
        pillG.fillRoundedRect(px, curY - pillH / 2, pillW, pillH, pillR);
        pillG.lineStyle(2, S.BEVEL_LIGHT, 0.55);
        pillG.strokeRoundedRect(px + 4, curY - pillH / 2 + 4, pillW - 8, pillH - 8, pillR - 2);
      }
      const pillTxt = scene.add.text(px + pillW / 2, curY, label, {
        fontFamily: FONT, fontSize: '19px', letterSpacing: LETTER_SPACING,
        color: isActive ? S.TEXT : '#6868a0',
      }).setOrigin(0.5);
      const hit = scene.add.rectangle(px + pillW / 2, curY, pillW, pillH)
        .setInteractive({ cursor: 'pointer' });
      hit.on('pointerdown', () => {
        saveSetting('movementMode', id);
        if (player) player.applySettings();
        buildContent();
      });
      container.add([pillImg, pillG, pillTxt, hit]);
    });
    curY += pillH / 2 + 24;

    // ── Show FPS counter ───────────────────────────────────────────────────
    container.add(scene.add.text(-PANEL_W / 2 + 26, curY, 'Show FPS Counter', {
      fontFamily: FONT, fontSize: '21px', letterSpacing: LETTER_SPACING, color: '#9090b8',
    }).setOrigin(0, 0.5));
    curY += 36;

    const fpsOptions = [
      { id: false, label: 'Off' },
      { id: true,  label: 'On'  },
    ];
    const fpsPillTexKey = `stone-settings-pill-${Math.round(pillW)}x${pillH}`;
    makeStoneTexture(scene, fpsPillTexKey, { w: pillW, h: pillH, shape: 'rounded', radius: pillR, bevel: 4, seed: 35 });
    fpsOptions.forEach(({ id, label }, idx) => {
      const isActive = s.showFps === id;
      const px = pillStartX + idx * (pillW + 12);
      const pillImg = scene.add.image(px + pillW / 2, curY, fpsPillTexKey).setOrigin(0.5);
      const pillG = scene.add.graphics();
      if (isActive) {
        pillG.fillStyle(S.BEVEL_LIGHT, 0.18);
        pillG.fillRoundedRect(px, curY - pillH / 2, pillW, pillH, pillR);
        pillG.lineStyle(2, S.BEVEL_LIGHT, 0.55);
        pillG.strokeRoundedRect(px + 4, curY - pillH / 2 + 4, pillW - 8, pillH - 8, pillR - 2);
      }
      const pillTxt = scene.add.text(px + pillW / 2, curY, label, {
        fontFamily: FONT, fontSize: '19px', letterSpacing: LETTER_SPACING,
        color: isActive ? S.TEXT : '#6868a0',
      }).setOrigin(0.5);
      const hit = scene.add.rectangle(px + pillW / 2, curY, pillW, pillH)
        .setInteractive({ cursor: 'pointer' });
      hit.on('pointerdown', () => {
        saveSetting('showFps', id);
        if (scene.refreshFpsVisibility) scene.refreshFpsVisibility();
        buildContent();
      });
      container.add([pillImg, pillG, pillTxt, hit]);
    });
    curY += pillH / 2 + 24;

    // ── Key bindings ───────────────────────────────────────────────────────
    container.add(scene.add.text(-PANEL_W / 2 + 26, curY, 'Key Bindings  (click to rebind)', {
      fontFamily: FONT, fontSize: '21px', letterSpacing: LETTER_SPACING, color: '#9090b8',
    }).setOrigin(0, 0.5));
    curY += 28;

    SLOT_ORDER.forEach((slot, i) => {
      const isListening = listeningSlot === slot;
      const keyDisp     = isListening ? 'Press a key…' : displayKey(s.keys[slot]);
      const rowY        = curY + i * ROW + ROW / 2;

      // Alternating row tint using stone FACE color
      if (i % 2 === 0) {
        const rowBg = scene.add.graphics();
        rowBg.fillStyle(S.FACE, 0.40);
        rowBg.fillRoundedRect(-PANEL_W / 2 + 14, rowY - ROW / 2 + 4, PANEL_W - 28, ROW - 8, 4);
        container.add(rowBg);
      }

      // Slot label
      container.add(scene.add.text(-PANEL_W / 2 + 26, rowY, SLOT_LABELS[slot], {
        fontFamily: FONT, fontSize: '24px', letterSpacing: LETTER_SPACING, color: S.TEXT,
      }).setOrigin(0, 0.5));

      // Key badge — canvas-baked stone; listening state adds live overlay
      const badgeW = 140, badgeH = 36;
      const badgeX = PANEL_W / 2 - 30 - badgeW;
      makeStoneTexture(scene, 'stone-settings-badge', { w: badgeW, h: badgeH, shape: 'rounded', radius: 6, bevel: 4, seed: 40 });
      const badgeImg = scene.add.image(badgeX + badgeW / 2, rowY, 'stone-settings-badge').setOrigin(0.5);
      const badgeG = scene.add.graphics(); // listening-state overlay only
      if (isListening) {
        badgeG.fillStyle(S.BEVEL_LIGHT, 0.25);
        badgeG.fillRoundedRect(badgeX, rowY - badgeH / 2, badgeW, badgeH, 6);
      }
      container.add([badgeImg, badgeG]);

      container.add(scene.add.text(badgeX + badgeW / 2, rowY, keyDisp,
        stoneTextStyle(20, isListening ? '#e0e0ff' : S.TEXT)).setOrigin(0.5));

      // Clickable hit area
      const hit = scene.add.rectangle(badgeX + badgeW / 2, rowY, badgeW, badgeH)
        .setInteractive({ cursor: 'pointer' });
      hit.on('pointerdown', () => {
        cancelListen();
        listeningSlot = slot;
        buildContent();
        keyListener = (event) => {
          const code = domKeyToCode(event.key);
          if (code && code !== 'ESCAPE') {
            saveSetting('keys', { [slot]: code });
            if (player) player.applySettings();
            if (slot === 'pause' && scene.refreshPauseKey) scene.refreshPauseKey();
          }
          listeningSlot = null;
          keyListener   = null;
          buildContent();
        };
        scene.input.keyboard.once('keydown', keyListener);
      });
      container.add(hit);
    });

    curY += ROW * 5;

    // ── Divider — carved groove ────────────────────────────────────────────
    const divG = scene.add.graphics();
    divG.lineStyle(1, S.CRACK, 0.60);
    divG.lineBetween(-PANEL_W / 2 + 24, curY + 10, PANEL_W / 2 - 24, curY + 10);
    divG.lineStyle(1, S.BEVEL_LIGHT, 0.30);
    divG.lineBetween(-PANEL_W / 2 + 24, curY + 11, PANEL_W / 2 - 24, curY + 11);
    container.add(divG);
    curY += 32;

    // ── Reset to defaults — stone button with red face tint ───────────────
    makeStoneTexture(scene, 'stone-settings-reset', { w: 180, h: 36, shape: 'rounded', radius: 8, bevel: 4, seed: 45 });
    const resetBg = scene.add.image(0, curY, 'stone-settings-reset').setOrigin(0.5);
    const resetTint = scene.add.graphics();
    resetTint.fillStyle(0x3a1515, 0.55);
    resetTint.fillRoundedRect(-90 + 4, curY - 18 + 4, 172, 28, 4);
    container.add([resetBg, resetTint]);
    const resetHoverG = scene.add.graphics();
    resetHoverG.fillStyle(S.BEVEL_LIGHT, 0.12);
    resetHoverG.fillRoundedRect(-90, curY - 18, 180, 36, 8);
    resetHoverG.setAlpha(0);
    container.add(resetHoverG);
    container.add(scene.add.text(0, curY, 'Reset to Defaults',
      stoneTextStyle(19, '#ff8888')).setOrigin(0.5));
    const resetHit = scene.add.rectangle(0, curY, 180, 36).setInteractive({ cursor: 'pointer' });
    resetHit.on('pointerover',  () => scene.tweens.add({ targets: resetHoverG, alpha: 1, duration: 100 }));
    resetHit.on('pointerout',   () => scene.tweens.add({ targets: resetHoverG, alpha: 0, duration: 100 }));
    resetHit.on('pointerdown', () => {
      resetSettings();
      if (player) player.applySettings();
      cancelListen();
      buildContent();
    });
    container.add(resetHit);
    curY += 36 + 16;

    // ── Close button ───────────────────────────────────────────────────────
    makeStoneTexture(scene, 'stone-settings-close', { w: 150, h: 44, shape: 'rounded', radius: 10, bevel: 5, seed: 50 });
    const closeBg = scene.add.image(0, curY, 'stone-settings-close').setOrigin(0.5);
    const closeHoverG = scene.add.graphics();
    closeHoverG.fillStyle(S.BEVEL_LIGHT, 0.14);
    closeHoverG.fillRoundedRect(-75, curY - 22, 150, 44, 10);
    closeHoverG.setAlpha(0);
    container.add(closeBg);
    container.add(closeHoverG);
    container.add(scene.add.text(0, curY, 'CLOSE', stoneTextStyle(28)).setOrigin(0.5));
    const closeHit = scene.add.rectangle(0, curY, 150, 44).setInteractive({ cursor: 'pointer' });
    closeHit.on('pointerover',  () => scene.tweens.add({ targets: closeHoverG, alpha: 1, duration: 100 }));
    closeHit.on('pointerout',   () => scene.tweens.add({ targets: closeHoverG, alpha: 0, duration: 100 }));
    closeHit.on('pointerdown', close);
    container.add(closeHit);
  }

  buildContent();
  container.setAlpha(0);
  scene.tweens.add({ targets: container, alpha: 1, duration: 200, ease: 'Quad.easeOut' });

  // Clean up if the scene shuts down while overlay is open
  scene.events.once('shutdown', () => { cancelListen(); container.destroy(true); });

  return container;
}
