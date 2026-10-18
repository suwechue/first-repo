// The asset registry. Fetches public/assets/manifest.json, then loads every file on its own.
// A missing or broken file marks only that key as missing: callers draw a placeholder instead.
// Nothing here ever throws, so the game boots and stays playable with no art at all.

const EMPTY = { tileSize: 32, sprites: {}, tilesets: {}, icons: {}, audio: {} };

function browserFetchJson(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(r.status + ' ' + url);
    return r.json();
  });
}

function browserLoadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('missing ' + url));
    img.src = url;
  });
}

/**
 * `base` is the folder that holds manifest.json. `fetchJson` and `loadImage` are injectable so the
 * tests can run without a browser; both may reject, and a rejection only marks that file missing.
 */
export function createAssets({
  base = 'assets/',
  fetchJson = browserFetchJson,
  loadImage = browserLoadImage,
} = {}) {
  let manifest = EMPTY;
  const images = {}; // "group:key" -> image
  const status = {}; // "group:key" -> 'pending' | 'loaded' | 'missing'
  const listeners = new Set();

  function loadOne(group, key, file) {
    const id = group + ':' + key;
    status[id] = 'pending';
    let p;
    try {
      p = Promise.resolve(loadImage(base + file));
    } catch (e) {
      p = Promise.reject(e);
    }
    return p.then(
      (img) => {
        images[id] = img;
        status[id] = 'loaded';
        for (const fn of listeners) fn(group, key);
      },
      () => {
        status[id] = 'missing'; // normal until the art exists
      },
    );
  }

  function normalize(m) {
    if (!m || typeof m !== 'object') return EMPTY;
    return {
      tileSize: m.tileSize || 32,
      sprites: m.sprites || {},
      tilesets: m.tilesets || {},
      icons: m.icons || {},
      audio: m.audio || {},
    };
  }

  return {
    /** Fetches the manifest and every image in it. Resolves when all have loaded or failed; never rejects. */
    async load() {
      try {
        manifest = normalize(await fetchJson(base + 'manifest.json'));
      } catch {
        manifest = EMPTY;
        return;
      }
      const jobs = [];
      for (const [k, d] of Object.entries(manifest.sprites))
        if (d && d.file) jobs.push(loadOne('sprite', k, d.file));
      for (const [k, d] of Object.entries(manifest.tilesets))
        if (d && d.file) jobs.push(loadOne('tiles', k, d.file));
      for (const [k, f] of Object.entries(manifest.icons))
        if (typeof f === 'string') jobs.push(loadOne('icon', k, f));
      await Promise.all(jobs);
    },
    get manifest() {
      return manifest;
    },
    /** { def, img } for a loaded sprite, or null so the caller draws a placeholder. */
    sprite(key) {
      const img = images['sprite:' + key];
      return img ? { def: manifest.sprites[key], img } : null;
    },
    tileset(key) {
      const img = images['tiles:' + key];
      return img ? { def: manifest.tilesets[key], img } : null;
    },
    /** URL of a loaded sprite's file, for DOM panels (portraits, report banners), or null. */
    spriteUrl(key) {
      return images['sprite:' + key] ? base + manifest.sprites[key].file : null;
    },
    /** URL of a loaded icon, or null. */
    iconUrl(key) {
      return images['icon:' + key] ? base + manifest.icons[key] : null;
    },
    /** URL of an audio file named in the manifest, or null. The audio engine handles missing files. */
    audioUrl(key) {
      const f = manifest.audio[key];
      return typeof f === 'string' ? base + f : null;
    },
    status(group, key) {
      return status[group + ':' + key] || 'unknown';
    },
    /** Calls fn(group, key) each time an image finishes loading. Returns an unsubscribe function. */
    onLoad(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** The game's shared registry. main.js calls assets.load() at boot. */
export const assets = createAssets({ base: (import.meta.env?.BASE_URL ?? './') + 'assets/' });
