const STORAGE_KEY = 'riftbrawler-settings';

export const DEFAULTS = {
  movementMode: 'rightclick', // 'rightclick' | 'wasd'
  showFps: false,
  keys: {
    skill1: 'ONE',
    skill2: 'TWO',
    skill3: 'THREE',
    dodge:  'SPACE',
    pause:  'P',
  },
  uiLayout: {
    resource: { x: 0, y: 0, scale: 1 },
    skillBar: { x: 0, y: 0, scale: 1 },
    score:    { x: 0, y: 0, scale: 1 },
    bossBar:  { x: 0, y: 0, scale: 1 },
    fps:      { x: 0, y: 0, scale: 1 },
  },
};

export function getSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const dl = DEFAULTS.uiLayout;
    const sl = stored.uiLayout || {};
    return {
      ...DEFAULTS,
      ...stored,
      keys: { ...DEFAULTS.keys, ...(stored.keys || {}) },
      uiLayout: {
        resource: { ...dl.resource, ...(sl.resource || {}) },
        skillBar: { ...dl.skillBar, ...(sl.skillBar || {}) },
        score:    { ...dl.score,    ...(sl.score    || {}) },
        bossBar:  { ...dl.bossBar,  ...(sl.bossBar  || {}) },
        fps:      { ...dl.fps,      ...(sl.fps      || {}) },
      },
    };
  } catch {
    return {
      movementMode: DEFAULTS.movementMode,
      showFps: DEFAULTS.showFps,
      keys: { ...DEFAULTS.keys },
      uiLayout: {
        resource: { ...DEFAULTS.uiLayout.resource },
        skillBar: { ...DEFAULTS.uiLayout.skillBar },
        score:    { ...DEFAULTS.uiLayout.score    },
        bossBar:  { ...DEFAULTS.uiLayout.bossBar  },
        fps:      { ...DEFAULTS.uiLayout.fps      },
      },
    };
  }
}

export function saveSetting(key, val) {
  try {
    const s = getSettings();
    if (key === 'keys' || key === 'uiLayout') {
      s[key] = { ...s[key], ...val };
    } else {
      s[key] = val;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

export function resetSettings() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ─── Key display helpers ────────────────────────────────────────────────────

const DISPLAY = {
  ONE: '1', TWO: '2', THREE: '3', FOUR: '4', FIVE: '5',
  SIX: '6', SEVEN: '7', EIGHT: '8', NINE: '9', ZERO: '0',
  SPACE: 'Space', SHIFT: 'Shift', CTRL: 'Ctrl', ALT: 'Alt', TAB: 'Tab',
  ENTER: 'Enter', BACKSPACE: 'Back',
  UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→',
};

export function displayKey(code) {
  return DISPLAY[code] ?? code;
}

const NUM_TO_CODE = {
  '0': 'ZERO', '1': 'ONE', '2': 'TWO', '3': 'THREE', '4': 'FOUR',
  '5': 'FIVE', '6': 'SIX', '7': 'SEVEN', '8': 'EIGHT', '9': 'NINE',
};

// Converts a native DOM KeyboardEvent.key string to a Phaser keydown event suffix.
// Returns null for unsupported/modifier keys.
export function domKeyToCode(key) {
  if (key === ' ')          return 'SPACE';
  if (key === 'Shift')      return 'SHIFT';
  if (key === 'Control')    return 'CTRL';
  if (key === 'Alt')        return 'ALT';
  if (key === 'Tab')        return 'TAB';
  if (key === 'Enter')      return 'ENTER';
  if (key === 'Backspace')  return 'BACKSPACE';
  if (key === 'ArrowUp')    return 'UP';
  if (key === 'ArrowDown')  return 'DOWN';
  if (key === 'ArrowLeft')  return 'LEFT';
  if (key === 'ArrowRight') return 'RIGHT';
  if (NUM_TO_CODE[key])     return NUM_TO_CODE[key];
  if (key.length === 1)     return key.toUpperCase();
  return null;
}
