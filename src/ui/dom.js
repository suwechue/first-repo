// Small DOM helpers shared by the panels.
import { D } from '../core/content.js';

export const $ = (id) => document.getElementById(id);

export const esc = (str) =>
  String(str).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/** Display name of an inventory item. */
export const label = (k) => D.materials[k]?.label || k;

/** "3 Wood · 2 Stone", each green or red by whether the player has enough. */
export function costString(s, costs) {
  return Object.entries(costs)
    .map(([k, v]) => {
      const have = s.player.inventory[k] >= v;
      return `<span class="${have ? 'met' : 'unmet'}">${v} ${esc(label(k))}</span>`;
    })
    .join(' · ');
}

export function techNames(keys) {
  return keys.map((k) => D.tech[k].name).join(', ');
}
