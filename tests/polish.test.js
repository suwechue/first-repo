// Polish: the audio engine, settings, and day and night.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame } from '../src/systems/game.js';
import { darkness, isNight } from '../src/systems/clock.js';
import { ambientMultiplier } from '../src/systems/exploration.js';
import { createAudio } from '../src/render/audio.js';
import { normalizeSettings, loadSettings, saveSettings } from '../src/ui/settings.js';

function fakeAudioContext() {
  const made = [];
  class Ctx {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = {};
      this.played = [];
      made.push(this);
    }
    createGain() {
      return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
    }
    createOscillator() {
      return {
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start: () => this.played.push('tone'),
        stop() {},
      };
    }
    createBufferSource() {
      const src = {
        connect() {},
        stop() {},
        start: () => this.played.push(src.loop ? 'loop:' + src.buffer : src.buffer),
      };
      return src;
    }
    resume() {
      this.state = 'running';
    }
  }
  return { Ctx, made };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Audio', () => {
  it('stays silent until the first click, then plays', () => {
    const { Ctx, made } = fakeAudioContext();
    const target = new EventTarget();
    let t = 0;
    const audio = createAudio({
      assets: { audioUrl: () => null },
      AudioCtx: Ctx,
      target,
      now: () => (t += 100),
    });
    expect(audio.play('gather')).toBe(false);
    expect(made.length).toBe(0); // no AudioContext before the player interacts
    target.dispatchEvent(new Event('click'));
    expect(audio.unlocked).toBe(true);
    expect(made[0].state).toBe('running');
    expect(audio.play('gather')).toBe(true);
    expect(made[0].played).toContain('tone'); // no file yet, so a synthesized tone
    expect(audio.play('not_a_sound')).toBe(false);
  });

  it('plays a sound file from the manifest when there is one, and loops music', async () => {
    const { Ctx, made } = fakeAudioContext();
    const target = new EventTarget();
    let t = 0;
    const urls = { sfx_hit: 'assets/audio/sfx/hit.ogg', music_day: 'assets/audio/music/day.ogg' };
    const audio = createAudio({
      assets: { audioUrl: (k) => urls[k] || null },
      AudioCtx: Ctx,
      target,
      now: () => (t += 100),
      loadBuffer: async (_ctx, url) => 'buffer(' + url.split('/').pop() + ')',
    });
    audio.music('music_day'); // asked for before unlocking: starts once sound is allowed
    target.dispatchEvent(new Event('keydown'));
    audio.play('hit'); // first call starts loading the file and plays a tone meanwhile
    await flush();
    await flush();
    audio.play('hit');
    expect(made[0].played).toContain('buffer(hit.ogg)');
    expect(made[0].played).toContain('loop:buffer(day.ogg)');
  });

  it('a missing file falls back to a tone and never throws', async () => {
    const { Ctx, made } = fakeAudioContext();
    const target = new EventTarget();
    let t = 0;
    const audio = createAudio({
      assets: { audioUrl: () => 'assets/audio/sfx/none.ogg' },
      AudioCtx: Ctx,
      target,
      now: () => (t += 100),
      loadBuffer: async () => {
        throw new Error('404');
      },
    });
    target.dispatchEvent(new Event('pointerdown'));
    expect(audio.play('craft')).toBe(true);
    await flush();
    expect(audio.play('craft')).toBe(true);
    expect(made[0].played.every((p) => p === 'tone')).toBe(true);
    audio.music('music_boss');
  });

  it('with no Web Audio at all, it simply stays silent', () => {
    const target = new EventTarget();
    const audio = createAudio({ assets: null, AudioCtx: undefined, target });
    target.dispatchEvent(new Event('click'));
    expect(audio.play('gather')).toBe(false);
  });

  it('clamps volumes to 0 to 1', () => {
    const audio = createAudio({ AudioCtx: undefined, target: null });
    audio.setVolumes({ master: 3, music: -1, sfx: 0.25 });
    expect(audio.volumes).toEqual({ master: 1, music: 0, sfx: 0.25 });
  });
});

describe('Settings', () => {
  function memoryStorage() {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
  }

  it('persist and load back', () => {
    const storage = memoryStorage();
    expect(loadSettings(storage)).toEqual(D.game.settings.defaults);
    const mine = { zoom: 3, master: 0.4, music: 0, sfx: 1, touch: 'on' };
    expect(saveSettings(mine, storage)).toBe(true);
    expect(loadSettings(storage)).toEqual(mine);
  });

  it('bad values fall back to the defaults or the nearest allowed value', () => {
    const d = D.game.settings.defaults;
    expect(normalizeSettings({ zoom: 9, master: 2, music: 'loud', touch: 'maybe' })).toEqual({
      ...d,
      zoom: D.world.camera.maxZoom,
      master: 1,
    });
    const broken = { getItem: () => '{not json', setItem: () => {} };
    expect(loadSettings(broken)).toEqual(d);
  });
});

describe('Day and night', () => {
  it('days start bright, darken at dusk and lift before dawn', () => {
    const s = makeInitialState();
    newGame(s, 5);
    const at = (t) => {
      s.dayTimer = Math.round(t * s.dayLength);
      return darkness(s);
    };
    expect(at(0)).toBe(0);
    expect(at(0.5)).toBe(0);
    expect(at(D.game.night.duskAt + D.game.night.fade / 2)).toBeCloseTo(0.5, 1);
    expect(at(0.85)).toBe(1);
    expect(at(0.999)).toBeLessThan(0.1);
  });

  it('brings more wolves at night', () => {
    const s = makeInitialState();
    newGame(s, 5);
    s.dayTimer = 0;
    expect(isNight(s)).toBe(false);
    expect(ambientMultiplier(s)).toBe(1);
    s.dayTimer = Math.round(0.85 * s.dayLength);
    expect(isNight(s)).toBe(true);
    expect(ambientMultiplier(s)).toBe(D.game.night.ambientMul);
  });
});
