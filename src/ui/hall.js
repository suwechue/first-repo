// The Expedition Hall: choose a zone, objective, retreat threshold and squad, then launch.
import { D } from '../core/content.js';
import { emit } from '../core/events.js';
import { $, esc } from './dom.js';
import * as C from '../systems/characters.js';
import * as Ms from '../systems/missions.js';
import { saveSquad, deleteSquad, squadMembers } from '../systems/squads.js';
import { getBond } from '../systems/bonds.js';
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
  note: '', // a message about the squad picker, such as a refused pick
};

/** A character at Blood Feud with someone already in the squad, or null. */
function feudWith(s, id) {
  for (const other of sel.squad) if (getBond(s, id, other) <= M.bloodFeud) return C.byId(s, other);
  return null;
}

export function renderHall(s) {
  const el = $('hall-body');
  if (!s.nexus.awake) {
    el.innerHTML = '<p class="muted">The Nexus sleeps.</p>';
    return;
  }
  const realm = D.realms[sel.realm];
  if (!Ms.zoneUnlocked(s, sel.realm, sel.zone)) sel.zone = firstZone(sel.realm);
  sel.squad = sel.squad.filter((id) => C.byId(s, id) && !C.isInjured(s, C.byId(s, id)) && !Ms.awayOn(s, id));
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
    const away = Ms.awayOn(s, c.id);
    const feud = sel.squad.includes(c.id) ? null : feudWith(s, c.id);
    const off = hurt || !!feud || !!away;
    html += `<label class="pick ${off ? 'locked' : ''}" title="${feud ? esc('Blood Feud with ' + feud.name) : ''}"><input type="checkbox" data-pick="${c.id}" ${sel.squad.indexOf(c.id) >= 0 ? 'checked' : ''} ${off ? 'disabled' : ''}>
      ${esc(c.name)} <small>${D.classes[c.cls].name} L${c.level} · CP ${Math.round(Ms.combatPower(c, sel.objective))}${hurt ? ' · injured' : ''}${away ? ' · away' : ''}${c.grief > 0 ? ' · grieving' : ''}${feud ? ' · Blood Feud with ' + esc(feud.name.split(' ')[0]) : ''}</small></label>`;
  }
  html += '</div>';
  if (sel.note) html += `<div class="bad small">${esc(sel.note)}</div>`;

  // Saved squads.
  html += '<div class="row saved-squads"><b>Saved squads</b>';
  for (const q of s.squads) {
    html += `<span class="chip"><a href="#" data-load-squad="${esc(q.name)}">${esc(q.name)}</a> <a href="#" data-del-squad="${esc(q.name)}" title="Forget this squad">×</a></span>`;
  }
  html += `<input id="squad-name" placeholder="Name this squad" maxlength="30" size="14"><button class="craft-btn" id="btn-save-squad" ${sel.squad.length ? '' : 'disabled'}>Save</button></div>`;

  // Chemistry preview: every pair's bond before launch.
  if (sel.squad.length > 1) {
    const ch = Ms.chemistry(s, sel.squad);
    html += '<div class="chemistry small"><b>Chemistry</b> ';
    html += ch.pairs
      .map(
        (p) =>
          `<span class="${p.value >= 0 ? 'good' : 'bad'}${p.feud ? ' feud' : ''}">${esc(p.a.name.split(' ')[0])} & ${esc(p.b.name.split(' ')[0])}: ${p.tier.name} (${p.value >= 0 ? '+' : ''}${p.value})</span>`,
      )
      .join(' · ');
    html += ` · team chemistry <b>${ch.value >= 0 ? '+' : ''}${Math.round(ch.value * 100)}%</b></div>`;
  }

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
  const hours = Math.round(Ms.missionFrames(sel.realm, sel.zone) / M.timing.framesPerHour);
  const full = s.expeditions.length >= M.timing.maxOut;
  html += `<div class="row"><button class="craft-btn big" id="btn-launch" ${err || full ? 'disabled' : ''}>Launch Expedition</button>
    <span class="muted small">${err ? esc(err) : full ? `${M.timing.maxOut} squads are already out.` : `Ready. The trip takes about ${hours} hours.`}</span></div>`;

  // Squads out, and reports of those who have come back.
  html += '<h4>Out in the field</h4>';
  if (!s.expeditions.length) html += '<p class="muted small">No squads are out.</p>';
  for (const e of s.expeditions) {
    const left = Math.max(0, Math.ceil((e.returns - s.frame) / M.timing.framesPerHour));
    const names = e.order.squad.map((id) => C.byId(s, id)?.name.split(' ')[0] || '?').join(', ');
    html += `<div class="log-row out-row">${esc(D.realms[e.order.realm].zones[e.order.zone].name)} · ${M.objectives[e.order.objective].label} · ${esc(names)} — back in about <b>${left} h</b></div>`;
  }
  if (s.reportQueue.length) {
    html += `<div class="row"><button class="craft-btn" id="btn-read-report">Read report (${s.reportQueue.length} waiting)</button></div>`;
  }

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
      sel.note = '';
      if (cb.checked) {
        const feud = feudWith(s, id);
        if (feud) {
          cb.checked = false;
          sel.note = `${C.byId(s, id).name} and ${feud.name} are in a Blood Feud and will not deploy together.`;
        } else if (sel.squad.length >= M.squad.max) cb.checked = false;
        else sel.squad.push(id);
      } else sel.squad = sel.squad.filter((x) => x !== id);
      renderHall(s);
    }),
  );
  el.querySelectorAll('[data-load-squad]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const ids = squadMembers(s, a.getAttribute('data-load-squad')).filter(
        (id) => !C.isInjured(s, C.byId(s, id)),
      );
      sel.squad = ids.slice(0, M.squad.max);
      sel.note =
        ids.length < squadMembers(s, a.getAttribute('data-load-squad')).length
          ? 'Some of that squad are injured.'
          : '';
      renderHall(s);
    }),
  );
  el.querySelectorAll('[data-del-squad]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      deleteSquad(s, a.getAttribute('data-del-squad'));
      renderHall(s);
    }),
  );
  $('btn-save-squad').addEventListener('click', () => {
    const err = saveSquad(s, $('squad-name').value, sel.squad);
    sel.note = err || '';
    renderHall(s);
  });
  $('btn-launch').addEventListener('click', () => {
    const res = Ms.dispatch(s, { ...order, squad: sel.squad.slice(), retreat: sel.retreat });
    if (!res.ok) {
      log(s, res.error);
      renderHall(s);
      return;
    }
    sel.squad = [];
    const h = Math.round((res.expedition.returns - s.frame) / M.timing.framesPerHour);
    log(
      s,
      `The squad sets out for ${D.realms[order.realm].zones[order.zone].name}. Back in about ${h} hours.`,
    );
    changed('all');
    renderHall(s);
  });
  const read = $('btn-read-report');
  if (read) {
    read.addEventListener('click', () => {
      const rep = Ms.nextReport(s);
      if (rep) emit('mission:report', rep);
      renderHall(s);
    });
  }
  el.querySelectorAll('[data-report]').forEach((r) =>
    r.addEventListener('click', () =>
      emit('mission:report', s.missionLog[parseInt(r.getAttribute('data-report'), 10)]),
    ),
  );
}
