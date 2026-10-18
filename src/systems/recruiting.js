// Generating recruits, their arrival at the Hall, and taking them on for Renown. Rarity gives more
// stat points and traits, never a better chance at notable traits: every trait roll uses the same
// pool weights. Rules: docs/SPEC.md, Systems reference, Characters (M11).
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

/**
 * Tier weights: Uncommon and Rare grow with Renown up to their caps, and Common keeps the rest, so
 * it stays the most frequent. With no Renown these are the base weights (70 / 25 / 5).
 */
export function tierWeights(s) {
  const w = weightsOf(T.tiers, 'weight');
  const renown = Math.max(0, s?.renown || 0);
  let moved = 0;
  for (const [k, o] of Object.entries(T.recruit.odds)) {
    const bonus = Math.min(o.maxBonus, renown * o.perRenown);
    w[k] += bonus;
    moved += bonus;
  }
  w[T.recruit.starterTier] -= moved;
  return w;
}

/** The chance that someone arrives at a dawn with no one waiting: min(0.9, 0.25 + Renown / 200). */
export function arrivalChance(s) {
  const A = T.recruit.arrival;
  return Math.min(A.max, A.base + A.perRenown * Math.max(0, s.renown || 0));
}

/** One line of flavor from the background and the rarest trait. Chosen by name, so it uses no rolls. */
export function flavorLine(c) {
  const bg = D.backgrounds[c.bg];
  const lines = bg?.flavor || [];
  if (!lines.length) return '';
  const order = Object.keys(T.traitPoolWeights);
  const rarest = c.traits
    .slice()
    .sort((a, b) => order.indexOf(D.traits.traits[b].rarity) - order.indexOf(D.traits.traits[a].rarity))[0];
  const phrase = rarest ? D.traits.traits[rarest].flavor : 'looking for a place to belong';
  let h = 0;
  for (const ch of c.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return lines[h % lines.length].replace('{trait}', phrase);
}

export function generate(s, opts = {}) {
  const tier = opts.tier || weightedKey(tierWeights(s));
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
  const c = build(s, { name, cls, tier, bg: bgKey, stats, traits });
  c.origin = T.recruit.origin;
  c.flavor = flavorLine(c);
  return c;
}

export function rosterCap() {
  return T.recruit.rosterCap;
}

/** Someone arrives now if no one is waiting and there is room (the Nexus waking calls this). */
export function refreshOffer(s) {
  if (!s.recruitOffer && s.roster.length < T.recruit.rosterCap) s.recruitOffer = generate(s);
}

/** At dawn: with no one waiting and room on the roster, someone arrives by chance. Returns true if so. */
export function dawnArrival(s) {
  if (s.recruitOffer || s.roster.length >= T.recruit.rosterCap) return false;
  if (rand() >= arrivalChance(s)) return false;
  s.recruitOffer = generate(s);
  return true;
}

/** Sends the waiting candidate away; the next arrival rolls at the next dawn. */
export function dismiss(s) {
  const o = s.recruitOffer;
  if (!o) return { ok: false, msg: 'No one is waiting.' };
  s.recruitOffer = null;
  return { ok: true, msg: o.name + ' moves on.' };
}

/** Renown to take a recruit on: 20, 40 or 80 by tier. */
export function recruitCost(c) {
  return T.tiers[c.tier].renown;
}

export function recruit(s) {
  const o = s.recruitOffer;
  const cap = T.recruit.rosterCap;
  if (!o) return { ok: false, msg: 'No one is looking for a home right now.' };
  if (s.roster.length >= cap) return { ok: false, msg: 'Your roster is full (' + cap + ').' };
  const cost = recruitCost(o);
  if (s.renown < cost) {
    return { ok: false, msg: 'You need ' + cost + ' Renown before ' + o.name + ' will follow you.' };
  }
  s.renown -= cost;
  s.roster.push(o);
  for (const other of s.roster) if (other !== o) seedBond(s, o, other);
  s.recruitOffer = null;
  return { ok: true, msg: o.name + ' joins your settlement.', char: o };
}
