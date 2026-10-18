// Ground rendering from pre-rendered chunks of tiles on offscreen canvases. A chunk is drawn once
// and reused until its art changes. Tiles use the manifest tileset when it exists, else a colored
// placeholder with a little per-tile variation.
import { D } from '../core/content.js';

const MAX_CHUNKS = 16; // least recently used chunks are dropped beyond this

/** A stable per-tile hash for picking variants and speckles. */
export function tileHash(x, y, seed = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createTilemap(assets, makeCanvas = () => document.createElement('canvas')) {
  const cache = new Map(); // "cx,cy" -> canvas
  let cachedWorld = null;
  assets.onLoad((group) => {
    if (group === 'tiles') cache.clear();
  });

  function terrainId(world, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= world.w || ty >= world.h) return null;
    return world.terrainIds[world.terrain[ty * world.w + tx]];
  }

  function placeholderTile(g, world, id, def, tx, ty, px, py, ts) {
    const h = tileHash(tx, ty, world.seed);
    g.fillStyle = def.color;
    g.fillRect(px, py, ts, ts);
    g.fillStyle = `rgba(0,0,0,${(h % 4) * 0.008})`; // a faint per-tile variation
    g.fillRect(px, py, ts, ts);
    if (id === 'water' || id === 'ford') {
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(px + (h % 20), py + ((h >>> 5) % 26) + 3, 8, 1);
      g.fillRect(px + ((h >>> 9) % 18) + 6, py + ((h >>> 14) % 22) + 6, 6, 1);
    } else if (id === 'seal') {
      g.fillStyle = 'rgba(190,170,255,0.10)';
      for (let i = -ts; i < ts; i += 8) {
        g.beginPath();
        g.moveTo(px + i, py + ts);
        g.lineTo(px + i + ts, py);
        g.lineTo(px + i + ts + 2, py);
        g.lineTo(px + i + 2, py + ts);
        g.fill();
      }
    } else {
      g.fillStyle = id === 'meadow' ? 'rgba(230,220,120,0.25)' : 'rgba(0,0,0,0.12)';
      for (let k = 0; k < 3; k++) {
        const v = h >>> (k * 9);
        g.fillRect(px + (v % 29), py + ((v >>> 5) % 29), 2, 2);
      }
    }
    // A soft edge where the terrain changes, so regions read clearly.
    g.fillStyle = 'rgba(0,0,0,0.10)';
    if (terrainId(world, tx, ty - 1) !== id) g.fillRect(px, py, ts, 2);
    if (terrainId(world, tx - 1, ty) !== id) g.fillRect(px, py, 2, ts);
  }

  function renderChunk(world, cx, cy) {
    const C = world.chunk;
    const ts = world.ts;
    const tx0 = cx * C;
    const ty0 = cy * C;
    const tw = Math.min(C, world.w - tx0);
    const th = Math.min(C, world.h - ty0);
    const canvas = makeCanvas();
    canvas.width = tw * ts;
    canvas.height = th * ts;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < th; y++) {
      for (let x = 0; x < tw; x++) {
        const tx = tx0 + x;
        const ty = ty0 + y;
        const id = terrainId(world, tx, ty);
        const def = D.world.terrain[id];
        const art = def.tileset ? assets.tileset(def.tileset) : null;
        if (art) {
          const variants = Math.max(1, art.def.variants || 1);
          const v = tileHash(tx, ty, world.seed) % variants;
          g.drawImage(art.img, v * ts, 0, ts, ts, x * ts, y * ts, ts, ts);
        } else {
          placeholderTile(g, world, id, def, tx, ty, x * ts, y * ts, ts);
        }
      }
    }
    return canvas;
  }

  return {
    /** Draws every chunk that overlaps the camera view. The context is already in world space. */
    draw(ctx, world, cam) {
      if (cachedWorld !== world) {
        cache.clear();
        cachedWorld = world;
      }
      const chunkPx = world.chunk * world.ts;
      const nx = Math.ceil(world.w / world.chunk);
      const ny = Math.ceil(world.h / world.chunk);
      const cx0 = Math.max(0, Math.floor(cam.x / chunkPx));
      const cy0 = Math.max(0, Math.floor(cam.y / chunkPx));
      const cx1 = Math.min(nx - 1, Math.floor((cam.x + cam.viewW) / chunkPx));
      const cy1 = Math.min(ny - 1, Math.floor((cam.y + cam.viewH) / chunkPx));
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const key = cx + ',' + cy;
          let c = cache.get(key);
          if (c)
            cache.delete(key); // re-insert below to mark it recently used
          else c = renderChunk(world, cx, cy);
          cache.set(key, c);
          if (cache.size > MAX_CHUNKS) cache.delete(cache.keys().next().value);
          ctx.drawImage(c, cx * chunkPx, cy * chunkPx);
        }
      }
    },
    get cachedChunks() {
      return cache.size;
    },
  };
}
