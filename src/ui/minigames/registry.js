// The minigame registry. Every file in ./plugins/ exports a default definition and is registered
// here automatically, so adding a minigame is one file (see ./plugins/README.md).
//
// A definition: { key, label, vectorHint: [], run(ctx) -> cleanup | null }. ctx carries:
//   canvas, ctx2d        the shared 680 x 300 canvas (hide it if you build your own DOM)
//   instructionsEl       a line of instructions
//   progressEl           a bar: set style.width as a 0-100% progress
//   extraEl              an empty element under the canvas for buttons and the like
//   difficulty           1 to 10
//   targetCategory       'weapon' | 'armor'
//   vectors              the Invention allocation, or {} for a plain craft
//   rand()               a seeded random number in [0, 1); never use Math.random
//   now()                milliseconds, for timing
//   schedule(fn)         the next animation frame
//   finish(performance)  call exactly once with 0 to 1 when done
// run() may return a cleanup function, called if the player closes the minigame early.

const registry = new Map();

export function register(def) {
  if (!def || !def.key || typeof def.run !== 'function') {
    console.warn('A minigame needs a key and a run(ctx) function; skipped.', def);
    return;
  }
  registry.set(def.key, def);
}

export function get(key) {
  return registry.get(key) || null;
}

export function has(key) {
  return registry.has(key);
}

export function list() {
  return [...registry.keys()];
}

// Every plugin file registers itself by being in the folder.
const modules = import.meta.glob('./plugins/*.js', { eager: true });
for (const m of Object.values(modules)) register(m.default);
