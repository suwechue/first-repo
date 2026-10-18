// The save format (v3: the seed plus what changed, and character depth): round trips, v1 imports,
// prototype files, bad files.
import { describe, it, expect, afterEach } from 'vitest';
import { makeInitialState } from '../src/core/state.js';
import { serialize, apply } from '../src/core/save.js';
import { rand, createRng, useRandomSource } from '../src/core/rng.js';
import { newGame, update, loadGame } from '../src/systems/game.js';
import { getWorld } from '../src/world/world.js';
import { launch } from '../src/systems/missions.js';
import { D } from '../src/core/content.js';
import { handleInteract } from '../src/systems/game.js';
import { enterPlacing, tryPlaceBuilding, placementCheck } from '../src/systems/building.js';
import { discover } from '../src/systems/exploration.js';
import { walkTo } from './helpers/walk.js';
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

/** A session that touches every kind of saved change: gathering, a relic, fog, landmarks, a building. */
function exploredState() {
  const s = makeInitialState();
  newGame(s, 4321);
  const w = getWorld(4321);
  const pile = w.nodes.find((n) => n.type === 'salvage_pile' && n.relic);
  walkTo(s, (x, y) => x === pile.tx && y === pile.ty);
  for (let i = 0; i < D.resources.salvage_pile.amount; i++) {
    s.gatherCooldown = 0;
    handleInteract(s);
  }
  const den = w.landmarks.find((l) => l.type === 'wolf_den');
  discover(s, den);
  s.landmarks[den.id].hp = 7;
  discover(
    s,
    w.landmarks.find((l) => l.type === 'watchtower'),
  );
  s.tech.fire_making = true;
  s.player.inventory.wood = 10;
  s.player.inventory.stone = 10;
  enterPlacing(s, 'campfire');
  const spot = [];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const p = placementCheck(s, 'campfire', s.player.x + dx * 32, s.player.y + dy * 32);
      if (p.ok) spot.push(p);
    }
  expect(spot.length).toBeGreaterThan(0);
  expect(tryPlaceBuilding(s, spot[0].x, spot[0].y)).toBe(true);
  for (let i = 0; i < 300; i++) update(s, { up: true, down: false, left: false, right: false });
  return s;
}

describe('Save and load', () => {
  it('a save and load round trip after exploring matches exactly', () => {
    const s = exploredState();
    expect(Object.keys(s.nodes).length).toBeGreaterThan(0);
    expect(Object.keys(s.relics).length).toBe(1);
    expect(s.buildings.length).toBe(1);
    const first = JSON.stringify(serialize(s, 42));
    const t = makeInitialState();
    expect(loadGame(t, JSON.parse(first))).toBeNull();
    expect(JSON.stringify(serialize(t, 42))).toBe(first);
    expect([t.player.x, t.player.y]).toEqual([s.player.x, s.player.y]);
    expect(t.enemies).toEqual([]); // enemies are never saved
  });

  it('stores the seed and what changed, not the world', () => {
    const s = exploredState();
    const data = serialize(s);
    expect(data.v).toBe(6);
    expect(data.seed).toBe(4321);
    expect(data.resources).toBeUndefined();
    expect(data.enemies).toBeUndefined();
    expect(Object.keys(data.nodes).length).toBeLessThan(5); // only the nodes gathered from
    expect(JSON.stringify(data).length).toBeLessThan(40000);
  });

  it('drops malformed world changes instead of trusting them', () => {
    const data = serialize(exploredState());
    data.nodes.bogus = { amount: 'lots' };
    data.fog = [1, -2, 'x'];
    data.buildings.push({ type: 'castle', x: 1, y: 2 }, null);
    data.landmarks = [];
    const t = makeInitialState();
    expect(apply(t, data)).toBeNull();
    expect(t.nodes.bogus).toBeUndefined();
    expect(t.fog).toEqual([]);
    expect(t.buildings.map((b) => b.type)).toEqual(['campfire']);
    expect(t.landmarks).toEqual({});
  });

  it('a v1 file imports with its roster, tech and inventory and starts a new world', () => {
    const old = playedState();
    const v1 = JSON.parse(JSON.stringify(serialize(old, 99)));
    // Shape it like a version 1 file: the single-screen map's nodes, enemies and positions.
    v1.v = 1;
    delete v1.nodes;
    delete v1.relics;
    delete v1.fog;
    delete v1.landmarks;
    v1.resources = [
      { id: 'tree_0_1', type: 'tree', x: 100, y: 120, amount: 2, maxAmount: 5, respawnTimer: 0 },
    ];
    v1.enemies = [{ id: 'wolf_1', x: 10, y: 10, hp: 8 }];
    v1.buildings = [{ type: 'shrine', x: 700, y: 200, radius: 14, color: '#8f7ad1', awarenessTimer: 30 }];
    Object.assign(v1.player, { x: 450, y: 280, w: 20, h: 20 });
    v1.tech.woodworking = true;
    v1.player.inventory.wood = 37;

    const t = makeInitialState();
    expect(loadGame(t, v1)).toBeNull();
    expect(t.roster).toEqual(JSON.parse(JSON.stringify(old.roster)));
    expect(t.tech.woodworking).toBe(true);
    expect(t.player.inventory.wood).toBe(37);
    expect(t.missionLog.length).toBe(old.missionLog.length);
    expect(t.nexus.awake).toBe(true);
    // a new world: nothing from the old map survives, and the player stands at the new spawn
    const w = getWorld(t.seed);
    expect([t.player.x, t.player.y]).toEqual([w.spawn.x, w.spawn.y]);
    expect(t.buildings).toEqual([]);
    expect(t.nodes).toEqual({});
    expect(t.player.w).toBeUndefined();
    expect(serialize(t).v).toBe(6);
    // and it plays on
    for (let i = 0; i < 60; i++) update(t, { up: false, down: true, left: false, right: false });
  });

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
    // the beta's fields come across unchanged; character depth fields are filled in by the migration
    expect(
      t.roster.map((c, i) => Object.fromEntries(Object.keys(st.roster[i]).map((k) => [k, plain(c)[k]]))),
    ).toEqual(plain(st.roster));
    expect(t.roster.every((c) => c.history.length && c.skills && c.talentRanks)).toBe(true);
    expect(Object.keys(t.bondMeta).sort()).toEqual(Object.keys(t.bonds).sort());
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
