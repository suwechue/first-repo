// The Settlement & Save menu: save, export, import, new game, progress and the memorial.
import { D } from '../core/content.js';
import { $, esc } from './dom.js';
import { store, exportFile, importFile, clearStored } from './persistence.js';

let confirmNew = false;

export function resetMenuConfirm() {
  confirmNew = false;
}

/** `actions.newGame()` starts a fresh world; `actions.loaded()` refreshes after an import. */
export function renderSys(s, actions) {
  const el = $('sys-body');
  const fr =
    Object.entries(s.fragments)
      .map(([k, v]) => `${esc(k)}: ${v}%`)
      .join(' · ') || 'none yet';
  const mem = s.memorial.length
    ? '<ul class="events">' +
      s.memorial
        .map(
          (m) =>
            `<li>${esc(m.name)}, ${D.classes[m.cls].name} Lv ${m.level} — day ${m.day}, ${esc(m.cause)}</li>`,
        )
        .join('') +
      '</ul>'
    : '<p class="muted small">No one has fallen. Yet.</p>';
  el.innerHTML = `
    <div class="row">
      <button class="craft-btn" id="sys-save">Save now</button>
      <button class="craft-btn" id="sys-export">Export file</button>
      <button class="craft-btn" id="sys-import">Import file</button>
      <button class="craft-btn danger" id="sys-new">${confirmNew ? 'Click again to erase everything' : 'New game'}</button>
      <input type="file" id="sys-file" accept="application/json,.json" style="display:none">
    </div>
    <div class="muted small" id="sys-msg">Autosaves every few seconds in this browser.</div>
    <h4>Progress</h4>
    <p class="small">Day ${s.day} · Expeditions: ${s.stats.missions} · Fallen: ${s.stats.deaths}<br>
    Renown ${s.renown} · Arcane Knowledge ${s.arcane}<br>Knowledge fragments: ${fr}<br>World seed: ${esc(s.seed)}</p>
    <h4>Memorial</h4>${mem}`;
  $('sys-save').onclick = () => {
    $('sys-msg').textContent = store(s) ? 'Saved.' : 'Browser storage unavailable — use Export.';
  };
  $('sys-export').onclick = () => exportFile(s);
  $('sys-import').onclick = () => $('sys-file').click();
  $('sys-file').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    importFile(s, f, (err) => {
      if (err) $('sys-msg').textContent = 'Import failed: ' + err;
      else actions.loaded();
    });
  };
  $('sys-new').onclick = () => {
    if (!confirmNew) {
      confirmNew = true;
      renderSys(s, actions);
      return;
    }
    confirmNew = false;
    clearStored();
    actions.newGame();
  };
}
