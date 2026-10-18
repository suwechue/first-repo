// The minimap: one pixel per tile, terrain colors where explored, dark elsewhere, with discovered
// landmarks and the player marked. Redrawn from a cached image only when the fog changes.
import { D } from '../core/content.js';
import { fogGrid, isCellRevealed } from '../world/fog.js';

const DARK = [13, 11, 18];
const TREE = [36, 58, 30];
const WALL = [60, 56, 50];

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  let base = null; // per world: terrain colors as RGBA bytes
  let baseWorld = null;
  let image = null; // base with fog applied
  let key = null;

  function buildBase(world) {
    const px = new Uint8ClampedArray(world.w * world.h * 4);
    const colors = world.terrainIds.map((id) => rgb(D.world.terrain[id].color));
    for (let i = 0; i < world.w * world.h; i++) {
      let c = colors[world.terrain[i]];
      const n = world.nodeAt[i];
      if (n >= 0 && D.resources[world.nodes[n].type].blocks) c = TREE;
      if (world.solid[i]) c = WALL;
      px.set([c[0], c[1], c[2], 255], i * 4);
    }
    return px;
  }

  function buildImage(s, world) {
    const px = new Uint8ClampedArray(base);
    const { cell } = fogGrid(world);
    for (let ty = 0; ty < world.h; ty++) {
      for (let tx = 0; tx < world.w; tx++) {
        if (isCellRevealed(s.fog, world, Math.floor(tx / cell), Math.floor(ty / cell))) continue;
        px.set([DARK[0], DARK[1], DARK[2], 255], (ty * world.w + tx) * 4);
      }
    }
    return typeof ImageData === 'function' ? new ImageData(px, world.w, world.h) : null;
  }

  return {
    draw(s, world, landmarks, time) {
      if (canvas.width !== world.w || canvas.height !== world.h) {
        canvas.width = world.w;
        canvas.height = world.h;
      }
      if (baseWorld !== world) {
        base = buildBase(world);
        baseWorld = world;
        key = null;
      }
      const k = (s.fogRev || 0) + ':' + s.seed;
      if (k !== key || !image) {
        image = buildImage(s, world);
        key = k;
      }
      if (image) ctx.putImageData(image, 0, 0);
      const ts = world.ts;
      for (const lm of landmarks) {
        if (!s.landmarks[lm.id]?.found) continue;
        ctx.fillStyle = D.landmarks[lm.type].minimap || '#fff';
        ctx.fillRect(Math.floor(lm.x / ts) - 1, Math.floor(lm.y / ts) - 1, 3, 3);
      }
      const blink = Math.floor(time / 400) % 2 === 0;
      ctx.fillStyle = blink ? '#ffffff' : '#e6934a';
      ctx.fillRect(Math.floor(s.player.x / ts) - 1, Math.floor(s.player.y / ts) - 1, 3, 3);
    },
  };
}
