// The Build panel.
import { D } from '../core/content.js';
import { $, costString, techNames } from './dom.js';
import { reqsMet } from '../systems/tech.js';
import { canAfford } from '../systems/inventory.js';
import { enterPlacing } from '../systems/building.js';

export function renderBuildPanel(s) {
  const el = $('build-list');
  el.innerHTML = '';
  for (const key in D.buildings) {
    const b = D.buildings[key];
    const unlocked = reqsMet(s, b.requires);
    const row = document.createElement('div');
    row.className = 'item-row' + (unlocked ? '' : ' locked');
    row.innerHTML = `
      <div>
        <div class="item-name">${b.name}</div>
        <div class="item-desc">${b.desc}</div>
        <div class="item-cost">${unlocked ? costString(s, b.costs) : 'Locked — requires ' + techNames(b.requires)}</div>
      </div>
      <button class="craft-btn" data-build="${key}" ${unlocked && canAfford(s, b.costs) ? '' : 'disabled'}>Place</button>`;
    el.appendChild(row);
  }
  el.querySelectorAll('button[data-build]').forEach((btn) =>
    btn.addEventListener('click', () => enterPlacing(s, btn.getAttribute('data-build'))),
  );
}
