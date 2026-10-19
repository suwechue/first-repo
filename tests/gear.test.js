// Gear and armor (M14): six slots for the player and every character, item quality, and what each
// slot's pieces do.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame, update, handleInteract } from '../src/systems/game.js';
import { tryCraft } from '../src/systems/crafting.js';
import * as Ms from '../src/systems/missions.js';
import { statEff } from '../src/systems/characters.js';
import {
  SLOTS,
  createItem,
  equip,
  itemStat,
  itemEffects,
  armorMod,
  gearPower,
  playerDamage,
  damageToPlayer,
  playerEffect,
} from '../src/systems/gear.js';
import { migrate } from '../src/core/migrations.js';
import { constantRandom, restoreRandom, wear } from './helpers/setup.js';
import { afterEach } from 'vitest';

afterEach(restoreRandom);

function game() {
  const s = makeInitialState();
  newGame(s, 1414);
  s.enemies = [];
  return s;
}

const idle = { up: false, down: false, left: false, right: false };

describe('Slots and quality', () => {
  it('the player and every character have the same six slots', () => {
    const s = game();
    expect(SLOTS).toEqual(['weapon', 'offhand', 'head', 'body', 'hands', 'feet']);
    expect(Object.keys(s.player.gear)).toEqual(SLOTS);
    for (const c of s.roster) expect(Object.keys(c.gear)).toEqual(SLOTS);
  });

  it('quality scales a piece: Crude x0.8, Fine x1.2, Masterwork x1.45', () => {
    const s = game();
    const q = (quality) => createItem(s, 'hide_armor', quality);
    expect(itemStat(q('standard'), 'gear')).toBe(4);
    expect(itemStat(q('crude'), 'gear')).toBeCloseTo(3.2, 10);
    expect(itemStat(q('fine'), 'armorMod')).toBeCloseTo(0.144, 10);
    expect(itemStat(q('masterwork'), 'defense')).toBeCloseTo(2.9, 10);
    // a multiplier effect moves its distance from 1 by the quality
    const cloak = createItem(s, 'verdant_cloak', 'masterwork');
    expect(itemEffects(cloak).encounterMul).toBeCloseTo(1 - 0.05 * 1.45, 10);
  });

  it('armor from every piece adds up, to a cap of 0.5', () => {
    const s = game();
    const k = s.roster[0];
    wear(s, k, 'hide_armor');
    wear(s, k, 'hide_cap');
    wear(s, k, 'wooden_shield');
    expect(armorMod(k)).toBeCloseTo(0.12 + 0.05 + 0.04, 10);
    expect(gearPower(k)).toBe(4 + 1 + 1);
    for (const sl of ['body', 'head', 'offhand']) equip(s, k, sl, null);
    wear(s, k, 'verdant_cloak', 'masterwork');
    wear(s, k, 'hide_cap', 'masterwork');
    wear(s, k, 'wooden_shield', 'masterwork');
    wear(s, k, 'hide_boots', 'masterwork');
    wear(s, k, 'hide_gloves', 'masterwork');
    expect(armorMod(k)).toBeLessThanOrEqual(D.gear.armorModCap);
    expect(Ms.injuryChance(k, 1, true)).toBeLessThan(0.35 * 0.6);
  });
});

describe('What each slot does', () => {
  it('weapon: the player hits with its damage; a squad member gains its gear in Combat Power', () => {
    const s = game();
    expect(playerDamage(s)).toBe(D.game.player.unarmedDmg);
    wear(s, s.player, 'stone_spear');
    expect(playerDamage(s)).toBe(4);
    const k = s.roster[0];
    const cp = Ms.combatPower(k, 'explore');
    wear(s, k, 'stone_spear');
    expect(Ms.combatPower(k, 'explore')).toBe(cp + 4);
  });

  it('off-hand: a shield blocks some hits outright', () => {
    const s = game();
    wear(s, s.player, 'wooden_shield');
    expect(playerEffect(s, 'blockChance')).toBeCloseTo(0.15, 10);
    s.enemies.push({
      id: 'w',
      type: 'wolf',
      x: s.player.x + 10,
      y: s.player.y,
      hp: 8,
      maxHp: 8,
      dmg: 2,
      speed: 1.4,
      state: 'aggro',
      wanderTarget: { x: 0, y: 0 },
      attackCooldown: 0,
    });
    s.frame = 1;
    constantRandom(0.1); // under the block chance
    for (let i = 0; i <= D.enemies.wolf.overworld.windup; i++) update(s, idle); // wind-up, then the strike
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.logMessages[0]).toMatch(/block/);
  });

  it('head and body: defense comes off every hit, never below 1', () => {
    const s = game();
    expect(damageToPlayer(s, 3)).toBe(3);
    wear(s, s.player, 'hide_cap');
    wear(s, s.player, 'hide_armor');
    expect(damageToPlayer(s, 5)).toBe(2);
    expect(damageToPlayer(s, 2)).toBe(1);
  });

  it("head: a Scout's Hood gives a squad member +1 PER", () => {
    const s = game();
    const k = s.roster[0];
    const per = statEff(k, 'per');
    wear(s, k, 'scout_hood');
    expect(statEff(k, 'per')).toBe(per + 1);
  });

  it('hands: gloves make the player gather faster and a squad member gather better', () => {
    const s = game();
    const k = s.roster[0];
    const cp = Ms.combatPower(k, 'gather');
    wear(s, k, 'hide_gloves');
    expect(Ms.combatPower(k, 'gather')).toBe(cp + 1 + 1); // gear 1 + gatherCp 1
    wear(s, s.player, 'hide_gloves');
    expect(playerEffect(s, 'gatherSpeed')).toBeCloseTo(0.2, 10);
  });

  it('feet: boots make the player move faster', () => {
    const s = game();
    const x0 = s.player.x;
    for (let i = 0; i < 10; i++) update(s, { ...idle, right: true });
    const plain = s.player.x - x0;
    const t = game();
    wear(t, t.player, 'hide_boots');
    const x1 = t.player.x;
    for (let i = 0; i < 10; i++) update(t, { ...idle, right: true });
    expect(t.player.x - x1).toBeCloseTo(plain * 1.1, 1);
  });
});

describe('Crafting', () => {
  it('a crafted piece goes on the player if the slot is free, else to the armory', () => {
    const s = game();
    Object.assign(s.player.inventory, { wood: 20, stone: 20 });
    expect(tryCraft(s, 'stone_axe')).toBe(true);
    expect(s.player.gear.weapon.base).toBe('stone_axe');
    expect(tryCraft(s, 'stone_spear')).toBe(true);
    expect(s.armory.map((it) => it.base)).toEqual(['stone_spear']);
    s.gatherCooldown = 0;
    handleInteract(s); // nothing to break here; just make sure the game still runs
  });
});

describe('Save v8', () => {
  it("a v7 save's counts become pieces, and weapon and armor move into the new slots", () => {
    const v7 = {
      v: 7,
      player: { weaponDmg: 4, inventory: {} },
      armory: { stone_axe: 2, hide_armor: 1 },
      roster: [{ id: 'c1', cls: 'warrior', gear: { weapon: 'stone_spear', armor: 'hide_armor' } }],
    };
    const { data } = migrate(v7);
    expect(data.v).toBe(9);
    expect(data.armory.map((it) => it.base)).toEqual(['stone_axe', 'stone_axe', 'hide_armor']);
    expect(data.roster[0].gear.weapon.base).toBe('stone_spear');
    expect(data.roster[0].gear.body.base).toBe('hide_armor');
    expect(data.player.gear.weapon.base).toBe('stone_spear'); // the beta's spear damage, as a spear
    expect(data.player.weaponDmg).toBeUndefined();
    const ids = [...data.armory, data.roster[0].gear.weapon, data.player.gear.weapon].map((it) => it.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(data.nextItemId).toBe(ids.length + 2);
  });
});
