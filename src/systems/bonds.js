// Bonds between pairs of characters: values, tiers and the opening roll.
import { D } from '../core/content.js';
import { rand } from '../core/rng.js';

const B = D.bonds;

export function pairKey(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

export function inPairs(pairs, a, b) {
  return pairs.some((p) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
}

export function getBond(s, a, b) {
  return s.bonds[pairKey(a, b)] || 0;
}

export function setBond(s, a, b, v) {
  s.bonds[pairKey(a, b)] = Math.max(B.min, Math.min(B.max, Math.round(v)));
}

export function addBond(s, a, b, d) {
  setBond(s, a, b, getBond(s, a, b) + d);
}

export function bondTier(v) {
  for (const t of B.tiers) if (v >= t.min) return t;
  return B.tiers[B.tiers.length - 1];
}

/** Rolls the starting bond between two characters who have just met. */
export function seedBond(s, a, b) {
  let v = Math.round(rand() * B.seed.range + B.seed.low);
  for (const ta of a.traits)
    for (const tb of b.traits) {
      if (inPairs(D.traits.clash, ta, tb)) v += B.seed.clash;
      if (inPairs(D.traits.synergy, ta, tb)) v += B.seed.synergy;
    }
  setBond(s, a.id, b.id, v);
}

/** Removes every bond that involves a character. */
export function deleteBondsOf(s, id) {
  for (const k of Object.keys(s.bonds)) if (k.split('|').indexOf(id) >= 0) delete s.bonds[k];
}
