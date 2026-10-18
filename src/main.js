// Boot: load content and art, resume the browser save or start a new game, wire input, sound and
// settings, start the loop.
import './ui/style.css';
import { D } from './core/content.js';
import { on } from './core/events.js';
import { makeInitialState } from './core/state.js';
import { createLoop } from './core/loop.js';
import { newGame, update, handleInteract, interactTarget } from './systems/game.js';
import { nexusStage, nexusPrompt } from './systems/nexus.js';
import { exitPlacing, tryPlaceBuilding, placementCheck } from './systems/building.js';
import { darkness, isNight } from './systems/clock.js';
import { log } from './systems/log.js';
import { createRenderer } from './render/renderer.js';
import { assets } from './render/assets.js';
import { createMinimap } from './render/minimap.js';
import { createAudio } from './render/audio.js';
import { worldOf } from './world/world.js';
import { createUI } from './ui/panels.js';
import { store, loadStored } from './ui/persistence.js';
import { loadSettings, saveSettings, normalizeSettings } from './ui/settings.js';
import { createTouchControls, prefersTouch } from './ui/touch.js';

const state = makeInitialState();
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas, assets);
const minimap = createMinimap(document.getElementById('minimap'));
const audio = createAudio({ assets });
assets.load(); // art appears as it arrives; placeholders draw until then

function fit() {
  renderer.resize(window.innerWidth || canvas.width, window.innerHeight || canvas.height);
}
window.addEventListener('resize', fit);
fit();

// ---- Settings (kept apart from the save) ----
let settings = loadSettings();
const touch = createTouchControls(document.getElementById('game-root'), {
  onInteract: () => handleInteract(state),
});
function applySettings() {
  renderer.setZoom(settings.zoom);
  audio.setVolumes(settings);
  touch.show(settings.touch === 'on' || (settings.touch === 'auto' && prefersTouch()));
}
const settingsApi = {
  get: () => ({ ...settings }),
  set(patch) {
    settings = normalizeSettings({ ...settings, ...patch });
    saveSettings(settings);
    applySettings();
  },
};
applySettings();

// ---- Input ----
const keys = {};
const input = { up: false, down: false, left: false, right: false };
function zoomBy(step) {
  settingsApi.set({ zoom: settings.zoom + step });
}
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (e.key === 'Escape') {
    exitPlacing(state);
    ui.closeModal();
  }
  if (k === 'e') handleInteract(state); // key repeat keeps gathering, limited by the cooldown
  if (k === '=' || k === '+') zoomBy(1);
  if (k === '-' || k === '_') zoomBy(-1);
});
window.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
});

let mouse = null; // canvas pixels
function canvasPoint(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) * canvas.width) / (rect.width || canvas.width),
    y: ((e.clientY - rect.top) * canvas.height) / (rect.height || canvas.height),
  };
}
canvas.addEventListener('mousemove', (e) => (mouse = canvasPoint(e)));
canvas.addEventListener('mouseleave', () => (mouse = null));
canvas.addEventListener('click', (e) => {
  if (state.mode === 'PLACING') {
    const p = renderer.toWorld(canvasPoint(e));
    tryPlaceBuilding(state, p.x, p.y);
  }
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

// ---- Sound: systems announce moments, the UI turns them into audio ----
on('sfx', (name) => audio.play(name));
on('mission:report', (r) => audio.play(r.dead.length ? 'death' : r.levelups.length ? 'levelup' : 'discover'));
document.addEventListener('click', (e) => {
  if (e.target.closest?.('button')) audio.play('click');
});

// ---- Game lifecycle ----
function freshSeed() {
  return Date.now() % 2147483647;
}

const ui = createUI(state, {
  newGame() {
    newGame(state, freshSeed());
    renderer.snap();
    ui.closeAllPanels();
    ui.refreshAll();
    log(state, 'A new world begins.');
  },
  loaded() {
    renderer.snap();
    ui.refreshAll();
    log(state, 'Save imported.');
  },
  settings: settingsApi,
});

assets.onLoad((group) => {
  if (group === 'icon') ui.refreshAll();
});

const resumed = loadStored(state);
if (!resumed) newGame(state, freshSeed());
ui.refreshAll();
if (resumed) log(state, D.game.messages.resumed.replace('{day}', state.day));

window.addEventListener('beforeunload', () => store(state));

// ---- Loop ----
let autosaveTimer = 0;
const loop = createLoop({
  update() {
    input.up = !!keys['w'] || !!keys['arrowup'] || touch.input.up;
    input.down = !!keys['s'] || !!keys['arrowdown'] || touch.input.down;
    input.left = !!keys['a'] || !!keys['arrowleft'] || touch.input.left;
    input.right = !!keys['d'] || !!keys['arrowright'] || touch.input.right;
    update(state, input);
    if (++autosaveTimer >= D.game.autosaveEvery) {
      autosaveTimer = 0;
      store(state);
    }
  },
  render() {
    const t = interactTarget(state);
    const view = {
      nexusStage: nexusStage(state),
      nexusPrompt: nexusPrompt(state),
      target: t && t.kind !== 'nexus' ? t : null,
      enemy: t?.kind === 'enemy',
      targetLabel: t && t.kind !== 'nexus' ? t.label : null,
      placement: null,
      darkness: darkness(state),
    };
    if (state.mode === 'PLACING' && mouse) {
      const p = renderer.toWorld(mouse);
      view.placement = placementCheck(state, state.placingBuilding, p.x, p.y);
    }
    const now = performance.now();
    renderer.draw(state, view, now);
    const world = worldOf(state);
    minimap.draw(state, world, world.landmarks, now);
    audio.music(ui.isOpen('hall') ? 'music_hall' : isNight(state) ? 'music_night' : 'music_day');
  },
  schedule: (fn) => requestAnimationFrame(fn),
  now: () => performance.now(),
});
loop.start();
