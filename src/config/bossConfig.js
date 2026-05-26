// Base boss stats (level 1). Scaled up each level via ProgressionSystem.
export const BOSS_CONFIGS = {
  charger: {
    name: 'The Charger',
    baseHp: 2300,
    baseDamage: 150,
    baseSpeed: 140,
    size: 38,
    color: 0x001a4d,
    accentColor: 0x00ccff,
    attackPool: ['dashCharge', 'spinCrash'],
    enrageAttacks: ['tripleCharge'],
    enrageThresholds: [0.5, 0.25],
  },
  gunner: {
    name: 'The Gunner',
    baseHp: 2000,
    baseDamage: 250,
    baseSpeed: 100,
    size: 34,
    color: 0x9b59b6,
    accentColor: 0xf1c40f,
    attackPool: ['aimedShot', 'spreadBurst'],
    enrageAttacks: ['fullRotation', 'barrage'],
    enrageThresholds: [0.5, 0.25],
  },
  stomper: {
    name: 'The Stomper',
    baseHp: 3000,
    baseDamage: 200,
    baseSpeed: 80,
    size: 48,
    color: 0x27ae60,
    accentColor: 0x1abc9c,
    attackPool: ['bigStomp', 'quakeLine'],
    enrageAttacks: ['tremorField', 'leapSlam'],
    enrageThresholds: [0.5, 0.25],
  },
};

// Which bosses appear at which level ranges
export const BOSS_POOL_BY_LEVEL = {
  early: ['charger', 'gunner', 'stomper'],    // levels 1-5
  mid: ['charger', 'gunner', 'stomper'],       // levels 6-12 (expanded later)
  late: ['charger', 'gunner', 'stomper'],      // levels 13+ (expanded later)
};

export function getBossPool(level) {
  if (level <= 5) return BOSS_POOL_BY_LEVEL.early;
  if (level <= 12) return BOSS_POOL_BY_LEVEL.mid;
  return BOSS_POOL_BY_LEVEL.late;
}

export function getRandomBossKey(level, excludeKeys = []) {
  const full = getBossPool(level);
  const pool = full.filter(k => !excludeKeys.includes(k));
  const src = pool.length > 0 ? pool : full;
  return src[Math.floor(Math.random() * src.length)];
}
