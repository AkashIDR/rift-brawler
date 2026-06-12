export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

// ── Arena world (camera-followed large world) ────────────────────────────────
// Worlds are procedurally-generated organic polygons (one per arena). The
// MIN/MAX world dimensions are kept as soft references — the actual size
// derives from each arena's polygon bounds in ArenaGenerator.
export const ARENA = {
  MIN_WORLD_W: 2600, MAX_WORLD_W: 4400,
  MIN_WORLD_H: 2000, MAX_WORLD_H: 3400,
  PADDING: 70,           // default wall inset, used when callers omit `r` to containsPoint
  CAMERA_LERP: 0.1,      // camera follow smoothness
  CAMERA_ZOOM: 1.5,      // default zoom level (1 = no zoom, higher = closer in)
  WALL_HEIGHT: 60,       // px — vertical lift of wall top on north-facing edges
  WALL_THICKNESS: 22,    // px — visible "top of wall" thickness (band drawn outward from perimeter)
  WALL_SHADOW_DEPTH: 14, // px — drop-shadow depth from wall onto floor
};

// ── Obstacle config ───────────────────────────────────────────────────────────
export const OBSTACLES = {
  DENSITY: 0.000007,      // sparse background obstacles per px² of arena floor area
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
  CLUSTER_COUNT_MAX: 10,

  // Theme-specific vertical props (one per ~600 000 px² of floor)
  SPIRE_RADIUS: 22,
  SPIRE_DENSITY: 0.0000017,
};

// Player base stats
export const PLAYER = {
  BASE_HP: 1000,
  BASE_SPEED: 280,
  BASE_DAMAGE: 100,
  BASIC_ATTACK_COOLDOWN: 100,    // ms
  BASIC_ATTACK_SPEED: 600,       // px/s
  DODGE_STAMINA_COST: 10,
  DODGE_COOLDOWN: 700,           // ms
  DODGE_IFRAME_DURATION: 350,    // ms
  DODGE_SPEED: 700,
  DODGE_DISTANCE: 200,
  STAMINA_MAX: 100,
  STAMINA_REGEN_RATE: 8,         // stamina per second (passive)
  STAMINA_REGEN_PER_HIT: 12,
  PROJECTILE_MAX_RANGE: 350,     // px — all player projectiles fizzle at this distance
  // Floating HP bar above player
  HP_BAR_WIDTH: 48,
  HP_BAR_HEIGHT: 6,
  HP_BAR_OFFSET_Y: -52,   // clears the helmet dome top (~world y-43 at container scale)
};

// Player weapon float/held feel
export const WEAPON = {
  ORBIT_R: 24,            // local px — midpoint distance from the waist toward the aim
  ANCHOR_Y: 0,            // orbit center vertical offset from the waist
  BEHIND_ENTER_DEG: 26,   // within this of straight-up → weapon renders behind the body
  BEHIND_EXIT_DEG: 36,    // must leave this cone to come back in front (hysteresis)
  TILT_LERP: 0.3,       // per-frame rotation lerp factor (shortest arc)
  BOB_AMPLITUDE: 1.5,   // px idle float bob
  BOB_SPEED: 2.2,       // rad/s
  RECOIL_KICK: 4,       // px backward kick along the aim axis on fire
  RECOIL_DECAY: 0.85,   // per-frame decay multiplier
  MUZZLE_OFFSET: 15,    // px from weapon midpoint to muzzle tip (half canvas length)
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

// Level theme palettes (11 fields each for full procedural art)
// floor/floorLight/floorDark — floor base, bright patches, dark patches
// wallTop/wallInner/wallHighlight/wallShadow — pseudo-3D wall ring colors
// accent/accentDim — detail line bright/muted
// bg — void beyond the arena
// particle — ambient mote color
export const THEMES = [
  // Levels 1-5: Green Fields (ancient moss-covered stone)
  { floor: 0x2a4e18, floorLight: 0x3d6b24, floorDark: 0x1c3510,
    wallTop: 0x4a3520, wallInner: 0x3a2a14, wallHighlight: 0x8aaa55, wallShadow: 0x0d1a08,
    accent: 0x7ec850, accentDim: 0x3a6022, bg: 0x111a09, particle: 0x9ad060 },

  // Levels 6-10: Crystal Caves (bioluminescent underground)
  { floor: 0x162038, floorLight: 0x1e3058, floorDark: 0x0c1422,
    wallTop: 0x1a3a7a, wallInner: 0x112a5a, wallHighlight: 0x88ddff, wallShadow: 0x050d1a,
    accent: 0x44eeff, accentDim: 0x1a6677, bg: 0x070e1c, particle: 0x66ffee },

  // Levels 11-15: Volcanic Depths (hellish lava rock)
  { floor: 0x2e1008, floorLight: 0x4a1c0a, floorDark: 0x180600,
    wallTop: 0x7a1e00, wallInner: 0x5a1400, wallHighlight: 0xff8844, wallShadow: 0x0a0200,
    accent: 0xff6600, accentDim: 0x883300, bg: 0x0f0300, particle: 0xff4400 },

  // Levels 16-20: Celestial Void (cosmic stone, ancient astral)
  { floor: 0x08082a, floorLight: 0x14147a, floorDark: 0x040416,
    wallTop: 0x1e1e6a, wallInner: 0x141450, wallHighlight: 0xffeebb, wallShadow: 0x020208,
    accent: 0xffd700, accentDim: 0x886600, bg: 0x020210, particle: 0xddccff },

  // Levels 21+: Chaos Realm (reality fracturing)
  { floor: 0x18081e, floorLight: 0x280c36, floorDark: 0x0c0412,
    wallTop: 0x550055, wallInner: 0x3a0040, wallHighlight: 0xff44ff, wallShadow: 0x08000e,
    accent: 0xff00ff, accentDim: 0x660066, bg: 0x060008, particle: 0xee00dd },
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
  PLAYER_BODY: 0x2d7dd2,    // armor blue base
  PLAYER_BODY_HI: 0x5aa3e8, // armor blue highlight (top-lit)
  PLAYER_BODY_LO: 0x1a5a9e, // armor blue shadow (bottom)
  PLAYER_HEAD: 0x5ab8ff,    // kept — used for death particle color
  PLAYER_HELMET: 0x8faab8,  // steel base
  PLAYER_HELMET_HI: 0xc8d8e2, // steel highlight
  PLAYER_HELMET_LO: 0x556878, // steel shadow
  PLAYER_CHAINMAIL: 0x6b7785,    // chainmail cheek guards — desaturated gray, darker than steel
  PLAYER_CHAINMAIL_HI: 0x9aa5b0, // chainmail highlight
  PLAYER_CHAINMAIL_LO: 0x3e4854, // chainmail shadow
  PLAYER_SHIELD: 0xf0c040,  // gold base
  PLAYER_SHIELD_HI: 0xffe480, // gold highlight
  PLAYER_SHIELD_LO: 0xa07810, // gold shadow
  PLAYER_SKIN: 0xf4c090,    // skin base
  PLAYER_SKIN_HI: 0xffe4c0, // skin highlight
  PLAYER_SKIN_LO: 0xc48868, // skin shadow
  PLAYER_HAIR: 0x4a3020,    // dark brown hair tuft
  PLAYER_BRASS: 0xd4a040,   // blunderbuss barrel base
  PLAYER_BRASS_HI: 0xf4d870, // brass highlight
  PLAYER_BRASS_LO: 0x8a6020, // brass shadow
  PLAYER_WOOD: 0x6a4020,    // weapon grip wood
  WHITE: 0xffffff,
  BLACK: 0x000000,
  PORTAL: 0xaa44ff,
  ALTAR: 0xffaa22,
};
