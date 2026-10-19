// Versioned save format: serialize GameState to plain JSON and apply it back.
// Pure: localStorage and files are handled in src/ui/persistence.js.
// The world is regenerated from `seed`, so a save holds only what changed: depleted nodes,
// buildings, the player and the settlement. Enemies are not saved.
import { D } from './content.js';
import { makeInitialState } from './state.js';
import { migrate, SAVE_VERSION } from './migrations.js';
import { getRngState, setRngState } from './rng.js';

const FIELDS = [
  'day',
  'dayTimer',
  'kp',
  'renown',
  'arcane',
  'player',
  'nodes',
  'relics',
  'fog',
  'landmarks',
  'buildings',
  'nexus',
  'roster',
  'bonds',
  'bondMeta',
  'armory',
  'memorial',
  'fragments',
  'realms',
  'missionLog',
  'recruitOffer',
  'squads',
  'expeditions',
  'reportQueue',
  'nextExpeditionId',
  'researchCarry',
  'nextCharId',
  'stats',
  'logMessages',
  'seed',
  'rngState',
  'frame',
];

export function serialize(state, savedAt = 0) {
  state.rngState = getRngState();
  const o = { v: SAVE_VERSION, savedAt, tech: {} };
  for (const f of FIELDS) o[f] = state[f];
  for (const k in state.tech) o.tech[k] = !!state.tech[k];
  return JSON.parse(JSON.stringify(o));
}

/**
 * Loads `data` into `state` in place. Returns null on success, or an error message.
 * A save without a player position (a migrated v1 file) leaves player.x and y null; loadGame in
 * systems/game.js then puts the player at the world's spawn.
 */
export function apply(state, data) {
  const m = migrate(data);
  if (m.error) return m.error;
  data = m.data;
  if (!data.player || typeof data.player !== 'object' || !Array.isArray(data.roster)) {
    return 'Save file is incomplete.';
  }
  const fresh = makeInitialState();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
  for (const f of FIELDS) if (data[f] !== undefined) state[f] = structuredClone(data[f]);
  state.player = Object.assign({}, fresh.player, data.player);
  state.player.inventory = Object.assign({}, fresh.player.inventory, data.player.inventory || {});
  state.nexus = Object.assign({}, fresh.nexus, data.nexus || {});
  state.stats = Object.assign({}, fresh.stats, data.stats || {});
  // The world's changes: anything malformed is dropped rather than trusted, since the world itself
  // is regenerated from the seed and a bad entry would only point at nothing.
  const plainObject = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? structuredClone(o) : {});
  state.nodes = {};
  for (const [id, n] of Object.entries(plainObject(data.nodes))) {
    if (n && Number.isFinite(n.amount) && Number.isFinite(n.respawnTimer)) state.nodes[id] = n;
  }
  state.relics = plainObject(data.relics);
  state.landmarks = plainObject(data.landmarks);
  state.fog =
    Array.isArray(data.fog) && data.fog.every((n) => Number.isInteger(n) && n >= 0) ? data.fog.slice() : [];
  state.buildings = (Array.isArray(state.buildings) ? state.buildings : []).filter(
    (b) => b && D.buildings[b.type] && Number.isFinite(b.x) && Number.isFinite(b.y),
  );
  // Merge realm progress so zones added in newer content still exist.
  const saved = data.realms || {};
  state.realms = {};
  for (const rk in fresh.realms) state.realms[rk] = Object.assign({}, fresh.realms[rk], saved[rk] || {});
  for (const k in fresh.tech) {
    state.tech[k] = data.tech && data.tech[k] !== undefined ? !!data.tech[k] : fresh.tech[k];
  }
  if (data.rngState !== undefined) setRngState(data.rngState);
  return null;
}
