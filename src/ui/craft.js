// The Craft panel.
import { D } from '../core/content.js';
import { $, costString, techNames } from './dom.js';
import { reqsMet } from '../systems/tech.js';
import { canAfford } from '../systems/inventory.js';
import { tryCraft } from '../systems/crafting.js';

export function renderCraftPanel(s) {
  const el = $('craft-list');
  el.innerHTML = '';
  for (const key in D.recipes) {
    const r = D.recipes[key];
    const unlocked = reqsMet(s, r.requires);
    const row = document.createElement('div');
    row.className = 'item-row' + (unlocked ? '' : ' locked');
    row.innerHTML = `
      <div>
        <div class="item-name">${r.name}</div>
        <div class="item-desc">${r.desc}</div>
        <div class="item-cost">${unlocked ? costString(s, r.costs) : 'Locked — requires ' + techNames(r.requires)}</div>
      </div>
      <button class="craft-btn" data-recipe="${key}" ${unlocked && canAfford(s, r.costs) ? '' : 'disabled'}>Craft</button>`;
    el.appendChild(row);
  }
  el.querySelectorAll('button[data-recipe]').forEach((btn) =>
    btn.addEventListener('click', () => tryCraft(s, btn.getAttribute('data-recipe'))),
  );
}
