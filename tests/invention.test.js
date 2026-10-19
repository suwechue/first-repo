// Crafting and Invention (M16), the pure side: quality from performance, which minigame plays,
// the Vector pool, and Property Bank rolls that follow the allocation's signature.
import { describe, it, expect, afterEach } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame } from '../src/systems/game.js';
import { enterPlacing, tryPlaceBuilding, placementCheck } from '../src/systems/building.js';
import { itemStat, itemName, itemEffects, playerDamage } from '../src/systems/gear.js';
import * as Inv from '../src/systems/invention.js';
import { createRng, useRandomSource } from '../src/core/rng.js';
import { constantRandom, restoreRandom } from './helpers/setup.js';

afterEach(restoreRandom);

function game() {
  const s = makeInitialState();
  newGame(s, 1616);
  s.enemies = [];
  Object.assign(s.player.inventory, { wood: 200, stone: 200, fiber: 200, hide: 200, mana_crystal: 10 });
  return s;
}

function withBench(s) {
  s.tech.elemental_attunement = true;
  s.tech.tanning = true;
  enterPlacing(s, 'invention_bench');
  for (let r = 1; r <= 3; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const p = placementCheck(s, 'invention_bench', s.player.x + dx * 32, s.player.y + dy * 32);
        if (
          p.ok &&
          Math.hypot(p.x - s.player.x, p.y - s.player.y) < D.game.interact.benchRange &&
          tryPlaceBuilding(s, p.x, p.y)
        )
          return s;
      }
  throw new Error('no room for a bench');
}

describe('Gear crafting quality', () => {
  it('quality follows performance: under 0.35 Crude, 0.65 Standard, 0.9 Fine, else Masterwork', () => {
    expect([0, 0.34, 0.35, 0.64, 0.65, 0.89, 0.9, 1].map(Inv.qualityFor)).toEqual([
      'crude',
      'crude',
      'standard',
      'standard',
      'fine',
      'fine',
      'masterwork',
      'masterwork',
    ]);
  });

  it('each gear recipe names its minigame and difficulty, else its slot does', () => {
    expect(Inv.gearMinigame('stone_spear')).toEqual({ minigame: 'forge', difficulty: 3 });
    expect(Inv.gearMinigame('scout_hood').minigame).toBe('alignment');
    expect(Inv.isGearRecipe('cook_food')).toBe(false);
  });

  it('a better performance makes a better piece; rushing always makes a Crude one', () => {
    const s = game();
    const poor = Inv.finishCraft(s, 'stone_spear', 0.2);
    const great = Inv.finishCraft(s, 'stone_spear', 0.95);
    const rushed = Inv.finishCraft(s, 'stone_spear', 1, { rushed: true });
    expect([poor.quality, great.quality, rushed.quality]).toEqual(['crude', 'masterwork', 'crude']);
    expect(itemStat(great, 'dmg')).toBeGreaterThan(itemStat(poor, 'dmg'));
    expect(itemName(great)).toBe('Masterwork Stone Spear');
    expect(s.player.gear.weapon).toBe(poor); // the first went straight on
  });
});

describe('Which minigame an Invention plays', () => {
  it('follows the archetype rules, first match wins', () => {
    expect(Inv.chooseArchetype({ heat: 4, cold: 3, force: 3 }, 'weapon')).toBe('synthesis');
    expect(Inv.chooseArchetype({ heat: 8, force: 2 }, 'weapon')).toBe('forge');
    expect(Inv.chooseArchetype({ cold: 8 }, 'armor')).toBe('forge');
    expect(Inv.chooseArchetype({ force: 8, heat: 2 }, 'armor')).toBe('precision');
    expect(Inv.chooseArchetype({ light: 6, binding: 2 }, 'armor')).toBe('alignment');
    expect(Inv.chooseArchetype({}, 'weapon')).toBe('precision'); // nothing matches
  });

  it('skips a rule whose minigame is not registered', () => {
    const has = (k) => k !== 'forge';
    expect(Inv.chooseArchetype({ heat: 8, force: 2 }, 'weapon', has)).toBe('thermal');
  });

  it('complexity = points / 10 + 3 per extra Vector; difficulty is it clamped to 1..10', () => {
    expect(Inv.complexity({ heat: 10 })).toBe(1);
    expect(Inv.complexity({ heat: 6, force: 4 })).toBe(1 + 3);
    expect(Inv.difficultyOf({ heat: 1 })).toBe(1);
    expect(Inv.difficultyOf({ heat: 5, cold: 5, force: 5, motion: 5 })).toBe(10);
  });
});

describe('The Vector pool', () => {
  it('is 6 + 4 x Knowledge Tier, over the Vectors the era allows', () => {
    const s = game();
    expect(Inv.vectorPool(s)).toBe(10);
    expect(Inv.inventionVectors(s)).toEqual(['heat', 'cold', 'force', 'motion']);
    s.tech.vector_dynamics = true;
    expect(Inv.vectorPool(s)).toBe(14);
    expect(Inv.inventionVectors(s)).toContain('light');
  });

  it('checks the plan: a bench in reach, points within the pool, Knowledge for Research Points', () => {
    const s = game();
    const plan = { recipe: 'stone_spear', vectors: { heat: 6 }, researchPoints: 0 };
    expect(Inv.inventionError(s, plan)).toMatch(/Invention Bench/);
    withBench(s);
    expect(Inv.inventionError(s, plan)).toBeNull();
    expect(Inv.inventionError(s, { ...plan, vectors: { heat: 11 } })).toMatch(/10 Vector points/);
    expect(Inv.inventionError(s, { ...plan, vectors: { light: 3 } })).toMatch(/Knowledge Tier/);
    expect(Inv.inventionError(s, { ...plan, researchPoints: 4 })).toMatch(/20 Knowledge/);
    s.kp = 20;
    expect(Inv.inventionError(s, { ...plan, researchPoints: 4 })).toBeNull();
  });
});

describe('Property rolls', () => {
  it("weights follow the allocation's signature, and thresholds gate what can roll", () => {
    const heat = Inv.propertyWeights({ heat: 7, force: 3 }, 'weapon', 0.5);
    const best = Object.entries(heat).sort((a, b) => b[1] - a[1])[0][0];
    expect(best).toBe('searing_edge');
    expect(heat.frost_bite).toBeUndefined(); // needs 6 Cold
    const armor = Inv.propertyWeights({ heat: 6 }, 'armor', 0.5);
    expect(Object.keys(armor)).toEqual(['ember_lining']);
    expect(Inv.propertyWeights({ heat: 2 }, 'weapon', 0.5)).toEqual({});
  });

  it('in a large sample the leading property follows the leading Vector', () => {
    useRandomSource(createRng(7));
    const count = (vectors) => {
      const n = {};
      for (let i = 0; i < 1500; i++) {
        const [p] = Inv.rollProperties(vectors, 'weapon', 0);
        if (p) n[p.id] = (n[p.id] || 0) + 1;
      }
      return n;
    };
    const fire = count({ heat: 10, cold: 6 }); // about 61% Searing Edge to 39% Frostbite
    const ice = count({ cold: 10, heat: 6 });
    expect(fire.searing_edge).toBeGreaterThan(fire.frost_bite);
    expect(ice.frost_bite).toBeGreaterThan(ice.searing_edge);
  });

  it('rolls = 1 + floor(3 x performance) + floor(RP / 5), without repeats, tier from complexity', () => {
    const v = { heat: 6, force: 5, motion: 5, cold: 6 };
    constantRandom(0.3);
    expect(Inv.rollProperties(v, 'weapon', 0, 0).length).toBe(1);
    expect(Inv.rollProperties(v, 'weapon', 0.7, 0).length).toBe(3);
    const many = Inv.rollProperties(v, 'weapon', 1, 10);
    expect(many.length).toBe(4); // only 4 weapon properties can roll here
    expect(new Set(many.map((p) => p.id)).size).toBe(many.length);
    expect(Inv.tierFor(2, 0.5)).toBe('minor');
    expect(Inv.tierFor(2, 0.9)).toBe('standard'); // a great performance lifts it a step
    expect(Inv.tierFor(10, 0.9)).toBe('grand');
  });

  it('an invented piece pays its way, carries its properties and names the first', () => {
    const s = withBench(game());
    s.kp = 50;
    constantRandom(0.1);
    const before = { kp: s.kp, stone: s.player.inventory.stone };
    const it = Inv.finishInvention(
      s,
      { recipe: 'stone_spear', vectors: { heat: 7, force: 3 }, researchPoints: 2 },
      0.5,
    );
    expect(s.kp).toBe(before.kp - 10);
    expect(s.player.inventory.stone).toBe(before.stone - D.recipes.stone_spear.costs.stone);
    expect(it.props.length).toBeGreaterThan(0);
    expect(it.props[0].id).toBe('searing_edge');
    expect(itemName(it)).toBe('Searing Stone Spear');
    expect(s.player.gear.weapon).toBe(it);
    // Searing Edge at its tier adds damage on top of the base
    const add = D.properties.searing_edge.tiers[it.props[0].tier].stats.dmg;
    expect(playerDamage(s)).toBe(4 + add);
    expect(itemEffects(it)).toBeDefined();
  });
});
