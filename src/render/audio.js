// The audio engine. Browsers allow sound only after the player interacts, so the engine stays
// silent until the first click, tap or key press, then creates its AudioContext. Each sound plays
// its manifest file when one exists; until you add audio files, sound effects fall back to short
// synthesized tones so the game is never silent. Music plays only from files.

/** Synthesized stand-ins: [wave, start Hz, end Hz, seconds, gain, delay]. */
const SYNTH = {
  gather: [['triangle', 520, 360, 0.07, 0.22, 0]],
  hit: [['square', 190, 80, 0.09, 0.18, 0]],
  hurt: [['sawtooth', 150, 60, 0.16, 0.16, 0]],
  build: [
    ['square', 220, 220, 0.06, 0.14, 0],
    ['square', 330, 330, 0.09, 0.14, 0.07],
  ],
  craft: [
    ['triangle', 660, 660, 0.08, 0.2, 0],
    ['triangle', 880, 880, 0.12, 0.2, 0.08],
  ],
  discover: [
    ['sine', 784, 784, 0.12, 0.22, 0],
    ['sine', 1175, 1175, 0.25, 0.2, 0.11],
  ],
  levelup: [
    ['triangle', 523, 523, 0.09, 0.2, 0],
    ['triangle', 659, 659, 0.09, 0.2, 0.09],
    ['triangle', 784, 784, 0.09, 0.2, 0.18],
    ['triangle', 1046, 1046, 0.22, 0.2, 0.27],
  ],
  death: [['sine', 440, 110, 0.9, 0.22, 0]],
  awaken: [
    ['sine', 392, 392, 1.4, 0.12, 0],
    ['sine', 494, 494, 1.4, 0.12, 0.12],
    ['sine', 587, 587, 1.4, 0.12, 0.24],
    ['sine', 784, 784, 1.6, 0.12, 0.36],
  ],
  click: [['square', 1200, 1100, 0.025, 0.08, 0]],
  day: [
    ['sine', 392, 392, 0.3, 0.08, 0],
    ['sine', 523, 523, 0.45, 0.08, 0.2],
  ],
};

const MIN_GAP_MS = 45; // the same sound twice within this is skipped, so held keys do not buzz

function defaultLoadBuffer(ctx, url) {
  return fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error('missing');
      return r.arrayBuffer();
    })
    .then((data) => ctx.decodeAudioData(data));
}

/**
 * `assets` gives file URLs (assets.audioUrl). `AudioCtx`, `loadBuffer`, `target` and `now` are
 * injectable for tests. Volumes are 0 to 1.
 */
export function createAudio({
  assets,
  AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext,
  loadBuffer = defaultLoadBuffer,
  target = globalThis.window,
  now = () => (globalThis.performance ? globalThis.performance.now() : Date.now()),
} = {}) {
  let ctx = null;
  let gains = null;
  const volumes = { master: 0.8, music: 0.5, sfx: 0.8 };
  const buffers = {}; // key -> AudioBuffer | 'loading' | 'missing'
  const lastPlayed = {};
  let wantMusic = null;
  let musicKey = null;
  let musicSource = null;

  function applyVolumes() {
    if (!gains) return;
    gains.master.gain.value = volumes.master;
    gains.music.gain.value = volumes.music;
    gains.sfx.gain.value = volumes.sfx;
  }

  function unlock() {
    if (ctx || !AudioCtx) return;
    try {
      ctx = new AudioCtx();
    } catch {
      ctx = null;
      return;
    }
    const master = ctx.createGain();
    master.connect(ctx.destination);
    const music = ctx.createGain();
    music.connect(master);
    const sfx = ctx.createGain();
    sfx.connect(master);
    gains = { master, music, sfx };
    applyVolumes();
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    if (target?.removeEventListener) for (const ev of EVENTS) target.removeEventListener(ev, unlock, true);
    if (wantMusic) startMusic(wantMusic);
  }
  const EVENTS = ['pointerdown', 'keydown', 'touchstart', 'click'];
  if (target?.addEventListener) for (const ev of EVENTS) target.addEventListener(ev, unlock, true);

  /** Starts loading a file if the manifest names one. Returns the buffer if it is ready. */
  function buffer(key) {
    const b = buffers[key];
    if (b && b !== 'loading' && b !== 'missing') return b;
    if (b) return null;
    const url = assets?.audioUrl(key);
    if (!url) {
      buffers[key] = 'missing';
      return null;
    }
    buffers[key] = 'loading';
    Promise.resolve()
      .then(() => loadBuffer(ctx, url))
      .then(
        (buf) => {
          buffers[key] = buf || 'missing';
          if (buf && wantMusic === key && musicKey !== key) startMusic(key);
        },
        () => {
          buffers[key] = 'missing';
        },
      );
    return null;
  }

  function synth(name) {
    const notes = SYNTH[name];
    if (!notes) return false;
    const t0 = ctx.currentTime;
    for (const [type, f0, f1, dur, gain, delay] of notes) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0 + delay);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + delay + dur);
      env.gain.setValueAtTime(0.0001, t0 + delay);
      env.gain.exponentialRampToValueAtTime(gain, t0 + delay + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + dur);
      osc.connect(env);
      env.connect(gains.sfx);
      osc.start(t0 + delay);
      osc.stop(t0 + delay + dur + 0.02);
    }
    return true;
  }

  function startMusic(key) {
    if (!ctx) return;
    const buf = buffer(key);
    if (!buf) return; // starts when it finishes loading, or never if there is no file
    if (musicSource) {
      try {
        musicSource.stop();
      } catch {
        // already stopped
      }
    }
    musicSource = ctx.createBufferSource();
    musicSource.buffer = buf;
    musicSource.loop = true;
    musicSource.connect(gains.music);
    musicSource.start();
    musicKey = key;
  }

  return {
    get unlocked() {
      return !!ctx;
    },
    unlock,
    /** Plays a sound effect by cue name ('gather' plays sfx_gather). Returns true if something played. */
    play(name) {
      if (!ctx) return false; // not allowed before the first interaction
      const t = now();
      if (lastPlayed[name] !== undefined && t - lastPlayed[name] < MIN_GAP_MS) return false;
      lastPlayed[name] = t;
      const buf = buffer('sfx_' + name);
      if (buf) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(gains.sfx);
        src.start();
        return true;
      }
      return synth(name);
    },
    /** The music that should be playing, by manifest key ('music_day'). Silent without a file. */
    music(key) {
      if (key === wantMusic) return;
      wantMusic = key;
      if (!key && musicSource) {
        try {
          musicSource.stop();
        } catch {
          // already stopped
        }
        musicSource = null;
        musicKey = null;
      }
      if (key) startMusic(key);
    },
    setVolumes(v) {
      for (const k of ['master', 'music', 'sfx']) {
        if (Number.isFinite(v[k])) volumes[k] = Math.max(0, Math.min(1, v[k]));
      }
      applyVolumes();
    },
    get volumes() {
      return { ...volumes };
    },
  };
}
