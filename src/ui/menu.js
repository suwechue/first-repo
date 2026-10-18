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
    ${settingsHtml(actions.settings?.get())}
    <h4>Progress</h4>
    <p class="small">Day ${s.day} · Expeditions: ${s.stats.missions} · Fallen: ${s.stats.deaths}<br>
    Renown ${s.renown} · Arcane Knowledge ${s.arcane}<br>Knowledge fragments: ${fr}<br>World seed: ${esc(s.seed)}</p>
    <h4>Memorial</h4>${mem}`;
  if (actions.settings) wireSettings(s, actions);
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

function settingsHtml(st) {
  if (!st) return '';
  const slider = (k, label) =>
    `<label class="set-row">${label}<input type="range" min="0" max="100" step="5" id="set-${k}" value="${Math.round(st[k] * 100)}"><span>${Math.round(st[k] * 100)}%</span></label>`;
  const zooms = [1, 2, 3]
    .map((z) => `<button class="craft-btn ${st.zoom === z ? 'active' : ''}" data-zoom="${z}">${z}x</button>`)
    .join('');
  const touch = D.game.settings.touchModes
    .map((m) => `<option value="${m}" ${st.touch === m ? 'selected' : ''}>${m}</option>`)
    .join('');
  return `<h4>Settings</h4>
    <div class="set-row">Zoom ${zooms}</div>
    ${slider('master', 'Volume')}${slider('music', 'Music')}${slider('sfx', 'Effects')}
    <label class="set-row">Touch controls <select id="set-touch">${touch}</select></label>`;
}

/** `actions.settings` is { get(), set(patch) }; set applies and stores the change. */
function wireSettings(s, actions) {
  const S = actions.settings;
  document.querySelectorAll('#sys-body [data-zoom]').forEach((b) =>
    b.addEventListener('click', () => {
      S.set({ zoom: Number(b.getAttribute('data-zoom')) });
      renderSys(s, actions);
    }),
  );
  for (const k of ['master', 'music', 'sfx']) {
    const el = $('set-' + k);
    el.addEventListener('input', () => {
      S.set({ [k]: Number(el.value) / 100 });
      el.nextElementSibling.textContent = el.value + '%';
    });
  }
  $('set-touch').addEventListener('change', (e) => S.set({ touch: e.target.value }));
}
