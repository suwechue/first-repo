// Axiom Magic: Knowledge Tiers, spells (Vector + Form + Magnitude), Focus Points, the Repertoire,
// the Stability Check, caster growth rolls and specializations.
// Rules: docs/SPEC.md, Systems reference, Axiom Magic (M10).
import { D } from '../core/content.js';
import { rand, weightedKey } from '../core/rng.js';
import { isUnlocked } from './tech.js';
import * as C from './characters.js';

const K = D.knowledgeTiers;
const MG = K.magic;
const MAG = K.magnitudes;
const ORDER = Object.keys(MAG); // minor, standard, major, grand

// ---------------- Knowledge Tier ----------------
/** The settlement's era: the highest tier whose tech is researched (Tier 1 needs none). */
export function knowledgeTier(s) {
  let tier = 1;
  for (const row of K.tiers) {
    if (row.locked) continue;
    if (!row.tech || (s && isUnlocked(s, row.tech))) tier = Math.max(tier, row.tier);
  }
  return tier;
}

export function tierInfo(tier) {
  return K.tiers.find((t) => t.tier === tier) || K.tiers[0];
}

/** The largest Magnitude the era allows. */
export function magnitudeCap(tier) {
  return tierInfo(tier).maxMagnitude;
}

export const magnitudeRank = (m) => ORDER.indexOf(m);

// ---------------- casters and spells ----------------
export function isCaster(c) {
  return !!(D.classes[c.cls]?.caster || c.specialization);
}

export function spellPair(v, f) {
  return v + '+' + f;
}

/** FP max = 5 + 2 x Level + WIL + INT, plus fpPerLevel effects (Arcane Affinity) x Level. */
export function fpMax(c) {
  return (
    MG.fp.base + MG.fp.perLevel * c.level + c.stats.wil + c.stats.int + C.sumEffect(c, 'fpPerLevel') * c.level
  );
}

/** The Magnitude unlocked for a pair: Minor until a Breakthrough raises it. */
export function unlockedMagnitude(c, v, f) {
  return c.knowledge?.magnitudes?.[spellPair(v, f)] || ORDER[0];
}

/** Magnitudes a caster may use for a pair under the era's cap. */
export function allowedMagnitudes(c, v, f, tier) {
  const top = Math.min(magnitudeRank(unlockedMagnitude(c, v, f)), magnitudeRank(magnitudeCap(tier)));
  return ORDER.slice(0, top + 1);
}

/** SpellValue = Magnitude + floor((Vector affinity + Form affinity) / 2). */
export function spellValue(c, spell) {
  const kv = c.knowledge?.vectors?.[spell.vector] || 0;
  const kf = c.knowledge?.forms?.[spell.form] || 0;
  return MAG[spell.magnitude] + Math.floor((kv + kf) / 2);
}

/** FP cost: the Magnitude, less any flat reduction (an Axiom Monk's), at least 1. */
export function spellCost(c, spell) {
  return Math.max(1, MAG[spell.magnitude] - C.sumEffect(c, 'fpCostFlat'));
}

/** 1.5 against an enemy weak to the Vector, 0.6 against one that resists it, else 1. */
export function matchup(vector, enemy) {
  const M = MG.matchup;
  if (!enemy) return M.neutral;
  if ((enemy.weakTo || []).includes(vector)) return M.weak;
  if ((enemy.resists || []).includes(vector)) return M.resists;
  return M.neutral;
}

/** The Repertoire outside a fight: every equipped spell at Matchup 1 (the Hall preview). */
export function repertoire(c, enemy = null) {
  if (!isCaster(c)) return 0;
  return (c.loadout || []).reduce((a, sp) => a + spellValue(c, sp) * matchup(sp.vector, enemy), 0);
}

/** Checks a loadout. Returns null if valid, or a message. */
export function loadoutError(c, slots, tier) {
  if (!isCaster(c)) return 'Only casters carry spells.';
  if (!Array.isArray(slots) || slots.length > MG.loadoutSize)
    return `A loadout holds up to ${MG.loadoutSize} spells.`;
  for (const sp of slots) {
    if (!sp || !c.knowledge.vectors[sp.vector]) return 'Unknown Vector.';
    if (!c.knowledge.forms[sp.form]) return 'Unknown Form.';
    if (!allowedMagnitudes(c, sp.vector, sp.form, tier).includes(sp.magnitude))
      return `${D.vectors[sp.vector].name} ${D.forms[sp.form].name} cannot be cast at ${sp.magnitude} yet.`;
  }
  return null;
}

export function setLoadout(s, c, slots) {
  const err = loadoutError(c, slots, knowledgeTier(s));
  if (err) return err;
  c.loadout = slots.map((sp) => ({ vector: sp.vector, form: sp.form, magnitude: sp.magnitude }));
  return null;
}

// ---------------- the Stability Check ----------------
/**
 * A cast costing more than half the caster's current FP. Returns { roll, dc, margin, result, mul }:
 * result is 'success', 'reduced', 'misfire', 'backlash' or 'surge'; mul is how much of the spell
 * counts (1, 0.7 or 0). `tier` is the Knowledge Tier. Rolls one d20.
 */
export function stabilityCheck(c, cost, fpNow, tier) {
  const I = MG.instability;
  const intMod = Math.floor((c.stats.int - I.statPivot) / 2);
  const wilMod = Math.max(0, Math.floor((c.stats.wil - I.statPivot) / 2));
  const pct = (cost / fpNow) * 100;
  let dc = I.dcBase + Math.round((pct - 50) / 2) - wilMod;
  dc = Math.round(dc * C.prodEffect(c, 'dcMul'));
  const auto = C.sumEffect(c, 'autoSucceedDc');
  const roll = 1 + Math.floor(rand() * I.die) + intMod + I.tierBonus * tier;
  if ((auto && dc <= auto) || roll >= dc) return { roll, dc, margin: 0, result: 'success', mul: 1 };
  const margin = dc - roll;
  const row = I.results.find((r) => r.upTo === undefined || margin <= r.upTo);
  return { roll, dc, margin, result: row.kind, mul: row.kind === 'reduced' ? row.mul : 0 };
}

/** The failure table on its own, for a margin the roll missed by. */
export function failureResult(margin) {
  return MG.instability.results.find((r) => r.upTo === undefined || margin <= r.upTo).kind;
}

/** A Wild Surge: a random Vector at Minor, helping or hurting with even odds. Returns its signed value. */
export function wildSurge(enemy) {
  const vs = Object.keys(D.vectors);
  const v = vs[Math.floor(rand() * vs.length)];
  const sign = rand() < 0.5 ? 1 : -1;
  return { vector: v, value: sign * MAG[MG.instability.results.at(-1).magnitude] * matchup(v, enemy) };
}

// ---------------- caster growth ----------------
function tableWithMods(c, kind) {
  const T = D.growthTables[kind];
  const base = { ...(T[c.cls] || T.default) };
  const spec = D.specializations[c.specialization];
  if (kind === 'vectors' && spec)
    for (const [v, w] of Object.entries(spec.rollMods || {})) base[v] = (base[v] || 0) + w;
  return base;
}

/** Weights for a Vector ('vectors') or Form ('forms') roll, limited to the era's tier. */
export function casterRollWeights(c, kind, tier) {
  const G = D.talents.growth;
  const defs = kind === 'vectors' ? D.vectors : D.forms;
  const known = c.knowledge[kind];
  const table = tableWithMods(c, kind);
  const open = Object.keys(table).filter((k) => defs[k] && defs[k].tier <= tier);
  const unknownLeft = open.some((k) => !known[k]);
  const pity = c.pity >= G.pityDryLevels && unknownLeft;
  const intSteps = Math.max(0, Math.floor((c.stats.int - G.intPivot) / G.intPointsPerStep));
  const w = {};
  for (const k of open) {
    if (pity && known[k]) continue;
    let x = table[k];
    if (!known[k]) {
      x *= 1 + intSteps * G.intWeightStep;
      if (kind === 'vectors') x *= C.prodEffect(c, 'newVectorMul');
    }
    w[k] = x;
  }
  return { weights: w, pity };
}

/** One caster roll: learn a Vector or Form, or raise its affinity. */
export function casterRoll(c, kind, tier) {
  const { weights } = casterRollWeights(c, kind, tier);
  const k = weightedKey(weights);
  if (!k) return null;
  const known = c.knowledge[kind];
  const one = kind === 'vectors' ? 'vector' : 'form';
  if (!known[k]) {
    known[k] = 1;
    if (kind === 'vectors' && !c.vectors.includes(k)) c.vectors.push(k);
    return { kind: 'new-' + one, [one]: k };
  }
  known[k] = Math.min(MG.affinityCap, known[k] + 1);
  return { kind: one + '-up', [one]: k, affinity: known[k] };
}

/** A caster's Breakthrough: the next Magnitude for the pair they cast most, else their strongest pair. */
export function magnitudeBreakthrough(c) {
  const kn = c.knowledge;
  let pair = null;
  for (const [p, n] of Object.entries(kn.pairUses || {}))
    if (n > 0 && (!pair || n > kn.pairUses[pair])) pair = p;
  if (!pair) {
    const top = (o) => Object.keys(o).sort((a, b) => o[b] - o[a])[0];
    const v = top(kn.vectors);
    const f = top(kn.forms);
    if (!v || !f) return null;
    pair = spellPair(v, f);
  }
  const [v, f] = pair.split('+');
  const next = ORDER[Math.min(ORDER.length - 1, magnitudeRank(unlockedMagnitude(c, v, f)) + 1)];
  kn.magnitudes[pair] = next;
  return { pair, magnitude: next };
}

// ---------------- specializations ----------------
export function specializationError(s, c, key) {
  const sp = D.specializations[key];
  const at = MG.specializeAt;
  if (!sp) return 'Unknown specialization.';
  if (c.specialization) return 'Already specialized.';
  if (!sp.from.includes(c.cls))
    return `${sp.name} grows from ${sp.from.map((k) => D.classes[k].name).join(' or ')}.`;
  if (knowledgeTier(s) < at.tier) return `Needs Knowledge Tier ${at.tier}.`;
  if (c.level < at.level) return `Needs level ${at.level}.`;
  return null;
}

/** Specializes a character. A non-caster becomes a caster with the specialization's favored Vector. */
export function specialize(s, c, key) {
  const err = specializationError(s, c, key);
  if (err) return err;
  const sp = D.specializations[key];
  const wasCaster = isCaster(c);
  c.specialization = key;
  if (!wasCaster) {
    const tier = knowledgeTier(s);
    const v = Object.keys(sp.rollMods)
      .filter((k) => D.vectors[k].tier <= tier)
      .sort((a, b) => sp.rollMods[b] - sp.rollMods[a])[0];
    const f = sp.startForm && D.forms[sp.startForm].tier <= tier ? sp.startForm : MG.startForm;
    c.knowledge.vectors[v] = 1;
    c.knowledge.forms[f] = 1;
    if (!c.vectors.includes(v)) c.vectors.push(v);
    c.loadout = [{ vector: v, form: f, magnitude: ORDER[0] }];
  }
  return null;
}
