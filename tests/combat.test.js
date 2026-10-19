// Overworld combat (M15): light, heavy and ranged attacks, the dodge, stamina, weapon types and
// enemy telegraphs.
import { describe, it, expect, afterEach } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame, update } from '../src/systems/game.js';
import {
  addEnemy,
  lightAttack,
  startCharge,
  releaseHeavy,
  fireRanged,
  dodge,
  weaponType,
  enemiesInSwing,
} from '../src/systems/combat.js';
import { wear, constantRandom, restoreRandom } from './helpers/setup.js';

afterEach(restoreRandom);

const K = D.game.combat;
const idle = { up: false, down: false, left: false, right: false };

/** A quiet spot: the spawn, with no other enemies and the frame off the ambient spawn beat. */
function game() {
  const s = makeInitialState();
  newGame(s, 1515);
  s.enemies = [];
  s.frame = 1;
  return s;
}

function wolfAt(s, dx, dy = 0, hp = 50) {
  const e = addEnemy(s, 'wolf', s.player.x + dx, s.player.y + dy);
  e.hp = e.maxHp = hp;
  e.state = 'aggro';
  e.attackCooldown = 999; // standing still, not striking, unless a test says otherwise
  return e;
}

function frames(s, n) {
  for (let i = 0; i < n; i++) {
    update(s, idle);
    s.frame += s.frame % D.game.ambient.every === 0 ? 1 : 0; // skip ambient spawns
  }
}

describe('Light attack', () => {
  it('hits for the weapon damage x 0.85..1.15, costs 8 stamina, then the weapon cooldown', () => {
    const s = game();
    wear(s, s.player, 'stone_spear'); // 4 damage
    const w = wolfAt(s, 30);
    constantRandom(0.5); // x1.0
    const hit = lightAttack(s, w);
    expect(hit).toEqual([w]);
    expect(w.hp).toBe(50 - 4);
    expect(s.player.stamina).toBe(100 - K.light.stamina);
    expect(s.gatherCooldown).toBe(D.gear.weaponTypes.spear.cooldown);
    expect(lightAttack(s, w)).toBeNull(); // still cooling down
  });

  it('reaches as far as the weapon type, within its arc', () => {
    const s = game();
    const right = { x: 1, y: 0 };
    const near = wolfAt(s, 30);
    const far = wolfAt(s, 60);
    const behind = wolfAt(s, -30);
    expect(weaponType(s).key).toBe('fists');
    expect(enemiesInSwing(s, right, 32, 100)).toEqual([near]); // fists: reach 32
    wear(s, s.player, 'stone_spear');
    const W = weaponType(s);
    expect(enemiesInSwing(s, right, W.reach, W.arc)).toEqual([near, far]); // spear: reach 56
    expect(enemiesInSwing(s, right, W.reach, W.arc)).not.toContain(behind);
    const side = wolfAt(s, 20, 25);
    expect(enemiesInSwing(s, right, W.reach, W.arc)).not.toContain(side); // spear's 40 degree arc
    s.player.gear.weapon = null;
    wear(s, s.player, 'stone_axe');
    const A = weaponType(s);
    expect(enemiesInSwing(s, right, A.reach, A.arc)).toContain(side); // axe sweeps 130 degrees
  });

  it('needs the stamina', () => {
    const s = game();
    const w = wolfAt(s, 20);
    s.player.stamina = K.light.stamina - 1;
    expect(lightAttack(s, w)).toBeNull();
    expect(w.hp).toBe(50);
  });
});

describe('Heavy attack', () => {
  it('a full charge deals x2.6, knocks back and stuns, for 25 stamina', () => {
    const s = game();
    wear(s, s.player, 'stone_axe'); // 3 damage, knockback 10
    const w = wolfAt(s, 25);
    const x0 = w.x;
    expect(startCharge(s)).toBe(true);
    frames(s, K.heavy.chargeFrames);
    constantRandom(0.5);
    const hit = releaseHeavy(s, w);
    expect(hit).toEqual([w]);
    expect(w.hp).toBe(50 - Math.round(3 * K.heavy.mul[1]));
    expect(s.player.stamina).toBeGreaterThanOrEqual(100 - K.heavy.stamina - 1);
    expect(s.player.stamina).toBeLessThanOrEqual(100 - K.heavy.stamina + 1);
    expect(w.x).toBeGreaterThan(x0); // knocked away
    expect(w.stun).toBe(K.heavy.stun);
  });

  it('released early it is just a light attack', () => {
    const s = game();
    const w = wolfAt(s, 20);
    startCharge(s);
    frames(s, K.heavy.minCharge - 2);
    constantRandom(0.5);
    releaseHeavy(s, w);
    expect(w.hp).toBe(50 - D.game.player.unarmedDmg);
    expect(w.stun).toBe(0);
  });

  it('a stunned enemy neither moves nor winds up', () => {
    const s = game();
    const w = wolfAt(s, 20);
    w.attackCooldown = 0;
    w.stun = 10;
    frames(s, 5);
    expect(w.windup).toBe(0);
  });
});

describe('Ranged', () => {
  it('throws a stone (2 damage, range 180) for 10 stamina and 1 stone', () => {
    const s = game();
    s.player.inventory.stone = 2;
    const far = wolfAt(s, 300);
    expect(fireRanged(s)).toBeNull(); // out of range
    const w = wolfAt(s, 120);
    constantRandom(0.5);
    const p = fireRanged(s);
    expect(p.dmg).toBe(K.ranged.dmg);
    expect(s.player.inventory.stone).toBe(1);
    expect(s.player.stamina).toBe(100 - K.ranged.stamina);
    frames(s, 30);
    expect(w.hp).toBe(50 - 2);
    expect(far.hp).toBe(50);
    expect(s.projectiles).toEqual([]);
  });

  it('a sling fires for its own damage at range 300', () => {
    const s = game();
    s.player.inventory.stone = 1;
    wear(s, s.player, 'sling');
    const w = wolfAt(s, 260);
    constantRandom(0.5);
    expect(fireRanged(s).dmg).toBe(5);
    frames(s, 50);
    expect(w.hp).toBe(50 - 5);
  });

  it('needs ammunition', () => {
    const s = game();
    s.player.inventory.stone = 0;
    wolfAt(s, 60);
    expect(fireRanged(s)).toBeNull();
  });
});

describe('Dodge and telegraphs', () => {
  it('an enemy winds up before striking, and the strike lands if the player stays', () => {
    const s = game();
    const w = wolfAt(s, 15);
    w.attackCooldown = 0;
    frames(s, 1);
    expect(w.windup).toBe(D.enemies.wolf.overworld.windup);
    frames(s, D.enemies.wolf.overworld.windup);
    expect(s.player.hp).toBe(s.player.maxHp - 2);
  });

  it('a dodge during the wind-up avoids the telegraphed hit', () => {
    const s = game();
    const w = wolfAt(s, 15);
    w.attackCooldown = 0;
    frames(s, D.enemies.wolf.overworld.windup - 4); // nearly ready to strike
    expect(dodge(s, { x: -1, y: 0 })).toBe(true);
    expect(s.player.stamina).toBe(100 - K.dodge.stamina);
    frames(s, 6);
    expect(s.player.hp).toBe(s.player.maxHp);
    expect(s.logMessages.some((m) => /lunges and misses/.test(m))).toBe(true);
  });

  it('dodging is untouchable for its first 12 frames even standing in reach', () => {
    const s = game();
    const w = wolfAt(s, 15);
    w.attackCooldown = 0;
    frames(s, D.enemies.wolf.overworld.windup - 2);
    // dodge into a wall-free direction; the wolf follows nothing while it winds up
    dodge(s, { x: 1, y: 0 }); // toward the wolf: still within reach, but untouchable
    frames(s, 4);
    expect(s.player.hp).toBe(s.player.maxHp);
  });

  it('stamina refills after a pause', () => {
    const s = game();
    s.player.stamina = 50;
    s.player.staminaRest = 0;
    frames(s, K.stamina.regenDelay);
    expect(s.player.stamina).toBe(50);
    frames(s, 20);
    expect(s.player.stamina).toBeCloseTo(50 + 20 * K.stamina.regen, 5); // regen starts once the rest passes 30 frames
  });
});
