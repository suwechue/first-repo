// The tech tree: Knowledge Points, Arcane Knowledge and materials buy technologies.
import { D } from '../core/content.js';
import { canAfford, spend } from './inventory.js';
import { log, changed } from './log.js';

export function isUnlocked(s, key) {
  return !!s.tech[key];
}

export function reqsMet(s, reqs) {
  return reqs.every((r) => D.tech[r] && isUnlocked(s, r));
}

/** Why a tech cannot be unlocked right now, or null if it can. */
export function unlockError(s, key) {
  const t = D.tech[key];
  if (!t) return 'Unknown technology.';
  if (isUnlocked(s, key)) return 'Already known.';
  if (!t.prereq.every((p) => isUnlocked(s, p))) return 'Missing prerequisite technology.';
  if (t.needsNexus && !s.nexus.awake) return 'This knowledge needs an awakened Nexus.';
  if (s.kp < t.cost) return 'Not enough Knowledge Points.';
  if ((t.arcane || 0) > s.arcane) return 'Not enough Arcane Knowledge — explore other realms.';
  if (t.extra && !canAfford(s, t.extra)) return 'Missing materials for this research.';
  return null;
}

export function tryUnlockTech(s, key) {
  const err = unlockError(s, key);
  if (err) {
    if (err !== 'Already known.') log(s, err);
    return false;
  }
  const t = D.tech[key];
  s.kp -= t.cost;
  s.arcane -= t.arcane || 0;
  if (t.extra) spend(s, t.extra);
  s.tech[key] = true;
  log(s, `Unlocked technology: ${t.name}!`);
  changed('tech');
  return true;
}
