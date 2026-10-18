// Grid building: snapping, validity, range, solid buildings, and Shrines near Standing Stones.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame, update } from '../src/systems/game.js';
import {
  enterPlacing,
  tryPlaceBuilding,
  placementCheck,
  awarenessMultiplier,
} from '../src/systems/building.js';
import { worldOf, isSolidTile, nodeAtTile, propAtTile, isReachable } from '../src/world/world.js';

const idle = { up: false, down: false, left: false, right: false };

function game(seed = 606) {
  const s = makeInitialState();
  newGame(s, seed);
  s.enemies = [];
  s.tech.basic_construction = true;
  s.tech.woodworking = true;
  s.tech.shamanic_rites = true;
  Object.assign(s.player.inventory, { wood: 500, stone: 500, fiber: 500 });
  return s;
}

const center = (w, tx, ty) => ({ x: (tx + 0.5) * w.ts, y: (ty + 0.5) * w.ts });

/** The first tile near the player for which `test(tx, ty)` holds. */
function findTile(s, test, maxR = 5) {
  const w = worldOf(s);
  const px = Math.floor(s.player.x / w.ts);
  const py = Math.floor(s.player.y / w.ts);
  for (let r = 1; r <= maxR; r++)
    for (let ty = py - r; ty <= py + r; ty++)
      for (let tx = px - r; tx <= px + r; tx++) if (test(tx, ty)) return [tx, ty];
  return null;
}

/** Puts the player on an open tile a couple of tiles from a tile that `test` accepts, anywhere on the map. */
function standNear(s, test) {
  const w = worldOf(s);
  const offsets = [
    [0, 2],
    [0, -2],
    [2, 0],
    [-2, 0],
    [2, 2],
    [-2, -2],
    [2, -2],
    [-2, 2],
    [0, 3],
    [3, 0],
    [0, -3],
    [-3, 0],
  ];
  for (let ty = 2; ty < w.h - 2; ty++)
    for (let tx = 2; tx < w.w - 2; tx++) {
      if (!test(tx, ty)) continue;
      for (const [dx, dy] of offsets) {
        const x = tx + dx;
        const y = ty + dy;
        if (isReachable(w, x, y) && !nodeAtTile(w, x, y) && !propAtTile(w, x, y)) {
          Object.assign(s.player, center(w, x, y));
          return [tx, ty];
        }
      }
    }
  throw new Error('no such tile');
}

describe('Placement', () => {
  it('snaps to the tile grid, centered on the footprint', () => {
    const s = game();
    const w = worldOf(s);
    const p = placementCheck(s, 'campfire', s.player.x + 40.7, s.player.y - 3.2);
    expect(p.x % w.ts).toBe(w.ts / 2);
    expect(p.y % w.ts).toBe(w.ts / 2);
    const hut = placementCheck(s, 'hut', s.player.x + 64, s.player.y);
    expect(hut.tiles.length).toBe(4);
    expect(hut.x % w.ts).toBe(0); // a 2 by 2 footprint centers on a tile corner
  });

  it('places on open ground within range, and refuses beyond 6 tiles', () => {
    const s = game();
    const w = worldOf(s);
    const [tx, ty] = findTile(
      s,
      (x, y) =>
        !isSolidTile(w, x, y) &&
        !nodeAtTile(w, x, y) &&
        !propAtTile(w, x, y) &&
        (x !== Math.floor(s.player.x / 32) || y !== Math.floor(s.player.y / 32)),
    );
    const c = center(w, tx, ty);
    expect(placementCheck(s, 'campfire', c.x, c.y).ok).toBe(true);
    const far = placementCheck(s, 'campfire', s.player.x + 7 * w.ts, s.player.y);
    expect(far).toMatchObject({ ok: false, reason: 'Too far away' });
    enterPlacing(s, 'campfire');
    expect(tryPlaceBuilding(s, c.x, c.y)).toBe(true);
    expect(s.buildings.at(-1)).toMatchObject({ type: 'campfire', tx, ty });
    // the same tile is now taken
    enterPlacing(s, 'palisade');
    expect(placementCheck(s, 'palisade', c.x, c.y)).toMatchObject({
      ok: false,
      reason: 'Another building is there',
    });
    expect(tryPlaceBuilding(s, c.x, c.y)).toBe(false);
  });

  it('cannot overlap water, rock, walls, trees, props, landmarks or the Nexus', () => {
    const s = game();
    const w = worldOf(s);
    const id = (x, y) => w.terrainIds[w.terrain[y * w.w + x]];
    const cases = [
      [(x, y) => id(x, y) === 'water', 'Blocked ground'],
      [(x, y) => id(x, y) === 'hills_rock', 'Blocked ground'],
      [(x, y) => w.solid[y * w.w + x] === 1, 'Blocked ground'],
      [(x, y) => nodeAtTile(w, x, y)?.type === 'tree', 'Something is in the way'],
      [(x, y) => nodeAtTile(w, x, y)?.type === 'bush', 'Something is in the way'],
      [(x, y) => propAtTile(w, x, y)?.type === 'ruin_statue', 'Something is in the way'],
      [
        (x, y) => w.landmarks.some((l) => l.type === 'spring' && l.tx === x && l.ty === y),
        'Something is in the way',
      ],
      [
        (x, y) => x === Math.floor(w.nexus.x / 32) && y === Math.floor(w.nexus.y / 32),
        'Something is in the way',
      ],
    ];
    for (const [test, reason] of cases) {
      const [tx, ty] = standNear(s, test);
      const c = center(w, tx, ty);
      expect(placementCheck(s, 'campfire', c.x, c.y), reason).toMatchObject({ ok: false, reason });
    }
  });

  it('a blocking building cannot go where you stand, but a campfire can', () => {
    const s = game();
    expect(placementCheck(s, 'palisade', s.player.x, s.player.y)).toMatchObject({
      ok: false,
      reason: 'You are standing there',
    });
    expect(placementCheck(s, 'campfire', s.player.x, s.player.y).ok).toBe(true);
  });

  it('needs the materials', () => {
    const s = game();
    s.player.inventory.wood = 0;
    expect(placementCheck(s, 'campfire', s.player.x, s.player.y)).toMatchObject({
      ok: false,
      reason: 'Not enough resources',
    });
  });

  it('a placed palisade blocks movement', () => {
    const s = game();
    const w = worldOf(s);
    const [tx, ty] = findTile(
      s,
      (x, y) => y === Math.floor(s.player.y / 32) && x === Math.floor(s.player.x / 32) + 2,
    );
    expect(isSolidTile(w, tx, ty)).toBe(false);
    enterPlacing(s, 'palisade');
    const c = center(w, tx, ty);
    expect(tryPlaceBuilding(s, c.x, c.y)).toBe(true);
    Object.assign(s.player, center(w, tx - 1, ty));
    for (let i = 0; i < 30; i++) update(s, { ...idle, right: true });
    expect(s.player.x).toBeLessThanOrEqual(tx * w.ts - D.game.player.radius);
  });
});

describe('Shrines and Standing Stones', () => {
  it("a Shrine's Awareness speed doubles near Standing Stones", () => {
    const s = game();
    const w = worldOf(s);
    s.nexus.dig = D.nexus.digSteps; // excavated
    const [stones] = w.landmarks.filter((l) => l.type === 'standing_stones');
    const R = D.landmarks.standing_stones.effect.radius;
    // one Shrine beside the stones
    Object.assign(s.player, { x: stones.x, y: stones.y + 40 });
    enterPlacing(s, 'shrine');
    const spot = findTile(
      s,
      (x, y) =>
        Math.hypot(x - stones.tx, y - stones.ty) <= R - 1 &&
        placementCheck(s, 'shrine', center(w, x, y).x, center(w, x, y).y).ok,
    );
    expect(spot).not.toBeNull();
    expect(tryPlaceBuilding(s, center(w, ...spot).x, center(w, ...spot).y)).toBe(true);
    expect(awarenessMultiplier(s, s.buildings[0])).toBe(2);

    // 40 Awareness takes 180 x 40 / 2 = 3,600 frames for one Shrine at double speed.
    for (let i = 0; i < 3599; i++) {
      update(s, idle);
      s.enemies = [];
      s.player.hp = s.player.maxHp;
    }
    expect(s.nexus.awake).toBe(false);
    update(s, idle);
    expect(s.nexus.awake).toBe(true);
  });

  it('a Shrine far from any stones attunes at the normal speed', () => {
    const s = game();
    const w = worldOf(s);
    s.nexus.dig = D.nexus.digSteps;
    Object.assign(s.player, { x: w.nexus.x, y: w.nexus.y + 64 });
    enterPlacing(s, 'shrine');
    expect(tryPlaceBuilding(s, w.nexus.x + 64, w.nexus.y + 64)).toBe(true);
    expect(awarenessMultiplier(s, s.buildings[0])).toBe(1);
    for (let i = 0; i < 180 * 10; i++) {
      update(s, idle);
      s.enemies = [];
    }
    expect(s.nexus.awareness).toBe(10);
  });
});
