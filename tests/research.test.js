// Research (M13): no passive Knowledge, study at a Research Desk, and scholars seated at desks.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame, update } from '../src/systems/game.js';
import { enterPlacing, tryPlaceBuilding, placementCheck } from '../src/systems/building.js';
import { setScholar, scholarRate, seats, scholarsPerDay, startStudy } from '../src/systems/research.js';
import * as Ms from '../src/systems/missions.js';
import { migrate } from '../src/core/migrations.js';

const idle = { up: false, down: false, left: false, right: false };

function game() {
  const s = makeInitialState();
  newGame(s, 1313);
  s.player.inventory.wood = 100;
  s.player.inventory.stone = 100;
  return s;
}

function frames(s, n) {
  for (let i = 0; i < n; i++) {
    update(s, idle);
    s.enemies = [];
  }
}

/** Builds a desk on the first free tile near the player. */
function buildDesk(s) {
  enterPlacing(s, 'research_desk');
  for (let r = 1; r <= 3; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const p = placementCheck(s, 'research_desk', s.player.x + dx * 32, s.player.y + dy * 32);
        if (p.ok && tryPlaceBuilding(s, p.x, p.y)) return s.buildings.at(-1);
      }
  throw new Error('no room for a desk');
}

describe('Research', () => {
  it('time alone earns no Knowledge', () => {
    const s = game();
    frames(s, D.game.clock.dayLength);
    expect(s.kp).toBe(0);
  });

  it('studying needs a desk in reach, and pays 1 Knowledge every 45 frames', () => {
    const s = game();
    expect(startStudy(s)).toBe(false);
    const desk = buildDesk(s);
    Object.assign(s.player, { x: desk.x, y: desk.y + 30 });
    expect(startStudy(s)).toBe(true);
    frames(s, 45 * 4);
    expect(s.kp).toBe(4);
    // walking away from the desk stops it
    s.player.y += 200;
    frames(s, 45);
    expect(s.mode).toBe('EXPLORE');
    expect(s.kp).toBe(4);
  });

  it('each desk seats one scholar, who earns 8 + 2 x INT a day and cannot deploy', () => {
    const s = game();
    s.nexus.awake = true;
    s.player.inventory.supplies = 10;
    const [a, b, c] = s.roster;
    expect(setScholar(s, a, true)).toMatch(/Build a Research Desk/);
    buildDesk(s);
    expect(seats(s)).toBe(1);
    expect(setScholar(s, a, true)).toBeNull();
    expect(setScholar(s, b, true)).toMatch(/seat is taken/);
    expect(scholarRate(a)).toBe(8 + 2 * a.stats.int);
    expect(scholarsPerDay(s)).toBe(scholarRate(a));
    frames(s, D.game.clock.dayLength);
    expect(s.kp).toBeGreaterThanOrEqual(scholarRate(a) - 1);
    expect(s.kp).toBeLessThanOrEqual(scholarRate(a));
    expect(
      Ms.validate(s, { realm: 'verdant_wilds', zone: 'fringe', objective: 'explore', squad: [a.id, c.id] }),
    ).toMatch(/researching/);
    setScholar(s, a, false);
    expect(
      Ms.validate(s, { realm: 'verdant_wilds', zone: 'fringe', objective: 'explore', squad: [a.id, c.id] }),
    ).toBeNull();
  });

  it('a v6 save seats no one', () => {
    const { data } = migrate({ v: 6, player: {}, roster: [{ id: 'c1', cls: 'warrior' }] });
    expect(data.roster[0].assignment).toBeNull();
    expect(data.researchCarry).toBe(0);
  });
});
