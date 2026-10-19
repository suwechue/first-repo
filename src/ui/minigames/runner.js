// Runs a minigame in the modal: builds its canvas, instructions, progress bar and extra area,
// pauses the game while it plays, and reports the performance when it ends.
import { createRng } from '../../core/rng.js';
import { $, esc } from '../dom.js';
import { get, has, list } from './registry.js';

const W = 680;
const H = 300;
let active = null; // { cleanup, s }

/** Ends whatever minigame is open without a result (the player closed it). */
export function abortMinigame() {
  if (!active) return;
  try {
    active.cleanup?.();
  } catch {
    // a plugin's cleanup failing must not break the game
  }
  active.s.paused = false;
  active = null;
}

export function minigameOpen() {
  return !!active;
}

/**
 * Opens minigame `key` (or the default if it is not registered). `onDone(performance)` gets 0 to 1.
 * opts: { s, title, difficulty, category, vectors, onDone }.
 */
export function openMinigame(key, { s, title, difficulty = 3, category = 'weapon', vectors = {}, onDone }) {
  abortMinigame();
  const def = get(key) || get('precision') || get(list()[0]);
  if (!def) {
    onDone(0.5); // no minigames at all: a middling result rather than a broken craft
    return;
  }
  $('modal-body').innerHTML = `
    <h3>${esc(title)}</h3>
    <div class="muted small">${esc(def.label)} · difficulty ${difficulty}</div>
    <div class="mg-instructions" id="mg-instructions"></div>
    <canvas id="mg-canvas" width="${W}" height="${H}"></canvas>
    <div class="mg-progress"><div id="mg-progress"></div></div>
    <div class="mg-extra" id="mg-extra"></div>`;
  $('modal').classList.add('open');
  s.paused = true;
  const canvas = $('mg-canvas');
  let done = false;
  const ctx = {
    canvas,
    ctx2d: canvas.getContext('2d'),
    width: W,
    height: H,
    instructionsEl: $('mg-instructions'),
    progressEl: $('mg-progress'),
    extraEl: $('mg-extra'),
    difficulty,
    targetCategory: category,
    vectors,
    rand: createRng('minigame:' + s.frame + ':' + key),
    now: () => performance.now(),
    schedule: (fn) => requestAnimationFrame(fn),
    /** Canvas coordinates of a mouse event, whatever size the canvas is drawn at. */
    point(e) {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) * W) / (r.width || W),
        y: ((e.clientY - r.top) * H) / (r.height || H),
      };
    },
    finish(performance) {
      if (done) return;
      done = true;
      const p = Math.max(0, Math.min(1, Number(performance) || 0));
      ctx.progressEl.style.width = '100%';
      active = null;
      s.paused = false;
      onDone(p);
    },
  };
  let cleanup;
  try {
    cleanup = def.run(ctx);
  } catch (e) {
    console.warn('Minigame failed:', e);
    ctx.finish(0.5);
    return;
  }
  if (!done) active = { cleanup, s };
}

export { has as minigameRegistered };
