// The player-facing message log. Kept in GameState so it survives a reload, like the prototype.
import { D } from '../core/content.js';
import { emit } from '../core/events.js';

export function log(s, msg) {
  s.logMessages.unshift(msg);
  if (s.logMessages.length > D.game.logSize) s.logMessages.pop();
  emit('log', msg);
}

/** Tells the UI that part of the state changed: 'inventory', 'vitals', 'kp', 'day', 'tech', 'roster', 'nexus', 'all'. */
export function changed(topic) {
  emit('changed', topic);
}
