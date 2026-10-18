// Walks the player with the movement keys only, along a breadth-first path over reachable tiles,
// so tests prove a place can really be reached through the collision code.
import { update } from '../../src/systems/game.js';
import { worldOf, isReachable, tileOf } from '../../src/world/world.js';

/** Tile path (indices) from the player's tile to the first tile `isGoal(tx, ty)` accepts, or null. */
export function findPath(s, isGoal) {
  const w = worldOf(s);
  const start = tileOf(w, s.player.y) * w.w + tileOf(w, s.player.x);
  const prev = new Int32Array(w.w * w.h).fill(-1);
  prev[start] = start;
  const q = [start];
  for (let head = 0; head < q.length; head++) {
    const i = q[head];
    const x = i % w.w;
    const y = (i - x) / w.w;
    if (isGoal(x, y)) {
      const path = [];
      for (let j = i; j !== start; j = prev[j]) path.unshift(j);
      return path;
    }
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
  return null;
}

/** Steers to each tile center in turn. Enemies are cleared so the walk is about the terrain. Returns frames used. */
export function walkPath(s, path, { clearEnemies = true } = {}) {
  const w = worldOf(s);
  let frames = 0;
  for (const i of path) {
    const tx = (i % w.w) * w.ts + w.ts / 2;
    const ty = Math.floor(i / w.w) * w.ts + w.ts / 2;
    for (let f = 0; f < 120; f++) {
      const dx = tx - s.player.x;
      const dy = ty - s.player.y;
      if (Math.abs(dx) < 1.5 && Math.abs(dy) < 1.5) break;
      update(s, { left: dx < -1.5, right: dx > 1.5, up: dy < -1.5, down: dy > 1.5 });
      if (clearEnemies) s.enemies = [];
      frames++;
    }
    if (Math.hypot(tx - s.player.x, ty - s.player.y) > 2.5) throw new Error('stuck on the way at tile ' + i);
  }
  return frames;
}

/** Walks to the nearest tile `isGoal` accepts. Throws if there is no way there. */
export function walkTo(s, isGoal) {
  const path = findPath(s, isGoal);
  if (!path) throw new Error('no path');
  return walkPath(s, path);
}
