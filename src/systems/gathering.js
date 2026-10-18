// Gathering from the world's resource nodes, and node respawn.
// Nodes come from the world generator; GameState keeps only the ones that have been gathered from.
import { D } from '../core/content.js';
import { dist } from '../core/geometry.js';
import { weightedKey } from '../core/rng.js';
import { worldOf, nodesNear } from '../world/world.js';
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

/** What is left on a node: its saved amount if it has been gathered from, else full. */
export function nodeAmount(s, node) {
  const st = s.nodes[node.id];
  return st ? st.amount : D.resources[node.type].amount;
}

export function nearestNode(s) {
  const range = D.game.interact.range;
  const near = nodesNear(worldOf(s), s.player.x, s.player.y, range);
  return nearestInRange(
    s,
    near.filter((n) => nodeAmount(s, n) > 0),
    range,
  );
}

/** One gather: a node yields one item, or for a `yields` table, one item drawn by weight. */
export function gatherNode(s, node) {
  const def = D.resources[node.type];
  const st = s.nodes[node.id] || (s.nodes[node.id] = { amount: def.amount, respawnTimer: 0 });
  const item = typeof def.yields === 'string' ? def.yields : weightedKey(def.yields);
  st.amount -= 1;
  s.player.inventory[item] += 1;
  log(s, `Gathered 1 ${item}. (${st.amount}/${def.amount} left)`);
  if (st.amount <= 0) {
    st.respawnTimer = def.respawn;
    if (node.relic && def.relic && !s.relics[node.id]) findRelic(s, node.id, def.relic.kp);
  }
  changed('inventory');
}

/** A relic grants Knowledge at once, and only the first time. */
export function findRelic(s, key, kp) {
  s.relics[key] = true;
  s.kp += kp;
  log(s, `You find a relic, carved with symbols you almost understand. (+${kp} Knowledge)`);
  changed('kp');
}

/** Depleted nodes count down and return to full, which removes them from the state. */
export function updateResources(s) {
  for (const id in s.nodes) {
    const st = s.nodes[id];
    if (st.amount > 0) continue;
    st.respawnTimer--;
    if (st.respawnTimer <= 0) delete s.nodes[id];
  }
}
