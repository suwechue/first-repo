// Spending and receiving inventory items.
import { changed } from './log.js';

export function canAfford(s, costs) {
  for (const k in costs) if (!(s.player.inventory[k] >= costs[k])) return false;
  return true;
}

export function spend(s, costs) {
  for (const k in costs) s.player.inventory[k] -= costs[k];
  changed('inventory');
}

export function give(s, items) {
  for (const k in items) s.player.inventory[k] = (s.player.inventory[k] || 0) + items[k];
  changed('inventory');
}

/** "4 stone + 2 wood" */
export function costText(costs) {
  return Object.entries(costs)
    .map(([k, v]) => v + ' ' + k)
    .join(' + ');
}
