// The day clock: passive Knowledge, hunger, and what happens at each dawn.
import { D } from '../core/content.js';
import { rand } from '../core/rng.js';
import { refreshOffer } from './recruiting.js';
import { spawnEnemy } from './combat.js';
import { hungerTick, autoEat } from './player.js';
import { log, changed } from './log.js';

const K = D.game.clock;

export function newDay(s) {
  s.dayTimer = 0;
  s.day++;
  log(s, `Day ${s.day} begins.`);
  if (s.nexus.awake) refreshOffer(s);
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

  if (s.frame % K.knowledgeEvery === 0) {
    s.kp += K.knowledgeAmount;
    changed('kp');
  }
  if (s.frame % D.game.hunger.every === 0) hungerTick(s);
  if (s.dayTimer >= s.dayLength) newDay(s);
  autoEat(s);
}
