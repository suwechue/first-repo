// Seeded world generation: rings, biomes, meadows, hills, the river and its fords, roads, trails,
// resource nodes, and a connectivity pass so every open tile can be walked to from the spawn.
// Pure and deterministic: the same seed always gives the same world, and generation draws from its
// own stream, so it never shifts the game's random sequence.
import { D } from '../core/content.js';
import { createRng } from '../core/rng.js';
import { createNoise } from './noise.js';

const DIRS = {
  south: [0, 1],
  north: [0, -1],
  east: [1, 0],
  west: [-1, 0],
};

export function generateWorld(seed) {
  const W = D.world;
  const w = W.size.w;
  const h = W.size.h;
  const ts = W.tileSize;
  const N = w * h;
  const rng = createRng('world:' + seed);
  const between = ([a, b]) => a + rng() * (b - a);
  const intBetween = ([a, b]) => a + Math.floor(rng() * (b - a + 1));
  const subSeed = () => Math.floor(rng() * 2147483647);

  const terrainIds = Object.keys(W.terrain);
  const zoneIds = Object.keys(D.biomes);
  const T = Object.fromEntries(terrainIds.map((k, i) => [k, i]));
  const Z = Object.fromEntries(zoneIds.map((k, i) => [k, i]));
  const terrain = new Uint8Array(N);
  const zone = new Uint8Array(N);
  const keepClear = new Uint8Array(N); // roads, trails, fords and clearings: no node grows here
  const solid = new Uint8Array(N); // tiles filled by a solid prop such as a city wall
  const idx = (x, y) => y * w + x;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const zoneOf = (x, y) => zoneIds[zone[idx(x, y)]];
  const terrainBlocks = (i) => !!W.terrain[terrainIds[terrain[i]]].blocks || solid[i] === 1;
  /** Elliptical distance from the map center: 0 at the center, 1 at the middle of each edge. */
  const ell = (x, y) => Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
  const clearDisc = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if (inside(x, y) && Math.hypot(x - cx, y - cy) <= r) keepClear[idx(x, y)] = 1;
  };

  // 1. Rings around the center, with noisy edges. The outermost ring and the map border are the Seal.
  const ringNoise = createNoise(subSeed());
  const RN = W.ringNoise;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = ell(x, y) + (ringNoise(x / RN.scale, y / RN.scale) - 0.5) * 2 * RN.amount;
      let z = W.seal.zone;
      if (d < W.seal.from) {
        for (const r of W.rings) {
          if (d < r.to) {
            z = r.zone;
            break;
          }
        }
      }
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) z = W.seal.zone;
      zone[idx(x, y)] = Z[z];
    }
  }

  // 2. The Old City, stamped from its hand-authored prefab: zones first, the rest after the ground.
  const C = W.city;
  const prefab = D.prefabs[C.prefab];
  const city = {
    x: C.center[0] - Math.floor(C.size[0] / 2),
    y: C.center[1] - Math.floor(C.size[1] / 2),
    w: C.size[0],
    h: C.size[1],
  };
  const inCity = (x, y) => x >= city.x && y >= city.y && x < city.x + city.w && y < city.y + city.h;
  const cells = []; // [x, y, legend entry]
  prefab.rows.forEach((row, py) => {
    for (let px = 0; px < row.length; px++) {
      const cell = prefab.legend[row[px]];
      const x = city.x + px;
      const y = city.y + py;
      zone[idx(x, y)] = Z[cell.zone];
      cells.push([x, y, cell]);
    }
  });

  // 3. Ground from each zone's biome, then the prefab's own terrain, props and key points.
  for (let i = 0; i < N; i++) terrain[i] = T[D.biomes[zoneIds[zone[i]]].ground];
  const props = [];
  const propAt = new Int32Array(N).fill(-1);
  const points = {};
  const prefabNodes = [];
  for (const [x, y, cell] of cells) {
    const i = idx(x, y);
    if (cell.terrain) terrain[i] = T[cell.terrain];
    if (cell.clear) keepClear[i] = 1;
    if (cell.point) points[cell.point] = [x, y];
    if (cell.node) prefabNodes.push([cell.node, x, y]);
    if (cell.prop) {
      const def = D.props[cell.prop];
      propAt[i] = props.length;
      props.push({ id: props.length, type: cell.prop, tx: x, ty: y, x: (x + 0.5) * ts, y: (y + 0.5) * ts });
      if (def.solid) solid[i] = 1;
      keepClear[i] = 1;
    }
  }

  // 4. Meadows: open patches in the light forest.
  const M = W.meadows;
  const meadowNoise = createNoise(subSeed());
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (M.zones.includes(zoneOf(x, y)) && meadowNoise(x / M.scale, y / M.scale) > M.threshold)
        terrain[idx(x, y)] = T[M.terrain];

  // 5. Hills: stony patches in the Deep Forest with blocking rock faces at their core.
  const HL = W.hills;
  const hills = [];
  const hillCount = intBetween(HL.count);
  for (let k = 0; k < hillCount; k++) {
    let hx = 0;
    let hy = 0;
    let ok = false;
    for (let tries = 0; tries < 200 && !ok; tries++) {
      const deg = k === 0 && HL.firstAngle !== undefined ? HL.firstAngle + (rng() - 0.5) * 40 : rng() * 360;
      const ang = (deg * Math.PI) / 180;
      const d = between(HL.dist);
      hx = Math.round(w / 2 + (Math.cos(ang) * d * w) / 2);
      hy = Math.round(h / 2 + (Math.sin(ang) * d * h) / 2);
      ok = inside(hx, hy) && zoneOf(hx, hy) === HL.within;
    }
    if (!ok) continue;
    const R = between(HL.radius);
    const shape = createNoise(subSeed());
    hills.push({ x: hx, y: hy, r: R });
    for (let y = Math.floor(hy - R * 1.3); y <= Math.ceil(hy + R * 1.3); y++) {
      for (let x = Math.floor(hx - R * 1.3); x <= Math.ceil(hx + R * 1.3); x++) {
        if (!inside(x, y) || zoneOf(x, y) !== HL.within) continue;
        const r = Math.hypot(x - hx, y - hy) / (R * (0.75 + 0.5 * shape(x / 4, y / 4)));
        if (r >= 1) continue;
        zone[idx(x, y)] = Z[HL.zone];
        terrain[idx(x, y)] = T[r < HL.core ? HL.rock : HL.ground];
      }
    }
  }

  // 6. The river: an arc through the south-west from Seal to Seal, flanked by marsh, with fords.
  const RV = W.river;
  const th0 = (between(RV.from) * Math.PI) / 180;
  const th1 = (between(RV.to) * Math.PI) / 180;
  const depth = between(RV.depth);
  const wobble = createNoise(subSeed());
  const STEPS = 160;
  const river = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const th = th0 + (th1 - th0) * t;
    const d = 1.05 - depth * Math.sin(Math.PI * t) + (wobble(t * 7, 0.5) - 0.5) * 0.06;
    river.push({ x: w / 2 + (Math.cos(th) * d * w) / 2, y: h / 2 + (Math.sin(th) * d * h) / 2 });
  }
  let rx0 = w;
  let ry0 = h;
  let rx1 = 0;
  let ry1 = 0;
  for (const p of river) {
    rx0 = Math.min(rx0, p.x);
    ry0 = Math.min(ry0, p.y);
    rx1 = Math.max(rx1, p.x);
    ry1 = Math.max(ry1, p.y);
  }
  const pad = Math.ceil(RV.marsh) + 1;
  for (let y = Math.max(0, Math.floor(ry0) - pad); y <= Math.min(h - 1, Math.ceil(ry1) + pad); y++) {
    for (let x = Math.max(0, Math.floor(rx0) - pad); x <= Math.min(w - 1, Math.ceil(rx1) + pad); x++) {
      if (zoneOf(x, y) === W.seal.zone || inCity(x, y)) continue;
      const d = distToPolyline(x + 0.5, y + 0.5, river);
      if (d < RV.width) {
        terrain[idx(x, y)] = T[RV.water];
        zone[idx(x, y)] = Z[RV.zone];
      } else if (d < RV.marsh) {
        if (!W.terrain[terrainIds[terrain[idx(x, y)]]].blocks)
          terrain[idx(x, y)] = T[D.biomes[RV.zone].ground];
        zone[idx(x, y)] = Z[RV.zone];
      }
    }
  }
  const fords = RV.fords.map((f) => {
    const p = river[Math.round(f * STEPS)];
    for (let y = Math.floor(p.y - RV.fordRadius); y <= Math.ceil(p.y + RV.fordRadius); y++)
      for (let x = Math.floor(p.x - RV.fordRadius); x <= Math.ceil(p.x + RV.fordRadius); x++)
        if (inside(x, y) && Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) <= RV.fordRadius) {
          const i = idx(x, y);
          if (terrain[i] === T[RV.water]) terrain[i] = T[RV.ford];
        }
    clearDisc(p.x - 0.5, p.y - 0.5, RV.fordRadius + 1.5);
    return { x: p.x, y: p.y };
  });

  // 7. Old roads leading out of the city gates.
  const RD = W.roads;
  const roads = [];
  const gateTile = (g) => {
    const [dx, dy] = DIRS[g];
    const cx = C.center[0];
    const cy = C.center[1];
    if (dy > 0) return [cx, city.y + city.h];
    if (dy < 0) return [cx, city.y - 1];
    if (dx > 0) return [city.x + city.w, cy];
    return [city.x - 1, cy];
  };
  for (const g of RD.gates) {
    const [dx, dy] = DIRS[g];
    let [x, y] = gateTile(g);
    let drift = 0;
    const path = [];
    while (inside(x, y) && ell(x, y) < RD.to && !terrainBlocks(idx(x, y))) {
      terrain[idx(x, y)] = T[RD.terrain];
      path.push([x, y]);
      clearDisc(x, y, 1);
      if (rng() < 0.3) {
        drift = Math.max(-1, Math.min(1, drift + (rng() < 0.5 ? -1 : 1)));
        if (drift !== 0) {
          // a sideways step, painted too so the road stays 4-connected
          x += dy !== 0 ? drift : 0;
          y += dx !== 0 ? drift : 0;
          if (!inside(x, y) || terrainBlocks(idx(x, y))) break;
          terrain[idx(x, y)] = T[RD.terrain];
          path.push([x, y]);
          clearDisc(x, y, 1);
        }
      }
      x += dx;
      y += dy;
    }
    roads.push(path);
  }

  // 8. Narrow trails winding out through the Deep Forest, plus a trail each way from every ford.
  const TR = W.trails;
  const trail = (sx, sy, heading, outward, until) => {
    let x = Math.round(sx);
    let y = Math.round(sy);
    for (let step = 0; step < 400; step++) {
      if (!inside(x, y) || terrainBlocks(idx(x, y))) break;
      keepClear[idx(x, y)] = 1;
      const d = ell(x, y);
      if (outward ? d > until : d < until) break;
      // wander, but keep heading away from (or toward) the center
      const rad = Math.atan2(y + 0.5 - h / 2, x + 0.5 - w / 2) + (outward ? 0 : Math.PI);
      heading += (rng() - 0.5) * 0.9;
      const vx = Math.cos(heading) * 0.6 + Math.cos(rad) * 0.4;
      const vy = Math.sin(heading) * 0.6 + Math.sin(rad) * 0.4;
      if (rng() < Math.abs(vx) / (Math.abs(vx) + Math.abs(vy) || 1)) x += Math.sign(vx);
      else y += Math.sign(vy);
    }
  };
  for (let k = 0; k < TR.count; k++) {
    const ang = ((k + rng() * 0.8) / TR.count) * Math.PI * 2;
    trail(
      w / 2 + (Math.cos(ang) * TR.from * w) / 2,
      h / 2 + (Math.sin(ang) * TR.from * h) / 2,
      ang,
      true,
      TR.to,
    );
  }
  for (const f of fords) {
    const ang = Math.atan2(f.y - h / 2, f.x - w / 2);
    trail(f.x, f.y, ang, true, TR.to);
    trail(f.x, f.y, ang + Math.PI, false, W.rings[0].to);
  }

  // 9. Key points from the prefab: the spawn in Mossgate, the plaza, and the Nexus beneath it.
  const spawnTile = points.spawn;
  const centerTile = points.center;
  const nexusTile = points.nexus;
  clearDisc(spawnTile[0], spawnTile[1], W.clear.spawnRadius);
  clearDisc(centerTile[0], centerTile[1], W.clear.centerRadius);
  clearDisc(nexusTile[0], nexusTile[1], W.clear.centerRadius);

  // 10. Resource nodes, rolled per tile from the zone's densities. One node per tile at most.
  const nodes = [];
  const nodeAt = new Int32Array(N).fill(-1);
  const addNode = (type, x, y) => {
    const id = nodes.length;
    const def = D.resources[type];
    const jitter = def.blocks ? 4 : 8;
    const node = {
      id,
      type,
      tx: x,
      ty: y,
      x: (x + 0.5) * ts + (rng() - 0.5) * jitter,
      y: (y + 0.5) * ts + (rng() - 0.5) * jitter,
      angle: rng() * Math.PI * 2,
    };
    if (def.relic && rng() < def.relic.chance) node.relic = true; // found once, when the pile is emptied
    nodes.push(node);
    nodeAt[idx(x, y)] = id;
  };
  for (const [type, x, y] of prefabNodes) addNode(type, x, y);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y);
      if (keepClear[i] || terrainBlocks(i)) continue;
      let r = rng();
      for (const [type, p] of Object.entries(D.biomes[zoneIds[zone[i]]].density)) {
        if (r < p) {
          addNode(type, x, y);
          break;
        }
        r -= p;
      }
    }
  }

  // 11. Connectivity: an open tile the spawn cannot reach becomes thicket, so there are no
  // unreachable pockets. Walking between 4-adjacent open tiles always fits the player's circle.
  const nexusIndex = idx(nexusTile[0], nexusTile[1]);
  const blocked = (i) =>
    i === nexusIndex ||
    terrainBlocks(i) ||
    (propAt[i] >= 0 && D.props[props[propAt[i]].type].blocks > 0) ||
    (nodeAt[i] >= 0 && D.resources[nodes[nodeAt[i]].type].blocks > 0);
  const spawnIndex = idx(spawnTile[0], spawnTile[1]);
  let reach = flood(spawnIndex, w, h, blocked);
  for (let i = 0; i < N; i++) {
    if (reach[i] || blocked(i)) continue;
    const fill = D.biomes[zoneIds[zone[i]]].fill;
    if (!fill) continue;
    if (nodeAt[i] >= 0) nodes[nodeAt[i]].type = fill;
    else addNode(fill, i % w, Math.floor(i / w));
  }
  reach = flood(spawnIndex, w, h, blocked);

  const center = (t) => ({ x: (t[0] + 0.5) * ts, y: (t[1] + 0.5) * ts });
  return {
    seed,
    w,
    h,
    ts,
    chunk: W.chunk,
    terrainIds,
    zoneIds,
    terrain,
    zone,
    solid,
    nodes,
    nodeAt,
    props,
    propAt,
    reach,
    city,
    spawn: center(spawnTile),
    center: center(centerTile),
    nexus: center(nexusTile),
    river: river.map((p) => ({ x: p.x * ts, y: p.y * ts })),
    fords: fords.map((p) => ({ x: p.x * ts, y: p.y * ts })),
    hills,
    roads,
  };
}

/** Distance from (x, y) to the nearest segment of a polyline. */
function distToPolyline(x, y, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
    if (d < best) best = d;
  }
  return best;
}

/** 4-connected flood fill over tiles that are not blocked. Returns a 0/1 mask. */
export function flood(start, w, h, blocked) {
  const seen = new Uint8Array(w * h);
  if (blocked(start)) return seen;
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  seen[start] = 1;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const y = (i - x) / w;
    const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
    for (const j of next) {
      if (j >= 0 && !seen[j] && !blocked(j)) {
        seen[j] = 1;
        queue[tail++] = j;
      }
    }
  }
  return seen;
}
