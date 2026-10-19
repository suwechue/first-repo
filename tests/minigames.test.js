// @vitest-environment jsdom
// The minigame plugins (M16): every file in src/ui/minigames/plugins registers itself, and the
// runner hands each one a working ctx and reports its performance.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { list, get } from '../src/ui/minigames/registry.js';
import { openMinigame, abortMinigame } from '../src/ui/minigames/runner.js';

function fakeContext() {
  return new Proxy({}, { get: () => () => {}, set: () => true });
}

let frameCallbacks = [];
beforeAll(() => {
  document.body.innerHTML = '<div id="modal"><div id="modal-body"></div></div>';
  HTMLCanvasElement.prototype.getContext = () => fakeContext();
  globalThis.requestAnimationFrame = (fn) => frameCallbacks.push(fn);
});

function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    const cbs = frameCallbacks;
    frameCallbacks = [];
    cbs.forEach((fn) => fn());
  }
}

describe('Plugin registry', () => {
  it('registers every file in the plugins folder, with no list to maintain', () => {
    const files = fs
      .readdirSync(path.resolve(__dirname, '../src/ui/minigames/plugins'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.replace('.js', ''));
    expect(list().sort()).toEqual(files.sort());
    expect(list().sort()).toEqual(['alignment', 'forge', 'precision', 'synthesis', 'thermal']);
    for (const k of list()) expect(typeof get(k).run).toBe('function');
  });

  it('no plugin calls Math.random', () => {
    const dir = path.resolve(__dirname, '../src/ui/minigames/plugins');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')))
      expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/Math\.random/);
  });
});

describe('The runner', () => {
  it('pauses the game, and resumes it with a performance from 0 to 1', () => {
    const s = { frame: 1, paused: false };
    let got = null;
    openMinigame('synthesis', { s, title: 'Test', difficulty: 2, onDone: (p) => (got = p) });
    expect(s.paused).toBe(true);
    expect(document.getElementById('modal').classList.contains('open')).toBe(true);
    tick(3);
    document.getElementById('mg-bottle').click(); // bottle it straight away
    expect(got).toBeGreaterThanOrEqual(0);
    expect(got).toBeLessThanOrEqual(1);
    expect(s.paused).toBe(false);
  });

  it('precision: five well-timed presses score high, and each pass is scored', () => {
    const s = { frame: 2, paused: false };
    let got = null;
    openMinigame('precision', { s, title: 'Test', difficulty: 1, onDone: (p) => (got = p) });
    const canvas = document.getElementById('mg-canvas');
    for (let i = 0; i < 5; i++) canvas.dispatchEvent(new MouseEvent('click'));
    expect(got).not.toBeNull();
    expect(got).toBeLessThan(0.5); // clicked at the start, far from the zone each time
  });

  it('closing early makes nothing and unpauses', () => {
    const s = { frame: 3, paused: false };
    const done = vi.fn();
    openMinigame('forge', { s, title: 'Test', onDone: done });
    tick(2);
    abortMinigame();
    expect(s.paused).toBe(false);
    tick(5);
    expect(done).not.toHaveBeenCalled();
  });

  it('an unknown minigame falls back to a registered one', () => {
    const s = { frame: 4, paused: false };
    openMinigame('no_such_game', { s, title: 'Test', onDone: () => {} });
    expect(document.getElementById('modal-body').textContent).toMatch(/Precision Strike/);
    abortMinigame();
  });
});
