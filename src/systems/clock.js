// The day clock: passive Knowledge, hunger, and what happens at each dawn.
import { D } from '../core/content.js';
import { rand } from '../core/rng.js';
import { dawnArrival } from './recruiting.js';
import { decayBonds } from './bonds.js';
import { spawnEnemy } from './combat.js';
import { hungerTick, autoEat } from './player.js';
import { log, changed, cue } from './log.js';

const NIGHT = D.game.night;

/**
 * How dark it is, 0 (day) to 1 (full night), from the time of day. Each day starts bright; dusk
 * begins at `duskAt`, darkens over `fade`, and the night lifts over the last `fade` of the day.
 */
export function darkness(s) {
  const t = s.dayTimer / s.dayLength;
  const { duskAt, fade } = NIGHT;
  if (t < duskAt) return 0;
  if (t < duskAt + fade) return (t - duskAt) / fade;
  if (t < 1 - fade) return 1;
  return Math.max(0, (1 - t) / fade);
}

export function isNight(s) {
  return darkness(s) >= 0.5;
}

export function newDay(s) {
  s.dayTimer = 0;
  s.day++;
  log(s, `Day ${s.day} begins.`);
  if (s.nexus.awake) dawnArrival(s);
  decayBonds(s);
  cue('day');
  const W = D.game.dawnSpawn;
  if (s.day >= W.fromDay && rand() < W.chance && s.enemies.length < W.maxEnemies) {
    spawnEnemy(s, W.enemy, W.minDistance, W.tries);
  }
  changed('day');
  changed('roster');
}

export function updateClock(s) {
  s.frame++;
  s.dayTimer++;

  if (s.frame % D.game.hunger.every === 0) hungerTick(s);
  if (s.dayTimer >= s.dayLength) newDay(s);
  autoEat(s);
}
