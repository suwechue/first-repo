// Placing buildings and ticking the ones that do something over time.
import { D } from '../core/content.js';
import { canAfford, spend, give } from './inventory.js';
import { log, changed } from './log.js';
import { addAwareness } from './nexus.js';

export function enterPlacing(s, key) {
  s.mode = 'PLACING';
  s.placingBuilding = key;
  log(s, `Placing ${D.buildings[key].name} — click on the map, ESC to cancel.`);
  changed('placing');
}

export function exitPlacing(s) {
  if (s.mode === 'PLACING') {
    s.mode = 'EXPLORE';
    s.placingBuilding = null;
  }
}

export function tryPlaceBuilding(s, x, y) {
  const key = s.placingBuilding;
  const def = D.buildings[key];
  if (!def) return false;
  if (!canAfford(s, def.costs)) {
    log(s, 'Not enough resources.');
    return false;
  }
  spend(s, def.costs);
  const b = { type: key, x, y, radius: def.radius, color: def.color };
  // A building that does something over time keeps its timer on the instance.
  if (def.produces) b.growthTimer = def.produces.time;
  if (def.awareness) b.awarenessTimer = def.awareness.time;
  s.buildings.push(b);
  log(s, `Built ${def.name}.`);
  s.mode = 'EXPLORE';
  s.placingBuilding = null;
  return true;
}

export function updateBuildings(s) {
  for (const b of s.buildings) {
    const def = D.buildings[b.type];
    if (b.awarenessTimer !== undefined) {
      b.awarenessTimer--;
      if (b.awarenessTimer <= 0) {
        b.awarenessTimer = def.awareness.time;
        addAwareness(s, def.awareness.amount);
      }
    }
    if (b.growthTimer === undefined) continue;
    b.growthTimer--;
    if (b.growthTimer <= 0) {
      give(s, def.produces.yields);
      b.growthTimer = def.produces.time;
      const what = Object.entries(def.produces.yields)
        .map(([k, v]) => v + ' ' + k)
        .join(', ');
      log(s, `Your ${def.name} produced ${what}.`);
    }
  }
}
