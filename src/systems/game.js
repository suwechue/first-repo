// Ties the systems together: a new game, the interact key, and the per-frame update.
import { D } from '../core/content.js';
import { resetState } from '../core/state.js';
import { seedRng } from '../core/rng.js';
import { initStarters } from './characters.js';
import { scatterResources } from '../world/worldgen.js';
import { nearestInRange, nearestNode, gatherNode, updateResources } from './gathering.js';
import { attackEnemy, updateEnemies } from './combat.js';
import { inNexusRange, interactNexus } from './nexus.js';
import { nearBuilding, tryCraft } from './crafting.js';
import { reqsMet } from './tech.js';
import { updateBuildings } from './building.js';
import { updatePlayer, checkFaint } from './player.js';
import { updateClock } from './clock.js';
import { log } from './log.js';

/** A fresh world and the starter roster, from a seed. */
export function newGame(s, seed) {
  resetState(s);
  seedRng(seed);
  s.seed = seed;
  scatterResources(s);
  initStarters(s);
  for (const m of D.game.messages.newGame) log(s, m);
}

export function nearestEnemy(s) {
  return nearestInRange(s, s.enemies, D.game.interact.range);
}

/** The E key: attack, else gather, else the Nexus, else cook at a fire. */
export function handleInteract(s) {
  if (s.mode !== 'EXPLORE') return;
  if (s.gatherCooldown > 0) return;
  const I = D.game.interact;

  const enemy = nearestEnemy(s);
  if (enemy) {
    attackEnemy(s, enemy);
    s.gatherCooldown = I.cooldown.attack;
    return;
  }
  const node = nearestNode(s);
  if (node) {
    gatherNode(s, node);
    s.gatherCooldown = I.cooldown.gather;
    return;
  }
  if (inNexusRange(s)) {
    interactNexus(s);
    s.gatherCooldown = I.cooldown.nexus;
    return;
  }
  const r = D.recipes[I.cook.recipe];
  if (nearBuilding(s, r.nearBuilding, I.cook.range) && reqsMet(s, r.requires)) {
    const item = Object.keys(r.costs)[0];
    if (s.player.inventory[item] > 0 && tryCraft(s, I.cook.recipe)) s.gatherCooldown = I.cooldown.cook;
  }
}

/** One fixed 1/60 s frame. */
export function update(s, input) {
  if (s.mode !== 'PLACING') updatePlayer(s, input);
  updateResources(s);
  updateBuildings(s);
  updateEnemies(s);
  updateClock(s);
  checkFaint(s);
}
