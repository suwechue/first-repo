// Fog of war: one bit per 4 by 4 tile cell, packed 32 to a number, so it saves as a short plain array.
import { D } from '../core/content.js';

/** Cell grid size for a world. */
export function fogGrid(world) {
  const cell = D.game.fog.cell;
  return { cell, cw: Math.ceil(world.w / cell), ch: Math.ceil(world.h / cell) };
}

/** A fog array with nothing revealed. */
export function emptyFog(world) {
  const { cw, ch } = fogGrid(world);
  return new Array(Math.ceil((cw * ch) / 32)).fill(0);
}

export function isCellRevealed(fog, world, cx, cy) {
  const { cw, ch } = fogGrid(world);
  if (cx < 0 || cy < 0 || cx >= cw || cy >= ch) return false;
  const bit = cy * cw + cx;
  return ((fog[bit >>> 5] >>> (bit & 31)) & 1) === 1;
}

export function isRevealed(fog, world, tx, ty) {
  const { cell } = fogGrid(world);
  return isCellRevealed(fog, world, Math.floor(tx / cell), Math.floor(ty / cell));
}

/**
 * Reveals every cell whose center lies within `radiusTiles` of the pixel position (x, y), measured
 * to the nearest point of the cell so the edge of the circle counts. Returns true if anything changed.
 */
export function revealCircle(fog, world, x, y, radiusTiles) {
  const { cell, cw, ch } = fogGrid(world);
  const cellPx = cell * world.ts;
  const r = radiusTiles * world.ts;
  let changed = false;
  const cx0 = Math.max(0, Math.floor((x - r) / cellPx));
  const cx1 = Math.min(cw - 1, Math.floor((x + r) / cellPx));
  const cy0 = Math.max(0, Math.floor((y - r) / cellPx));
  const cy1 = Math.min(ch - 1, Math.floor((y + r) / cellPx));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const nx = Math.max(cx * cellPx, Math.min(x, (cx + 1) * cellPx));
      const ny = Math.max(cy * cellPx, Math.min(y, (cy + 1) * cellPx));
      if ((nx - x) ** 2 + (ny - y) ** 2 > r * r) continue;
      const bit = cy * cw + cx;
      const word = bit >>> 5;
      const mask = 1 << (bit & 31);
      if (!(fog[word] & mask)) {
        fog[word] = (fog[word] | mask) >>> 0;
        changed = true;
      }
    }
  }
  return changed;
}

/** Share of the map's cells revealed, 0 to 1. */
export function revealedShare(fog, world) {
  const { cw, ch } = fogGrid(world);
  let n = 0;
  for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) if (isCellRevealed(fog, world, cx, cy)) n++;
  return n / (cw * ch);
}
