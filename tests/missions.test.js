// The Systems reference (docs/SPEC.md), formula by formula, with fixed inputs and scripted rolls.
import { describe, it, expect, afterEach } from 'vitest';
import { D } from '../src/core/content.js';
import * as Ms from '../src/systems/missions.js';
import { setBond, baseGain } from '../src/systems/bonds.js';
import { build } from '../src/systems/characters.js';
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

function mage(s, vector, stats = { str: 3, con: 5, dex: 3, int: 10, per: 3, wil: 8 }) {
  const c = build(s, { name: 'Test Mage', cls: 'mage', stats, traits: [] });
  c.vectors = [vector];
  return c;
}

describe('Combat Power', () => {
  it('is 4 x Level + 1.5 x (two primary stats) + Gear + Skill + Arcane', () => {
    const s = freshState();
    const kael = starter(s, 'Kael'); // hunter: DEX 10, PER 10, Brave (+2 CP); skill hunt 6, explore 2
    expect(Ms.combatPower(kael, 'explore')).toBe(4 + 1.5 * 20 + 0 + (2 + 2) + 0);
    expect(Ms.combatPower(kael, 'hunt')).toBe(4 + 30 + (6 + 2));
    expect(Ms.combatPower(kael, 'gather')).toBe(4 + 30 + 2);
    kael.level = 3;
    expect(Ms.combatPower(kael, 'gather')).toBe(12 + 30 + 2);
  });

  it('adds trait bonuses to CON and PER', () => {
    const s = freshState();
    const boris = starter(s, 'Boris'); // warrior STR 10, CON 10, Hardy (+2 CON)
    expect(Ms.combatPower(boris, 'explore')).toBe(4 + 1.5 * (10 + 12));
    boris.traits = ['keen_eyed'];
    boris.cls = 'scout'; // DEX 7, PER 6 + 2; scout explore skill 6
    expect(Ms.combatPower(boris, 'explore')).toBe(4 + 1.5 * (7 + 8) + 6);
  });

  it('adds the objective effect, class arcane base and gear', () => {
    const s = freshState();
    const lin = starter(s, 'Lin'); // shaman INT 9 WIL 10, Curious (+3 explore), arcaneBase 3
    expect(Ms.combatPower(lin, 'explore')).toBe(4 + 1.5 * 19 + 2 + 3 + 3);
    expect(Ms.combatPower(lin, 'hunt')).toBe(4 + 28.5 + 0 + 3);
    s.armory.hide_armor = 1;
    lin.gear.armor = 'hide_armor';
    expect(Ms.combatPower(lin, 'hunt')).toBe(4 + 28.5 + 4 + 3);
  });

  it('gives mages floor((INT + WIL) / 3) arcane plus trait and talent arcane', () => {
    const s = freshState();
    const m = mage(s, 'heat'); // INT 10 WIL 8: floor(18 / 3) = 6
    expect(Ms.combatPower(m, 'explore')).toBe(4 + 1.5 * 18 + 6);
    m.traits = ['mana_sensitive'];
    m.talents = ['arcane_affinity'];
    expect(Ms.combatPower(m, 'explore')).toBe(4 + 27 + 6 + 4 + 4);
  });

  it('multiplies by 0.85 while grieving', () => {
    const s = freshState();
    const kael = starter(s, 'Kael');
    const base = Ms.combatPower(kael, 'explore');
    kael.grief = 2;
    expect(Ms.combatPower(kael, 'explore')).toBeCloseTo(base * 0.85, 10);
  });
});

describe('Matchups, wounds and Squad Power', () => {
  it('gives +4 per Vector the enemy is weak to and -3 per Vector it resists', () => {
    const s = freshState();
    const warden = D.enemies.grove_warden; // weak to heat, resists cold
    expect(Ms.matchupBonus(mage(s, 'heat'), warden)).toBe(4);
    expect(Ms.matchupBonus(mage(s, 'cold'), warden)).toBe(-3);
    expect(Ms.matchupBonus(mage(s, 'force'), warden)).toBe(0);
    expect(Ms.matchupBonus(starter(s, 'Kael'), warden)).toBe(0);
  });

  it('is (sum of CP) x (1 + synergy), with wounded members at 0.8 and a floor of 1 each', () => {
    const s = freshState();
    const [a, b] = [starter(s, 'Kael'), starter(s, 'Elena')];
    setBond(s, a.id, b.id, 0);
    const cpA = Ms.combatPower(a, 'explore');
    const cpB = Ms.combatPower(b, 'explore');
    const syn = Ms.synergy(s, [a, b]).value;
    expect(Ms.squadPower(s, [a, b], 'explore', null).sp).toBeCloseTo((cpA + cpB) * (1 + syn), 10);
    const hurt = new Set([a.id]);
    expect(Ms.squadPower(s, [a, b], 'explore', null, hurt).cp).toBeCloseTo(cpA * 0.8 + cpB, 10);
    const weak = mage(s, 'cold', { str: 1, con: 1, dex: 1, int: 1, per: 1, wil: 1 });
    weak.level = 0;
    // A negative matchup can push CP below 1; the member still counts as 1.
    expect(Ms.squadPower(s, [weak], 'hunt', D.enemies.grove_warden).cp).toBe(1);
  });
});

describe('Win chance, closeness, injury and death', () => {
  it('P_win = SP / (SP + ETR)', () => {
    expect(Ms.winChance(100, 100)).toBe(0.5);
    expect(Ms.winChance(300, 100)).toBe(0.75);
  });

  it('closeness = max(0.1, 1 - 2|P_win - 0.5|)', () => {
    expect(Ms.closeness(0.5)).toBe(1);
    expect(Ms.closeness(0.75)).toBe(0.5);
    expect(Ms.closeness(0.25)).toBe(0.5);
    expect(Ms.closeness(0.99)).toBe(0.1);
    expect(Ms.closeness(0)).toBe(0.1);
  });

  it('ConMod = min(0.3, max(0, (CON - 5) x 0.03)), with trait CON bonuses', () => {
    const s = freshState();
    const c = starter(s, 'Kael');
    c.traits = [];
    for (const [con, mod] of [
      [3, 0],
      [5, 0],
      [10, 0.15],
      [15, 0.3],
      [20, 0.3],
    ]) {
      c.stats.con = con;
      expect(Ms.conMod(c)).toBeCloseTo(mod, 10);
    }
    c.stats.con = 5;
    c.traits = ['hardy'];
    expect(Ms.conMod(c)).toBeCloseTo(0.06, 10);
  });

  it('P_injury = closeness x 0.35 x (1 - ConMod) x (1 - ArmorMod) x trait multipliers, x1.6 on a loss, capped at 0.9', () => {
    const s = freshState();
    const c = starter(s, 'Kael');
    c.traits = [];
    c.stats.con = 5;
    expect(Ms.injuryChance(c, 1, true)).toBeCloseTo(0.35, 10);
    expect(Ms.injuryChance(c, 0.5, true)).toBeCloseTo(0.175, 10);
    expect(Ms.injuryChance(c, 1, false)).toBeCloseTo(0.56, 10);
    c.stats.con = 10;
    expect(Ms.injuryChance(c, 1, true)).toBeCloseTo(0.35 * 0.85, 10);
    s.armory.hide_armor = 1;
    c.gear.armor = 'hide_armor';
    expect(Ms.injuryChance(c, 1, true)).toBeCloseTo(0.35 * 0.85 * 0.88, 10);
    c.traits = ['cautious'];
    c.talents = [];
    expect(Ms.injuryChance(c, 1, true)).toBeCloseTo(0.35 * 0.85 * 0.88 * 0.9, 10);
    c.traits = ['dragon_blood', 'cautious'];
    expect(Ms.injuryChance(c, 1, true)).toBeCloseTo(0.35 * 0.85 * 0.88 * 0.8 * 0.9, 10);
    // The 0.9 cap cannot bind with the current data: the largest raw value is 0.35 x 1.6 = 0.56.
  });

  it('P_death = 0.2 x deathScale x talents x medic, x1.5 lost, x0.6 support alive, x2 already wounded, capped at 0.9', () => {
    const s = freshState();
    const c = starter(s, 'Kael');
    const base = { deathScale: 1, won: true, supportAlive: false, alreadyWounded: false, medic: 1 };
    expect(Ms.deathChance(c, base)).toBeCloseTo(0.2, 10);
    expect(Ms.deathChance(c, { ...base, deathScale: 0.4 })).toBeCloseTo(0.08, 10);
    expect(Ms.deathChance(c, { ...base, won: false })).toBeCloseTo(0.3, 10);
    expect(Ms.deathChance(c, { ...base, supportAlive: true })).toBeCloseTo(0.12, 10);
    expect(Ms.deathChance(c, { ...base, alreadyWounded: true })).toBeCloseTo(0.4, 10);
    expect(Ms.deathChance(c, { ...base, medic: 0.75 })).toBeCloseTo(0.15, 10);
    c.talents = ['second_wind'];
    expect(Ms.deathChance(c, base)).toBeCloseTo(0.14, 10);
    c.talents = [];
    const all = { deathScale: 4, won: false, supportAlive: false, alreadyWounded: true, medic: 1 };
    expect(Ms.deathChance(c, all)).toBe(0.9);
  });
});

describe('Synergy (M9: team chemistry plus composition)', () => {
  it('team chemistry is the sum of bond tier modifiers over the number of pairs', () => {
    const s = freshState();
    const [k, b, l] = [starter(s, 'Kael'), starter(s, 'Boris'), starter(s, 'Elena')];
    k.traits = b.traits = l.traits = [];
    b.cls = 'hunter'; // all back-liners: no composition bonus
    l.cls = 'hunter';
    setBond(s, k.id, b.id, 90); // Unbreakable 0.15
    setBond(s, k.id, l.id, 70); // Close 0.10
    setBond(s, b.id, l.id, -50); // Rivalry -0.10
    expect(Ms.synergy(s, [k, b, l]).value).toBeCloseTo((0.15 + 0.1 - 0.1) / 3, 10);
    expect(Ms.synergy(s, [k, b]).value).toBeCloseTo(0.15, 10);
  });

  it('trait pairs no longer add to synergy', () => {
    const s = freshState();
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Elena')];
    k.cls = b.cls = 'hunter';
    setBond(s, k.id, b.id, 0);
    k.traits = ['brave'];
    b.traits = ['stoic'];
    expect(Ms.synergy(s, [k, b]).value).toBe(0);
    b.traits = ['cautious'];
    expect(Ms.synergy(s, [k, b]).value).toBe(0);
  });

  it('front and back +0.10, support +0.08, Natural Leader +0.03, casters without a front-liner -0.15', () => {
    const s = freshState();
    const [k, b, l] = [starter(s, 'Kael'), starter(s, 'Boris'), starter(s, 'Lin')]; // hunter, warrior, shaman
    k.traits = b.traits = l.traits = [];
    const m = mage(s, 'heat');
    s.roster.push(m);
    for (const x of [k, b, l, m]) for (const y of [k, b, l, m]) if (x !== y) setBond(s, x.id, y.id, 0);
    expect(Ms.synergy(s, [k, b]).value).toBeCloseTo(0.1, 10);
    expect(Ms.synergy(s, [k, b, l]).value).toBeCloseTo(0.18, 10);
    k.talents = ['natural_leader'];
    expect(Ms.synergy(s, [k, b, l]).value).toBeCloseTo(0.21, 10);
    k.talents = [];
    expect(Ms.synergy(s, [k, l]).value).toBeCloseTo(0.08, 10); // a support without a front line
    expect(Ms.synergy(s, [k, m]).value).toBeCloseTo(-0.15, 10); // a caster with no front-liner
    expect(Ms.synergy(s, [b, m]).value).toBeCloseTo(0.1, 10); // a mage counts as back line, not support
    expect(Ms.synergy(s, [k, b, m]).value).toBeCloseTo(0.1, 10);
  });

  it('clamps to -0.4 .. +0.6', () => {
    const s = freshState();
    const sq = s.roster;
    sq.forEach((c) => (c.traits = []));
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) setBond(s, sq[i].id, sq[j].id, -100);
    sq.forEach((c) => (c.cls = 'mage')); // -0.3 chemistry, -0.15 casters without a front line
    expect(Ms.synergy(s, sq).value).toBe(-0.4);
  });
});

describe('Perception and the hunt locate check (M9)', () => {
  it('PerceptionMod = 1 + 0.04 x (average PER - 6), clamped to 0.8 .. 1.4', () => {
    const s = freshState();
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    k.traits = b.traits = [];
    k.stats.per = 10;
    b.stats.per = 6;
    expect(Ms.perceptionMod([k, b])).toBeCloseTo(1.08, 10);
    k.stats.per = b.stats.per = 1;
    expect(Ms.perceptionMod([k, b])).toBe(0.8);
    k.stats.per = b.stats.per = 30;
    expect(Ms.perceptionMod([k, b])).toBe(1.4);
    k.traits = ['keen_eyed']; // +2 effective PER
    k.stats.per = b.stats.per = 6;
    expect(Ms.perceptionMod([k, b])).toBeCloseTo(1.04, 10);
  });

  it('P_locate = min(0.95, 0.35 + 0.05 x best PER + 0.05 x best hunt proficiency)', () => {
    const s = freshState();
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    k.traits = b.traits = [];
    k.stats.per = 8;
    b.stats.per = 4;
    expect(Ms.locateChance([k, b])).toBeCloseTo(0.75, 10);
    b.skills.hunt = 2;
    expect(Ms.locateChance([k, b])).toBeCloseTo(0.85, 10);
    k.stats.per = 15;
    expect(Ms.locateChance([k, b])).toBe(0.95);
  });

  it('a hunt that never finds its quarry ends as a retreat without the fight, costing 6 vigor a try', () => {
    const s = readyForMissions(freshState());
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    // 0.999: quiet steps, and every locate attempt fails (0.999 >= P_locate).
    constantRandom(0.999);
    const rep = Ms.launch(s, {
      realm: R,
      zone: 'fringe',
      objective: 'hunt',
      squad: [k.id, b.id],
      retreat: 25,
    }).report;
    expect(rep.outcome).toBe('retreat');
    expect(rep.kills).toEqual([]);
    expect(rep.events.filter((e) => e.includes('finds only tracks')).length).toBe(3);
    expect(rep.vigorEnd).toBe(100 - 3 * 4 - 6 * 3);
    expect(rep.stepsDone).toBe(4);
  });

  it('Proficiency adds 2 Combat Power per point in that objective', () => {
    const s = freshState();
    const k = starter(s, 'Kael');
    const before = Ms.combatPower(k, 'hunt');
    k.skills.hunt = 3;
    expect(Ms.combatPower(k, 'hunt')).toBe(before + 6);
    expect(Ms.combatPower(k, 'gather')).toBe(Ms.combatPower(k, 'gather'));
  });
});

describe('A whole mission', () => {
  it('a quiet Explore: vigor -3 per step, +40% explored, Arcane, Renown, XP, bonds by the formula, a quarter day', () => {
    const s = readyForMissions(freshState());
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    const bond = s.bonds[[k.id, b.id].sort().join('|')];
    constantRandom(0.999); // no encounters, rounding always down
    const r = Ms.launch(s, {
      realm: R,
      zone: 'fringe',
      objective: 'explore',
      squad: [k.id, b.id],
      retreat: 35,
    });
    expect(r.ok).toBe(true);
    const rep = r.report;
    expect(rep.outcome).toBe('success');
    expect(rep.stepsDone).toBe(5);
    expect(rep.vigorEnd).toBe(100 - 3 * 5);
    expect(rep.explored).toBe(40);
    expect(s.realms[R].fringe.explored).toBe(40);
    expect(rep.arcane).toBe(1); // exploreArcane 1 x 1.0
    expect(rep.renown).toBe(3);
    expect(s.player.inventory.supplies).toBe(98);
    expect(s.dayTimer).toBe(900);
    // No fight: closeness 0 -> BaseGain 3, x1.25 for brave and hardy, x1 for success = 3.75 -> 4.
    expect(s.bonds[[k.id, b.id].sort().join('|')]).toBe(bond + 4);
    // XP = 14 x 1.0 + 0 fights + 10 success = 24: one level (20), 4 left over.
    expect(rep.xp[k.name]).toBe(24);
    expect(k.level).toBe(2);
    expect(k.xp).toBe(4);
    // Resources: explore takes 30%. wildroot 2 x (0.6 + 0.999 x 0.8) x 0.3 = 0.839 -> 0 (rounded down).
    expect(rep.gains.wildroot || 0).toBe(0);
  });

  it('resources: base x (0.6..1.4) x share x (1 + yield bonus) x PerceptionMod, rounded at random; Gather takes the full amount', () => {
    const s = readyForMissions(freshState());
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    constantRandom(0.5); // multiplier exactly 1.0; stochastic rounding rounds 0.5+ fractions up
    let rep = Ms.launch(s, { realm: R, zone: 'fringe', objective: 'gather', squad: [k.id, b.id] }).report;
    // 0.5 < encounterChance 0.4? no -> quiet steps. PerceptionMod for PER 10 and 6 is 1.08.
    // wildroot 2 x 1 x 1 x 1.08 = 2.16 -> 2 per step; enchanted_wood 1.08 -> 1 per step.
    expect(rep.gains).toEqual({ wildroot: 10, enchanted_wood: 5 });
    k.talents = ['efficient_gatherer'];
    rep = Ms.launch(s, { realm: R, zone: 'fringe', objective: 'gather', squad: [k.id, b.id] }).report;
    // 2 x 1.12 x 1.08 = 2.42 -> 2 (0.5 < 0.42 is false); 1.21 -> 1
    expect(rep.gains).toEqual({ wildroot: 10, enchanted_wood: 5 });
    rep = Ms.launch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [k.id, b.id] }).report;
    // 2 x 0.3 x 1.12 x 1.08 = 0.726 -> 1 (0.5 < 0.726); 0.363 -> 0
    expect(rep.gains).toEqual({ wildroot: 5 });
  });

  it('retreats when vigor is at or below the threshold before the last step', () => {
    const s = readyForMissions(freshState());
    const sq = s.roster.map((c) => c.id);
    // 0.39: every Fringe step is an encounter (< 0.40), every fight is won, nobody is hurt.
    constantRandom(0.39);
    const rep = Ms.launch(s, {
      realm: R,
      zone: 'fringe',
      objective: 'explore',
      squad: sq,
      retreat: 70,
    }).report;
    expect(rep.kills.length).toBe(4);
    expect(rep.outcome).toBe('retreat');
    expect(rep.stepsDone).toBe(4); // 92, 84, 76, 68 <= 70
    expect(rep.vigorEnd).toBe(68);
    expect(rep.explored).toBe(Math.round(40 * 0.8));
    expect(rep.arcane).toBe(Math.round(1 * 0.8)); // no minimum of 1 without success
    expect(rep.renown).toBe(Math.round(3 * 0.8 * 0.5));
  });

  it('a Hunt ends in a fight with the quarry; losing it is a retreat, and bonds grow by the formula', () => {
    const s = readyForMissions(freshState());
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    const key = [k.id, b.id].sort().join('|');
    const bond = s.bonds[key];
    s.realms[R].warrens.explored = 60;
    const warden = D.enemies.grove_warden;
    const pWin = Ms.winChance(Ms.squadPower(s, [k, b], 'hunt', warden, new Set()).sp, warden.etr);
    constantRandom(0.39); // found on the first try (0.39 < P_locate), then lost
    const rep = Ms.launch(s, { realm: R, zone: 'old_grove', objective: 'hunt', squad: [k.id, b.id] }).report;
    expect(rep.events.some((e) => e.startsWith('Defeated by the Grove Warden'))).toBe(true);
    expect(rep.outcome).toBe('retreat');
    expect(rep.stepsDone).toBe(6);
    // The hardest fight sets the closeness; a retreat scales the gain by 0.6.
    expect(rep.closeness).toBeGreaterThanOrEqual(Ms.closeness(pWin));
    expect(s.bonds[key]).toBe(bond + Math.round(baseGain(rep.closeness) * 1.25 * 0.6));
    expect(s.realms[R].old_grove.bossDown).toBe(false);
  });

  it('the first boss kill grants its Knowledge Fragment once', () => {
    const s = readyForMissions(freshState());
    const sq = s.roster.slice(0, 4);
    s.realms[R].warrens.explored = 60;
    for (const c of sq) {
      c.level = 20;
      for (const k in c.stats) c.stats[k] = 15;
    }
    // 0.25: every step an encounter, every fight won (the Warden at ~60%), and no one hurt.
    constantRandom(0.25);
    let rep = Ms.launch(s, {
      realm: R,
      zone: 'old_grove',
      objective: 'hunt',
      squad: sq.map((c) => c.id),
    }).report;
    expect(rep.outcome).toBe('success');
    expect(rep.fragments).toEqual({ gravitational: 17 });
    expect(s.fragments).toEqual({ gravitational: 17 });
    expect(s.realms[R].old_grove.cleared).toBe(1);
    rep = Ms.launch(s, { realm: R, zone: 'old_grove', objective: 'hunt', squad: sq.map((c) => c.id) }).report;
    expect(rep.fragments).toEqual({});
    expect(s.fragments).toEqual({ gravitational: 17 });
    expect(s.realms[R].old_grove.cleared).toBe(2);
  });

  it('wounded survivors are out until day + 2 after a success, day + 3 otherwise', () => {
    const s = readyForMissions(freshState());
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    // Step 1: encounter, Wild Sprites, won, Kael hurt (and survives), Boris unhurt. Then quiet.
    scriptedRandom([0, 0, 0, 0, 0.99, 0.99], 0.999);
    const rep = Ms.launch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [k.id, b.id] }).report;
    expect(rep.outcome).toBe('success');
    expect(rep.injured).toEqual([k.name]);
    expect(k.injuredUntil).toBe(s.day + 2);
    expect(Ms.validate(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [k.id, b.id] })).toMatch(
      /recovering/,
    );
  });

  it('a wipe: everyone dead, no exploration, Renown or XP; the dead go to the memorial and their gear to the armory', () => {
    const s = readyForMissions(freshState());
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    s.armory.stone_spear = 1;
    k.gear.weapon = 'stone_spear';
    s.armory.stone_spear = 0;
    constantRandom(0); // encounter, won, everyone hurt, everyone dies
    const rep = Ms.launch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [k.id, b.id] }).report;
    expect(rep.outcome).toBe('wipe');
    expect(rep.dead.map((d) => d.name)).toEqual([k.name, b.name]);
    expect(rep.explored).toBe(0);
    expect(rep.renown).toBe(0);
    expect(s.roster.length).toBe(2);
    expect(s.memorial.length).toBe(2);
    expect(s.stats.deaths).toBe(2);
    expect(s.armory.stone_spear).toBe(1);
    expect(Object.keys(s.bonds).some((key) => key.split('|').includes(k.id))).toBe(false);
  });

  it('Witnessed Death: survivors grieve 2 missions, 3 if close to the dead, unless Stoic; grief counts down first', () => {
    const s = readyForMissions(freshState());
    const [k, b, l] = [starter(s, 'Kael'), starter(s, 'Boris'), starter(s, 'Lin')];
    setBond(s, k.id, b.id, 41);
    setBond(s, l.id, b.id, 50);
    l.traits = ['stoic'];
    k.grief = 1;
    // Step 1 fight: won; Kael unhurt, Boris hurt and killed, Lin unhurt.
    scriptedRandom([0, 0, 0, 0.99, 0, 0, 0.99], 0.999);
    const rep = Ms.launch(s, {
      realm: R,
      zone: 'fringe',
      objective: 'explore',
      squad: [k.id, b.id, l.id],
    }).report;
    expect(rep.dead.map((d) => d.name)).toEqual([b.name]);
    expect(k.grief).toBe(3); // close to Boris (41+)
    expect(l.grief).toBe(0); // Stoic
    expect(k.history.some((h) => h.event === 'witnessed_death' && h.name === b.name)).toBe(true);
    // A quiet mission counts the grief down.
    constantRandom(0.999);
    Ms.launch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [k.id, l.id] });
    expect(k.grief).toBe(2);
  });

  it('opens a zone when the previous zone is 60% explored', () => {
    const s = readyForMissions(freshState());
    expect(Ms.zoneUnlocked(s, R, 'groves')).toBe(false);
    s.realms[R].fringe.explored = 59;
    expect(Ms.zoneUnlocked(s, R, 'groves')).toBe(false);
    s.realms[R].fringe.explored = 60;
    expect(Ms.zoneUnlocked(s, R, 'groves')).toBe(true);
    expect(Ms.validate(s, { realm: R, zone: 'warrens', objective: 'explore', squad: [] })).toMatch(
      /not been opened/,
    );
  });

  it('applies encounterMul from every member', () => {
    const s = readyForMissions(freshState());
    const [k, b] = [starter(s, 'Kael'), starter(s, 'Boris')];
    k.traits = ['night_vision'];
    // 0.38 < 0.40 but not < 0.40 x 0.93 = 0.372: no encounters.
    constantRandom(0.38);
    const rep = Ms.launch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [k.id, b.id] }).report;
    expect(rep.kills.length).toBe(0);
  });

  it('validates the order and costs one supply per member', () => {
    const s = freshState();
    const ids = s.roster.map((c) => c.id);
    const order = { realm: R, zone: 'fringe', objective: 'explore', squad: ids.slice(0, 2) };
    expect(Ms.validate(s, order)).toMatch(/not awake/);
    s.nexus.awake = true;
    expect(Ms.validate(s, order)).toMatch(/Expedition Supplies/);
    s.player.inventory.supplies = 2;
    expect(Ms.validate(s, order)).toBeNull();
    expect(Ms.validate(s, { ...order, squad: [ids[0]] })).toMatch(/2-4/);
    expect(Ms.validate(s, { ...order, squad: [ids[0], ids[0]] })).toMatch(/Duplicate/);
    expect(Ms.validate(s, { ...order, objective: 'nap' })).toMatch(/objective/);
  });

  it('the Hall preview uses the first quarry and the weighted typical threat', () => {
    const s = readyForMissions(freshState());
    const ids = s.roster.map((c) => c.id);
    const pv = Ms.preview(s, ids, R, 'fringe', 'hunt');
    expect(pv.target).toBe(D.enemies.thornback_boar);
    expect(pv.typicalEtr).toBeCloseTo((18 * 70 + 55 * 30) / 100, 10);
    expect(pv.pTarget).toBeCloseTo(pv.sp / (pv.sp + 55), 10);
  });
});
