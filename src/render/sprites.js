// Spritesheet animation. A sheet has one row per direction (down, left, right, up) when the
// manifest sets "dirs": 4, and one column per frame. Animations sit side by side in the order the
// manifest lists them, so { idle: 2 frames, walk: 4 frames } puts walk in columns 2 to 5.
// An animation may set "start" to name its first column directly.

export const DIRS = ['down', 'left', 'right', 'up'];

/** Direction row for a facing vector: the larger axis wins, ties go vertical. */
export function dirIndex(facing) {
  if (!facing) return 0;
  const { x, y } = facing;
  if (Math.abs(x) > Math.abs(y)) return x < 0 ? 1 : 2;
  return y < 0 ? 3 : 0;
}

/** { start, frames, fps } for `anim`, falling back to the first animation, then to a single frame. */
export function animInfo(def, anim) {
  const anims = def.anims || {};
  const names = Object.keys(anims);
  const name = anims[anim] ? anim : names[0];
  if (!name) return { start: 0, frames: 1, fps: 0 };
  let col = 0;
  for (const n of names) {
    if (n === name) break;
    col += Math.max(1, anims[n].frames || 1);
  }
  const a = anims[name];
  return {
    start: Number.isInteger(a.start) ? a.start : col,
    frames: Math.max(1, a.frames || 1),
    fps: a.fps || 0,
  };
}

/** The source rectangle of the frame to show at `timeMs`. */
export function frameRect(def, anim, dir, timeMs) {
  const a = animInfo(def, anim);
  const f = a.fps > 0 ? Math.floor((timeMs / 1000) * a.fps) % a.frames : 0;
  const row = (def.dirs || 1) > 1 ? Math.min(def.dirs - 1, dir || 0) : 0;
  return { sx: (a.start + f) * def.frameW, sy: row * def.frameH, sw: def.frameW, sh: def.frameH };
}

/**
 * Draws sprite `key` with its anchor at (x, y). Returns false, drawing nothing, when the sprite has
 * no loaded image, so the caller can draw a placeholder.
 */
export function drawSprite(ctx, assets, key, x, y, { anim, dir = 0, time = 0 } = {}) {
  const s = key ? assets.sprite(key) : null;
  if (!s || !s.def || !s.def.frameW || !s.def.frameH) return false;
  const r = frameRect(s.def, anim, dir, time);
  const [ax, ay] = s.def.anchor || [0.5, 1];
  ctx.drawImage(
    s.img,
    r.sx,
    r.sy,
    r.sw,
    r.sh,
    Math.round(x - ax * r.sw),
    Math.round(y - ay * r.sh),
    r.sw,
    r.sh,
  );
  return true;
}
