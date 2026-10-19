// Crafting minigames and Invention, the pure side: which minigame plays, the quality a performance
// earns, the Vector pool, and the Property Bank rolls. The minigames themselves are UI plugins
// (src/ui/minigames). Rules: docs/SPEC.md, Systems reference, Crafting and Invention (M16).
import { D } from '../core/content.js';
import { rand } from '../core/rng.js';
import { dist } from '../core/geometry.js';
import { canAfford, spend } from './inventory.js';
import { reqsMet } from './tech.js';
import { knowledgeTier } from './magic.js';
import { tryCraft } from './crafting.js';
import { createItem, equip, itemName } from './gear.js';
import { log, changed, cue } from './log.js';

const MG = D.minigames;
const INV = MG.invention;

/** The quality a minigame performance (0 to 1) earns. */
export function qualityFor(performance) {
  for (const row of MG.quality) if (row.below === undefined || performance < row.below) return row.quality;
  return MG.quality.at(-1).quality;
}

/** True for a recipe that makes a piece of gear (and so plays a minigame). */
export function isGearRecipe(key) {
  return D.recipes[key]?.type === 'item';
}

/** The minigame and difficulty a gear recipe plays. */
export function gearMinigame(key) {
  const r = D.recipes[key];
  const slot = D.items[r.item].slot;
  return { minigame: r.minigame || MG.bySlot[slot], difficulty: r.difficulty || MG.defaultDifficulty };
}

/**
 * Crafts a gear recipe after its minigame (or rushed): pays, makes the piece at the earned quality.
 * Returns the new piece, or null if it could not be made.
 */
export function finishCraft(s, key, performance, { rushed = false } = {}) {
  const quality = rushed ? MG.rushQuality : qualityFor(performance);
  const before = s.nextItemId;
  if (!tryCraft(s, key, { quality })) return null;
  return findItem(s, 'i' + before);
}

function findItem(s, id) {
  return (
    s.armory.find((it) => it.id === id) ||
    Object.values(s.player.gear).find((it) => it && it.id === id) ||
    null
  );
}

// ---------------- Invention ----------------
export function categoryOf(itemBase) {
  return D.items[itemBase].slot === 'weapon' ? 'weapon' : 'armor';
}

/** Vector points to spend: 6 + 4 x Knowledge Tier. */
export function vectorPool(s) {
  return INV.poolBase + INV.poolPerTier * knowledgeTier(s);
}

/** Vectors the era allows for Invention. */
export function inventionVectors(s) {
  const tier = knowledgeTier(s);
  return Object.keys(D.vectors).filter((v) => D.vectors[v].tier <= tier);
}

const total = (vectors) => Object.values(vectors).reduce((a, b) => a + (b || 0), 0);
const distinct = (vectors) => Object.values(vectors).filter((v) => v > 0).length;

/** Complexity = points / 10 + 3 per Vector beyond the first. */
export function complexity(vectors) {
  return total(vectors) / 10 + INV.extraVectorComplexity * Math.max(0, distinct(vectors) - 1);
}

export function difficultyOf(vectors) {
  return Math.max(1, Math.min(10, Math.round(complexity(vectors))));
}

/**
 * The minigame an allocation plays: the first archetype rule that matches and whose minigame is
 * registered (`has(key)`), else the default.
 */
export function chooseArchetype(vectors, category, has = () => true) {
  const sum = total(vectors) || 1;
  const keys = Object.keys(vectors);
  const dominant = keys.reduce((best, v) => ((vectors[v] || 0) > (vectors[best] || 0) ? v : best), keys[0]);
  const ratio = (vectors[dominant] || 0) / sum;
  const spread = distinct(vectors);
  for (const r of MG.archetypeRules) {
    if (!has(r.minigame)) continue;
    if (r.distinctVectorsAtLeast && spread < r.distinctVectorsAtLeast) continue;
    if (r.dominanceBelow !== undefined && ratio >= r.dominanceBelow) continue;
    if (r.dominantVectorIn && !r.dominantVectorIn.includes(dominant)) continue;
    if (r.targetCategoryIn && !r.targetCategoryIn.includes(category)) continue;
    return r.minigame;
  }
  return MG.archetypeDefault;
}

export function benchInReach(s) {
  return s.buildings.some(
    (b) => D.buildings[b.type]?.invention && dist(b, s.player) < D.game.interact.benchRange,
  );
}

/** Knowledge an Invention costs: 5 per Research Point. */
export function inventionKp(plan) {
  return (plan.researchPoints || 0) * INV.kpPerResearchPoint;
}

/**
 * Checks an Invention plan { recipe, vectors, researchPoints }. Returns a message, or null if it
 * can go ahead.
 */
export function inventionError(s, plan) {
  const r = D.recipes[plan.recipe];
  if (!r || r.type !== 'item') return 'Choose a piece of gear to design.';
  if (!reqsMet(s, r.requires)) return 'You do not know how to make that yet.';
  if (!benchInReach(s)) return 'Stand at an Invention Bench.';
  const allowed = inventionVectors(s);
  for (const [v, n] of Object.entries(plan.vectors || {})) {
    if (n < 0 || !Number.isInteger(n)) return 'Vector points are whole numbers.';
    if (n > 0 && !allowed.includes(v)) return `${D.vectors[v]?.name || v} is beyond your Knowledge Tier.`;
  }
  if (total(plan.vectors || {}) < 1) return 'Spend at least one Vector point.';
  if (total(plan.vectors) > vectorPool(s)) return `You have ${vectorPool(s)} Vector points.`;
  const rp = plan.researchPoints || 0;
  if (rp < 0 || rp > INV.maxResearchPoints) return `Up to ${INV.maxResearchPoints} Research Points.`;
  if (s.kp < inventionKp(plan)) return `That needs ${inventionKp(plan)} Knowledge.`;
  if (!canAfford(s, r.costs)) return 'Not enough materials.';
  return null;
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] || 0;
    const y = b[k] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function tierFor(cx, performance) {
  const rows = INV.tierByComplexity;
  let i = rows.findIndex((r) => r.below === undefined || cx < r.below);
  if (performance > INV.tierBoostAbove) i = Math.min(rows.length - 1, i + 1);
  return rows[i].tier;
}

/** Property weights for an allocation: weight x max(0.05, cosine) x (1 + performance), for eligible ones. */
export function propertyWeights(vectors, category, performance) {
  const sum = total(vectors) || 1;
  const norm = Object.fromEntries(Object.entries(vectors).map(([k, v]) => [k, v / sum]));
  const w = {};
  for (const [id, p] of Object.entries(D.properties)) {
    if (!p.appliesTo.includes(category)) continue;
    if (!Object.entries(p.threshold).every(([v, min]) => (vectors[v] || 0) >= min)) continue;
    w[id] = p.weight * Math.max(0.05, cosine(norm, p.signature)) * (1 + performance);
  }
  return w;
}

/** Rolls properties: 1 + floor(3 x performance) + floor(RP / 5) draws without repeats. */
export function rollProperties(vectors, category, performance, researchPoints = 0) {
  const n =
    1 +
    Math.floor(INV.rollsPerformance * performance) +
    Math.floor(researchPoints / INV.researchPointsPerRoll);
  const pool = propertyWeights(vectors, category, performance);
  const tier = tierFor(complexity(vectors), performance);
  const out = [];
  for (let i = 0; i < n; i++) {
    const keys = Object.keys(pool);
    if (!keys.length) break;
    const sum = keys.reduce((a, k) => a + pool[k], 0);
    let r = rand() * sum;
    let pick = keys[keys.length - 1];
    for (const k of keys) {
      r -= pool[k];
      if (r < 0) {
        pick = k;
        break;
      }
    }
    delete pool[pick];
    out.push({ id: pick, tier });
  }
  return out;
}

/**
 * Finishes an Invention: pays materials and Knowledge, rolls properties and makes the piece.
 * Returns the piece, or null with a log message if the plan no longer works.
 */
export function finishInvention(s, plan, performance) {
  const err = inventionError(s, plan);
  if (err) {
    log(s, err);
    return null;
  }
  const r = D.recipes[plan.recipe];
  spend(s, r.costs);
  s.kp -= inventionKp(plan);
  const props = rollProperties(plan.vectors, categoryOf(r.item), performance, plan.researchPoints || 0);
  const it = createItem(s, r.item, qualityFor(performance), props);
  const slot = D.items[r.item].slot;
  if (!s.player.gear[slot]) equip(s, s.player, slot, it.id);
  log(
    s,
    `Invented ${itemName(it)}${props.length ? ' (' + props.map((p) => D.properties[p.id].name).join(', ') + ')' : ''}.`,
  );
  cue('craft');
  changed('kp');
  changed('inventory');
  changed('roster');
  return it;
}
