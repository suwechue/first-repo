// Character depth (M9): growth rolls, talent ranks, proficiency, and the full bond rules and events.
import { describe, it, expect, afterEach } from 'vitest';
import { D } from '../src/core/content.js';
import * as C from '../src/systems/characters.js';
import * as Ms from '../src/systems/missions.js';
import { growthRoll, levelRolls, rollWeights, mostRunObjective } from '../src/systems/growth.js';
import {
  getBond,
  setBond,
  baseGain,
  traitCompat,
  missionBondGain,
  bondMeta,
  hasFlag,
  recordSharedMission,
  mentorTalents,
} from '../src/systems/bonds.js';
import { newDay } from '../src/systems/clock.js';
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

function fresh(s, cls = 'warrior', stats = {}) {
  return C.build(s, {
    name: 'Tess Test',
    cls,
    stats: { str: 5, con: 5, dex: 5, int: 5, per: 5, wil: 5, ...stats },
    traits: [],
  });
}

describe('Growth rolls', () => {
  it('a Primary roll every level, a Secondary on even levels, a Breakthrough every 5th', () => {
    const s = freshState(1);
    const c = fresh(s);
    const ups = C.addXp(c, 20 + 40 + 60 + 80).ups; // levels 2, 3, 4, 5
    expect(ups.map((u) => u.level)).toEqual([2, 3, 4, 5]);
    expect(ups.map((u) => u.rolls.length)).toEqual([2, 1, 2, 1]);
    expect(ups.map((u) => !!u.breakthrough)).toEqual([false, false, false, true]);
    // 6 rolls plus one breakthrough
    const ranks = Object.values(c.talentRanks).reduce((a, b) => a + b, 0);
    const prof = Object.values(c.skills).reduce((a, b) => a + b, 0);
    expect(ranks + prof).toBe(6 + 1);
  });

  it('learns an unknown talent at rank 1, ranks a known one up to 3, then gives proficiency', () => {
    const s = freshState(2);
    const c = fresh(s);
    constantRandom(0); // always the first talent in the warrior table: Battle Instinct
    expect(Object.keys(D.talents.tables.warrior)[0]).toBe('battle_instinct');
    expect(growthRoll(c)).toEqual({ kind: 'new', talent: 'battle_instinct' });
    expect(c.talentRanks.battle_instinct).toBe(1);
    expect(growthRoll(c)).toEqual({ kind: 'rank', talent: 'battle_instinct', rank: 2 });
    expect(growthRoll(c)).toEqual({ kind: 'rank', talent: 'battle_instinct', rank: 3 });
    // Past rank 3: proficiency. Battle Instinct favors no objective, so the most-run one (none yet:
    // the warrior's class skills are all 0, so the first objective).
    expect(growthRoll(c)).toEqual({ kind: 'proficiency', talent: 'battle_instinct', objective: 'explore' });
    expect(c.skills.explore).toBe(1);
  });

  it('proficiency from a maxed talent goes to the objective it favors, else the most-run objective', () => {
    const s = freshState(3);
    const c = fresh(s, 'scout');
    for (const t in D.talents.tables.scout) {
      c.talents.push(t);
      c.talentRanks[t] = 3;
    }
    constantRandom(0); // the first talent in the table: keen_tracking, which favors hunt
    expect(Object.keys(D.talents.tables.scout)[0]).toBe('keen_tracking');
    expect(growthRoll(c)).toMatchObject({ kind: 'proficiency', objective: 'hunt' });
    c.usage = { explore: 1, gather: 9, hunt: 2 };
    expect(mostRunObjective(c)).toBe('gather');
    c.usage = { explore: 0, gather: 0, hunt: 0 };
    expect(mostRunObjective(c)).toBe('explore'); // a scout's best class skill
  });

  it('INT above 10 adds 1% weight per 2 points to talents not yet known', () => {
    const s = freshState(4);
    const c = fresh(s, 'warrior', { int: 14 });
    c.talents = ['battle_instinct'];
    c.talentRanks = { battle_instinct: 1 };
    const { weights } = rollWeights(c);
    const T = D.talents.tables.warrior;
    expect(weights.battle_instinct).toBe(T.battle_instinct);
    expect(weights.second_wind).toBeCloseTo(T.second_wind * 1.02, 10);
    c.stats.int = 9;
    expect(rollWeights(c).weights.second_wind).toBe(T.second_wind);
  });

  it('pity: after 3 levels without a new talent, the next roll is always something new', () => {
    const s = freshState(5);
    const c = fresh(s);
    c.talents = ['battle_instinct'];
    c.talentRanks = { battle_instinct: 1 };
    c.pity = 3;
    const { weights, pity } = rollWeights(c);
    expect(pity).toBe(true);
    expect(weights.battle_instinct).toBeUndefined();
    constantRandom(0);
    expect(growthRoll(c).kind).toBe('new');
    // levelRolls resets pity on a level with something new, and counts up otherwise
    c.pity = 0;
    for (const t in D.talents.tables.warrior) {
      if (!c.talents.includes(t)) c.talents.push(t);
      c.talentRanks[t] = 1;
    }
    levelRolls(c, 3);
    expect(c.pity).toBe(1);
  });

  it('Life Debt leans the next roll toward Protective talents x3, a mentor toward theirs x1.5', () => {
    const s = freshState(6);
    const c = fresh(s);
    const T = D.talents.tables.warrior;
    expect(rollWeights(c, { lean: 'protective' }).weights.guardian).toBeCloseTo(T.guardian * 3, 10);
    expect(rollWeights(c, { mentorTalents: new Set(['second_wind']) }).weights.second_wind).toBeCloseTo(
      T.second_wind * 1.5,
      10,
    );
    c.lean = 'protective';
    levelRolls(c, 3, { lean: 'protective' });
    expect(c.lean).toBeNull();
  });

  it('a talent at rank r adds its perRank effects r - 1 times', () => {
    expect(C.talentAtRank('battle_instinct', 1).cp).toBe(3);
    expect(C.talentAtRank('battle_instinct', 3).cp).toBe(3 + 2 + 2);
    expect(C.talentAtRank('second_wind', 2).deathMul).toBeCloseTo(0.7 * 0.85, 10);
    const s = freshState(7);
    const k = starter(s, 'Kael');
    const base = Ms.combatPower(k, 'explore');
    k.talents = ['battle_instinct'];
    k.talentRanks = { battle_instinct: 2 };
    expect(Ms.combatPower(k, 'explore')).toBe(base + 5);
  });

  it('records level-ups and history', () => {
    const s = freshState(8);
    const k = starter(s, 'Kael');
    C.addXp(k, 20 + 40, s);
    expect(k.ups.length).toBe(2);
    expect(k.history.filter((h) => h.event === 'level').map((h) => h.level)).toEqual([2, 3]);
    expect(k.history[0]).toMatchObject({ event: 'joined', how: 'starter' });
  });
});

describe('Bond growth', () => {
  it('BaseGain by closeness: under 0.3 -> 3, under 0.6 -> 6, under 0.85 -> 10, else 18', () => {
    expect([0, 0.29, 0.3, 0.59, 0.6, 0.84, 0.85, 1].map(baseGain)).toEqual([3, 3, 6, 6, 10, 10, 18, 18]);
  });

  it('TraitCompat 1.25 for synergy, 0.7 for any clash, and Outcome 1 or 0.6', () => {
    const s = freshState(9);
    const [a, b] = [fresh(s), fresh(s)];
    expect(traitCompat(a, b)).toBe(1);
    a.traits = ['brave'];
    b.traits = ['stoic'];
    expect(traitCompat(a, b)).toBe(1.25);
    b.traits = ['stoic', 'cautious'];
    expect(traitCompat(a, b)).toBe(0.7);
    b.traits = ['stoic'];
    expect(missionBondGain(a, b, 0.9, true)).toBe(Math.round(18 * 1.25));
    expect(missionBondGain(a, b, 0.9, false)).toBe(Math.round(18 * 1.25 * 0.6));
    expect(missionBondGain(a, b, 0.1, false)).toBe(Math.round(3 * 1.25 * 0.6));
  });

  it('decays 1 toward 0 every 10 days apart; 86 and up never decays', () => {
    const s = freshState(10);
    const [k, b, l, e] = s.roster;
    setBond(s, k.id, b.id, 50);
    setBond(s, k.id, l.id, -30);
    setBond(s, k.id, e.id, 90);
    for (const o of [b, l, e]) bondMeta(s, k.id, o.id).since = s.day;
    for (let d = 0; d < 9; d++) newDay(s);
    expect(getBond(s, k.id, b.id)).toBe(50); // 9 days apart: nothing yet
    newDay(s);
    expect(getBond(s, k.id, b.id)).toBe(49);
    expect(getBond(s, k.id, l.id)).toBe(-29);
    for (let d = 0; d < 9; d++) newDay(s);
    expect(getBond(s, k.id, b.id)).toBe(49);
    newDay(s);
    expect(getBond(s, k.id, b.id)).toBe(48);
    expect(getBond(s, k.id, e.id)).toBe(90);
    // sharing a mission restarts the clock
    recordSharedMission(s, k, b);
    for (let d = 0; d < 10; d++) newDay(s);
    expect(getBond(s, k.id, b.id)).toBe(47);
  });

  it('mentor and apprentice: 15 levels apart, 3 missions shared, Trusted', () => {
    const s = freshState(11);
    const [k, b] = s.roster;
    k.level = 18;
    b.level = 2;
    k.talents = ['battle_instinct'];
    setBond(s, k.id, b.id, 45);
    recordSharedMission(s, k, b);
    recordSharedMission(s, k, b);
    expect(hasFlag(s, k.id, b.id, 'mentor')).toBe(false);
    recordSharedMission(s, k, b);
    expect(hasFlag(s, k.id, b.id, 'mentor')).toBe(true);
    expect(mentorTalents(s, b)).toEqual(new Set(['battle_instinct']));
    expect(mentorTalents(s, k)).toBeNull();
    expect(b.history.some((h) => h.event === 'apprentice')).toBe(true);
  });

  it('romance between Close Bond pairs with no clashing traits', () => {
    const s = freshState(12);
    const [k, b] = s.roster;
    k.traits = ['brave'];
    b.traits = ['cautious'];
    setBond(s, k.id, b.id, 70);
    recordSharedMission(s, k, b);
    expect(hasFlag(s, k.id, b.id, 'romance')).toBe(false); // brave and cautious clash
    b.traits = ['hardy'];
    recordSharedMission(s, k, b);
    expect(hasFlag(s, k.id, b.id, 'romance')).toBe(true);
  });

  it('crossing into a notable tier is a bond milestone in both histories', () => {
    const s = freshState(13);
    const [k, b] = s.roster;
    setBond(s, k.id, b.id, 30);
    setBond(s, k.id, b.id, 41);
    expect(k.history.at(-1)).toMatchObject({ event: 'bond', with: b.name, tier: 'Trusted' });
    expect(b.history.at(-1)).toMatchObject({ event: 'bond', with: k.name, tier: 'Trusted' });
  });
});

describe('Bond events in a mission', () => {
  it('Life Debt: a wound that would have killed without the medic gives +30, a flag and a lean', () => {
    const s = readyForMissions(freshState(14));
    const [k, b, h] = [starter(s, 'Kael'), starter(s, 'Boris'), fresh(s, 'hunter')];
    s.roster.push(h);
    for (const [x, y] of [
      [k, b],
      [k, h],
      [b, h],
    ])
      setBond(s, x.id, y.id, 0);
    h.talents = ['field_medic'];
    h.talentRanks = { field_medic: 1 };
    k.traits = b.traits = h.traits = [];
    k.level = 10; // no level-up this mission, so the lean is still waiting for the next roll
    // Kael's death chance in the Fringe after a won fight: 0.2 x 0.4 = 0.08 alone, x0.75 with the medic = 0.06.
    // Step 1: encounter, sprites, won; Kael hurt with a death roll of 0.07 (between the two), others unhurt.
    scriptedRandom([0, 0, 0, 0, 0.07, 0.99, 0.99], 0.999);
    const rep = Ms.launch(s, {
      realm: R,
      zone: 'fringe',
      objective: 'explore',
      squad: [k.id, b.id, h.id],
    }).report;
    expect(rep.dead).toEqual([]);
    expect(rep.lifeDebts).toEqual([{ saved: k.name, saver: h.name }]);
    expect(hasFlag(s, k.id, h.id, 'life_debt')).toBe(true);
    const gain = rep.bonds[k.name + ' & ' + h.name];
    expect(getBond(s, k.id, h.id)).toBe(gain + D.bonds.events.lifeDebt);
    expect(k.lean).toBe('protective');
    expect(k.history.some((h2) => h2.event === 'life_debt' && h2.saved)).toBe(true);
  });

  it('Witnessed Death: the survivors gain +10 with each other on top of the usual gain', () => {
    const s = readyForMissions(freshState(15));
    const [k, b, l] = [starter(s, 'Kael'), starter(s, 'Boris'), starter(s, 'Lin')];
    setBond(s, k.id, l.id, 0);
    // Step 1: encounter, sprites, won; Kael unhurt, Boris hurt and killed, Lin unhurt.
    scriptedRandom([0, 0, 0, 0.99, 0, 0, 0.99], 0.999);
    const rep = Ms.launch(s, {
      realm: R,
      zone: 'fringe',
      objective: 'explore',
      squad: [k.id, b.id, l.id],
    }).report;
    expect(rep.dead.map((d) => d.name)).toEqual([b.name]);
    const usual = missionBondGain(k, l, rep.closeness, true);
    expect(rep.bonds[k.name + ' & ' + l.name]).toBe(usual + D.mission.bondGain.witnessedDeath);
    expect(getBond(s, k.id, l.id)).toBe(usual + 10);
  });
});
