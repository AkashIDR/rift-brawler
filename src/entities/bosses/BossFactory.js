import Charger from './Charger.js';
import Gunner from './Gunner.js';
import Stomper from './Stomper.js';

const BOSS_MAP = {
  charger: Charger,
  gunner: Gunner,
  stomper: Stomper,
};

export function createBoss(scene, key, x, y, level) {
  const BossClass = BOSS_MAP[key];
  if (!BossClass) {
    console.warn(`Unknown boss key: ${key}. Defaulting to Charger.`);
    return new Charger(scene, x, y, level);
  }
  return new BossClass(scene, x, y, level);
}
