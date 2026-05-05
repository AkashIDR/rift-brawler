export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

// ── Arena world (camera-followed large world) ────────────────────────────────
export const ARENA = {
  MIN_WORLD_W: 2600, MAX_WORLD_W: 4400,
  MIN_WORLD_H: 2000, MAX_WORLD_H: 3400,
  PADDING: 70,           // wall inset from world/shape edge
  CAMERA_LERP: 0.1,      // camera follow smoothness
  MIN_CORRIDOR_W: 260,   // minimum corridor width (≥ 2× max boss size + buffer)
};

// ── Obstacle config ───────────────────────────────────────────────────────────
export const OBSTACLES = {
  DENSITY: 0.000011,      // sparse background obstacles per px² of arena floor area
  ROCK_RADIUS: 34,
  STUMP_RADIUS: 22,
  TREE_TRUNK_RADIUS: 24,
  TREE_CANOPY_RADIUS: 72,
  PILLAR_RADIUS: 20,
  CLEAR_RADIUS_SPAWN: 220,
  CLEAR_RADIUS_ALTAR: 200,
  MIN_OBSTACLE_GAP: 110,  // spacing between background obstacles

  // Cluster zones (forest/rocky terrain patches on large arenas)
  CLUSTER_MIN_LEVEL: 4,         // levels below this get no clusters
  CLUSTER_MIN_AREA: 3_000_000,  // px² — arenas smaller than this get no clusters
  CLUSTER_RADIUS_MIN: 160,
  CLUSTER_RADIUS_MAX: 270,
  CLUSTER_OBSTACLE_GAP: 52,     // tighter spacing inside a cluster
  CLUSTER_COUNT_MIN: 6,
  CLUSTER_COUNT_MAX: 14,
};

// Player base stats
export const PLAYER = {
  BASE_HP: 1000,
  BASE_SPEED: 280,
  BASE_DAMAGE: 120,
  BASIC_ATTACK_COOLDOWN: 350,    // ms
  BASIC_ATTACK_SPEED: 600,       // px/s
  DODGE_STAMINA_COST: 10,
  DODGE_COOLDOWN: 900,           // ms
  DODGE_IFRAME_DURATION: 350,    // ms
  DODGE_SPEED: 700,
  DODGE_DISTANCE: 160,
  STAMINA_MAX: 100,
  STAMINA_REGEN_RATE: 8,         // stamina per second (passive)
  STAMINA_REGEN_PER_HIT: 12,
  // Floating HP bar above player
  HP_BAR_WIDTH: 48,
  HP_BAR_HEIGHT: 6,
  HP_BAR_OFFSET_Y: -36,
};

// Skill base stats (default Knight class)
export const SKILLS = {
  Q: {
    name: 'Power Strike',
    staminaCost: 25,
    cooldown: 1200,
    damage: 400,
    projectileSpeed: 800,
    color: 0xffdd44
  },
  W: {
    name: 'Shield Dash',
    staminaCost: 35,
    cooldown: 2000,
    damage: 300,
    dashSpeed: 900,
    dashDistance: 240,
    iframeDuration: 450,
    color: 0x44aaff
  },
  E: {
    name: 'Ground Slam',
    staminaCost: 40,
    cooldown: 2500,
    damage: 550,
    radius: 140,
    color: 0xff6600
  }
};

// Progression scaling per level
export const SCALING = {
  HP_PER_LEVEL: 100,
  DAMAGE_MULTIPLIER_PER_LEVEL: 0.06,  // +6% per level
  BOSS_HP_PER_LEVEL: 250,
  BOSS_DAMAGE_PER_LEVEL: 30,
  BOSS_SPEED_PER_LEVEL: 4,
};

// Level theme palettes
export const THEMES = [
  // Levels 1-5: Green Fields
  { floor: 0x2d5a1b, wall: 0x5c3d1e, accent: 0x7ec850, bg: 0x1a3a0f },
  // Levels 6-10: Crystal Caves
  { floor: 0x1a2a4a, wall: 0x2244aa, accent: 0x44eeff, bg: 0x0d1a33 },
  // Levels 11-15: Volcanic Depths
  { floor: 0x3a1a0a, wall: 0x8b2200, accent: 0xff6600, bg: 0x200a00 },
  // Levels 16-20: Celestial Void
  { floor: 0x0a0a2a, wall: 0x222266, accent: 0xffd700, bg: 0x050515 },
  // Levels 21+: Chaos Realm
  { floor: 0x1a0a2a, wall: 0x660066, accent: 0xff00ff, bg: 0x0a0010 },
];

export function getTheme(level) {
  if (level <= 5) return THEMES[0];
  if (level <= 10) return THEMES[1];
  if (level <= 15) return THEMES[2];
  if (level <= 20) return THEMES[3];
  return THEMES[4];
}

// Colors
export const COLORS = {
  HP_FULL: 0xe74c3c,
  HP_LOW: 0xff0000,
  STAMINA: 0xf1c40f,
  BOSS_HP: 0xe74c3c,
  BOSS_HP_MID: 0xe67e22,
  BOSS_HP_LOW: 0xc0392b,
  PLAYER_BODY: 0x3a9ff5,
  PLAYER_HEAD: 0x5ab8ff,
  PLAYER_HELMET: 0x8fbdcc,
  PLAYER_SHIELD: 0xffd700,
  WHITE: 0xffffff,
  BLACK: 0x000000,
  PORTAL: 0xaa44ff,
  ALTAR: 0xffaa22,
};
