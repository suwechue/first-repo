// Circle collision against the world: blocking terrain tiles and walls, blocking nodes (tree
// trunks, rocks), props, the Nexus, and any extra solid tiles the caller passes (the player's
// buildings). Axes resolve separately, so a mover slides along walls instead of sticking to them.
import { D } from '../core/content.js';
import { tileOf, isSolidTile, nodeAtTile, propAtTile } from './world.js';

/**
 * True if a circle of radius r at (x, y) overlaps anything solid. `extraTiles` is an optional Set of
 * tile indices (ty * world.w + tx) that also count as solid.
 */
export function blockedAt(world, x, y, r, extraTiles = null) {
  const ts = world.ts;
  const tx0 = tileOf(world, x - r);
  const tx1 = tileOf(world, x + r);
  const ty0 = tileOf(world, y - r);
  const ty1 = tileOf(world, y + r);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (!isSolidTile(world, tx, ty) && !extraTiles?.has(ty * world.w + tx)) continue;
      const nx = Math.max(tx * ts, Math.min(x, (tx + 1) * ts));
      const ny = Math.max(ty * ts, Math.min(y, (ty + 1) * ts));
      if ((nx - x) ** 2 + (ny - y) ** 2 < r * r) return true;
    }
  }
  // Nodes sit near their tile's center with radius under half a tile, so one tile of margin is enough.
  for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) {
    for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      const n = nodeAtTile(world, tx, ty);
      if (!n) continue;
      const b = D.resources[n.type].blocks;
      if (b > 0 && Math.hypot(n.x - x, n.y - y) < r + b) return true;
    }
  }
  for (let ty = ty0 - 1; ty <= ty1 + 1; ty++) {
    for (let tx = tx0 - 1; tx <= tx1 + 1; tx++) {
      const p = propAtTile(world, tx, ty);
      if (!p) continue;
      const b = D.props[p.type].blocks;
      if (b > 0 && Math.hypot(p.x - x, p.y - y) < r + b) return true;
    }
  }
  if (world.nexus && Math.hypot(world.nexus.x - x, world.nexus.y - y) < r + D.nexus.blocks) return true;
  return false;
}

/**
 * Moves `obj` by (dx, dy) in small steps, resolving x and y separately. A mover that starts inside
 * something solid may move freely until it is out, so nothing can ever get stuck.
 */
export function moveCircle(world, obj, dx, dy, r, extraTiles = null) {
  if (blockedAt(world, obj.x, obj.y, r, extraTiles)) {
    obj.x += dx;
    obj.y += dy;
    return;
  }
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (sx && !blockedAt(world, obj.x + sx, obj.y, r, extraTiles)) obj.x += sx;
    if (sy && !blockedAt(world, obj.x, obj.y + sy, r, extraTiles)) obj.y += sy;
  }
}
