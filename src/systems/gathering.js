// Gathering from resource nodes, and node respawn.
import { D } from '../core/content.js';
import { dist } from '../core/geometry.js';
import { log, changed } from './log.js';

export function nearestInRange(s, list, range) {
  let best = null;
  let bestD = Infinity;
  for (const obj of list) {
    const d = dist(s.player, obj);
    if (d < range && d < bestD) {
      bestD = d;
      best = obj;
    }
  }
  return best;
}

export function nearestNode(s) {
  return nearestInRange(
    s,
    s.resources.filter((r) => r.amount > 0),
    D.game.interact.range,
  );
}

export function gatherNode(s, node) {
  const def = D.resources[node.type];
  node.amount -= 1;
  s.player.inventory[def.yields] += 1;
  log(s, `Gathered 1 ${def.yields}. (${node.amount}/${node.maxAmount} left)`);
  if (node.amount <= 0) node.respawnTimer = def.respawn;
  changed('inventory');
}

export function updateResources(s) {
  for (const node of s.resources) {
    if (node.amount <= 0) {
      node.respawnTimer--;
      if (node.respawnTimer <= 0) node.amount = node.maxAmount;
    }
  }
}
