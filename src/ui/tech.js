// The Knowledge (tech tree) panel.
import { D } from '../core/content.js';
import { $, label, techNames } from './dom.js';
import { isUnlocked, tryUnlockTech } from '../systems/tech.js';

function techCostText(t) {
  const bits = [`${t.cost} Knowledge`];
  if (t.arcane) bits.push(`${t.arcane} Arcane`);
  if (t.extra) {
    bits.push(
      Object.entries(t.extra)
        .map(([k, v]) => `${v} ${label(k)}`)
        .join(', '),
    );
  }
  return bits.join(' · ');
}

export function renderTechPanel(s) {
  const el = $('tech-list');
  el.innerHTML = '';
  for (const key in D.tech) {
    const t = D.tech[key];
    const done = isUnlocked(s, key);
    const row = document.createElement('div');
    row.className = 'tech-node ' + (done ? 'unlocked' : 'locked');
    const prereqText = t.prereq.length ? `Requires: ${techNames(t.prereq)}` : 'No prerequisites';
    const nexusNote = t.needsNexus && !s.nexus.awake ? ' · needs awakened Nexus' : '';
    row.innerHTML = `
      <div>
        <div class="item-name">${t.name} ${done ? '✔' : ''}</div>
        <div class="item-desc">${t.desc}</div>
        <div class="item-cost">${prereqText} · Cost: ${techCostText(t)}${nexusNote}</div>
      </div>
      ${done ? '' : `<button class="craft-btn" data-tech="${key}">Unlock</button>`}`;
    el.appendChild(row);
  }
  el.querySelectorAll('button[data-tech]').forEach((btn) =>
    btn.addEventListener('click', () => tryUnlockTech(s, btn.getAttribute('data-tech'))),
  );
}
