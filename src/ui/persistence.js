// Browser storage for saves: localStorage autosave and JSON file export and import.
import { D } from '../core/content.js';
import { serialize } from '../core/save.js';
import { loadGame } from '../systems/game.js';

const KEY = D.game.save.key;

export function store(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(serialize(s, Date.now())));
    return true;
  } catch {
    return false;
  }
}

/** Loads the browser save into `s`. Returns true if one was found and applied. */
export function loadStored(s) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const err = loadGame(s, JSON.parse(raw));
    if (err) {
      console.warn('Save not loaded:', err);
      return false;
    }
    return true;
  } catch (e) {
    console.warn('Save not loaded:', e);
    return false;
  }
}

export function clearStored() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
}

export function exportFile(s) {
  const blob = new Blob([JSON.stringify(serialize(s, Date.now()), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'nexus_save_day' + s.day + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Reads a save file into `s`. Calls done(error) with null on success. */
export function importFile(s, file, done) {
  const rd = new FileReader();
  rd.onload = () => {
    let err;
    try {
      err = loadGame(s, JSON.parse(rd.result));
    } catch {
      err = 'Could not read that file.';
    }
    if (!err) store(s);
    done(err);
  };
  rd.onerror = () => done('Could not read that file.');
  rd.readAsText(file);
}
