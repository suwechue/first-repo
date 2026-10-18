// The Expedition Hall: choose a zone, objective, retreat threshold and squad, then launch.
import { D } from '../core/content.js';
import { emit } from '../core/events.js';
import { $, esc } from './dom.js';
import * as C from '../systems/characters.js';
import * as Ms from '../systems/missions.js';
import { log, changed } from '../systems/log.js';

const M = D.mission;
const firstRealm = Object.keys(D.realms)[0];
const firstZone = (realm) => Object.keys(D.realms[realm].zones)[0];

// The Hall's selection is UI state, not game state, so it is not saved.
const sel = {
  realm: firstRealm,
  zone: firstZone(firstRealm),
  objective: Object.keys(M.objectives)[0],
  retreat: M.defaultRetreat,
  squad: [],
};

export function renderHall(s) {
  const el = $('hall-body');
  if (!s.nexus.awake) {
    el.innerHTML = '<p class="muted">The Nexus sleeps.</p>';
    return;
  }
  const realm = D.realms[sel.realm];
  if (!Ms.zoneUnlocked(s, sel.realm, sel.zone)) sel.zone = firstZone(sel.realm);
  sel.squad = sel.squad.filter((id) => C.byId(s, id) && !C.isInjured(s, C.byId(s, id)));
  const z = realm.zones[sel.zone];
  const obj = M.objectives[sel.objective];

  let html = `<div class="realm-name">${realm.name}</div><div class="muted">${realm.blurb}</div><div class="zones">`;
  for (const zk in realm.zones) {
    const zz = realm.zones[zk];
    const prog = s.realms[sel.realm][zk];
    const open = Ms.zoneUnlocked(s, sel.realm, zk);
    html += `<button class="zone-btn ${zk === sel.zone ? 'active' : ''}" data-zone="${zk}" ${open ? '' : 'disabled'}>
      ${zz.name}<br><small>${open ? prog.explored + '% explored' + (prog.bossDown ? ' · ★' : '') : 'Locked'}</small></button>`;
  }
  html += '</div>';

  html += '<div class="row"><b>Objective</b>';
  for (const ok in M.objectives) {
    html += `<label title="${esc(M.objectives[ok].desc)}"><input type="radio" name="obj" value="${ok}" ${sel.objective === ok ? 'checked' : ''}> ${M.objectives[ok].label}</label>`;
  }
  const quarry = D.enemies[Ms.quarryOf(z)];
  html += `</div><div class="muted small">${obj.desc}${obj.finalFight ? ' Quarry: ' + esc(quarry.short) + ' (threat ' + quarry.etr + ').' : ''}</div>`;

  html +=
    '<div class="row"><b>Retreat at</b> <select id="sel-retreat">' +
    M.retreatOptions
      .map((r) => {
        const note = M.retreatLabels[r] ? ` (${M.retreatLabels[r]})` : '';
        return `<option value="${r}" ${sel.retreat === r ? 'selected' : ''}>${r}% vigor${note}</option>`;
      })
      .join('') +
    '</select></div>';

  const supplies = s.player.inventory[M.supply.item];
  html += `<div class="row"><b>Squad</b> <span class="muted">(${M.squad.min}-${M.squad.max}; ${M.supply.perMember} Supply each — you have ${supplies})</span></div><div class="squad-pick">`;
  for (const c of s.roster) {
    const hurt = C.isInjured(s, c);
    html += `<label class="pick ${hurt ? 'locked' : ''}"><input type="checkbox" data-pick="${c.id}" ${sel.squad.indexOf(c.id) >= 0 ? 'checked' : ''} ${hurt ? 'disabled' : ''}>
      ${esc(c.name)} <small>${D.classes[c.cls].name} L${c.level} · CP ${Math.round(Ms.combatPower(c, sel.objective))}${hurt ? ' · injured' : ''}${c.grief > 0 ? ' · grieving' : ''}</small></label>`;
  }
  html += '</div>';

  const pv = sel.squad.length ? Ms.preview(s, sel.squad, sel.realm, sel.zone, sel.objective) : null;
  if (pv) {
    const pct = (v) => Math.round(v * 100);
    const synParts = pv.syn.parts.map((p) => `${p[0]} ${p[1] >= 0 ? '+' : ''}${pct(p[1])}%`).join(', ');
    html += `<div class="preview">Squad CP <b>${Math.round(pv.cp)}</b> · Synergy <b>${pv.syn.value >= 0 ? '+' : ''}${pct(pv.syn.value)}%</b>
      <span class="muted">(${synParts || 'none'})</span><br>
      Squad Power <b>${Math.round(pv.sp)}</b> · typical encounter odds <b>${pct(pv.pTypical)}%</b>
      ${pv.target ? ` · vs ${esc(pv.target.short)} <b>${pct(pv.pTarget)}%</b>` : ''}</div>`;
  }
  const order = { realm: sel.realm, zone: sel.zone, objective: sel.objective, squad: sel.squad };
  const err = Ms.validate(s, order);
  html += `<div class="row"><button class="craft-btn big" id="btn-launch" ${err ? 'disabled' : ''}>Launch Expedition</button>
    <span class="muted small">${err ? esc(err) : 'Ready.'}</span></div>`;

  html += '<h4>Recent reports</h4>';
  if (!s.missionLog.length) html += '<p class="muted small">No expeditions yet.</p>';
  s.missionLog.forEach((r, i) => {
    html += `<div class="log-row" data-report="${i}">Day ${r.day} · ${esc(D.realms[r.realm].zones[r.zone].name)} · ${M.objectives[r.objective].label} — <b class="out-${r.outcome}">${r.outcome}</b></div>`;
  });
  el.innerHTML = html;

  el.querySelectorAll('[data-zone]').forEach((b) =>
    b.addEventListener('click', () => {
      sel.zone = b.getAttribute('data-zone');
      renderHall(s);
    }),
  );
  el.querySelectorAll('input[name=obj]').forEach((r) =>
    r.addEventListener('change', () => {
      sel.objective = r.value;
      renderHall(s);
    }),
  );
  $('sel-retreat').addEventListener('change', (e) => {
    sel.retreat = parseInt(e.target.value, 10);
  });
  el.querySelectorAll('[data-pick]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-pick');
      if (cb.checked) {
        if (sel.squad.length >= M.squad.max) {
          cb.checked = false;
          return;
        }
        sel.squad.push(id);
      } else sel.squad = sel.squad.filter((x) => x !== id);
      renderHall(s);
    }),
  );
  $('btn-launch').addEventListener('click', () => {
    const res = Ms.launch(s, { ...order, squad: sel.squad.slice(), retreat: sel.retreat });
    if (!res.ok) {
      log(s, res.error);
      renderHall(s);
      return;
    }
    sel.squad = [];
    emit('mission:report', res.report);
    changed('all');
    renderHall(s);
  });
  el.querySelectorAll('[data-report]').forEach((r) =>
    r.addEventListener('click', () =>
      emit('mission:report', s.missionLog[parseInt(r.getAttribute('data-report'), 10)]),
    ),
  );
}
