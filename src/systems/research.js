// Research: Knowledge comes from study at a Research Desk and from scholars seated at desks.
// Rules: docs/SPEC.md, Systems reference, Research (M13).
import { D } from '../core/content.js';
import { dist } from '../core/geometry.js';
import * as C from './characters.js';
import { awayOn } from './missions.js';
import { log, changed } from './log.js';

const RS = D.game.research;

/** Desks the player has built, as building records. */
export function desks(s) {
  return s.buildings.filter((b) => D.buildings[b.type]?.research);
}

/** Scholar seats: one per desk (or the desk's `seats`). */
export function seats(s) {
  return desks(s).reduce((a, b) => a + (D.buildings[b.type].research.seats || 0), 0);
}

export function scholars(s) {
  return s.roster.filter((c) => c.assignment === 'research');
}

/** Knowledge per day for one scholar: 8 + 2 x INT. */
export function scholarRate(c) {
  return RS.scholar.base + RS.scholar.perInt * C.statEff(c, 'int');
}

/** Why a character cannot take a seat, or null. */
export function assignError(s, c) {
  if (c.assignment === 'research') return null;
  if (scholars(s).length >= seats(s))
    return seats(s)
      ? 'Every desk seat is taken. Build another Research Desk.'
      : 'Build a Research Desk first.';
  if (C.isInjured(s, c)) return c.name + ' is recovering from an injury.';
  if (awayOn(s, c.id)) return c.name + ' is away on an expedition.';
  return null;
}

/** Seats or unseats a scholar. Returns an error message or null. */
export function setScholar(s, c, on) {
  if (!on) {
    c.assignment = null;
    changed('roster');
    return null;
  }
  const err = assignError(s, c);
  if (err) return err;
  c.assignment = 'research';
  changed('roster');
  return null;
}

/** The nearest desk within reach of the player, or null. */
export function deskInReach(s) {
  let best = null;
  let bestD = RS.studyRange;
  for (const b of desks(s)) {
    const d = dist(s.player, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function startStudy(s) {
  if (!deskInReach(s)) return false;
  s.mode = 'STUDYING';
  s.studyTimer = 0;
  log(s, 'You settle at the desk and study. (Move or press E to stop.)');
  return true;
}

export function stopStudy(s) {
  if (s.mode !== 'STUDYING') return;
  s.mode = 'EXPLORE';
  log(s, 'You put the notes away.');
}

/** Per frame: study pays while the player stays at a desk; scholars add their share every frame. */
export function updateResearch(s) {
  if (s.mode === 'STUDYING') {
    const desk = deskInReach(s);
    if (!desk) stopStudy(s);
    else {
      const R = D.buildings[desk.type].research;
      s.studyTimer = (s.studyTimer || 0) + 1;
      if (s.studyTimer >= R.studyEvery) {
        s.studyTimer = 0;
        s.kp += R.studyKp;
        changed('kp');
      }
    }
  }
  const sc = scholars(s);
  if (!sc.length) return;
  // Seats can shrink if a desk is gone; extra scholars stand up.
  const free = seats(s);
  sc.slice(free).forEach((c) => (c.assignment = null));
  const perFrame = sc.slice(0, free).reduce((a, c) => a + scholarRate(c), 0) / s.dayLength;
  s.researchCarry = (s.researchCarry || 0) + perFrame;
  if (s.researchCarry >= 1) {
    const whole = Math.floor(s.researchCarry);
    s.researchCarry -= whole;
    s.kp += whole;
    changed('kp');
  }
}

/** Knowledge per day from the seated scholars. */
export function scholarsPerDay(s) {
  return scholars(s)
    .slice(0, seats(s))
    .reduce((a, c) => a + scholarRate(c), 0);
}
