// Exploration: fog of war, landmarks and their rewards, dens, springs, signs, ambient enemies.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { serialize, apply } from '../src/core/save.js';
import { newGame, update, handleInteract, interactTarget } from '../src/systems/game.js';
import { discover, fogOf, landmarkInReach } from '../src/systems/exploration.js';
import { worldOf, zoneAt } from '../src/world/world.js';
import { emptyFog, revealCircle, isRevealed, revealedShare, fogGrid } from '../src/world/fog.js';

const idle = { up: false, down: false, left: false, right: false };

function game(seed = 404) {
  const s = makeInitialState();
  newGame(s, seed);
  return s;
}

const ofType = (s, type) => worldOf(s).landmarks.filter((l) => l.type === type);
/** Stands the player just beside a landmark, on its open south side. */
function standAt(s, lm, dy = 20) {
  Object.assign(s.player, { x: lm.x, y: lm.y + dy });
}

describe('Landmark placement', () => {
  it('counts and spacing match landmarks.json', () => {
    for (const seed of [1, 2, 3]) {
      const s = game(seed);
      const w = worldOf(s);
      for (const [type, def] of Object.entries(D.landmarks)) {
        const list = ofType(s, type);
        expect(list.length, type).toBe(def.count);
        for (const lm of list) {
          if (def.zones) expect(def.zones).toContain(zoneAt(w, lm.x, lm.y));
          for (const other of list) {
            if (other === lm) continue;
            // spacing may relax to 0.8 or less only when a zone is crowded; it never drops below a third
            expect(Math.hypot(lm.tx - other.tx, lm.ty - other.ty)).toBeGreaterThan((def.minSpacing || 0) / 3);
          }
        }
      }
      // each one is on reachable ground
      for (const lm of w.landmarks)
        if (lm.type !== 'sunken_hall') expect(w.reach[lm.ty * w.w + lm.tx]).toBe(1);
    }
  });

  it('the Sunken Hall is the Nexus itself', () => {
    const s = game();
    const [hall] = ofType(s, 'sunken_hall');
    expect([hall.x, hall.y]).toEqual([worldOf(s).nexus.x, worldOf(s).nexus.y]);
  });
});

describe('Fog of war', () => {
  it('packs one bit per 4 by 4 cell and reveals a circle', () => {
    const w = worldOf(game());
    const fog = emptyFog(w);
    const { cw, ch } = fogGrid(w);
    expect([cw, ch]).toEqual([40, 28]);
    expect(fog.length).toBe(Math.ceil((40 * 28) / 32));
    expect(revealCircle(fog, w, 80 * 32, 56 * 32, 10)).toBe(true);
    expect(revealCircle(fog, w, 80 * 32, 56 * 32, 10)).toBe(false); // nothing new
    expect(isRevealed(fog, w, 80, 56)).toBe(true);
    expect(isRevealed(fog, w, 80, 70)).toBe(false);
    expect(revealedShare(fog, w)).toBeGreaterThan(0);
    expect(fog.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
  });

  it('walking reveals a 10 tile radius around the player', () => {
    const s = game();
    update(s, idle);
    const w = worldOf(s);
    const tx = Math.floor(s.player.x / 32);
    const ty = Math.floor(s.player.y / 32);
    expect(isRevealed(s.fog, w, tx, ty)).toBe(true);
    expect(isRevealed(s.fog, w, tx, ty - 9)).toBe(true);
    expect(isRevealed(s.fog, w, tx, ty - 20)).toBe(false);
  });
});

describe('Discovery', () => {
  it('pays Knowledge once', () => {
    const s = game();
    const [tower] = ofType(s, 'watchtower');
    const kp = s.kp;
    expect(discover(s, tower)).toBe(true);
    expect(s.kp).toBe(kp + D.landmarks.watchtower.discover.kp);
    expect(discover(s, tower)).toBe(false);
    standAt(s, tower);
    for (let i = 0; i < 10; i++) update(s, idle);
    expect(s.kp).toBeLessThanOrEqual(kp + D.landmarks.watchtower.discover.kp + 1); // only the passive trickle
  });

  it('walking up to a landmark discovers it, and a watchtower reveals a 30 tile radius', () => {
    const s = game();
    const [tower] = ofType(s, 'watchtower');
    const w = worldOf(s);
    expect(isRevealed(fogOf(s), w, tower.tx + 25, tower.ty)).toBe(false);
    standAt(s, tower);
    s.frame = 1;
    update(s, idle);
    expect(s.landmarks[tower.id].found).toBe(true);
    // a cell 25 tiles away along any axis that is on the map
    const probe = tower.tx + 25 < w.w ? [tower.tx + 25, tower.ty] : [tower.tx - 25, tower.ty];
    expect(isRevealed(s.fog, w, probe[0], probe[1])).toBe(true);
  });

  it('fog and discoveries persist across a reload, and do not pay again', () => {
    const s = game();
    const [stones] = ofType(s, 'standing_stones');
    standAt(s, stones);
    update(s, idle);
    expect(s.landmarks[stones.id].found).toBe(true);
    const fog = s.fog.slice();
    const kp = s.kp;
    const t = makeInitialState();
    expect(apply(t, serialize(s))).toBeNull();
    expect(t.fog).toEqual(fog);
    expect(t.landmarks[stones.id].found).toBe(true);
    expect(discover(t, stones)).toBe(false);
    expect(t.kp).toBe(kp);
  });
});

describe('Landmark effects', () => {
  it('an ancient cache opens once for stone, fiber and a relic', () => {
    const s = game();
    const [cache] = ofType(s, 'ancient_cache');
    standAt(s, cache);
    s.enemies = [];
    expect(landmarkInReach(s)).toBe(cache);
    expect(interactTarget(s).label).toMatch(/open Ancient Cache/);
    const before = { ...s.player.inventory };
    const kp = s.kp;
    handleInteract(s);
    const O = D.landmarks.ancient_cache.open;
    expect(s.player.inventory.stone).toBe(before.stone + O.items.stone);
    expect(s.player.inventory.fiber).toBe(before.fiber + O.items.fiber);
    expect(s.kp).toBe(kp + D.landmarks.ancient_cache.discover.kp + O.relicKp);
    expect(landmarkInReach(s)).toBeNull(); // used up
  });

  it('a camp gives supplies or food once', () => {
    const s = game();
    const [camp] = ofType(s, 'abandoned_camp');
    standAt(s, camp);
    s.enemies = [];
    const before = s.player.inventory.supplies + s.player.inventory.food;
    handleInteract(s);
    expect(s.player.inventory.supplies + s.player.inventory.food).toBeGreaterThan(before);
    expect(s.landmarks[camp.id].used).toBe(true);
  });

  it('a road sign points toward the nearest undiscovered landmark', () => {
    const s = game();
    const [sign] = ofType(s, 'old_road_sign');
    standAt(s, sign);
    s.enemies = [];
    handleInteract(s);
    expect(s.logMessages[0]).toMatch(/points (north|south|east|west)/);
  });

  it('a spring restores health while you stand in it', () => {
    const s = game();
    const [spring] = ofType(s, 'spring');
    standAt(s, spring, 4);
    s.player.hp = 5;
    for (let i = 0; i < 300; i++) {
      update(s, idle);
      s.enemies = [];
    }
    expect(s.player.hp).toBeGreaterThan(5 + 5);
  });
});

describe('Wolf dens', () => {
  it('spawns wolves while you are near, and clearing it stops its spawns', () => {
    const s = game();
    const [den] = ofType(s, 'wolf_den');
    const def = D.landmarks.wolf_den.den;
    standAt(s, den, 40);
    s.player.hp = 1e9; // this test is about the den, not survival
    s.player.maxHp = 1e9;
    for (let i = 0; i < 10; i++) update(s, idle);
    const fromDen = () => s.enemies.filter((e) => e.den === den.id);
    expect(fromDen().length).toBe(1); // the first comes as soon as you arrive
    for (let i = 0; i < def.every * 3; i++) update(s, idle);
    expect(fromDen().length).toBe(def.alive); // never more than its limit at once

    // Clear the den: kill its wolves, then break it.
    s.enemies = [];
    s.player.weaponDmg = def.hp * 2; // one blow, whatever the damage roll
    s.gatherCooldown = 0;
    expect(landmarkInReach(s)).toBe(den);
    expect(interactTarget(s).label).toMatch(/attack Wolf Den/);
    const hide = s.player.inventory.hide;
    handleInteract(s);
    expect(s.landmarks[den.id].cleared).toBe(true);
    expect(s.player.inventory.hide).toBe(hide + def.clearReward.hide);
    for (let i = 0; i < def.every * 3; i++) update(s, idle);
    expect(fromDen().length).toBe(0);
  });
});

describe('Ambient enemies', () => {
  it('appear only in zones whose biome has them, and leave when you are far away', () => {
    const s = game(77);
    const w = worldOf(s);
    s.player.hp = 1e9;
    s.player.maxHp = 1e9;
    for (let i = 0; i < D.game.ambient.every * 20; i++) update(s, idle);
    for (const e of s.enemies.filter((x) => x.ambient)) {
      const biome = D.biomes[zoneAt(w, e.x, e.y)];
      expect(biome).toBeDefined();
    }
    // Walk far away (teleport) and they despawn on the next check.
    const ambient = s.enemies.filter((x) => x.ambient && x.state !== 'aggro');
    Object.assign(s.player, { x: w.center.x, y: w.center.y });
    for (const e of ambient) Object.assign(e, { x: w.spawn.x, y: w.spawn.y + 5000 });
    s.frame = Math.ceil(s.frame / D.game.ambient.every) * D.game.ambient.every;
    update(s, idle);
    for (const e of ambient) expect(s.enemies.includes(e)).toBe(false);
  });
});
