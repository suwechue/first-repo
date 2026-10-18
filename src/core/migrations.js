// Save migrations: MIGRATIONS[n] turns a version n save into version n + 1.
// Version 1 is the beta prototype's format, so prototype exports load unchanged.
import { D } from './content.js';

export const SAVE_VERSION = D.game.save.version;

const MIGRATIONS = {};

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
