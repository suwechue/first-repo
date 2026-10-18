// Recruitment and Hall v2 (M11): Renown costs and arrivals, tier odds, Dismiss, the recruitment card's
// flavor, the Blood Feud refusal, chemistry and saved squads.
import { describe, it, expect, afterEach } from 'vitest';
import { D } from '../src/core/content.js';
import {
  generate,
  tierWeights,
  arrivalChance,
  dawnArrival,
  dismiss,
  recruit,
  refreshOffer,
  flavorLine,
} from '../src/systems/recruiting.js';
import { newDay } from '../src/systems/clock.js';
import * as Ms from '../src/systems/missions.js';
import { setBond } from '../src/systems/bonds.js';
import { saveSquad, deleteSquad, squadMembers } from '../src/systems/squads.js';
import { die } from '../src/systems/characters.js';
import { makeInitialState } from '../src/core/state.js';
import { serialize, apply } from '../src/core/save.js';
import { freshState, constantRandom, restoreRandom, readyForMissions, starter } from './helpers/setup.js';

afterEach(restoreRandom);

function tierShares(s, n) {
  const count = { common: 0, uncommon: 0, rare: 0 };
  for (let i = 0; i < n; i++) count[generate(s).tier]++;
  return Object.fromEntries(Object.entries(count).map(([k, v]) => [k, v / n]));
}

describe('Arrivals', () => {
  it('chance min(0.9, 0.25 + Renown / 200) rises with Renown', () => {
    const s = freshState();
    expect(arrivalChance(s)).toBe(0.25);
    s.renown = 50;
    expect(arrivalChance(s)).toBeCloseTo(0.5, 10);
    s.renown = 100;
    expect(arrivalChance(s)).toBeCloseTo(0.75, 10);
    s.renown = 1000;
    expect(arrivalChance(s)).toBe(0.9);
  });

  it('one candidate waits; dawn brings a new one only when no one is waiting', () => {
    const s = freshState();
    s.nexus.awake = true;
    constantRandom(0); // every arrival roll succeeds
    expect(dawnArrival(s)).toBe(true);
    const first = s.recruitOffer;
    expect(dawnArrival(s)).toBe(false);
    expect(s.recruitOffer).toBe(first);
    expect(dismiss(s).ok).toBe(true);
    expect(s.recruitOffer).toBeNull();
    constantRandom(0.999); // and now the roll fails: the Hall stays empty until a later dawn
    newDay(s);
    expect(s.recruitOffer).toBeNull();
    constantRandom(0.1);
    newDay(s);
    expect(s.recruitOffer).not.toBeNull();
  });

  it('dawns bring arrivals about as often as the chance says', () => {
    for (const renown of [0, 100]) {
      const s = freshState(3);
      s.nexus.awake = true;
      s.renown = renown;
      let arrived = 0;
      const days = 2000;
      for (let d = 0; d < days; d++) {
        s.recruitOffer = null;
        if (dawnArrival(s)) arrived++;
      }
      expect(arrived / days).toBeCloseTo(arrivalChance(s), 1);
    }
  });
});

describe('Tier odds', () => {
  it('Renown raises Uncommon and Rare to their caps, and Common stays the most frequent', () => {
    expect(tierWeights({ renown: 0 })).toEqual({ common: 70, uncommon: 25, rare: 5 });
    expect(tierWeights({ renown: 100 })).toEqual({ common: 62.5, uncommon: 30, rare: 7.5 });
    expect(tierWeights({ renown: 10000 })).toEqual({ common: 55, uncommon: 35, rare: 10 });
  });

  it('in a large sample, arrival odds rise with Renown but Common is still the most frequent tier', () => {
    const low = tierShares(freshState(5), 6000);
    const s = freshState(6);
    s.renown = 10000;
    const high = tierShares(s, 6000);
    expect(low.common).toBeCloseTo(0.7, 1);
    expect(high.common).toBeCloseTo(0.55, 1);
    expect(high.uncommon).toBeGreaterThan(low.uncommon);
    expect(high.rare).toBeGreaterThan(low.rare);
    expect(high.common).toBeGreaterThan(high.uncommon);
    expect(high.common).toBeGreaterThan(high.rare);
  });

  it('rarity never improves the chance of a notable trait', () => {
    const s = freshState(7);
    s.renown = 10000;
    const share = { common: [0, 0], rare: [0, 0] };
    for (let i = 0; i < 4000; i++) {
      for (const tier of ['common', 'rare']) {
        const c = generate(s, { tier });
        share[tier][0] += c.traits.filter((t) => D.traits.traits[t].rarity === 'notable').length;
        share[tier][1] += c.traits.length;
      }
    }
    expect(share.common[0] / share.common[1]).toBeCloseTo(share.rare[0] / share.rare[1], 1);
  });
});

describe('The recruitment card', () => {
  it('carries an origin and a flavor line from the background and the rarest trait', () => {
    const s = freshState(8);
    const c = generate(s);
    expect(c.origin).toBe('overworld_village');
    const lines = D.backgrounds[c.bg].flavor;
    expect(lines.some((l) => c.flavor.startsWith(l.split('{trait}')[0]))).toBe(true);
    c.traits = ['brave', 'genius'];
    expect(flavorLine(c)).toContain(D.traits.traits.genius.flavor); // notable beats common
    expect(flavorLine(c)).toBe(flavorLine(c)); // no rolls
  });

  it('recruiting spends Renown; Dismiss costs nothing', () => {
    const s = freshState(9);
    s.nexus.awake = true;
    refreshOffer(s);
    const o = s.recruitOffer;
    s.renown = D.tiers.tiers[o.tier].renown - 1;
    expect(recruit(s).ok).toBe(false);
    s.renown += 1;
    expect(recruit(s).ok).toBe(true);
    expect(s.renown).toBe(0);
    refreshOffer(s);
    const before = s.renown;
    dismiss(s);
    expect(s.renown).toBe(before);
  });
});

describe('Blood Feud, chemistry and saved squads', () => {
  it('a Blood Feud pair cannot launch together', () => {
    const s = readyForMissions(freshState(10));
    const [k, b, l] = [starter(s, 'Kael'), starter(s, 'Boris'), starter(s, 'Lin')];
    setBond(s, k.id, b.id, -90);
    const order = { realm: 'verdant_wilds', zone: 'fringe', objective: 'explore', squad: [k.id, l.id, b.id] };
    expect(Ms.validate(s, order)).toMatch(/Blood Feud/);
    expect(Ms.launch(s, order).ok).toBe(false);
    expect(Ms.bloodFeud(s, [k.id, b.id]).map((c) => c.id)).toEqual([k.id, b.id]);
    setBond(s, k.id, b.id, -85); // Grudge, not Blood Feud
    expect(Ms.validate(s, order)).toBeNull();
  });

  it("chemistry lists every pair's tier and averages their modifiers", () => {
    const s = freshState(11);
    const [k, b, l] = [starter(s, 'Kael'), starter(s, 'Boris'), starter(s, 'Lin')];
    setBond(s, k.id, b.id, 90);
    setBond(s, k.id, l.id, -90);
    setBond(s, b.id, l.id, 0);
    const ch = Ms.chemistry(s, [k.id, b.id, l.id]);
    expect(ch.pairs.map((p) => p.tier.name)).toEqual(['Unbreakable Bond', 'Blood Feud', 'Stranger']);
    expect(ch.pairs.map((p) => p.feud)).toEqual([false, true, false]);
    expect(ch.value).toBeCloseTo((0.15 - 0.3 + 0) / 3, 10);
  });

  it('saved squads keep their members, drop the dead, and survive a save', () => {
    const s = freshState(12);
    const [k, b, l] = [starter(s, 'Kael'), starter(s, 'Boris'), starter(s, 'Lin')];
    expect(saveSquad(s, '', [k.id])).toMatch(/Name/);
    expect(saveSquad(s, 'Vanguard', [k.id, b.id, l.id])).toBeNull();
    expect(saveSquad(s, 'Vanguard', [k.id, b.id])).toBeNull(); // replaces
    expect(s.squads.length).toBe(1);
    expect(squadMembers(s, 'Vanguard')).toEqual([k.id, b.id]);
    die(s, b, 'test');
    expect(squadMembers(s, 'Vanguard')).toEqual([k.id]);
    const t = makeInitialState();
    expect(apply(t, serialize(s))).toBeNull();
    expect(t.squads).toEqual([{ name: 'Vanguard', members: [k.id] }]);
    deleteSquad(s, 'Vanguard');
    expect(s.squads).toEqual([]);
  });
});
