// The Nexus: buried, then excavated by digging, then awakened by Shrine Awareness.
import { D } from '../core/content.js';
import { dist } from '../core/geometry.js';
import { emit } from '../core/events.js';
import { canAfford, spend, give, costText } from './inventory.js';
import { isUnlocked } from './tech.js';
import { refreshOffer } from './recruiting.js';
import { log, changed } from './log.js';

const N = D.nexus;

export function nexusPos() {
  return N.position;
}

export function nexusStage(s) {
  if (s.nexus.awake) return 'awake';
  if (s.nexus.dig >= N.digSteps) return 'excavated';
  return 'buried';
}

export function inNexusRange(s) {
  return dist(s.player, N.position) < N.interactRange;
}

export function interactNexus(s) {
  const n = s.nexus;
  const stage = nexusStage(s);
  if (stage === 'buried') {
    if (!isUnlocked(s, N.digTech)) {
      log(
        s,
        `Something huge lies buried here. You lack the engineering to dig it out safely (${D.tech[N.digTech].name}).`,
      );
      return;
    }
    if (!canAfford(s, N.digCost)) {
      log(s, 'Digging needs ' + costText(N.digCost) + '.');
      return;
    }
    spend(s, N.digCost);
    n.dig++;
    if (n.dig >= N.digSteps) {
      log(
        s,
        'The Nexus is uncovered — a ring of cold stone. Build Shrines nearby to attune your people to it.',
      );
    } else log(s, 'You dig around the buried structure. (' + n.dig + '/' + N.digSteps + ')');
    changed('nexus');
  } else if (stage === 'excavated') {
    log(
      s,
      'The Nexus is silent. Awareness ' +
        Math.floor(n.awareness) +
        '/' +
        N.awarenessNeeded +
        ' — Shrines slowly attune your people.',
    );
  } else {
    emit('panel:open', 'hall');
  }
}

export function addAwareness(s, amount) {
  const n = s.nexus;
  if (n.awake || n.dig < N.digSteps) return;
  n.awareness = Math.min(N.awarenessCap, n.awareness + amount);
  if (n.awareness >= N.awarenessNeeded) awakenNexus(s);
}

export function awakenNexus(s) {
  const n = s.nexus;
  if (n.awake) return;
  n.awake = true;
  give(s, N.awakenGrants.items);
  s.renown += N.awakenGrants.renown;
  refreshOffer(s);
  const grants = Object.entries(N.awakenGrants.items)
    .map(([k, v]) => '+' + v + ' ' + (D.materials[k]?.label || k))
    .join(', ');
  log(s, 'The Nexus awakens! A doorway of light opens. (' + grants + ')');
  changed('all');
}

/** The prompt shown over the Nexus when the player is close, or null. */
export function nexusPrompt(s) {
  if (!inNexusRange(s)) return null;
  const stage = nexusStage(s);
  if (stage === 'buried') return 'E: dig (' + s.nexus.dig + '/' + N.digSteps + ')';
  if (stage === 'excavated') return 'Awareness ' + Math.floor(s.nexus.awareness) + '/' + N.awarenessNeeded;
  return 'E: Expedition Hall';
}
