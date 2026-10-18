// Bonds between pairs of characters: values, tiers, the opening roll, and the pair's record
// (s.bondMeta: when they last shared a mission, how many they shared, and flags such as
// life_debt, mentor and romance). Rules: docs/SPEC.md, Systems reference, Bonds.
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

export function bondTier(v) {
  for (const t of B.tiers) if (v >= t.min) return t;
  return B.tiers[B.tiers.length - 1];
}

/** The pair's record, created on first use with the clock starting today. */
export function bondMeta(s, a, b) {
  const k = pairKey(a, b);
  if (!s.bondMeta[k]) s.bondMeta[k] = { since: s.day, missions: 0, flags: [] };
  return s.bondMeta[k];
}

export function hasFlag(s, a, b, flag) {
  return !!s.bondMeta[pairKey(a, b)]?.flags.includes(flag);
}

/** Adds a flag once. Returns true if it is new. */
export function addFlag(s, a, b, flag) {
  const m = bondMeta(s, a, b);
  if (m.flags.includes(flag)) return false;
  m.flags.push(flag);
  return true;
}

function charById(s, id) {
  return s.roster.find((c) => c.id === id) || null;
}

/** Appends to a character's history, keeping the most recent entries. */
export function addHistory(s, c, event, extra = {}) {
  if (!c) return;
  if (!Array.isArray(c.history)) c.history = [];
  c.history.push({ day: s.day, event, ...extra });
  const cap = D.talents.growth.historySize;
  if (c.history.length > cap) c.history.splice(0, c.history.length - cap);
}

export function setBond(s, a, b, v) {
  const before = getBond(s, a, b);
  const after = Math.max(B.min, Math.min(B.max, Math.round(v)));
  s.bonds[pairKey(a, b)] = after;
  // Crossing into a notable tier is a milestone in both characters' histories.
  const t0 = bondTier(before).name;
  const t1 = bondTier(after).name;
  if (t0 !== t1 && B.events.milestones.includes(t1)) {
    const ca = charById(s, a);
    const cb = charById(s, b);
    if (ca && cb) {
      addHistory(s, ca, 'bond', { with: cb.name, tier: t1 });
      addHistory(s, cb, 'bond', { with: ca.name, tier: t1 });
    }
  }
}

export function addBond(s, a, b, d) {
  setBond(s, a, b, getBond(s, a, b) + d);
}

/** Rolls the starting bond between two characters who have just met. */
export function seedBond(s, a, b) {
  let v = Math.round(rand() * B.seed.range + B.seed.low);
  for (const ta of a.traits)
    for (const tb of b.traits) {
      if (inPairs(D.traits.clash, ta, tb)) v += B.seed.clash;
      if (inPairs(D.traits.synergy, ta, tb)) v += B.seed.synergy;
    }
  s.bonds[pairKey(a.id, b.id)] = Math.max(B.min, Math.min(B.max, Math.round(v)));
  s.bondMeta[pairKey(a.id, b.id)] = { since: s.day, missions: 0, flags: [] };
}

/** Removes every bond that involves a character. */
export function deleteBondsOf(s, id) {
  for (const k of Object.keys(s.bonds)) if (k.split('|').indexOf(id) >= 0) delete s.bonds[k];
  for (const k of Object.keys(s.bondMeta)) if (k.split('|').indexOf(id) >= 0) delete s.bondMeta[k];
}

/** 1.25 for a pair with a synergizing trait pair and no clash, 0.7 with any clash, else 1. */
export function traitCompat(a, b) {
  const T = D.mission.bondGain.traitCompat;
  let clash = false;
  let syn = false;
  for (const ta of a.traits)
    for (const tb of b.traits) {
      if (inPairs(D.traits.clash, ta, tb)) clash = true;
      if (inPairs(D.traits.synergy, ta, tb)) syn = true;
    }
  return clash ? T.clash : syn ? T.synergy : 1;
}

/** BaseGain from a mission's closeness. */
export function baseGain(close) {
  for (const row of D.mission.bondGain.closeness)
    if (row.below === undefined || close < row.below) return row.gain;
  return 0;
}

/** The bond change for a surviving pair after a mission: round(BaseGain x TraitCompat x Outcome). */
export function missionBondGain(a, b, close, success) {
  const O = D.mission.bondGain.outcome;
  return Math.round(baseGain(close) * traitCompat(a, b) * (success ? O.success : O.otherwise));
}

/** At dawn: pairs apart for 10 or more days drift 1 toward 0, once every 10 days. 86 and up never decay. */
export function decayBonds(s) {
  const K = B.decay;
  for (const k of Object.keys(s.bonds)) {
    const v = s.bonds[k];
    if (v === 0 || v >= K.protectedFrom) continue;
    const [a, b] = k.split('|');
    const apart = s.day - bondMeta(s, a, b).since;
    if (apart >= K.afterDays && apart % K.everyDays === 0) {
      setBond(s, a, b, v > 0 ? Math.max(0, v - K.step) : Math.min(0, v + K.step));
    }
  }
}

/** After a mission: the pair shared it, and may have become mentor and apprentice or more. */
export function recordSharedMission(s, a, b) {
  const m = bondMeta(s, a.id, b.id);
  m.since = s.day;
  m.missions++;
  const E = B.events;
  const v = getBond(s, a.id, b.id);
  const [hi, lo] = a.level >= b.level ? [a, b] : [b, a];
  if (
    hi.level - lo.level >= E.mentor.levelGap &&
    m.missions >= E.mentor.missions &&
    v >= E.mentor.bondAtLeast
  ) {
    if (addFlag(s, a.id, b.id, 'mentor')) {
      m.mentor = hi.id;
      addHistory(s, hi, 'mentor', { with: lo.name });
      addHistory(s, lo, 'apprentice', { with: hi.name });
    }
  }
  const clash = a.traits.some((ta) => b.traits.some((tb) => inPairs(D.traits.clash, ta, tb)));
  if (v >= E.romance.bondAtLeast && !clash && addFlag(s, a.id, b.id, 'romance')) {
    addHistory(s, a, 'romance', { with: b.name });
    addHistory(s, b, 'romance', { with: a.name });
  }
}

/** The talents of a character's mentor, if they have a living one. */
export function mentorTalents(s, c) {
  for (const [k, m] of Object.entries(s.bondMeta)) {
    if (!m.mentor || m.mentor === c.id || !k.split('|').includes(c.id)) continue;
    const mentor = charById(s, m.mentor);
    if (mentor) return new Set(mentor.talents);
  }
  return null;
}
