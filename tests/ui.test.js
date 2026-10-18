// @vitest-environment jsdom
// Boots the real page (index.html + src/main.js) in jsdom and drives the panels like a player would.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

// jsdom has no canvas; record calls on a do-nothing 2D context instead.
function fakeContext() {
  return new Proxy(
    {
      measureText: () => ({ width: 10 }),
      createPattern: () => null,
      createRadialGradient: () => ({ addColorStop() {} }),
    },
    { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true },
  );
}

let frameCallbacks = [];
const errors = [];

beforeAll(async () => {
  document.documentElement.innerHTML = html.replace(/<script[\s\S]*?<\/script>/g, '');
  HTMLCanvasElement.prototype.getContext = () => fakeContext();
  globalThis.requestAnimationFrame = (fn) => frameCallbacks.push(fn);
  window.addEventListener('error', (e) => errors.push(e.error));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);
  localStorage.clear();
  await import('../src/main.js');
});

// The page's clock: each animation frame advances it by `stepsPerFrame` simulation steps.
let fakeNow = 0;
function runFrames(n, stepsPerFrame = 1) {
  for (let i = 0; i < n; i++) {
    fakeNow += (1000 / 60) * stepsPerFrame;
    const cbs = frameCallbacks;
    frameCallbacks = [];
    cbs.forEach((fn) => fn());
  }
}

/** Lets `frames` of game time pass. The loop drops time beyond 10 steps a frame, so stay under it. */
function fastForward(frames) {
  runFrames(Math.ceil(frames / 8) + 2, 8);
}

const click = (id) => document.getElementById(id).click();

describe('The page', () => {
  it('boots a new game and draws the HUD', () => {
    runFrames(5);
    expect(document.getElementById('day-label').textContent).toBe('Day 1');
    expect(document.querySelectorAll('#resource-bar .res-chip').length).toBe(5);
    expect(document.getElementById('status-log').textContent).toMatch(
      /You wake among the mossy ruins of Mossgate/,
    );
    expect(errors).toEqual([]);
  });

  it('opens every panel', () => {
    for (const k of ['craft', 'build', 'tech', 'roster', 'sys']) {
      click('btn-' + k);
      expect(document.getElementById('panel-' + k).classList.contains('open')).toBe(true);
    }
    click('btn-roster');
    expect(document.querySelectorAll('#roster-list .char-card').length).toBe(4);
    click('btn-tech');
    expect(document.querySelectorAll('#tech-list .tech-node').length).toBe(12);
    click('btn-tech');
    expect(document.getElementById('panel-tech').classList.contains('open')).toBe(false);
  });

  it('saves to the browser', () => {
    click('btn-sys');
    click('sys-save');
    expect(document.getElementById('sys-msg').textContent).toBe('Saved.');
    const saved = JSON.parse(localStorage.getItem('primitive_age_save_v1'));
    expect(saved.v).toBe(6);
    expect(saved.roster.length).toBe(4);
  });

  it('sends a squad from the Hall, and its report waits in the queue when it returns', async () => {
    // Load a save where the Nexus is awake, through the menu's import path.
    const saved = JSON.parse(localStorage.getItem('primitive_age_save_v1'));
    saved.nexus = { dig: 3, awareness: 40, awake: true };
    Object.assign(saved.player.inventory, { supplies: 10, wood: 10, stone: 10 });
    click('btn-sys');
    const file = new File([JSON.stringify(saved)], 'save.json', { type: 'application/json' });
    const input = document.getElementById('sys-file');
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(document.getElementById('status-log').textContent).toMatch(/Save imported/),
    );

    expect(document.getElementById('btn-hall').style.display).toBe('');
    click('btn-hall');
    const picks = [...document.querySelectorAll('#hall-body [data-pick]')];
    expect(picks.length).toBe(4);
    for (const cb of picks.slice(0, 3)) {
      document.querySelector(`[data-pick="${cb.getAttribute('data-pick')}"]`).click();
    }
    expect(document.querySelector('#hall-body .preview').textContent).toMatch(/Squad Power/);
    click('btn-launch');
    expect(document.getElementById('status-log').textContent).toMatch(/sets out for The Fringe/);
    expect(document.querySelectorAll('#hall-body .out-row').length).toBe(1);
    expect(document.getElementById('modal').classList.contains('open')).toBe(false);
    // The squad is away: they cannot be picked again.
    expect(document.querySelector(`[data-pick="${picks[0].getAttribute('data-pick')}"]`).disabled).toBe(true);
    fastForward(5 * 300 + 20); // five steps of 300 frames
    expect(document.querySelectorAll('#hall-body .out-row').length).toBe(0);
    expect(document.getElementById('status-log').textContent).toMatch(/A squad returns from The Fringe/);
    click('btn-read-report');
    expect(document.getElementById('modal').classList.contains('open')).toBe(true);
    expect(document.getElementById('modal-body').textContent).toMatch(/The Fringe — Explore/);
    click('modal-close');
    expect(document.getElementById('btn-read-report')).toBeNull();
    expect(document.querySelectorAll('#hall-body [data-report]').length).toBe(1);
    runFrames(10);
    expect(errors).toEqual([]);
  });

  it('the Hall will not put a Blood Feud pair in one squad, and shows chemistry', async () => {
    const saved = JSON.parse(localStorage.getItem('primitive_age_save_v1'));
    const [a, b] = saved.roster.filter((c) => !c.injuredUntil || c.injuredUntil <= saved.day);
    const key = [a.id, b.id].sort().join('|');
    saved.bonds[key] = -95;
    saved.player.inventory.supplies = 10;
    click('btn-sys');
    const file = new File([JSON.stringify(saved)], 'save.json', { type: 'application/json' });
    const input = document.getElementById('sys-file');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    // the import stores the save once it is applied
    await vi.waitFor(() =>
      expect(JSON.parse(localStorage.getItem('primitive_age_save_v1')).bonds[key]).toBe(-95),
    );
    click('btn-hall');
    const pick = (id) => document.querySelector(`#hall-body [data-pick="${id}"]`);
    pick(a.id).click();
    expect(pick(b.id).disabled).toBe(true);
    expect(pick(b.id).closest('label').textContent).toMatch(/Blood Feud/);
    pick(a.id).click(); // untick: now b can be picked, and a is the one refused
    pick(b.id).click();
    expect(pick(a.id).disabled).toBe(true);
    const others = saved.roster.filter(
      (c) => c.id !== a.id && c.id !== b.id && !(c.injuredUntil > saved.day),
    );
    if (others.length) {
      pick(others[0].id).click();
      expect(document.querySelector('#hall-body .chemistry').textContent).toMatch(/team chemistry/);
    }
    click('btn-hall');
  });

  it('the character sheet shows real data on all four tabs', () => {
    click('btn-roster');
    document.querySelector('#roster-list [data-sheet-open]').click();
    expect(document.getElementById('modal').classList.contains('open')).toBe(true);
    const body = () => document.getElementById('sheet-body');
    const tab = (k) => document.querySelector(`[data-sheet-tab="${k}"]`).click();
    expect(body().querySelectorAll('.sstat').length).toBe(6);
    expect(body().textContent).toMatch(/Combat Power/);
    tab('growth');
    expect(body().querySelectorAll('.sbar').length).toBeGreaterThan(5);
    expect(body().textContent).toMatch(/Next Breakthrough at level/);
    tab('bonds');
    expect(body().querySelectorAll('table.bonds tr').length).toBe(
      document.querySelectorAll('#roster-list .char-card:not(.offer)').length,
    ); // header + every squadmate
    expect(body().textContent).toMatch(/●|○/);
    tab('history');
    expect(body().textContent).toMatch(/One of the first four|Joined|expedition/);
    click('modal-close');
    click('btn-roster');
  });

  it('keeps settings across a reload, apart from the save', () => {
    click('btn-sys');
    document.querySelector('#sys-body [data-zoom="3"]').click();
    const vol = document.getElementById('set-music');
    vol.value = '20';
    vol.dispatchEvent(new Event('input'));
    const stored = JSON.parse(localStorage.getItem('nexus_settings'));
    expect(stored).toMatchObject({ zoom: 3, music: 0.2 });
    expect(JSON.parse(localStorage.getItem('primitive_age_save_v1')).zoom).toBeUndefined();
    click('btn-sys'); // reopening shows the stored values
    click('btn-sys');
    expect(document.querySelector('#sys-body [data-zoom="3"]').classList.contains('active')).toBe(true);
    expect(document.getElementById('set-music').value).toBe('20');
    document.querySelector('#sys-body [data-zoom="2"]').click();
    click('btn-sys');
  });

  it('places a building with the mouse', () => {
    click('btn-build');
    const place = document.querySelector("[data-build='campfire']");
    expect(place.disabled).toBe(false);
    place.click();
    expect(document.getElementById('panel-build').classList.contains('open')).toBe(false);
    // The camera centers on the player, so the middle of the canvas is the player's own tile, which
    // is clear ground at the spawn; a campfire may stand there.
    const canvas = document.getElementById('game');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: canvas.width, height: canvas.height });
    canvas.dispatchEvent(
      new MouseEvent('mousemove', { clientX: canvas.width / 2, clientY: canvas.height / 2 }),
    );
    runFrames(2);
    canvas.dispatchEvent(new MouseEvent('click', { clientX: canvas.width / 2, clientY: canvas.height / 2 }));
    expect(document.getElementById('status-log').textContent).toMatch(/Built Campfire/);
    runFrames(5);
    expect(errors).toEqual([]);
  });
});
