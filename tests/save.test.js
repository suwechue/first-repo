// The v1 save format: round trips, prototype files, bad files.
import { describe, it, expect, afterEach } from 'vitest';
import { makeInitialState } from '../src/core/state.js';
import { serialize, apply } from '../src/core/save.js';
import { rand, createRng, useRandomSource } from '../src/core/rng.js';
import { newGame, update, loadGame } from '../src/systems/game.js';
import { getWorld } from '../src/world/world.js';
import { launch } from '../src/systems/missions.js';
import { loadReference, referenceAvailable } from '../tools/reference.js';

afterEach(() => useRandomSource(null));

function playedState() {
  const s = makeInitialState();
  newGame(s, 1234);
  s.nexus.awake = true;
  s.player.inventory.supplies = 20;
  launch(s, {
    realm: 'verdant_wilds',
    zone: 'fringe',
    objective: 'explore',
    squad: s.roster.slice(0, 3).map((c) => c.id),
  });
  const input = { up: false, down: false, left: false, right: true };
  for (let i = 0; i < 500; i++) update(s, input);
  return s;
}

describe('Save and load', () => {
  it('serialize, reset, load and serialize again gives identical JSON', () => {
    const s = playedState();
    const first = JSON.stringify(serialize(s, 42));
    const t = makeInitialState();
    expect(apply(t, JSON.parse(first))).toBeNull();
    expect(JSON.stringify(serialize(t, 42))).toBe(first);
  });

  it('continues the same random stream after loading', () => {
    const s = playedState();
    const data = serialize(s);
    const next = [rand(), rand(), rand()];
    const t = makeInitialState();
    apply(t, data);
    expect([rand(), rand(), rand()]).toEqual(next);
  });

  it('resets runtime-only fields on load', () => {
    const s = playedState();
    s.mode = 'PLACING';
    s.placingBuilding = 'hut';
    const t = makeInitialState();
    apply(t, serialize(s));
    expect(t.mode).toBe('EXPLORE');
    expect(t.placingBuilding).toBeNull();
  });

  it('rejects bad files with a message', () => {
    const t = makeInitialState();
    expect(apply(t, null)).toMatch(/Not a save/);
    expect(apply(t, [])).toMatch(/Not a save/);
    expect(apply(t, { hello: 1 })).toMatch(/no version/);
    expect(apply(t, { v: 99, player: {}, roster: [] })).toMatch(/newer version/);
    expect(apply(t, { v: 0, player: {}, roster: [] })).toMatch(/Unsupported/);
    expect(apply(t, { v: 2, roster: [] })).toMatch(/incomplete/);
    expect(apply(t, { v: 2, player: {}, roster: 'no' })).toMatch(/incomplete/);
    expect(apply(t, { v: 1, roster: [] })).toMatch(/incomplete/);
  });

  it('fills fields a save lacks from a fresh state, including zones added later', () => {
    const t = makeInitialState();
    const err = apply(t, {
      v: 2,
      player: { inventory: { wood: 5 } },
      roster: [],
      realms: { verdant_wilds: {} },
    });
    expect(err).toBeNull();
    expect(t.player.inventory.wood).toBe(5);
    expect(t.player.inventory.stone).toBe(0);
    expect(t.realms.verdant_wilds.fringe).toEqual({ explored: 0, cleared: 0, bossDown: false });
    expect(t.tech.fire_making).toBe(true);
    expect(t.tech.cooking).toBe(false);
  });
});

describe.skipIf(!referenceAvailable())('Importing a beta prototype save (v1)', () => {
  it('loads the roster, bonds, tech, inventory, armory and mission log', () => {
    const ref = loadReference(createRng(77), { withSave: true });
    ref.resetState();
    ref.characters.initStarters();
    const st = ref.state;
    st.nexus.awake = true;
    st.player.inventory.supplies = 10;
    st.player.inventory.wood = 33;
    st.armory = { stone_spear: 2 };
    st.kp = 17;
    ref.config.TECH.woodworking.unlocked = true;
    ref.missions.launch({
      realm: 'verdant_wilds',
      zone: 'fringe',
      objective: 'explore',
      squad: st.roster.map((c) => c.id),
    });
    st.enemies.push({
      id: 'wolf_1',
      x: 10,
      y: 10,
      hp: 8,
      maxHp: 8,
      dmg: 2,
      speed: 1.4,
      state: 'wander',
      wanderTarget: { x: 10, y: 10 },
      attackCooldown: 0,
    });
    const file = JSON.parse(JSON.stringify(ref.save.serialize()));

    const t = makeInitialState();
    expect(loadGame(t, file)).toBeNull();
    const plain = (o) => JSON.parse(JSON.stringify(o));
    // A new world: the old map, its nodes, buildings and enemies are gone; the player stands at the spawn.
    const world = getWorld(t.seed);
    expect([t.player.x, t.player.y]).toEqual([world.spawn.x, world.spawn.y]);
    expect(t.nodes).toEqual({});
    expect(t.buildings).toEqual([]);
    expect(t.enemies).toEqual([]);
    expect(t.nexus.awake).toBe(true);
    expect(plain(t.roster)).toEqual(plain(st.roster));
    expect(t.bonds).toEqual(plain(st.bonds));
    expect(t.player.inventory).toEqual(plain(st.player.inventory));
    expect(t.armory).toEqual({ stone_spear: 2 });
    expect(t.kp).toBe(17);
    expect(t.tech.woodworking).toBe(true);
    expect(t.tech.cooking).toBe(false);
    expect(t.missionLog.length).toBe(1);
    expect(t.realms).toEqual(plain(st.realms));
    // and it plays on
    const input = { up: false, down: false, left: false, right: false };
    for (let i = 0; i < 100; i++) update(t, input);
  });
});
