// Save migrations: MIGRATIONS[n] turns a version n save into version n + 1.
// Version 1 is the beta prototype's format, so prototype exports load and migrate.
import { D } from './content.js';

export const SAVE_VERSION = D.game.save.version;

const MIGRATIONS = {
  // v1 -> v2: the single-screen map becomes a seeded open world. The old map cannot be converted, so
  // a new world is generated: map positions, resource nodes, buildings and enemies are dropped, and the
  // roster, bonds, tech, Knowledge, inventory, armory, Nexus progress and mission log are kept.
  1(d) {
    const out = { ...d, v: 2, nodes: {}, buildings: [] };
    delete out.resources;
    delete out.enemies;
    if (!Number.isInteger(out.seed) || out.seed === 0)
      out.seed = Math.floor(d.savedAt || 0) % 2147483647 || 1;
    if (out.player && typeof out.player === 'object') {
      out.player = { ...out.player };
      for (const k of ['x', 'y', 'w', 'h']) delete out.player[k]; // placed at the new world's spawn
    }
    return out;
  },
  // v2 -> v3: character depth (M9). Characters gain talent ranks, proficiency, objective usage,
  // a history and recent level-ups; each bonded pair gains a record whose clock starts on load.
  2(d) {
    const objectives = Object.keys(D.mission.objectives);
    const zeros = () => Object.fromEntries(objectives.map((o) => [o, 0]));
    const out = { ...d, v: 3, bondMeta: {} };
    const upgrade = (c) => ({
      talentRanks: Object.fromEntries((c.talents || []).map((t) => [t, 1])),
      skills: zeros(),
      usage: zeros(),
      history: [{ day: 1, event: 'joined', how: 'before records were kept' }],
      ups: [],
      lean: null,
      ...c,
    });
    if (Array.isArray(out.roster)) out.roster = out.roster.map(upgrade);
    if (out.recruitOffer && typeof out.recruitOffer === 'object')
      out.recruitOffer = upgrade(out.recruitOffer);
    for (const k of Object.keys(out.bonds || {}))
      out.bondMeta[k] = { since: d.day || 1, missions: 0, flags: [] };
    return out;
  },
};

/** Returns { data } at SAVE_VERSION, or { error } with a message for the player. */
export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Not a save file.' };
  if (typeof data.v !== 'number') return { error: 'Not a save file (no version number).' };
  if (data.v > SAVE_VERSION) {
    return { error: 'This save is from a newer version of the game (v' + data.v + ').' };
  }
  let d = data;
  while (d.v < SAVE_VERSION) {
    const step = MIGRATIONS[d.v];
    if (!step) return { error: 'Unsupported save version: ' + d.v };
    d = step(d);
  }
  return { data: d };
}
