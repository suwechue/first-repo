// Seeded 2D value noise for organic ring edges, meadows and hills. Pure and deterministic.
import { createRng } from '../core/rng.js';

/** Returns noise(x, y) in [0, 1), smooth between integer lattice points. */
export function createNoise(seed) {
  const rng = createRng(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rng();
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];

  const lattice = (ix, iy) => vals[perm[(ix & 255) + perm[iy & 255]]];
  const smooth = (t) => t * t * (3 - 2 * t);

  function value(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = lattice(ix, iy);
    const b = lattice(ix + 1, iy);
    const c = lattice(ix, iy + 1);
    const d = lattice(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  /** Two octaves, normalized back to [0, 1). */
  return (x, y) => (value(x, y) * 2 + value(x * 2.03 + 17.1, y * 2.03 + 5.3)) / 3;
}
