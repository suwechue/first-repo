// Recruits, XP and stat growth, bonds, gear and permadeath. Growth rolls: tests/growth.test.js.
import { describe, it, expect, afterEach } from 'vitest';
import { D } from '../src/core/content.js';
import * as C from '../src/systems/characters.js';
import { createItem } from '../src/systems/gear.js';
import { generate, recruit, refreshOffer, recruitCost, rollTraits } from '../src/systems/recruiting.js';
import { inPairs, getBond, setBond, bondTier, seedBond } from '../src/systems/bonds.js';
import { freshState, constantRandom, restoreRandom, starter } from './helpers/setup.js';

afterEach(restoreRandom);

const statSum = (c) => Object.values(c.stats).reduce((a, b) => a + b, 0);

describe('Recruits', () => {
  it('have stats totalling 18 plus the tier budget, each between 3 and 14', () => {
    const s = freshState(5);
    for (const tier of Object.keys(D.tiers.tiers)) {
      for (let i = 0; i < 300; i++) {
        const c = generate(s, { tier });
        expect(statSum(c)).toBe(6 * 3 + D.tiers.tiers[tier].budget);
        for (const v of Object.values(c.stats)) {
          expect(v).toBeGreaterThanOrEqual(3);
          expect(v).toBeLessThanOrEqual(14);
        }
        expect(c.traits.length).toBe(D.tiers.tiers[tier].traits);
      }
    }
  });

  it('never carry a clashing trait pair', () => {
    freshState(6); // seeds the random stream
    for (let i = 0; i < 2000; i++) {
      const t = rollTraits(3);
      for (let a = 0; a < t.length; a++)
        for (let b = a + 1; b < t.length; b++) expect(inPairs(D.traits.clash, t[a], t[b])).toBe(false);
      expect(new Set(t).size).toBe(t.length);
    }
  });

  it('are drawn 70 / 25 / 5 by tier, and every tier has the same chance of a notable trait', () => {
    const s = freshState(7);
    const tiers = { common: 0, uncommon: 0, rare: 0 };
    const N = 20000;
    for (let i = 0; i < N; i++) tiers[generate(s).tier]++;
    expect(tiers.common / N).toBeCloseTo(0.7, 1);
    expect(tiers.uncommon / N).toBeCloseTo(0.25, 1);
    expect(tiers.rare / N).toBeCloseTo(0.05, 1);

    // Per trait drawn, the notable share is about 3% whatever the tier.
    for (const tier of Object.keys(D.tiers.tiers)) {
      let notable = 0;
      let total = 0;
      for (let i = 0; i < 6000; i++) {
        for (const t of generate(s, { tier }).traits) {
          total++;
          if (D.traits.traits[t].rarity === 'notable') notable++;
        }
      }
      expect(notable / total).toBeGreaterThan(0.015);
      expect(notable / total).toBeLessThan(0.05);
    }
  });

  it('only include mages once their tech is researched', () => {
    const s = freshState(8);
    const classes = new Set();
    for (let i = 0; i < 2000; i++) classes.add(generate(s).cls);
    expect(classes.has('mage')).toBe(false);
    s.tech.elemental_attunement = true;
    let mages = 0;
    for (let i = 0; i < 2000; i++) {
      const c = generate(s);
      if (c.cls === 'mage') {
        mages++;
        expect(c.vectors.length).toBe(1);
        expect(D.classes.mage.vectorPool).toContain(c.vectors[0]);
      }
    }
    expect(mages).toBeGreaterThan(0);
  });

  it('cost 20, 40 or 80 Renown; the roster holds 8; recruiting rolls bonds with everyone', () => {
    const s = freshState(9);
    s.nexus.awake = true;
    refreshOffer(s);
    const o = s.recruitOffer;
    expect(recruitCost(o)).toBe({ common: 20, uncommon: 40, rare: 80 }[o.tier]);
    expect(recruit(s).ok).toBe(false); // no Renown
    s.renown = 1000;
    expect(recruit(s).ok).toBe(true);
    expect(s.renown).toBe(1000 - recruitCost(o));
    for (const other of s.roster)
      if (other !== o) expect(s.bonds[[o.id, other.id].sort().join('|')]).toBeDefined();
    while (s.roster.length < 8) {
      refreshOffer(s);
      expect(recruit(s).ok).toBe(true);
    }
    refreshOffer(s);
    expect(s.recruitOffer).toBeNull();
  });
});

describe('XP and growth', () => {
  it('level n needs 20 x n XP, each level adds 2 stat points weighted toward primaries, capped at 15', () => {
    const s = freshState(10);
    const k = starter(s, 'Kael');
    expect(C.xpToNext(1)).toBe(20);
    expect(C.xpToNext(7)).toBe(140);
    const before = statSum(k);
    const r = C.addXp(k, 20 + 40 + 60); // exactly three levels
    expect(k.level).toBe(4);
    expect(k.xp).toBe(0);
    expect(r.ups.length).toBe(3);
    expect(statSum(k)).toBe(before + 6);

    // Primary stats (DEX, PER) get about 3 of every 8 points each.
    const counts = { str: 0, con: 0, dex: 0, int: 0, per: 0, wil: 0 };
    for (let i = 0; i < 400; i++) {
      const c = C.build(s, {
        name: 'x',
        cls: 'hunter',
        stats: { str: 3, con: 3, dex: 3, int: 3, per: 3, wil: 3 },
        traits: [],
      });
      for (const u of C.addXp(c, 20).ups) for (const st in u.gains) counts[st] += u.gains[st];
    }
    expect((counts.dex + counts.per) / 800).toBeCloseTo(6 / 10, 1);

    const capped = C.build(s, {
      name: 'y',
      cls: 'hunter',
      stats: { str: 15, con: 15, dex: 15, int: 15, per: 15, wil: 14 },
      traits: [],
    });
    C.addXp(capped, 20);
    expect(capped.stats).toEqual({ str: 15, con: 15, dex: 15, int: 15, per: 15, wil: 15 });
  });

  it('stops at level 20 with XP cleared', () => {
    const s = freshState(11);
    const k = starter(s, 'Kael');
    C.addXp(k, 100000);
    expect(k.level).toBe(20);
    expect(k.xp).toBe(0);
  });

  it('applies the XP multiplier from traits', () => {
    const s = freshState(12);
    const k = starter(s, 'Kael');
    k.traits = ['genius'];
    expect(C.addXp(k, 10).xp).toBe(14);
  });

  // Growth rolls, pity and talent ranks (M9) are in tests/growth.test.js.
});

describe('Bonds', () => {
  it('map values to tiers and clamp to -100..100', () => {
    expect(bondTier(100).name).toBe('Unbreakable Bond');
    expect(bondTier(86).mod).toBe(0.15);
    expect(bondTier(41).name).toBe('Trusted');
    expect(bondTier(0).mod).toBe(0);
    expect(bondTier(-86).name).toBe('Blood Feud');
    const s = freshState(16);
    const [a, b] = s.roster;
    setBond(s, a.id, b.id, 250);
    expect(getBond(s, a.id, b.id)).toBe(100);
    setBond(s, b.id, a.id, -250);
    expect(getBond(s, a.id, b.id)).toBe(-100);
  });

  it('start at round(rand x 25 - 10), -15 per clashing trait pair, +10 per synergy pair', () => {
    const s = freshState(17);
    const [a, b] = s.roster;
    a.traits = ['brave'];
    b.traits = ['stoic'];
    constantRandom(0.5);
    seedBond(s, a, b);
    expect(getBond(s, a.id, b.id)).toBe(Math.round(0.5 * 25 - 10) + 10);
    b.traits = ['cautious'];
    seedBond(s, a, b);
    expect(getBond(s, a.id, b.id)).toBe(Math.round(0.5 * 25 - 10) - 15);
  });
});

describe('Gear and permadeath', () => {
  it('equips from and returns to the shared armory, one piece per slot', () => {
    const s = freshState(18);
    const k = starter(s, 'Kael');
    const axe = createItem(s, 'stone_axe');
    const armor = createItem(s, 'hide_armor');
    expect(C.equip(s, k, 'weapon', armor.id)).toMatch(/does not go there/);
    expect(k.gear.weapon).toBeNull();
    C.equip(s, k, 'weapon', axe.id);
    C.equip(s, k, 'body', armor.id);
    expect(k.gear.weapon).toBe(axe);
    expect(k.gear.body).toBe(armor);
    expect(s.armory).toEqual([]);
    expect(C.gearPower(k)).toBe(3 + 4);
    expect(C.armorMod(k)).toBe(0.12);
    C.equip(s, k, 'weapon', null);
    expect(s.armory).toEqual([axe]);
  });

  it('death moves a character to the memorial, deletes their bonds and returns their gear', () => {
    const s = freshState(19);
    const k = starter(s, 'Kael');
    const armor = createItem(s, 'hide_armor');
    C.equip(s, k, 'body', armor.id);
    C.die(s, k, 'test');
    expect(s.roster).not.toContain(k);
    expect(s.memorial).toEqual([{ name: k.name, cls: 'hunter', level: 1, day: 1, cause: 'test' }]);
    expect(Object.keys(s.bonds).some((key) => key.includes(k.id))).toBe(false);
    expect(s.armory).toEqual([armor]);
  });
});
