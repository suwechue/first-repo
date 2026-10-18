// Always-visible HUD: resource bar, Knowledge and day, vitals, message log.
import { D } from '../core/content.js';
import { $, esc, label } from './dom.js';

export function updateResourceBar(s) {
  const bar = $('resource-bar');
  bar.innerHTML = '';
  for (const k in s.player.inventory) {
    const v = s.player.inventory[k];
    if (!v && !D.materials[k]?.alwaysShow) continue;
    const chip = document.createElement('div');
    chip.className = 'res-chip';
    chip.title = label(k);
    chip.innerHTML = `<span class="res-icon">${D.materials[k]?.icon || ''}</span><span class="res-val">${v}</span>`;
    bar.appendChild(chip);
  }
}

export function updateKPLabel(s) {
  let t = `${s.kp} Knowledge`;
  if (s.nexus.awake) t += ` · ${s.arcane} Arcane · ${s.renown} Renown`;
  $('kp-label').textContent = t;
}

export function updateDayLabel(s) {
  $('day-label').textContent = 'Day ' + s.day;
}

export function updateVitals(s) {
  $('hp-fill').style.width = (s.player.hp / s.player.maxHp) * 100 + '%';
  $('hunger-fill').style.width = (s.player.hunger / s.player.maxHunger) * 100 + '%';
}

export function renderLog(s) {
  $('status-log').innerHTML = s.logMessages.map((m) => `<div>${esc(m)}</div>`).join('');
}

export function updateHallButton(s) {
  $('btn-hall').style.display = s.nexus.awake ? '' : 'none';
}
