// Growth rolls on level-up: a Primary roll every level, a Secondary roll on even levels, and a
// Breakthrough every 5th level, with pity after 3 levels without a new talent.
// Rules: docs/SPEC.md, Systems reference, Growth rolls.
import { D } from '../core/content.js';
import { weightedKey } from '../core/rng.js';
import { isCaster, casterRoll, magnitudeBreakthrough } from './magic.js';

const G = D.talents.growth;

/** The objective a character has run most, falling back to their class's strongest skill. */
export function mostRunObjective(c) {
  const objectives = Object.keys(D.mission.objectives);
  const usage = c.usage || {};
  let best = null;
  for (const o of objectives) if ((usage[o] || 0) > 0 && (!best || usage[o] > usage[best])) best = o;
  if (best) return best;
  const skill = D.classes[c.cls].skill || {};
  for (const o of objectives) if ((skill[o] || 0) > (skill[best] || 0)) best = o;
  return best || objectives[0];
}

export function addProficiency(c, objective, n = 1) {
  c.skills[objective] = (c.skills[objective] || 0) + n;
}

/** Weights for one roll. `ctx` may carry { lean: 'protective', mentorTalents: Set }. */
export function rollWeights(c, ctx = {}) {
  const table = D.talents.tables[c.cls] || {};
  const known = new Set(c.talents);
  const intSteps = Math.max(0, Math.floor((c.stats.int - G.intPivot) / G.intPointsPerStep));
  const unknownLeft = Object.keys(table).some((t) => !known.has(t));
  const pity = c.pity >= G.pityDryLevels && unknownLeft;
  const w = {};
  for (const [t, base] of Object.entries(table)) {
    if (pity && known.has(t)) continue; // pity: only something new
    let x = base;
    if (!known.has(t)) x *= 1 + intSteps * G.intWeightStep;
    if (ctx.lean && D.talents.talents[t].tags?.includes(ctx.lean)) x *= G.lifeDebtLean;
    if (ctx.mentorTalents?.has(t)) x *= D.bonds.events.mentor.weightMul;
    w[t] = x;
  }
  return { weights: w, pity };
}

/** One Primary or Secondary roll: learn a talent, rank one up, or past rank 3, gain proficiency. */
export function growthRoll(c, ctx = {}) {
  const { weights } = rollWeights(c, ctx);
  const t = weightedKey(weights);
  if (!t) return null;
  if (!c.talents.includes(t)) {
    c.talents.push(t);
    c.talentRanks[t] = 1;
    return { kind: 'new', talent: t };
  }
  const rank = c.talentRanks[t] || 1;
  if (rank < G.maxRank) {
    c.talentRanks[t] = rank + 1;
    return { kind: 'rank', talent: t, rank: rank + 1 };
  }
  const objective = D.talents.talents[t].objective || mostRunObjective(c);
  addProficiency(c, objective);
  return { kind: 'proficiency', talent: t, objective };
}

/**
 * The growth rolls for reaching `level`. A caster's Primary roll is on their Vector table and their
 * Secondary on their Form table; everyone else rolls talents. Updates pity and clears any lean.
 * `ctx.tier` is the settlement's Knowledge Tier (1 if absent).
 */
export function levelRolls(c, level, ctx = {}) {
  const rolls = [];
  const caster = isCaster(c);
  const tier = ctx.tier || 1;
  const once = { ...ctx };
  rolls.push(caster ? casterRoll(c, 'vectors', tier) : growthRoll(c, once));
  once.lean = null; // a Life Debt leans only the next roll
  if (level % G.secondaryEvery === 0) rolls.push(caster ? casterRoll(c, 'forms', tier) : growthRoll(c, once));
  if (ctx.lean) c.lean = null;
  let breakthrough = null;
  if (level % G.breakthroughEvery === 0) {
    const m = caster ? magnitudeBreakthrough(c) : null;
    if (m) breakthrough = m;
    else {
      const objective = mostRunObjective(c);
      addProficiency(c, objective);
      breakthrough = { objective };
    }
  }
  const learned = rolls.some(
    (r) => r && (r.kind === 'new' || r.kind === 'new-vector' || r.kind === 'new-form'),
  );
  c.pity = learned ? 0 : c.pity + 1;
  return { rolls: rolls.filter(Boolean), breakthrough };
}
