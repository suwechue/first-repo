// Axiom Magic (M10): Knowledge Tiers, spells, Focus Points, the Stability Check and its failure
// table, casting in fights, caster growth, specializations and the loadout in the Hall preview.
import { describe, it, expect, afterEach } from 'vitest';
import { D } from '../src/core/content.js';
import * as Mg from '../src/systems/magic.js';
import * as Ms from '../src/systems/missions.js';
import { build } from '../src/systems/characters.js';
import { levelRolls } from '../src/systems/growth.js';
import { setBond } from '../src/systems/bonds.js';
import { migrate } from '../src/core/migrations.js';
import {
  freshState,
  constantRandom,
  scriptedRandom,
  restoreRandom,
  readyForMissions,
  starter,
} from './helpers/setup.js';

afterEach(restoreRandom);

const R = 'verdant_wilds';
const MAG = D.knowledgeTiers.magnitudes;

function mage(s, vector = 'heat', stats = {}) {
  const c = build(s, {
    name: 'Ada Vane',
    cls: 'mage',
    stats: { str: 3, con: 5, dex: 3, int: 10, per: 3, wil: 8, ...stats },
    traits: [],
  });
  c.vectors = [vector];
  c.knowledge.vectors = { [vector]: 1 };
  c.knowledge.forms = { bolt: 1 };
  c.loadout = [{ vector, form: 'bolt', magnitude: 'minor' }];
  return c;
}

/** The d20 face from a rand() value: 1 + floor(r x 20). Returns the r that rolls `face`. */
const d20 = (face) => (face - 1) / 20 + 0.001;

describe('Knowledge Tiers and Magnitudes', () => {
  it('Tier 1 from the start, Tier 2 and 3 by research; caps Standard, Major, Grand', () => {
    const s = freshState();
    expect(Mg.knowledgeTier(s)).toBe(1);
    expect(Mg.magnitudeCap(1)).toBe('standard');
    s.tech.vector_dynamics = true;
    expect(Mg.knowledgeTier(s)).toBe(2);
    expect(Mg.magnitudeCap(2)).toBe('major');
    s.tech.conservation_axioms = true;
    expect(Mg.knowledgeTier(s)).toBe(3);
    expect(Mg.magnitudeCap(3)).toBe('grand');
    expect(MAG).toEqual({ minor: 5, standard: 10, major: 20, grand: 35 });
  });

  it("a spell's Magnitude is capped by its pair's unlock and the era", () => {
    const s = freshState();
    const m = mage(s);
    expect(Mg.allowedMagnitudes(m, 'heat', 'bolt', 1)).toEqual(['minor']);
    m.knowledge.magnitudes['heat+bolt'] = 'grand';
    expect(Mg.allowedMagnitudes(m, 'heat', 'bolt', 1)).toEqual(['minor', 'standard']);
    expect(Mg.allowedMagnitudes(m, 'heat', 'bolt', 2)).toEqual(['minor', 'standard', 'major']);
    expect(Mg.allowedMagnitudes(m, 'heat', 'bolt', 3)).toEqual(['minor', 'standard', 'major', 'grand']);
  });
});

describe('Spells and Focus Points', () => {
  it('FP max = 5 + 2 x Level + WIL + INT, plus 1 per level with Arcane Affinity', () => {
    const s = freshState();
    const m = mage(s);
    m.level = 4;
    expect(Mg.fpMax(m)).toBe(5 + 8 + 8 + 10);
    m.talents = ['arcane_affinity'];
    expect(Mg.fpMax(m)).toBe(5 + 8 + 8 + 10 + 4);
  });

  it('SpellValue = Magnitude + floor((Vector affinity + Form affinity) / 2); cost is the Magnitude', () => {
    const s = freshState();
    const m = mage(s);
    m.knowledge.vectors.heat = 4;
    m.knowledge.forms.bolt = 3;
    const sp = { vector: 'heat', form: 'bolt', magnitude: 'standard' };
    expect(Mg.spellValue(m, sp)).toBe(10 + 3);
    expect(Mg.spellCost(m, sp)).toBe(10);
  });

  it('a loadout holds up to 3 known spells at allowed Magnitudes', () => {
    const s = freshState();
    const m = mage(s);
    const sp = { vector: 'heat', form: 'bolt', magnitude: 'minor' };
    expect(Mg.setLoadout(s, m, [sp, sp, sp])).toBeNull();
    expect(Mg.setLoadout(s, m, [sp, sp, sp, sp])).toMatch(/up to 3/);
    expect(Mg.setLoadout(s, m, [{ ...sp, vector: 'cold' }])).toMatch(/Unknown Vector/);
    expect(Mg.setLoadout(s, m, [{ ...sp, form: 'burst' }])).toMatch(/Unknown Form/);
    expect(Mg.setLoadout(s, m, [{ ...sp, magnitude: 'standard' }])).toMatch(/cannot be cast/);
    expect(Mg.setLoadout(s, starter(s, 'Kael'), [])).toMatch(/Only casters/);
  });

  it("a caster's loadout changes their Combat Power in the Hall preview", () => {
    const s = readyForMissions(freshState());
    const m = mage(s);
    s.roster.push(m);
    const k = starter(s, 'Kael');
    setBond(s, k.id, m.id, 0);
    const before = Ms.preview(s, [k.id, m.id], R, 'fringe', 'explore');
    m.knowledge.magnitudes['heat+bolt'] = 'standard';
    const sp = { vector: 'heat', form: 'bolt', magnitude: 'standard' };
    expect(Mg.setLoadout(s, m, [sp, sp])).toBeNull();
    const after = Ms.preview(s, [k.id, m.id], R, 'fringe', 'explore');
    expect(after.cp - before.cp).toBe((10 + 1) * 2 - (5 + 1));
    expect(after.pTypical).toBeGreaterThan(before.pTypical);
  });
});

describe('The Stability Check', () => {
  it('Roll = d20 + INTmod + 2 x Tier; DC = 10 + round((FPspent% - 50) / 2) - WILmod', () => {
    const s = freshState();
    const m = mage(s, 'heat', { int: 14, wil: 12 }); // INTmod 2, WILmod 1
    // 20 FP spent of 25 is 80%: DC = 10 + 15 - 1 = 24.
    constantRandom(d20(12));
    const r = Mg.stabilityCheck(m, 20, 25, 1);
    expect(r.dc).toBe(24);
    expect(r.roll).toBe(12 + 2 + 2);
    expect(r.margin).toBe(24 - 16);
    constantRandom(d20(20));
    expect(Mg.stabilityCheck(m, 20, 25, 3)).toMatchObject({ roll: 28, result: 'success', mul: 1 });
  });

  it('the failure table: 1-3 reduced (0.7), 4-6 misfire, 7-9 backlash, 10+ wild surge', () => {
    expect([1, 3].map(Mg.failureResult)).toEqual(['reduced', 'reduced']);
    expect([4, 6].map(Mg.failureResult)).toEqual(['misfire', 'misfire']);
    expect([7, 9].map(Mg.failureResult)).toEqual(['backlash', 'backlash']);
    expect([10, 25].map(Mg.failureResult)).toEqual(['surge', 'surge']);
    const s = freshState();
    const m = mage(s); // INTmod 0, WILmod 0; 10 of 10 FP: DC 10 + 25 = 35, roll = face + 2
    const at = (face) => {
      constantRandom(d20(face));
      return Mg.stabilityCheck(m, 10, 10, 1);
    };
    expect(at(20)).toMatchObject({ margin: 13, result: 'surge', mul: 0 });
    // 8 of 10 FP: DC = 10 + round(30 / 2) = 25. A face of 19 rolls 21: margin 4.
    constantRandom(d20(19));
    const r = Mg.stabilityCheck(m, 8, 10, 1);
    expect(r.dc).toBe(25);
    expect(r.margin).toBe(25 - 21);
    expect(r.result).toBe('misfire');
    constantRandom(d20(20)); // roll 22 vs 25: margin 3
    expect(Mg.stabilityCheck(m, 8, 10, 1)).toMatchObject({ result: 'reduced', mul: 0.7 });
    constantRandom(d20(16)); // roll 18 vs 25: margin 7
    expect(Mg.stabilityCheck(m, 8, 10, 1)).toMatchObject({ result: 'backlash', mul: 0 });
  });

  it("an Axiom Monk's DC is 20% lower, and a DC of 10 or less always holds", () => {
    const s = freshState();
    const m = mage(s);
    m.specialization = 'axiom_monk';
    constantRandom(d20(1));
    expect(Mg.stabilityCheck(m, 8, 10, 1).dc).toBe(Math.round(25 * 0.8));
    // 6 of 10 FP: DC 10 + 5 = 15, x0.8 = 12: still above 10, and a 1 misses
    expect(Mg.stabilityCheck(m, 6, 10, 1).result).not.toBe('success');
    // 5.2 of 10: 10 + round(0.1) = 10, x0.8 = 8: automatic
    expect(Mg.stabilityCheck(m, 5.2, 10, 1).result).toBe('success');
    expect(Mg.spellCost(m, { vector: 'heat', form: 'bolt', magnitude: 'standard' })).toBe(8);
  });
});

describe('Casting in a mission', () => {
  it('casts at a cost in FP, counts pair uses, and holds back big casts while winning', () => {
    const s = readyForMissions(freshState());
    const m = mage(s);
    s.roster.push(m);
    const k = starter(s, 'Kael');
    setBond(s, k.id, m.id, 0);
    m.knowledge.magnitudes['heat+bolt'] = 'standard';
    const sp = { vector: 'heat', form: 'bolt', magnitude: 'standard' };
    Mg.setLoadout(s, m, [sp, sp, sp]);
    const fp = Mg.fpMax(m); // 5 + 2 + 8 + 10 = 25: two Standard casts at 40% each, the third would be 100%
    expect(fp).toBe(25);
    // 0.39: every step a fight, every fight won, nobody hurt
    constantRandom(0.39);
    const rep = Ms.launch(s, {
      realm: R,
      zone: 'fringe',
      objective: 'explore',
      squad: [k.id, m.id],
      retreat: 25,
    }).report;
    expect(rep.kills.length).toBe(5);
    // Fight 1: the first cast is 10 of 25 FP (40%, safe). Every later cast is 10 of the 15 left (67%):
    // risky, and the squad is winning, so the mage holds it back for the rest of the mission.
    expect(m.knowledge.pairUses['heat+bolt']).toBe(1);
  });

  it('a losing squad risks a big cast; a backlash wounds the caster', () => {
    const s = readyForMissions(freshState());
    const m = mage(s);
    s.roster.push(m);
    const k = starter(s, 'Kael');
    setBond(s, k.id, m.id, 0);
    s.realms[R].warrens.explored = 60;
    m.knowledge.magnitudes['heat+bolt'] = 'standard';
    m.stats.int = 10;
    m.stats.wil = 1; // FP 5 + 2 + 1 + 10 = 18: a Standard cast is 56%, so it needs a check
    Mg.setLoadout(s, m, [{ vector: 'heat', form: 'bolt', magnitude: 'standard' }]);
    // Old Grove step 1: an encounter with its first enemy; the squad is losing, so the mage risks the cast.
    const dc = 10 + Math.round(((10 / 18) * 100 - 50) / 2);
    expect(dc).toBe(13);
    // Roll = face + INTmod 0 + 2: a face of 3 rolls 5, missing DC 13 by 8, a backlash.
    scriptedRandom([0, 0, d20(3)], 0.999);
    const rep = Ms.launch(s, {
      realm: R,
      zone: 'old_grove',
      objective: 'explore',
      squad: [k.id, m.id],
    }).report;
    expect(rep.events.some((e) => e.includes('backlashes'))).toBe(true);
    expect(rep.injured).toContain(m.name);
  });
});

describe('Caster growth', () => {
  it('Primary rolls Vectors, Secondary rolls Forms, and only up to the era', () => {
    const s = freshState();
    const m = mage(s);
    constantRandom(0.999); // the last entry in each table
    const tier1 = Mg.casterRollWeights(m, 'vectors', 1).weights;
    expect(Object.keys(tier1).sort()).toEqual(['cold', 'force', 'heat', 'motion']);
    expect(Object.keys(Mg.casterRollWeights(m, 'vectors', 2).weights)).toContain('binding');
    const { rolls } = levelRolls(m, 2, { tier: 1 });
    expect(rolls.map((r) => r.kind)).toEqual(['new-vector', 'new-form']);
    expect(m.talents).toEqual([]); // casters do not roll talents
    expect(m.vectors.length).toBe(2);
  });

  it('a known Vector gains affinity; Mana Sensitive and INT favor new ones', () => {
    const s = freshState();
    const m = mage(s);
    constantRandom(0); // heat, the first in the table, which is already known
    expect(Mg.casterRoll(m, 'vectors', 1)).toEqual({ kind: 'vector-up', vector: 'heat', affinity: 2 });
    const base = Mg.casterRollWeights(m, 'vectors', 1).weights.cold;
    m.traits = ['mana_sensitive'];
    expect(Mg.casterRollWeights(m, 'vectors', 1).weights.cold).toBeCloseTo(base * 1.1, 10);
    m.pity = 3;
    expect(Mg.casterRollWeights(m, 'vectors', 1).weights.heat).toBeUndefined();
  });

  it('a Breakthrough raises the Magnitude of the pair cast most', () => {
    const s = freshState();
    const m = mage(s);
    m.knowledge.forms.burst = 1;
    m.knowledge.pairUses = { 'heat+bolt': 2, 'heat+burst': 7 };
    expect(Mg.magnitudeBreakthrough(m)).toEqual({ pair: 'heat+burst', magnitude: 'standard' });
    expect(Mg.magnitudeBreakthrough(m)).toEqual({ pair: 'heat+burst', magnitude: 'major' });
    m.knowledge.pairUses = {};
    expect(Mg.magnitudeBreakthrough(m).pair).toBe('heat+bolt'); // strongest pair when nothing is cast yet
  });
});

describe('Specializations', () => {
  it('need Knowledge Tier 2 and level 8, the right class, and happen once', () => {
    const s = freshState();
    const m = mage(s);
    expect(Mg.specializationError(s, m, 'kinetic_logician')).toMatch(/Tier 2/);
    s.tech.vector_dynamics = true;
    expect(Mg.specializationError(s, m, 'kinetic_logician')).toMatch(/level 8/);
    m.level = 8;
    expect(Mg.specializationError(s, m, 'runeforger')).toMatch(/grows from/);
    expect(Mg.specialize(s, m, 'kinetic_logician')).toBeNull();
    expect(Mg.specializationError(s, m, 'axiom_monk')).toMatch(/Already/);
    // roll modifiers add to the Vector table
    const w = Mg.casterRollWeights(m, 'vectors', 2).weights;
    expect(w.force).toBeGreaterThan(D.growthTables.vectors.mage.force);
  });

  it('a specialized non-caster becomes a caster with a starting spell', () => {
    const s = freshState();
    s.tech.vector_dynamics = true;
    const l = starter(s, 'Lin'); // a shaman
    l.level = 8;
    expect(Mg.isCaster(l)).toBe(false);
    expect(Mg.specialize(s, l, 'axiom_monk')).toBeNull();
    expect(Mg.isCaster(l)).toBe(true);
    expect(l.loadout).toEqual([{ vector: 'light', form: 'bolt', magnitude: 'minor' }]);
    expect(Mg.repertoire(l)).toBeGreaterThan(0);
  });
});

describe('Save v4', () => {
  it('a v3 mage gains a spellbook with their Vector and the first Form', () => {
    const v3 = {
      v: 3,
      player: {},
      roster: [
        { id: 'c9', cls: 'mage', vectors: ['cold'], talents: [] },
        { id: 'c8', cls: 'warrior', vectors: [], talents: [] },
      ],
    };
    const { data } = migrate(v3);
    expect(data.v).toBe(5); // and on through later versions
    expect(data.roster[0].knowledge.vectors).toEqual({ cold: 1 });
    expect(data.roster[0].loadout).toEqual([{ vector: 'cold', form: 'bolt', magnitude: 'minor' }]);
    expect(data.roster[1].loadout).toEqual([]);
  });
});
