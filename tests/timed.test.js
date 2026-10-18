// Timed missions (M12): squads are away for game time, several at once, and reports queue in the
// order squads return. A save made mid-mission brings the squad home on time.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { serialize, apply } from '../src/core/save.js';
import { newGame, update } from '../src/systems/game.js';
import * as Ms from '../src/systems/missions.js';
import { on } from '../src/core/events.js';

const idle = { up: false, down: false, left: false, right: false };
const R = 'verdant_wilds';

function game(seed = 1212) {
  const s = makeInitialState();
  newGame(s, seed);
  s.nexus.awake = true;
  s.player.inventory.supplies = 50;
  for (const z in s.realms[R]) s.realms[R][z].explored = 100;
  return s;
}

/** Runs frames with the player kept safe, so only the expedition clock matters. */
function frames(s, n) {
  for (let i = 0; i < n; i++) {
    update(s, idle);
    s.enemies = [];
    s.player.hp = s.player.maxHp;
  }
}

describe('Timed missions', () => {
  it('a squad is away for stepFrames per step, pays at departure, and returns with a queued report', () => {
    const s = game();
    const ids = s.roster.slice(0, 2).map((c) => c.id);
    const res = Ms.dispatch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: ids });
    expect(res.ok).toBe(true);
    const e = res.expedition;
    expect(e.returns - e.departed).toBe(D.realms[R].zones.fringe.steps * D.mission.timing.stepFrames);
    expect(s.player.inventory.supplies).toBe(48);
    expect(Ms.awayOn(s, ids[0])).toBe(e);
    expect(
      Ms.validate(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [ids[0], s.roster[2].id] }),
    ).toMatch(/away/);
    const heard = [];
    const stop = on('mission:return', (r) => heard.push(r));
    frames(s, e.returns - s.frame - 1);
    expect(s.expeditions.length).toBe(1);
    expect(s.reportQueue.length).toBe(0);
    frames(s, 1);
    stop();
    expect(s.expeditions.length).toBe(0);
    expect(s.reportQueue.length).toBe(1);
    expect(heard.length).toBe(1);
    expect(Ms.awayOn(s, ids[0])).toBeNull();
    expect(s.missionLog[0]).toBe(s.reportQueue[0]);
    expect(Ms.nextReport(s)).toBe(heard[0]);
    expect(s.reportQueue.length).toBe(0);
  });

  it('a save made mid-mission loads with the squad still out, and it returns on time with the same report', () => {
    const s = game(77);
    const ids = s.roster.slice(0, 3).map((c) => c.id);
    const { expedition } = Ms.dispatch(s, {
      realm: R,
      zone: 'groves',
      objective: 'hunt',
      squad: ids,
      retreat: 25,
    });
    frames(s, 700);
    const data = JSON.parse(JSON.stringify(serialize(s, 1)));
    expect(data.expeditions.length).toBe(1);

    // Carry on in the original game...
    frames(s, expedition.returns - s.frame);
    const original = s.reportQueue[0];
    expect(original).toBeDefined();

    // ...and in a game loaded from the save.
    const t = makeInitialState();
    expect(apply(t, data)).toBeNull();
    expect(t.expeditions).toEqual(data.expeditions);
    expect(Ms.awayOn(t, ids[1])).not.toBeNull();
    frames(t, expedition.returns - t.frame - 1);
    expect(t.reportQueue.length).toBe(0); // not a frame early
    frames(t, 1);
    expect(t.reportQueue.length).toBe(1);
    expect(t.frame).toBe(expedition.returns);
    expect(JSON.stringify(t.reportQueue[0])).toBe(JSON.stringify(original));
  });

  it('several squads can be out at once, up to the limit, and no one can be in two', () => {
    const s = game();
    const [a, b, c, d] = s.roster.map((x) => x.id);
    expect(Ms.dispatch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [a, b] }).ok).toBe(true);
    expect(Ms.dispatch(s, { realm: R, zone: 'fringe', objective: 'gather', squad: [b, c] }).ok).toBe(false);
    expect(Ms.dispatch(s, { realm: R, zone: 'groves', objective: 'gather', squad: [c, d] }).ok).toBe(true);
    expect(s.expeditions.length).toBe(2);
    // a third squad needs more people; give the roster two more and fill the last slot
    s.roster.push({ ...structuredClone(s.roster[0]), id: 'x1', name: 'Extra One' });
    s.roster.push({ ...structuredClone(s.roster[1]), id: 'x2', name: 'Extra Two' });
    expect(Ms.dispatch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: ['x1', 'x2'] }).ok).toBe(
      true,
    );
    s.roster.push({ ...structuredClone(s.roster[0]), id: 'x3', name: 'Extra Three' });
    s.roster.push({ ...structuredClone(s.roster[1]), id: 'x4', name: 'Extra Four' });
    const fourth = Ms.dispatch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: ['x3', 'x4'] });
    expect(fourth.ok).toBe(false);
    expect(fourth.error).toMatch(/at once/);
  });

  it('reports arrive in the order squads return, not the order they left', () => {
    const s = game(31);
    const [a, b, c, d] = s.roster.map((x) => x.id);
    // Old Grove has 6 steps, the Fringe 5: the long trip leaves first but returns last.
    const long = Ms.dispatch(s, {
      realm: R,
      zone: 'old_grove',
      objective: 'explore',
      squad: [a, b],
    }).expedition;
    frames(s, 10);
    const short = Ms.dispatch(s, {
      realm: R,
      zone: 'fringe',
      objective: 'explore',
      squad: [c, d],
    }).expedition;
    expect(short.returns).toBeLessThan(long.returns);
    frames(s, long.returns - s.frame);
    expect(s.reportQueue.map((r) => r.zone)).toEqual(['fringe', 'old_grove']);
    expect(Ms.nextReport(s).zone).toBe('fringe');
    expect(Ms.nextReport(s).zone).toBe('old_grove');
  });

  it('squads that return on the same frame report in the order they set out', () => {
    const s = game(32);
    const [a, b, c, d] = s.roster.map((x) => x.id);
    Ms.dispatch(s, { realm: R, zone: 'fringe', objective: 'gather', squad: [c, d] });
    Ms.dispatch(s, { realm: R, zone: 'fringe', objective: 'explore', squad: [a, b] });
    frames(s, Ms.missionFrames(R, 'fringe'));
    expect(s.reportQueue.map((r) => r.objective)).toEqual(['gather', 'explore']);
  });
});
