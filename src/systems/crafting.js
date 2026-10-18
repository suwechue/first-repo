// Crafting: gear for the armory, cooking at a building, and packed supplies.
import { D } from '../core/content.js';
import { dist } from '../core/geometry.js';
import { canAfford, spend, give } from './inventory.js';
import { reqsMet } from './tech.js';
import { log, changed, cue } from './log.js';

export function nearBuilding(s, type, range) {
  return s.buildings.find((b) => b.type === type && dist(b, s.player) < range) || null;
}

export function canCraft(s, key) {
  const r = D.recipes[key];
  return reqsMet(s, r.requires) && canAfford(s, r.costs);
}

export function tryCraft(s, key) {
  const r = D.recipes[key];
  if (!reqsMet(s, r.requires)) return false;
  if (!canAfford(s, r.costs)) {
    log(s, 'Not enough resources.');
    return false;
  }

  if (r.type === 'item') {
    spend(s, r.costs);
    const it = D.items[r.item];
    s.armory[r.item] = (s.armory[r.item] || 0) + 1;
    if (it.slot === 'weapon' && it.dmg) s.player.weaponDmg = Math.max(s.player.weaponDmg, it.dmg);
    log(s, `Crafted ${it.name}. Equip it from the Roster.`);
    changed('roster');
  } else if (r.type === 'cook') {
    if (r.nearBuilding && !nearBuilding(s, r.nearBuilding, D.game.interact.craftNearBuildingRange)) {
      log(s, `You need to be near a lit ${D.buildings[r.nearBuilding].name}.`);
      return false;
    }
    spend(s, r.costs);
    give(s, r.yields);
    log(s, 'Cooked a portion of food.');
  } else if (r.type === 'supply') {
    spend(s, r.costs);
    give(s, r.yields);
    log(s, 'Packed ' + r.name + '.');
  }
  changed('craft');
  cue('craft');
  return true;
}
