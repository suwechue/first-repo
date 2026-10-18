// Player settings: zoom, volumes and touch controls. Stored in the browser apart from the save,
// so they carry over to a new game and are never part of GameState.
import { D } from '../core/content.js';

const KEY = 'nexus_settings';

/** Settings with every field present and in range. */
export function normalizeSettings(raw) {
  const S = D.game.settings;
  const out = { ...S.defaults };
  if (raw && typeof raw === 'object') {
    const C = D.world.camera;
    if (Number.isFinite(raw.zoom)) out.zoom = Math.max(C.minZoom, Math.min(C.maxZoom, Math.round(raw.zoom)));
    for (const k of ['master', 'music', 'sfx']) {
      if (Number.isFinite(raw[k])) out[k] = Math.max(0, Math.min(1, raw[k]));
    }
    if (S.touchModes.includes(raw.touch)) out.touch = raw.touch;
  }
  return out;
}

export function loadSettings(storage = globalThis.localStorage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(KEY) || 'null'));
  } catch {
    return normalizeSettings(null);
  }
}

export function saveSettings(settings, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
