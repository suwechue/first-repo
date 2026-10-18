// Generating recruits and taking them on. Rarity gives more stat points and traits,
// never a better chance at notable traits: every trait roll uses the same pool weights.
import { D } from '../core/content.js';
import { rand, weightedKey } from '../core/rng.js';
import { build } from './characters.js';
import { seedBond, inPairs } from './bonds.js';
import { isUnlocked } from './tech.js';

const T = D.tiers;

function weightsOf(table, field) {
  const o = {};
  for (const k in table) o[k] = table[k][field];
  return o;
}

function uniqueName(s) {
  const N = D.names;
  for (let i = 0; i < N.uniqueAttempts; i++) {
    const f = N.first[Math.floor(rand() * N.first.length)];
    const l = N.last[Math.floor(rand() * N.last.length)];
    const n = f + ' ' + l;
    if (!s.roster.some((c) => c.name === n) && !s.memorial.some((c) => c.name === n)) return n;
  }
  return N.fallbackPrefix + ' ' + s.nextCharId;
}

export function rollTraits(n) {
  const picked = [];
  let guard = 0;
  while (picked.length < n && guard++ < T.traitRollAttempts) {
    const rarity = weightedKey(T.traitPoolWeights);
    const pool = Object.keys(D.traits.traits).filter(
      (k) => D.traits.traits[k].rarity === rarity && picked.indexOf(k) < 0,
    );
    if (!pool.length) continue;
    const t = pool[Math.floor(rand() * pool.length)];
    // An unlucky pairing is rerolled, so recruits don't arrive self-contradictory.
    if (picked.some((p) => inPairs(D.traits.clash, p, t))) continue;
    picked.push(t);
  }
  return picked;
}

/** Class weights for a background, plus any class unlocked by research (mages). */
function classWeights(s, bg) {
  const w = Object.assign({}, bg.classes);
  for (const k in D.classes) {
    const cl = D.classes[k];
    if (cl.recruitWeight && cl.needsTech && isUnlocked(s, cl.needsTech)) w[k] = cl.recruitWeight;
  }
  return w;
}

export function generate(s, opts = {}) {
  const tier = opts.tier || weightedKey(weightsOf(T.tiers, 'weight'));
  const bgKey = weightedKey(weightsOf(D.backgrounds, 'weight'));
  const bg = D.backgrounds[bgKey];
  const cls = weightedKey(classWeights(s, bg));
  const cl = D.classes[cls];

  const stats = {};
  const keys = Object.keys(T.stats.labels);
  keys.forEach((k) => (stats[k] = T.stats.floor));
  let budget = T.tiers[tier].budget;
  while (budget > 0) {
    const w = {};
    keys.forEach((k) => {
      if (stats[k] >= T.stats.cap) {
        w[k] = 0;
        return;
      }
      w[k] =
        (cl.primary.indexOf(k) >= 0 ? T.stats.primaryWeight : T.stats.otherWeight) *
        ((bg.nudge && bg.nudge[k]) || 1);
    });
    stats[weightedKey(w)]++;
    budget--;
  }
  const name = uniqueName(s);
  const traits = rollTraits(T.tiers[tier].traits);
  return build(s, { name, cls, tier, bg: bgKey, stats, traits });
}

export function rosterCap() {
  return T.recruit.rosterCap;
}

export function refreshOffer(s) {
  s.recruitOffer = s.roster.length < T.recruit.rosterCap ? generate(s) : null;
}

export function recruitCost(c) {
  return T.tiers[c.tier].cost;
}

export function recruit(s) {
  const o = s.recruitOffer;
  const cap = T.recruit.rosterCap;
  const item = T.recruit.costItem;
  if (!o) return { ok: false, msg: 'No one is looking for a home right now.' };
  if (s.roster.length >= cap) return { ok: false, msg: 'Your roster is full (' + cap + ').' };
  const cost = recruitCost(o);
  if (s.player.inventory[item] < cost) {
    return {
      ok: false,
      msg: 'You need ' + cost + ' ' + item + ' to feed a new recruit through the first week.',
    };
  }
  s.player.inventory[item] -= cost;
  s.roster.push(o);
  for (const other of s.roster) if (other !== o) seedBond(s, o, other);
  s.recruitOffer = null;
  return { ok: true, msg: o.name + ' joins your settlement.', char: o };
}
