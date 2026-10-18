// The open world: seeded generation, reachability, collision, and walking across the map.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { rand, seedRng } from '../src/core/rng.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame, update } from '../src/systems/game.js';
import { generateWorld, flood } from '../src/world/worldgen.js';
import { getWorld, zoneAt, isSolidTile, tileOf, isReachable, nodesNear } from '../src/world/world.js';
import { blockedAt, moveCircle } from '../src/world/collision.js';
import { createCamera, resizeCamera, followCamera, screenToWorld, setZoom } from '../src/render/camera.js';

const R = D.game.player.radius;

function blockedTile(world, i) {
  const t = D.world.terrain[world.terrainIds[world.terrain[i]]];
  const n = world.nodeAt[i];
  return !!t.blocks || (n >= 0 && D.resources[world.nodes[n].type].blocks > 0);
}

describe('World generation', () => {
  it('the same seed gives the same map, and a different seed a different one', () => {
    const a = generateWorld(42);
    const b = generateWorld(42);
    const c = generateWorld(43);
    expect(Buffer.from(a.terrain).equals(Buffer.from(b.terrain))).toBe(true);
    expect(Buffer.from(a.zone).equals(Buffer.from(b.zone))).toBe(true);
    expect(a.nodes).toEqual(b.nodes);
    expect(a.spawn).toEqual(b.spawn);
    expect(Buffer.from(a.terrain).equals(Buffer.from(c.terrain))).toBe(false);
  });

  it('never touches the game random stream', () => {
    seedRng(9);
    const expected = [rand(), rand()];
    seedRng(9);
    generateWorld(1234);
    expect([rand(), rand()]).toEqual(expected);
  });

  it('is 160 by 112 tiles, sealed at every edge', () => {
    const w = getWorld(7);
    expect([w.w, w.h, w.ts]).toEqual([160, 112, 32]);
    for (let x = 0; x < w.w; x++) {
      expect(isSolidTile(w, x, 0)).toBe(true);
      expect(isSolidTile(w, x, w.h - 1)).toBe(true);
    }
    for (let y = 0; y < w.h; y++) {
      expect(isSolidTile(w, 0, y)).toBe(true);
      expect(isSolidTile(w, w.w - 1, y)).toBe(true);
    }
    expect(isSolidTile(w, -1, 5)).toBe(true);
  });

  it('lays out rings: city at the center, outskirts, deep forest, then the Seal', () => {
    const w = getWorld(7);
    const at = (fx, fy) => zoneAt(w, fx * w.w * w.ts, fy * w.h * w.ts);
    expect(at(0.5, 0.5)).toBe('old_city');
    expect(zoneAt(w, w.spawn.x, w.spawn.y)).toBe(D.world.spawn.zone);
    expect(at(0.5, 0.25)).toBe('outskirts');
    expect(at(0.5, 0.06)).toBe('deep_forest');
    expect(at(0.02, 0.02)).toBe(D.world.seal.zone);
  });

  it('has a river with three passable fords, flanked by marsh', () => {
    for (const seed of [1, 2, 3]) {
      const w = getWorld(seed);
      const ids = new Set(Array.from(w.terrain, (t) => w.terrainIds[t]));
      expect(ids.has('water')).toBe(true);
      expect(ids.has('marsh')).toBe(true);
      expect(w.fords.length).toBe(3);
      for (const f of w.fords) {
        const tx = tileOf(w, f.x);
        const ty = tileOf(w, f.y);
        expect(w.terrainIds[w.terrain[ty * w.w + tx]]).toBe('ford');
        expect(isReachable(w, tx, ty)).toBe(true);
      }
    }
  });

  it('places hills with blocking rock faces in the deep forest', () => {
    const w = getWorld(5);
    expect(w.hills.length).toBeGreaterThanOrEqual(D.world.hills.count[0]);
    expect(Array.from(w.terrain).some((t) => w.terrainIds[t] === 'hills_rock')).toBe(true);
  });

  it('spawn, plaza and the Nexus are reachable, and no open tile is cut off', () => {
    for (const seed of [1, 2, 3, 4, 5, 99, 2026]) {
      const w = getWorld(seed);
      expect(isReachable(w, tileOf(w, w.spawn.x), tileOf(w, w.spawn.y))).toBe(true);
      expect(isReachable(w, tileOf(w, w.center.x), tileOf(w, w.center.y))).toBe(true);
      // some reachable tile lies within the Nexus's interact range
      const near = [];
      for (let ty = tileOf(w, w.nexus.y) - 3; ty <= tileOf(w, w.nexus.y) + 3; ty++)
        for (let tx = tileOf(w, w.nexus.x) - 3; tx <= tileOf(w, w.nexus.x) + 3; tx++)
          if (isReachable(w, tx, ty)) near.push([tx, ty]);
      expect(
        near.some(
          ([tx, ty]) =>
            Math.hypot((tx + 0.5) * 32 - w.nexus.x, (ty + 0.5) * 32 - w.nexus.y) < D.nexus.interactRange,
        ),
      ).toBe(true);
      const reach = flood(tileOf(w, w.spawn.y) * w.w + tileOf(w, w.spawn.x), w.w, w.h, (i) =>
        blockedTile(w, i),
      );
      let pockets = 0;
      let open = 0;
      const nexusTile = tileOf(w, w.nexus.y) * w.w + tileOf(w, w.nexus.x);
      for (let i = 0; i < w.w * w.h; i++) {
        if (blockedTile(w, i) || i === nexusTile) continue;
        open++;
        if (!reach[i]) pockets++;
      }
      expect(pockets).toBe(0);
      expect(open).toBeGreaterThan(6000);
    }
  });

  it('generates in well under a second', () => {
    const t = performance.now();
    generateWorld(31337);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('Collision', () => {
  const w = getWorld(11);

  it('cannot walk into water, rock, the Seal or a tree trunk', () => {
    const solid = { water: 0, hills_rock: 0, seal: 0 };
    for (let ty = 1; ty < w.h - 1; ty++) {
      for (let tx = 1; tx < w.w - 1; tx++) {
        const id = w.terrainIds[w.terrain[ty * w.w + tx]];
        if (id in solid) solid[id]++;
        if (id in solid && solid[id] < 5)
          expect(blockedAt(w, (tx + 0.5) * 32, (ty + 0.5) * 32, R)).toBe(true);
      }
    }
    const tree = w.nodes.find((n) => n.type === 'tree');
    expect(blockedAt(w, tree.x, tree.y, R)).toBe(true);
    expect(blockedAt(w, w.spawn.x, w.spawn.y, R)).toBe(false);
  });

  it('slides along a wall instead of sticking', () => {
    // Find an open tile with a solid tile to its right and an open tile below.
    let probe = null;
    for (let ty = 1; ty < w.h - 2 && !probe; ty++)
      for (let tx = 1; tx < w.w - 2 && !probe; tx++)
        if (
          isReachable(w, tx, ty) &&
          isReachable(w, tx, ty + 1) &&
          isSolidTile(w, tx + 1, ty) &&
          !blockedAt(w, (tx + 0.5) * 32, (ty + 0.5) * 32, R) &&
          !blockedAt(w, (tx + 0.5) * 32, (ty + 1.5) * 32, R)
        )
          probe = { x: (tx + 0.5) * 32, y: (ty + 0.5) * 32, wall: (tx + 1) * 32 };
    expect(probe).not.toBeNull();
    const p = { x: probe.x, y: probe.y };
    for (let i = 0; i < 20; i++) moveCircle(w, p, 2, 0.8, R);
    expect(p.x).toBeLessThanOrEqual(probe.wall - R);
    expect(p.y).toBeGreaterThan(probe.y + 10); // kept moving down while pressed against the wall
  });

  it('lets a mover that starts inside something solid walk out', () => {
    const tree = w.nodes.find((n) => n.type === 'tree');
    const p = { x: tree.x, y: tree.y };
    moveCircle(w, p, 0, 3, R);
    expect(p.y).toBe(tree.y + 3);
  });
});

describe('Crossing the map', () => {
  it('the player walks from Mossgate across a ford using only the movement keys', () => {
    const s = makeInitialState();
    newGame(s, 2026);
    s.enemies = [];
    const w = getWorld(2026);
    const ford = w.fords[1];
    const goal = [tileOf(w, ford.x), tileOf(w, ford.y)];
    // Breadth-first path over reachable tiles.
    const start = tileOf(w, s.player.y) * w.w + tileOf(w, s.player.x);
    const prev = new Int32Array(w.w * w.h).fill(-1);
    const q = [start];
    prev[start] = start;
    while (q.length) {
      const i = q.shift();
      const x = i % w.w;
      const y = (i - x) / w.w;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = (y + dy) * w.w + x + dx;
        if (isReachable(w, x + dx, y + dy) && prev[j] < 0) {
          prev[j] = i;
          q.push(j);
        }
      }
    }
    const path = [];
    for (let i = goal[1] * w.w + goal[0]; i !== start; i = prev[i]) {
      expect(i).toBeGreaterThanOrEqual(0);
      path.unshift(i);
    }
    expect(path.length).toBeGreaterThan(30);

    let framesUsed = 0;
    for (const i of path) {
      const tx = (i % w.w) * 32 + 16;
      const ty = Math.floor(i / w.w) * 32 + 16;
      for (let f = 0; f < 120; f++) {
        const dx = tx - s.player.x;
        const dy = ty - s.player.y;
        if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) break;
        update(s, { left: dx < -1.5, right: dx > 1.5, up: dy < -1.5, down: dy > 1.5 });
        s.enemies = [];
        framesUsed++;
      }
      expect(Math.hypot(tx - s.player.x, ty - s.player.y)).toBeLessThan(2.5);
    }
    // Smooth: about one tile per 32 / speed frames, with no snags along the way.
    expect(framesUsed).toBeLessThan(path.length * Math.ceil(32 / D.game.player.speed) * 1.6);
    expect(nodesNear(w, s.player.x, s.player.y, 0).length).toBe(0);
  });
});

describe('Camera', () => {
  it('follows the player, clamps to the map and converts the mouse to world space', () => {
    const cam = createCamera({ zoom: 2, minZoom: 1, maxZoom: 3, smoothing: 0.12 });
    resizeCamera(cam, 1000, 600);
    expect([cam.viewW, cam.viewH]).toEqual([500, 300]);
    followCamera(cam, { x: 2000, y: 1500 }, 5120, 3584);
    expect([cam.x, cam.y]).toEqual([1750, 1350]); // snapped on the first frame
    followCamera(cam, { x: 2100, y: 1500 }, 5120, 3584);
    expect(cam.x).toBeGreaterThan(1750);
    expect(cam.x).toBeLessThan(1850); // eased, not jumped
    followCamera(cam, { x: 10, y: 10 }, 5120, 3584);
    expect([cam.x, cam.y]).toEqual([0, 0]); // a far jump snaps, and the map edge clamps
    expect(screenToWorld(cam, 100, 50)).toEqual({ x: 50, y: 25 });
    setZoom(cam, 7);
    expect(cam.zoom).toBe(3);
    setZoom(cam, 1.4);
    expect(cam.zoom).toBe(1);
  });
});
