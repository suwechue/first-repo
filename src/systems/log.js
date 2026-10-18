// The player-facing message log. Kept in GameState so it survives a reload, like the prototype.
import { D } from '../core/content.js';
import { emit } from '../core/events.js';

export function log(s, msg) {
  s.logMessages.unshift(msg);
  if (s.logMessages.length > D.game.logSize) s.logMessages.pop();
  emit('log', msg);
}

/** A moment worth a sound: 'gather', 'hit', 'hurt', 'build', 'craft', 'awaken', 'discover'. The UI maps it to audio. */
export function cue(name) {
  emit('sfx', name);
}

/** Tells the UI that part of the state changed: 'inventory', 'vitals', 'kp', 'day', 'tech', 'roster', 'nexus', 'all'. */
export function changed(topic) {
  emit('changed', topic);
}
