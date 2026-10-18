// The generated world for a save's seed, and read-only queries on it.
// The world is regenerated from the seed, never stored in GameState; what changes during play
// (depleted nodes, and later fog and landmarks) lives in the state.
import { D } from '../core/content.js';
import { generateWorld } from './worldgen.js';

const cache = new Map(); // seed -> world, a few kept so tests and reloads do not regenerate
const CACHE_SIZE = 3;

export function getWorld(seed) {
  let world = cache.get(seed);
  if (!world) {
    world = generateWorld(seed);
    if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value);
    cache.set(seed, world);
  }
  return world;
}

/** The world of a game state. */
export function worldOf(s) {
  return getWorld(s.seed);
}

export function inBounds(world, tx, ty) {
  return tx >= 0 && ty >= 0 && tx < world.w && ty < world.h;
}

export function tileOf(world, px) {
  return Math.floor(px / world.ts);
}

export function tileCenter(world, tx, ty) {
  return { x: (tx + 0.5) * world.ts, y: (ty + 0.5) * world.ts };
}

/** Terrain definition from world.json at a tile, or null outside the map. */
export function terrainAt(world, tx, ty) {
  if (!inBounds(world, tx, ty)) return null;
  return D.world.terrain[world.terrainIds[world.terrain[ty * world.w + tx]]];
}

/** Zone id at a pixel position, or null outside the map. */
export function zoneAt(world, x, y) {
  const tx = tileOf(world, x);
  const ty = tileOf(world, y);
  if (!inBounds(world, tx, ty)) return null;
  return world.zoneIds[world.zone[ty * world.w + tx]];
}

/** True if the tile blocks movement by its terrain, or lies outside the map. */
export function isSolidTile(world, tx, ty) {
  const t = terrainAt(world, tx, ty);
  return !t || !!t.blocks;
}

export function nodeAtTile(world, tx, ty) {
  if (!inBounds(world, tx, ty)) return null;
  const n = world.nodeAt[ty * world.w + tx];
  return n >= 0 ? world.nodes[n] : null;
}

/** Every node whose position lies within `r` pixels of (x, y). */
export function nodesNear(world, x, y, r) {
  const out = [];
  const t0x = tileOf(world, x - r) - 1;
  const t1x = tileOf(world, x + r) + 1;
  const t0y = tileOf(world, y - r) - 1;
  const t1y = tileOf(world, y + r) + 1;
  for (let ty = t0y; ty <= t1y; ty++) {
    for (let tx = t0x; tx <= t1x; tx++) {
      const n = nodeAtTile(world, tx, ty);
      if (n && Math.hypot(n.x - x, n.y - y) < r) out.push(n);
    }
  }
  return out;
}

/** True if the tile is open ground the spawn can walk to. */
export function isReachable(world, tx, ty) {
  return inBounds(world, tx, ty) && world.reach[ty * world.w + tx] === 1;
}

/**
 * A random reachable tile center between minR and maxR pixels from (x, y), or null.
 * `rand` is passed in so the caller decides which random stream is used.
 */
export function randomReachableNear(world, x, y, minR, maxR, rand, tries = 40, ok = () => true) {
  for (let i = 0; i < tries; i++) {
    const ang = rand() * Math.PI * 2;
    const r = minR + rand() * (maxR - minR);
    const tx = tileOf(world, x + Math.cos(ang) * r);
    const ty = tileOf(world, y + Math.sin(ang) * r);
    if (!isReachable(world, tx, ty)) continue;
    const p = tileCenter(world, tx, ty);
    if (ok(p, tx, ty)) return p;
  }
  return null;
}
