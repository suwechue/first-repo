// The Roster panel: character cards, gear, bonds, and the day's recruit.
import { D } from '../core/content.js';
import { $, esc } from './dom.js';
import * as C from '../systems/characters.js';
import { getBond, bondTier } from '../systems/bonds.js';
import { recruit, recruitCost, rosterCap, dismiss, arrivalChance } from '../systems/recruiting.js';
import { combatPower, awayOn } from '../systems/missions.js';
import { assets } from '../render/assets.js';
import { openSheet } from './sheet.js';
import { log, changed } from '../systems/log.js';

const STAT_LABELS = D.tiers.stats.labels;
const PREVIEW_OBJECTIVE = Object.keys(D.mission.objectives)[0]; // the CP shown on each card

export function traitChips(c) {
  const t = c.traits.map((k) => {
    const d = D.traits.traits[k];
    return `<span class="chip trait-${d.rarity}" title="${esc(d.desc)}">${d.name}</span>`;
  });
  const ta = c.talents.map((k) => {
    const d = D.talents.talents[k];
    return `<span class="chip talent" title="${esc(d.desc)}">★ ${d.name}</span>`;
  });
  return t.concat(ta).join('');
}

function statusText(s, c) {
  const bits = [];
  if (C.isInjured(s, c)) bits.push(`<span class="bad">Injured until day ${c.injuredUntil}</span>`);
  if (awayOn(s, c.id)) bits.push('<span class="muted">Away on an expedition</span>');
  if (c.grief > 0)
    bits.push(`<span class="bad">Grieving (${c.grief} mission${c.grief > 1 ? 's' : ''})</span>`);
  return bits.length ? bits.join(' · ') : '<span class="good">Ready</span>';
}

function gearSelect(s, c, slot) {
  const cur = c.gear[slot];
  const opts = [`<option value="">— none —</option>`];
  if (cur) opts.push(`<option value="${cur}" selected>${D.items[cur].name}</option>`);
  for (const k in s.armory) {
    if (s.armory[k] > 0 && D.items[k].slot === slot) {
      opts.push(`<option value="${k}">${D.items[k].name} (×${s.armory[k]})</option>`);
    }
  }
  return `<label>${slot}: <select data-equip="${c.id}" data-slot="${slot}">${opts.join('')}</select></label>`;
}

export function renderRoster(s) {
  const el = $('roster-list');
  let html = '';
  for (const c of s.roster) {
    const cl = D.classes[c.cls];
    const stats = Object.keys(STAT_LABELS)
      .map(
        (k) =>
          `<span class="stat${cl.primary.indexOf(k) >= 0 ? ' primary' : ''}">${STAT_LABELS[k]} ${c.stats[k]}</span>`,
      )
      .join('');
    const pct = c.level >= D.talents.growth.levelCap ? 100 : Math.round((c.xp / C.xpToNext(c.level)) * 100);
    const bonds = s.roster
      .filter((o) => o !== c)
      .map((o) => {
        const v = getBond(s, c.id, o.id);
        return `${esc(o.name.split(' ')[0])}: ${bondTier(v).name} (${v >= 0 ? '+' : ''}${v})`;
      })
      .join(' · ');
    const vec = c.vectors.length ? ` · Vector: ${c.vectors.join(', ')}` : '';
    const portrait = assets.spriteUrl('portrait_' + c.id) || assets.spriteUrl('portrait_' + c.cls);
    html += `
      <div class="char-card ${C.isInjured(s, c) ? 'hurt' : ''}">
        ${portrait ? `<img class="portrait" src="${esc(portrait)}" alt="">` : ''}
        <div class="char-head"><b>${esc(c.name)}</b> <span class="muted">${cl.name} · Lv ${c.level} · ${D.tiers.tiers[c.tier].label}${vec}</span>
          <span class="status">${statusText(s, c)}</span></div>
        <div class="xpbar"><div style="width:${pct}%"></div></div>
        <div class="stats">${stats}<span class="stat cpval" title="Combat Power (${PREVIEW_OBJECTIVE})">CP ${Math.round(combatPower(c, PREVIEW_OBJECTIVE))}</span></div>
        <div class="chips">${traitChips(c)}</div>
        <div class="gear">${gearSelect(s, c, 'weapon')} ${gearSelect(s, c, 'armor')}</div>
        <div class="bondline">${bonds || 'No bonds yet.'}</div>
        <button class="craft-btn" data-sheet-open="${c.id}">Character sheet</button>
      </div>`;
  }
  if (!s.roster.length) html = '<p class="muted">Your roster is empty.</p>';

  if (s.nexus.awake) {
    const o = s.recruitOffer;
    let rec;
    if (o) {
      const cl = D.classes[o.cls];
      const st = Object.keys(STAT_LABELS)
        .map((k) => `${STAT_LABELS[k]} ${o.stats[k]}`)
        .join(' ');
      const skills = Object.entries(cl.skill || {})
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${D.mission.objectives[k].label} +${v}`)
        .join(' · ');
      const origin = D.tiers.origins[o.origin]?.name || '';
      const cost = recruitCost(o);
      rec = `<div class="char-card offer recruit-card tier-${o.tier}">
        <div class="char-head"><span class="tier-badge">${D.tiers.tiers[o.tier].label}</span> <b>${esc(o.name)}</b>
          <span class="muted">${cl.name}${origin ? ' · ' + esc(origin) : ''}${o.bg ? ' · ' + esc(D.backgrounds[o.bg].name) : ''}</span></div>
        ${o.flavor ? `<div class="flavor">“${esc(o.flavor)}”</div>` : ''}
        <div class="stats muted">${st}</div><div class="chips">${traitChips(o)}</div>
        ${skills ? `<div class="small muted">Skills: ${skills}</div>` : ''}
        <div class="row"><button class="craft-btn" id="btn-recruit" ${s.renown >= cost ? '' : 'disabled'}>Recruit (${cost} Renown)</button>
          <button class="craft-btn" id="btn-dismiss">Dismiss</button>
          <span class="small muted">You have ${s.renown} Renown.</span></div></div>`;
    } else if (s.roster.length >= rosterCap()) {
      rec = `<p class="muted">Roster full (${rosterCap()}).</p>`;
    } else {
      rec = `<p class="muted">No one is waiting at the Hall. At each dawn someone may arrive (${Math.round(arrivalChance(s) * 100)}% with your Renown).</p>`;
    }
    html += `<h4>Newcomers</h4>` + rec;
  }
  el.innerHTML = html;
  el.querySelectorAll('select[data-equip]').forEach((sel) =>
    sel.addEventListener('change', () => {
      C.equip(s, C.byId(s, sel.getAttribute('data-equip')), sel.getAttribute('data-slot'), sel.value);
      renderRoster(s);
    }),
  );
  el.querySelectorAll('[data-sheet-open]').forEach((b) =>
    b.addEventListener('click', () => openSheet(s, b.getAttribute('data-sheet-open'))),
  );
  const rb = $('btn-recruit');
  if (rb) {
    rb.addEventListener('click', () => {
      const r = recruit(s);
      log(s, r.msg);
      changed('kp');
      renderRoster(s);
    });
  }
  const db = $('btn-dismiss');
  if (db) {
    db.addEventListener('click', () => {
      log(s, dismiss(s).msg);
      renderRoster(s);
    });
  }
}
