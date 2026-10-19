// Shared test helpers: a fresh state with the starter roster, and scripted random sources.
import { makeInitialState } from '../../src/core/state.js';
import { D } from '../../src/core/content.js';
import { seedRng, useRandomSource } from '../../src/core/rng.js';
import { initStarters } from '../../src/systems/characters.js';
import { createItem, equip } from '../../src/systems/gear.js';

export function freshState(seed = 1) {
  useRandomSource(null);
  seedRng(seed);
  const s = makeInitialState();
  initStarters(s);
  return s;
}

/** Every roll returns `value`. */
export function constantRandom(value) {
  useRandomSource(() => value);
}

/** Rolls come from `queue` in order, then `fallback` forever. */
export function scriptedRandom(queue, fallback) {
  const q = queue.slice();
  useRandomSource(() => (q.length ? q.shift() : fallback));
}

export function restoreRandom() {
  useRandomSource(null);
}

/** An awake Nexus with plenty of supplies, so missions can launch. */
export function readyForMissions(s) {
  s.nexus.awake = true;
  s.player.inventory.supplies = 100;
  return s;
}

/** A character by the start of their name, e.g. starter(s, 'Kael'). */
export function starter(s, first) {
  return s.roster.find((c) => c.name.startsWith(first));
}

/** Makes a piece of `base` and puts it on `wearer` (a character or s.player). Returns the piece. */
export function wear(s, wearer, base, quality = 'standard') {
  const it = createItem(s, base, quality);
  equip(s, wearer, D.items[base].slot, it.id);
  return it;
}
