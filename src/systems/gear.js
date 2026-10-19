// Gear: each crafted piece is its own item { id, base, quality, props } that sits in the shared
// armory (s.armory, a list) or in a wearer's slot. The player and every character wear the same
// six slots. Rules: docs/SPEC.md, Systems reference, Gear (M14).
import { D } from '../core/content.js';

const GR = D.gear;
export const SLOTS = Object.keys(GR.slots);
const MULTIPLIERS = new Set(D.talents.growth.multipliers);

export function emptyGear() {
  return Object.fromEntries(SLOTS.map((k) => [k, null]));
}

/** Makes a new item and puts it in the armory. Returns it. */
export function createItem(s, base, quality = GR.defaultQuality, props = []) {
  const it = { id: 'i' + s.nextItemId++, base, quality, props };
  s.armory.push(it);
  return it;
}

export function itemDef(it) {
  return D.items[it.base];
}

export function qualityMul(it) {
  return GR.qualities[it.quality]?.mul ?? 1;
}

/** A number on the piece (gear, dmg, defense, armorMod), times its quality. */
export function itemStat(it, key) {
  return (itemDef(it)[key] || 0) * qualityMul(it);
}

/**
 * The piece's effects at its quality: bonuses scale with it, multipliers move their distance from 1
 * by it. Properties rolled in M16 add their own effects on top.
 */
export function itemEffects(it) {
  const q = qualityMul(it);
  const out = {};
  const add = (k, v) => {
    if (MULTIPLIERS.has(k)) out[k] = (out[k] ?? 1) * (1 - (1 - v) * q);
    else out[k] = (out[k] || 0) + v * q;
  };
  for (const [k, v] of Object.entries(itemDef(it).effects || {})) add(k, v);
  for (const p of it.props || []) for (const [k, v] of Object.entries(p.effects || {})) add(k, v);
  return out;
}

export function itemName(it) {
  const q = GR.qualities[it.quality];
  const lead = it.props?.[0]?.adjective ? it.props[0].adjective + ' ' : '';
  return `${it.quality !== GR.defaultQuality ? q.label + ' ' : ''}${lead}${itemDef(it).name}`;
}

/** Every piece a wearer (a character or the player) has on. */
export function worn(wearer) {
  return Object.values(wearer.gear || {}).filter(Boolean);
}

/** Squad Combat Power from gear: the sum of every piece's `gear`. */
export function gearPower(wearer) {
  return worn(wearer).reduce((a, it) => a + itemStat(it, 'gear'), 0);
}

/** Injury protection: every piece's armorMod added, capped. */
export function armorMod(wearer) {
  return Math.min(
    GR.armorModCap,
    worn(wearer).reduce((a, it) => a + itemStat(it, 'armorMod'), 0),
  );
}

/** Effects of everything worn, one definition per piece, in the same shape as a trait. */
export function gearEffectDefs(wearer) {
  return worn(wearer).map(itemEffects);
}

/**
 * Moves an armory item (by id) into a wearer's slot, returning whatever was there to the armory.
 * `id` null just takes the slot's piece off. Returns an error message or null.
 */
export function equip(s, wearer, slot, id) {
  if (!SLOTS.includes(slot)) return 'Unknown slot.';
  const cur = wearer.gear[slot];
  if (cur && cur.id === id) return null;
  let next = null;
  if (id) {
    const i = s.armory.findIndex((it) => it.id === id);
    if (i < 0) return 'That piece is not in the armory.';
    if (itemDef(s.armory[i]).slot !== slot) return 'That piece does not go there.';
    next = s.armory.splice(i, 1)[0];
  }
  if (cur) s.armory.push(cur);
  wearer.gear[slot] = next;
  return null;
}

/** Everything a wearer has on goes back to the armory (a death). */
export function unequipAll(s, wearer) {
  for (const slot of SLOTS) {
    if (wearer.gear?.[slot]) s.armory.push(wearer.gear[slot]);
    if (wearer.gear) wearer.gear[slot] = null;
  }
}

// ---------------- the player ----------------
/** Sum of one effect key over the player's gear. */
export function playerEffect(s, key) {
  return gearEffectDefs(s.player).reduce((a, e) => a + (e[key] || 0), 0);
}

/** The player's weapon damage: the weapon's `dmg`, or bare hands. */
export function playerDamage(s) {
  const w = s.player.gear?.weapon;
  return w ? Math.max(1, itemStat(w, 'dmg')) : D.game.player.unarmedDmg;
}

export function playerDefense(s) {
  return worn(s.player).reduce((a, it) => a + itemStat(it, 'defense'), 0);
}

/** Damage after the player's defense, never under 1. */
export function damageToPlayer(s, raw) {
  return Math.max(1, Math.round(raw - playerDefense(s)));
}
