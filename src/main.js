// Boot: load content and art, resume the browser save or start a new game, wire input, start the loop.
import './ui/style.css';
import { D } from './core/content.js';
import { makeInitialState } from './core/state.js';
import { createLoop } from './core/loop.js';
import { newGame, update, handleInteract, nearestEnemy } from './systems/game.js';
import { nearestNode, nodeAmount } from './systems/gathering.js';
import { nexusStage, nexusPrompt } from './systems/nexus.js';
import { exitPlacing, tryPlaceBuilding } from './systems/building.js';
import { log } from './systems/log.js';
import { createRenderer } from './render/renderer.js';
import { assets } from './render/assets.js';
import { createUI } from './ui/panels.js';
import { store, loadStored } from './ui/persistence.js';

const state = makeInitialState();
const canvas = document.getElementById('game');
const renderer = createRenderer(canvas, assets);
assets.load(); // art appears as it arrives; placeholders draw until then

function fit() {
  renderer.resize(window.innerWidth || canvas.width, window.innerHeight || canvas.height);
}
window.addEventListener('resize', fit);
fit();

// ---- Input ----
const keys = {};
const input = { up: false, down: false, left: false, right: false };
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (e.key === 'Escape') {
    exitPlacing(state);
    ui.closeModal();
  }
  if (k === 'e') handleInteract(state); // key repeat keeps gathering, limited by the cooldown
  if (k === '=' || k === '+') renderer.zoomBy(1);
  if (k === '-' || k === '_') renderer.zoomBy(-1);
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
    renderer.zoomBy(e.deltaY < 0 ? 1 : -1);
  },
  { passive: false },
);

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
    input.up = !!keys['w'] || !!keys['arrowup'];
    input.down = !!keys['s'] || !!keys['arrowdown'];
    input.left = !!keys['a'] || !!keys['arrowleft'];
    input.right = !!keys['d'] || !!keys['arrowright'];
    update(state, input);
    if (++autosaveTimer >= D.game.autosaveEvery) {
      autosaveTimer = 0;
      store(state);
    }
  },
  render() {
    const enemy = state.mode === 'EXPLORE' ? nearestEnemy(state) : null;
    const node = !enemy && state.mode === 'EXPLORE' ? nearestNode(state) : null;
    const view = {
      nexusStage: nexusStage(state),
      nexusPrompt: nexusPrompt(state),
      target: enemy || node,
      enemy: !!enemy,
      targetLabel: enemy
        ? 'E: attack ' + D.enemies[enemy.type].short
        : node
          ? `E: gather ${D.materials[D.resources[node.type].yields].label} (${nodeAmount(state, node)})`
          : null,
    };
    renderer.draw(state, view, mouse, performance.now());
  },
  schedule: (fn) => requestAnimationFrame(fn),
  now: () => performance.now(),
});
loop.start();
