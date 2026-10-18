// Placing buildings on the tile grid, and ticking the ones that do something over time.
// A building covers `size` tiles from its top-left tile (tx, ty); x and y are its footprint's center.
import { D } from '../core/content.js';
import { dist } from '../core/geometry.js';
import { worldOf, tileOf, inBounds, isSolidTile, nodeAtTile, propAtTile } from '../world/world.js';
import { blockedAt } from '../world/collision.js';
import { canAfford, spend, give } from './inventory.js';
import { log, changed, cue } from './log.js';
import { addAwareness } from './nexus.js';

export function enterPlacing(s, key) {
  s.mode = 'PLACING';
  s.placingBuilding = key;
  log(s, `Placing ${D.buildings[key].name} — click on the map, ESC to cancel.`);
  changed('placing');
}

export function exitPlacing(s) {
  if (s.mode === 'PLACING') {
    s.mode = 'EXPLORE';
    s.placingBuilding = null;
  }
}

/** The tiles a building covers: an array of [tx, ty]. */
export function footprint(def, tx, ty) {
  const [w, h] = def.size || [1, 1];
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push([tx + x, ty + y]);
  return out;
}

const tileSetCache = new WeakMap(); // buildings array -> { n, tiles }

/** Tile indices covered by the player's buildings: `all`, and `solid` for the ones that block movement. */
export function buildingTiles(s) {
  const world = worldOf(s);
  const cached = tileSetCache.get(s.buildings);
  if (cached && cached.n === s.buildings.length && cached.w === world.w) return cached;
  const all = new Set();
  const solid = new Set();
  for (const b of s.buildings) {
    const def = D.buildings[b.type];
    if (!Number.isInteger(b.tx)) continue; // a building from before grid placement
    for (const [x, y] of footprint(def, b.tx, b.ty)) {
      all.add(y * world.w + x);
      if (def.blocks) solid.add(y * world.w + x);
    }
  }
  const entry = { n: s.buildings.length, w: world.w, all, solid };
  tileSetCache.set(s.buildings, entry);
  return entry;
}

/**
 * Where a building of type `key` would go if placed with the mouse at world point (x, y), and
 * whether it may: { ok, reason, tx, ty, x, y, tiles }. The footprint is centered on the mouse and
 * snapped to the grid.
 */
export function placementCheck(s, key, x, y) {
  const def = D.buildings[key];
  const world = worldOf(s);
  const ts = world.ts;
  const [w, h] = def.size || [1, 1];
  const tx = tileOf(world, x - ((w - 1) * ts) / 2);
  const ty = tileOf(world, y - ((h - 1) * ts) / 2);
  const tiles = footprint(def, tx, ty);
  const cx = (tx + w / 2) * ts;
  const cy = (ty + h / 2) * ts;
  const result = (ok, reason) => ({ ok, reason, tx, ty, x: cx, y: cy, tiles });

  if (dist(s.player, { x: cx, y: cy }) > D.game.building.range * ts) return result(false, 'Too far away');
  const taken = buildingTiles(s).all;
  const landmarkTiles = new Set(world.landmarks.map((l) => l.ty * world.w + l.tx));
  const nexusTile = tileOf(world, world.nexus.y) * world.w + tileOf(world, world.nexus.x);
  for (const [x0, y0] of tiles) {
    const i = y0 * world.w + x0;
    if (!inBounds(world, x0, y0) || isSolidTile(world, x0, y0)) return result(false, 'Blocked ground');
    if (nodeAtTile(world, x0, y0) || propAtTile(world, x0, y0))
      return result(false, 'Something is in the way');
    if (landmarkTiles.has(i) || i === nexusTile) return result(false, 'Something is in the way');
    if (taken.has(i)) return result(false, 'Another building is there');
  }
  if (def.blocks) {
    const mine = new Set(tiles.map(([a, b]) => b * world.w + a));
    const onlyMine = { has: (i) => mine.has(i) };
    if (blockedAt(world, s.player.x, s.player.y, D.game.player.radius, onlyMine))
      return result(false, 'You are standing there');
  }
  if (!canAfford(s, def.costs)) return result(false, 'Not enough resources');
  return result(true, null);
}

export function tryPlaceBuilding(s, x, y) {
  const key = s.placingBuilding;
  const def = D.buildings[key];
  if (!def) return false;
  const p = placementCheck(s, key, x, y);
  if (!p.ok) {
    log(s, p.reason + '.');
    return false;
  }
  spend(s, def.costs);
  const b = { type: key, tx: p.tx, ty: p.ty, x: p.x, y: p.y, radius: def.radius, color: def.color };
  // A building that does something over time keeps its timer on the instance.
  if (def.produces) b.growthTimer = def.produces.time;
  if (def.awareness) b.awarenessTimer = def.awareness.time;
  s.buildings.push(b);
  log(s, `Built ${def.name}.`);
  cue('build');
  s.mode = 'EXPLORE';
  s.placingBuilding = null;
  changed('inventory');
  return true;
}

/** How much faster a Shrine attunes here: the largest bonus of any landmark whose effect reaches it. */
export function awarenessMultiplier(s, b) {
  const world = worldOf(s);
  let mul = 1;
  for (const lm of world.landmarks) {
    const e = D.landmarks[lm.type].effect;
    if (!e?.shrineAwarenessMul) continue;
    if (dist(lm, b) <= e.radius * world.ts) mul = Math.max(mul, e.shrineAwarenessMul);
  }
  return mul;
}

export function updateBuildings(s) {
  for (const b of s.buildings) {
    const def = D.buildings[b.type];
    if (b.awarenessTimer !== undefined) {
      b.awarenessTimer -= awarenessMultiplier(s, b); // near Standing Stones the timer runs at double speed
      if (b.awarenessTimer <= 0) {
        b.awarenessTimer += def.awareness.time;
        addAwareness(s, def.awareness.amount);
      }
    }
    if (b.growthTimer === undefined) continue;
    b.growthTimer--;
    if (b.growthTimer <= 0) {
      give(s, def.produces.yields);
      b.growthTimer = def.produces.time;
      const what = Object.entries(def.produces.yields)
        .map(([k, v]) => v + ' ' + k)
        .join(', ');
      log(s, `Your ${def.name} produced ${what}.`);
    }
  }
}
