// Saved squads: name a squad in the Expedition Hall and load it again later.
import { D } from '../core/content.js';
import * as C from './characters.js';

/** Saves `ids` under `name`, replacing a squad of the same name. Returns an error message or null. */
export function saveSquad(s, name, ids) {
  const n = String(name || '')
    .trim()
    .slice(0, 30);
  if (!n) return 'Name the squad first.';
  if (!ids.length) return 'Pick a squad first.';
  const rest = s.squads.filter((q) => q.name !== n);
  if (rest.length >= D.mission.savedSquads) return `You can keep ${D.mission.savedSquads} squads.`;
  s.squads = [...rest, { name: n, members: ids.slice() }];
  return null;
}

export function deleteSquad(s, name) {
  s.squads = s.squads.filter((q) => q.name !== name);
}

/** The living members of a saved squad. The dead are dropped from it for good. */
export function squadMembers(s, name) {
  const q = s.squads.find((x) => x.name === name);
  if (!q) return [];
  q.members = q.members.filter((id) => C.byId(s, id));
  return q.members.slice();
}
