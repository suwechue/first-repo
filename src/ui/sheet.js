// The character sheet: four tabs (Overview, Growth, Bonds, History) shown in the modal.
import { D } from '../core/content.js';
import { $, esc } from './dom.js';
import * as C from '../systems/characters.js';
import { getBond, bondTier, pairKey } from '../systems/bonds.js';
import { combatPower } from '../systems/missions.js';
import { mostRunObjective } from '../systems/growth.js';
import { assets } from '../render/assets.js';

const TABS = [
  ['overview', 'Overview'],
  ['growth', 'Growth'],
  ['bonds', 'Bonds'],
  ['history', 'History'],
];
const STAT_LABELS = D.tiers.stats.labels;
const G = D.talents.growth;

function bar(frac, label, cls = '') {
  const pct = Math.max(0, Math.min(100, Math.round(frac * 100)));
  return `<div class="sbar ${cls}" title="${esc(label)}"><div style="width:${pct}%"></div><span>${esc(label)}</span></div>`;
}

function objectiveLabel(o) {
  return D.mission.objectives[o]?.label || o;
}

function overview(s, c) {
  const cl = D.classes[c.cls];
  const stats = Object.keys(STAT_LABELS)
    .map((k) => {
      const eff = C.statEff(c, k);
      const extra = eff !== c.stats[k] ? ` <span class="good">(${eff})</span>` : '';
      return `<div class="sstat${cl.primary.includes(k) ? ' primary' : ''}"><b>${STAT_LABELS[k]}</b> ${c.stats[k]}${extra}</div>`;
    })
    .join('');
  const traits = c.traits
    .map((k) => {
      const d = D.traits.traits[k];
      return `<li><span class="chip trait-${d.rarity}">${d.name}</span> ${esc(d.desc)}</li>`;
    })
    .join('');
  const talents = c.talents
    .map((k) => {
      const d = D.talents.talents[k];
      const r = c.talentRanks?.[k] || 1;
      return `<li><span class="chip talent">★ ${d.name} ${'I'.repeat(r)}</span> ${esc(d.desc)}</li>`;
    })
    .join('');
  const cps = Object.keys(D.mission.objectives)
    .map((o) => `${objectiveLabel(o)} ${Math.round(combatPower(c, o))}`)
    .join(' · ');
  const skills = Object.entries(c.skills || {})
    .filter(([, v]) => v > 0)
    .map(([o, v]) => `${objectiveLabel(o)} +${v}`)
    .join(' · ');
  const gear = ['weapon', 'armor']
    .map((sl) => `${sl}: ${c.gear[sl] ? D.items[c.gear[sl]].name : '—'}`)
    .join(' · ');
  const status = [];
  if (C.isInjured(s, c)) status.push(`<span class="bad">Injured until day ${c.injuredUntil}</span>`);
  if (c.grief > 0)
    status.push(`<span class="bad">Grieving (${c.grief} mission${c.grief > 1 ? 's' : ''})</span>`);
  return `
    <div class="sheet-grid">${stats}</div>
    <p class="small"><b>Combat Power</b> ${cps}</p>
    <p class="small"><b>Proficiency</b> ${skills || 'none yet'}</p>
    <p class="small"><b>Gear</b> ${gear}</p>
    <p class="small"><b>Status</b> ${status.join(' · ') || '<span class="good">Ready</span>'} · ${c.missions} expeditions · ${c.kills} kills</p>
    <h4>Traits</h4><ul class="events">${traits || '<li class="muted">None.</li>'}</ul>
    <h4>Talents</h4><ul class="events">${talents || '<li class="muted">None yet. Each level brings a growth roll.</li>'}</ul>`;
}

function rollText(r) {
  const name = D.talents.talents[r.talent]?.name || r.talent;
  if (r.kind === 'new') return `learned ${name}`;
  if (r.kind === 'rank') return `${name} to rank ${r.rank}`;
  return `${name} mastered: +1 ${objectiveLabel(r.objective)} proficiency`;
}

function growth(s, c) {
  const cap = G.levelCap;
  const xpFrac = c.level >= cap ? 1 : c.xp / C.xpToNext(c.level);
  const nextBt = Math.min(cap, Math.ceil((c.level + 1) / G.breakthroughEvery) * G.breakthroughEvery);
  const btFrom = nextBt - G.breakthroughEvery;
  const btFrac = (c.level - btFrom + xpFrac) / G.breakthroughEvery;
  const table = D.talents.tables[c.cls] || {};
  const talentBars = Object.keys(table)
    .map((t) => {
      const r = c.talentRanks?.[t] || (c.talents.includes(t) ? 1 : 0);
      return `<div class="growrow"><span>${D.talents.talents[t].name}</span>${bar(r / G.maxRank, r ? 'rank ' + r + ' of ' + G.maxRank : 'not yet learned', r ? '' : 'dim')}</div>`;
    })
    .join('');
  const prof = Object.keys(D.mission.objectives)
    .map((o) => {
      const v = c.skills?.[o] || 0;
      return `<div class="growrow"><span>${objectiveLabel(o)}</span>${bar(Math.min(1, v / 5), '+' + v + ' (' + v * G.proficiencyCp + ' CP)')}</div>`;
    })
    .join('');
  const ups = (c.ups || [])
    .slice()
    .reverse()
    .map((u) => {
      const gains = Object.entries(u.gains || {})
        .map(([k, v]) => `+${v} ${STAT_LABELS[k]}`)
        .join(' ');
      const rolls = (u.rolls || []).map(rollText).join('; ');
      const bt = u.breakthrough ? `; breakthrough: +1 ${objectiveLabel(u.breakthrough.objective)}` : '';
      return `<li>Level ${u.level}${u.day ? ' (day ' + u.day + ')' : ''}: ${gains}${rolls ? ' · ' + rolls : ''}${bt}</li>`;
    })
    .join('');
  const pity =
    c.pity >= G.pityDryLevels
      ? '<span class="good">The next roll will be something new.</span>'
      : `${c.pity} of ${G.pityDryLevels} levels without a new talent.`;
  return `
    ${bar(xpFrac, `Level ${c.level}${c.level >= cap ? ' (max)' : ` · ${c.xp} / ${C.xpToNext(c.level)} XP`}`)}
    ${c.level >= cap ? '' : bar(btFrac, `Next Breakthrough at level ${nextBt}: +1 ${objectiveLabel(mostRunObjective(c))} proficiency`, 'gold')}
    <p class="small muted">Knowledge Tier, Vectors and Forms arrive with Axiom Magic. ${pity}${c.lean ? ' A life debt leans the next roll toward protective talents.' : ''}</p>
    <h4>Talents</h4>${talentBars}
    <h4>Proficiency</h4>${prof}
    <h4>Recent level-ups</h4><ul class="events">${ups || '<li class="muted">None yet.</li>'}</ul>`;
}

function bonds(s, c) {
  const rows = s.roster
    .filter((o) => o !== c)
    .map((o) => {
      const v = getBond(s, c.id, o.id);
      const t = bondTier(v);
      const m = s.bondMeta[pairKey(c.id, o.id)] || { missions: 0, flags: [] };
      const dots = Math.min(5, Math.ceil(Math.abs(v) / 20));
      const dot = v >= 0 ? '●' : '○';
      const flags = (m.flags || [])
        .map((f) => `<span class="chip">${esc(f.replace('_', ' '))}</span>`)
        .join(' ');
      return `<tr><td>${esc(o.name)}</td><td class="${v >= 0 ? 'good' : 'bad'}">${dot.repeat(dots) || '·'}</td><td>${t.name}</td><td>${v >= 0 ? '+' : ''}${v}</td><td>${m.missions}</td><td>${flags}</td></tr>`;
    })
    .join('');
  return rows
    ? `<table class="bonds"><tr><th>With</th><th></th><th>Tier</th><th>Value</th><th>Missions</th><th>Flags</th></tr>${rows}</table>
       <p class="small muted">Filled dots are positive bonds, hollow dots negative. Bonds grow on shared missions and fade after ten days apart.</p>`
    : '<p class="muted">No one else on the roster.</p>';
}

const HISTORY = {
  joined: (h) => (h.how === 'starter' ? 'One of the first four.' : `Joined the settlement (${h.how}).`),
  first_expedition: (h) => `First expedition, to ${h.zone}.`,
  level: (h) =>
    `Reached level ${h.level}${h.talent ? ', learning ' + (D.talents.talents[h.talent]?.name || h.talent) : ''}.`,
  witnessed_death: (h) => `Saw ${h.name} fall.`,
  life_debt: (h) =>
    h.saved ? `${h.with} pulled them back from death. A life debt.` : `Saved ${h.with} from death.`,
  bond: (h) => `Became ${h.tier} with ${h.with}.`,
  mentor: (h) => `Took ${h.with} as an apprentice.`,
  apprentice: (h) => `Became ${h.with}'s apprentice.`,
  romance: (h) => `Grew close to ${h.with}.`,
};

function history(s, c) {
  const items = (c.history || [])
    .slice()
    .reverse()
    .map(
      (h) =>
        `<li><span class="muted">Day ${h.day}</span> ${esc((HISTORY[h.event] || (() => h.event))(h))}</li>`,
    )
    .join('');
  return `<ul class="events">${items || '<li class="muted">Nothing yet.</li>'}</ul>`;
}

const RENDER = { overview, growth, bonds, history };

/** Opens the sheet for character `id` at `tab`. */
export function openSheet(s, id, tab = 'overview') {
  const c = C.byId(s, id);
  if (!c) return;
  const cl = D.classes[c.cls];
  const portrait = assets.spriteUrl('portrait_' + c.id) || assets.spriteUrl('portrait_' + c.cls);
  const tabs = TABS.map(
    ([k, label]) =>
      `<button class="tab-btn sheet-tab ${k === tab ? 'active' : ''}" data-sheet-tab="${k}">${label}</button>`,
  ).join('');
  $('modal-body').innerHTML = `
    <div class="sheet" data-sheet="${c.id}">
      ${portrait ? `<img class="portrait" src="${esc(portrait)}" alt="">` : ''}
      <h3>${esc(c.name)}</h3>
      <div class="muted small">${cl.name} · Level ${c.level} · ${D.tiers.tiers[c.tier].label}${c.vectors.length ? ' · Vector: ' + c.vectors.join(', ') : ''}</div>
      <div class="sheet-tabs">${tabs}</div>
      <div class="sheet-body" id="sheet-body">${RENDER[tab](s, c)}</div>
    </div>`;
  $('modal').classList.add('open');
  $('modal-body')
    .querySelectorAll('[data-sheet-tab]')
    .forEach((b) => b.addEventListener('click', () => openSheet(s, id, b.getAttribute('data-sheet-tab'))));
}
