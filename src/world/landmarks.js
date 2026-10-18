// Landmark placement, run by the world generator after the connectivity pass. Each type in
// landmarks.json is placed `count` times on reachable tiles in its zones, at least `minSpacing`
// tiles from others of its type and a few tiles from any landmark. Pure and seeded.
import { D } from '../core/content.js';

const MIN_ANY = 6; // tiles between any two landmarks
const CLEAR_OF_SPAWN = 12; // tiles; the start stays calm

/**
 * `g` is the generator's working set: { rng, w, h, ts, zoneIds, zone, terrainIds, terrain, reach,
 * nodeAt, nodes, inCity, spawnTile, nexusTile }. Returns the landmark list and clears nodes from
 * the tile and its neighbors so each one stands in a small clearing.
 */
export function placeLandmarks(g) {
  const { rng, w, h, ts } = g;
  const out = [];
  const add = (type, tx, ty) => {
    const lm = { id: out.length, type, tx, ty, x: (tx + 0.5) * ts, y: (ty + 0.5) * ts };
    out.push(lm);
    for (let y = ty - 1; y <= ty + 1; y++) {
      for (let x = tx - 1; x <= tx + 1; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const n = g.nodeAt[y * w + x];
        if (n >= 0) {
          g.nodes[n].gone = true;
          g.nodeAt[y * w + x] = -1;
        }
      }
    }
    return lm;
  };

  for (const [type, def] of Object.entries(D.landmarks)) {
    if (def.at === 'nexus') {
      out.push({
        id: out.length,
        type,
        tx: g.nexusTile[0],
        ty: g.nexusTile[1],
        ...centerOf(g.nexusTile, ts),
      });
      continue;
    }
    const candidates = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!g.reach[i] || g.inCity(x, y)) continue;
        if (!def.zones.includes(g.zoneIds[g.zone[i]])) continue;
        if (Math.hypot(x - g.spawnTile[0], y - g.spawnTile[1]) < CLEAR_OF_SPAWN) continue;
        if (def.nearTerrain && !nextTo(g, x, y, def.nearTerrain)) continue;
        candidates.push(i);
      }
    }
    let spacing = def.minSpacing || 0;
    let placed = 0;
    // Relax the spacing a little at a time if the zone is too small to fit them all.
    for (let round = 0; round < 6 && placed < def.count && candidates.length; round++) {
      for (let tries = 0; tries < 4000 && placed < def.count; tries++) {
        const i = candidates[Math.floor(rng() * candidates.length)];
        const x = i % w;
        const y = (i - x) / w;
        const tooClose = out.some(
          (o) => Math.hypot(o.tx - x, o.ty - y) < (o.type === type ? spacing : MIN_ANY),
        );
        if (tooClose) continue;
        add(type, x, y);
        placed++;
      }
      spacing *= 0.8;
    }
  }
  return out;
}

function centerOf([tx, ty], ts) {
  return { x: (tx + 0.5) * ts, y: (ty + 0.5) * ts };
}

function nextTo(g, x, y, terrainId) {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const j = (y + dy) * g.w + x + dx;
    if (g.terrainIds[g.terrain[j]] === terrainId) return true;
  }
  return false;
}
