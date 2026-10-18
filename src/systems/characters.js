// The roster: character records, trait and talent effects, gear, XP and growth, permadeath.
import { D } from '../core/content.js';
import { rand, weightedKey, pick } from '../core/rng.js';
import { seedBond, deleteBondsOf } from './bonds.js';

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

/** Every trait and talent definition a character has, traits first. */
export function traitDefs(c) {
  return c.traits
    .map((t) => D.traits.traits[t])
    .filter(Boolean)
    .concat(c.talents.map((t) => D.talents.talents[t]).filter(Boolean));
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

export function arcanePower(c) {
  const cl = D.classes[c.cls];
  let a = (cl.arcaneBase || 0) + sumEffect(c, 'arcane');
  if (cl.arcane) a += Math.floor((c.stats.int + c.stats.wil) / 3);
  return a;
}

export function xpToNext(level) {
  return G.xpPerLevel * level;
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
  };
  if (cl.vectorPool) c.vectors = [pick(cl.vectorPool)];
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
function rollTalent(c) {
  const table = Object.assign({}, D.talents.tables[c.cls] || {});
  c.talents.forEach((t) => delete table[t]);
  if (!Object.keys(table).length) return null;
  return weightedKey(table);
}

/** Adds XP, applies any level-ups, and returns what happened for the report. */
export function addXp(c, amount) {
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
    // The roll always happens; after pityDryLevels levels without a talent, it cannot miss.
    let talent = null;
    if (rand() < G.talentRollChance || c.pity >= G.pityDryLevels) {
      talent = rollTalent(c);
      if (talent) {
        c.talents.push(talent);
        c.pity = 0;
      } else c.pity++;
    } else c.pity++;
    ups.push({ level: c.level, gains, talent });
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
