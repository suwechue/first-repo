// The one source of randomness. Seeded (mulberry32) so worlds, missions and tests are reproducible.
// The generator's state is a single uint32 that the save stores, so a loaded game continues the same stream.

let state = 0;
let source = null; // optional override, used by tests to share a stream with the reference prototype

function step(s) {
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A float in [0, 1). */
export function rand() {
  if (source) return source();
  state = (state + 0x6d2b79f5) | 0;
  return step(state);
}

/** Seeds the generator from an integer or a string. */
export function seedRng(seed) {
  source = null;
  state = toSeed(seed);
}

export function getRngState() {
  return state >>> 0;
}

export function setRngState(s) {
  state = s | 0;
}

/** Replaces the generator with another function returning [0, 1). Pass null to restore. Tests only. */
export function useRandomSource(fn) {
  source = fn;
}

/** A standalone seeded generator, for tools and tests that need an independent stream. */
export function createRng(seed) {
  let s = toSeed(seed);
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    return step(s);
  };
}

function toSeed(seed) {
  if (typeof seed === 'number') return seed | 0;
  const str = String(seed);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}

/** Picks a key from {key: weight}. Negative weights count as 0. Returns null, without rolling, if all are 0. */
export function weightedKey(weights) {
  let total = 0;
  for (const k in weights) total += Math.max(0, weights[k]);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const k in weights) {
    r -= Math.max(0, weights[k]);
    if (r < 0) return k;
  }
  return Object.keys(weights)[0];
}

/** Uniform pick from an array. */
export function pick(list) {
  return list[Math.floor(rand() * list.length)];
}

/** Rounds x down or up at random, in proportion to its fraction. Always rolls once. */
export function stochRound(x) {
  const f = Math.floor(x);
  return f + (rand() < x - f ? 1 : 0);
}
