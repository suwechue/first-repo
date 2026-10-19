// The roster: character records, trait and talent effects, gear, XP and growth, permadeath.
import { D } from '../core/content.js';
import { weightedKey, pick } from '../core/rng.js';
import { seedBond, deleteBondsOf, addHistory, mentorTalents } from './bonds.js';
import { levelRolls } from './growth.js';
import { knowledgeTier } from './magic.js';

const G = D.talents.growth;

// ---------------- queries ----------------
export function byId(s, id) {
  return s.roster.find((c) => c.id === id) || null;
}

export function isInjured(s, c) {
  return (c.injuredUntil || 0) > s.day;
}

export function isAvailable(s, c) {
  return !isInjured(s, c);
}

const MULTIPLIERS = new Set(G.multipliers);
const rankedCache = new Map(); // "talent:rank" -> definition with the rank applied

/** A talent's definition at a rank: `perRank` effects are added (bonuses) or multiplied (multipliers) r - 1 times. */
export function talentAtRank(key, rank = 1) {
  const id = key + ':' + rank;
  let def = rankedCache.get(id);
  if (!def) {
    const base = D.talents.talents[key];
    def = { ...base };
    for (const [k, v] of Object.entries(base.perRank || {})) {
      for (let r = 1; r < rank; r++) def[k] = MULTIPLIERS.has(k) ? (def[k] ?? 1) * v : (def[k] || 0) + v;
    }
    rankedCache.set(id, def);
  }
  return def;
}

/**
 * Every trait and talent definition a character has, traits first, talents at their rank, then their
 * specialization's effects.
 */
export function traitDefs(c) {
  const defs = c.traits
    .map((t) => D.traits.traits[t])
    .filter(Boolean)
    .concat(
      c.talents.filter((t) => D.talents.talents[t]).map((t) => talentAtRank(t, c.talentRanks?.[t] || 1)),
    );
  const spec = c.specialization && D.specializations[c.specialization];
  if (spec) defs.push(spec.effects || {});
  return defs;
}

/** Sums a numeric effect across a character's traits and talents. */
export function sumEffect(c, key) {
  return traitDefs(c).reduce((a, d) => a + (d[key] || 0), 0);
}

/** Multiplies a multiplier effect (default 1) across traits and talents. */
export function prodEffect(c, key) {
  return traitDefs(c).reduce((a, d) => a * (d[key] !== undefined ? d[key] : 1), 1);
}

export function hasEffect(c, key) {
  return traitDefs(c).some((d) => d[key]);
}

/** A stat with trait bonuses: conBonus adds to CON, perBonus to PER. */
export function statEff(c, stat) {
  let v = c.stats[stat];
  if (stat === 'con') v += sumEffect(c, 'conBonus');
  if (stat === 'per') v += sumEffect(c, 'perBonus');
  return v;
}

/** Class arcane base plus trait and talent arcane. A caster's spells count in their Repertoire (magic.js). */
export function arcanePower(c) {
  return (D.classes[c.cls].arcaneBase || 0) + sumEffect(c, 'arcane');
}

export function xpToNext(level) {
  return G.xpPerLevel * level;
}

/** { explore: 0, gather: 0, hunt: 0 } for every objective. */
export function emptyByObjective() {
  return Object.fromEntries(Object.keys(D.mission.objectives).map((o) => [o, 0]));
}

// ---------------- creation ----------------
export function build(s, spec) {
  const cl = D.classes[spec.cls];
  const c = {
    id: 'c' + s.nextCharId++,
    name: spec.name,
    cls: spec.cls,
    tier: spec.tier || D.tiers.recruit.starterTier,
    bg: spec.bg || null,
    level: 1,
    xp: 0,
    pity: 0,
    stats: Object.assign({}, spec.stats),
    traits: spec.traits.slice(),
    talents: [],
    vectors: [],
    gear: { weapon: null, armor: null },
    injuredUntil: 0,
    grief: 0,
    missions: 0,
    kills: 0,
    // M9 character depth
    talentRanks: {},
    skills: emptyByObjective(),
    usage: emptyByObjective(),
    history: [{ day: s.day, event: 'joined', how: spec.how || 'recruited' }],
    ups: [],
    lean: null,
    // M10 Axiom Magic
    knowledge: { vectors: {}, forms: {}, pairUses: {}, magnitudes: {} },
    origin: spec.origin || D.tiers.recruit.origin,
    assignment: null, // 'research' while seated at a Research Desk (M13)
    loadout: [],
    specialization: null,
  };
  if (cl.vectorPool) c.vectors = [pick(cl.vectorPool)];
  if (cl.caster) {
    // A new caster knows one Vector and the first Form, and carries that spell at Minor.
    const form = D.knowledgeTiers.magic.startForm;
    for (const v of c.vectors) c.knowledge.vectors[v] = 1;
    c.knowledge.forms[form] = 1;
    if (c.vectors.length) c.loadout = [{ vector: c.vectors[0], form, magnitude: 'minor' }];
  }
  return c;
}

/** The hand-authored opening roster, with their starting bonds rolled. */
export function initStarters(s) {
  s.roster = [];
  s.bonds = {};
  for (const sp of D.starterRoster) {
    s.roster.push(
      build(s, {
        name: sp.name,
        cls: sp.cls,
        stats: sp.stats,
        traits: sp.traits,
        tier: D.tiers.recruit.starterTier,
        how: 'starter',
      }),
    );
  }
  for (let i = 0; i < s.roster.length; i++)
    for (let j = i + 1; j < s.roster.length; j++) seedBond(s, s.roster[i], s.roster[j]);
}

// ---------------- gear ----------------
export function equip(s, c, slot, itemKey) {
  const cur = c.gear[slot];
  if (cur === (itemKey || null)) return;
  if (itemKey) {
    if (!(s.armory[itemKey] > 0)) return;
    if (D.items[itemKey].slot !== slot) return;
    s.armory[itemKey]--;
  }
  if (cur) s.armory[cur] = (s.armory[cur] || 0) + 1;
  c.gear[slot] = itemKey || null;
}

export function gearPower(c) {
  let g = 0;
  for (const sl in c.gear) if (c.gear[sl]) g += D.items[c.gear[sl]].gear;
  return g;
}

export function armorMod(c) {
  const a = c.gear.armor;
  return a ? D.items[a].armorMod || 0 : 0;
}

// ---------------- growth ----------------
/**
 * Adds XP, applies any level-ups with their growth rolls, and returns what happened for the report.
 * `s` (optional) supplies the day for history and the character's mentor, if any.
 */
export function addXp(c, amount, s = null) {
  amount = Math.round(amount * prodEffect(c, 'xpMul'));
  c.xp += amount;
  const ups = [];
  const cl = D.classes[c.cls];
  while (c.level < G.levelCap && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level++;
    const gains = {};
    for (let i = 0; i < G.statPointsPerLevel; i++) {
      const w = {};
      Object.keys(c.stats).forEach((k) => {
        w[k] = c.stats[k] >= G.statCap ? 0 : cl.primary.indexOf(k) >= 0 ? G.primaryWeight : G.otherWeight;
      });
      const k = weightedKey(w);
      if (k) {
        c.stats[k]++;
        gains[k] = (gains[k] || 0) + 1;
      }
    }
    const ctx = {
      lean: c.lean,
      mentorTalents: s ? mentorTalents(s, c) : null,
      tier: s ? knowledgeTier(s) : 1,
    };
    const { rolls, breakthrough } = levelRolls(c, c.level, ctx);
    const talent = rolls.find((r) => r.kind === 'new')?.talent || null;
    const up = { level: c.level, gains, talent, rolls, breakthrough };
    ups.push(up);
    if (Array.isArray(c.ups)) {
      c.ups.push({ day: s ? s.day : null, ...up });
      if (c.ups.length > G.recentUps) c.ups.shift();
    }
    if (s) addHistory(s, c, 'level', { level: c.level, talent });
  }
  if (c.level >= G.levelCap) c.xp = 0;
  return { xp: amount, ups };
}

// ---------------- permadeath ----------------
export function die(s, c, cause) {
  s.memorial.push({
    name: c.name,
    cls: c.cls,
    level: c.level,
    day: s.day,
    cause: cause || 'fell on an expedition',
  });
  s.roster = s.roster.filter((x) => x !== c);
  deleteBondsOf(s, c.id);
  s.stats.deaths++;
  // Anything they carried goes back to the armory.
  for (const sl in c.gear) if (c.gear[sl]) s.armory[c.gear[sl]] = (s.armory[c.gear[sl]] || 0) + 1;
}
