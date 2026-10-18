// The expedition report modal.
import { D } from '../core/content.js';
import { $, esc, label } from './dom.js';
import { assets } from '../render/assets.js';

export function showReport(r) {
  const zone = D.realms[r.realm].zones[r.zone];
  const zn = zone.name;
  const art = assets.spriteUrl(zone.banner);
  const fmt = (o) =>
    Object.entries(o)
      .map(([k, v]) => `${v} ${esc(label(k))}`)
      .join(', ') || 'nothing';
  const banner =
    r.outcome === 'success'
      ? 'Expedition succeeded'
      : r.outcome === 'retreat'
        ? 'The squad retreated'
        : 'The squad was lost';
  let h = `${art ? `<img class="realm-banner" src="${esc(art)}" alt="">` : ''}<h3>${esc(zn)} — ${D.mission.objectives[r.objective].label}</h3>
    <div class="out-banner out-${r.outcome}">${banner}</div>
    <div class="muted small">Squad: ${r.squad.map(esc).join(', ')} · ${r.stepsDone}/${r.steps} steps · vigor ${r.vigorEnd}% · synergy ${r.synergy >= 0 ? '+' : ''}${Math.round(r.synergy * 100)}% · retreat at ${r.retreat}%</div>
    <h4>Account</h4><ul class="events">${r.events.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
    <h4>Spoils</h4><p>${fmt(r.gains)}${r.renown ? ` · +${r.renown} Renown` : ''}${r.arcane ? ` · +${r.arcane} Arcane Knowledge` : ''}${r.explored ? ` · zone +${r.explored}% explored` : ''}</p>`;
  for (const k in r.fragments) {
    h += `<p class="fragment">Knowledge fragment recovered: <b>${esc(k)}</b> +${r.fragments[k]}%</p>`;
  }
  if (r.injured.length) h += `<p class="bad">Wounded: ${r.injured.map(esc).join(', ')}</p>`;
  if (r.dead.length) {
    h += `<p class="bad">Fallen: ${r.dead.map((d) => esc(d.name) + ' (' + D.classes[d.cls].name + ', Lv ' + d.level + ')').join(', ')}. They will not return.</p>`;
  }
  if (r.levelups.length) {
    const labels = D.tiers.stats.labels;
    h +=
      '<h4>Growth</h4><ul class="events">' +
      r.levelups
        .map((u) => {
          const g = Object.entries(u.gains)
            .map(([k, v]) => `${labels[k]} +${v}`)
            .join(' ');
          const t = u.talent ? D.talents.talents[u.talent] : null;
          return `<li><b>${esc(u.name)}</b> reached level ${u.level} (${g})${t ? ` — learned <b>${t.name}</b>: ${esc(t.desc)}` : ''}</li>`;
        })
        .join('') +
      '</ul>';
  }
  $('modal-body').innerHTML = h;
  $('modal').classList.add('open');
}

export function closeModal() {
  $('modal').classList.remove('open');
}
