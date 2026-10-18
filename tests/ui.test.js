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
  localStorage.clear();
  await import('../src/main.js');
});

function runFrames(n) {
  for (let i = 0; i < n; i++) {
    const cbs = frameCallbacks;
    frameCallbacks = [];
    cbs.forEach((fn) => fn());
  }
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
    expect(document.querySelectorAll('#tech-list .tech-node').length).toBe(10);
    click('btn-tech');
    expect(document.getElementById('panel-tech').classList.contains('open')).toBe(false);
  });

  it('saves to the browser', () => {
    click('btn-sys');
    click('sys-save');
    expect(document.getElementById('sys-msg').textContent).toBe('Saved.');
    const saved = JSON.parse(localStorage.getItem('primitive_age_save_v1'));
    expect(saved.v).toBe(2);
    expect(saved.roster.length).toBe(4);
  });

  it('launches an expedition from the Hall once the Nexus is awake, and shows the report', async () => {
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
    expect(document.getElementById('modal').classList.contains('open')).toBe(true);
    expect(document.getElementById('modal-body').textContent).toMatch(/The Fringe — Explore/);
    click('modal-close');
    expect(document.querySelectorAll('#hall-body .log-row').length).toBe(1);
    runFrames(10);
    expect(errors).toEqual([]);
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
