// Always-visible HUD: resource bar, Knowledge and day, vitals, message log.
import { D } from '../core/content.js';
import { $, esc, label } from './dom.js';
import { assets } from '../render/assets.js';
import { scholarsPerDay } from '../systems/research.js';

export function updateResourceBar(s) {
  const bar = $('resource-bar');
  bar.innerHTML = '';
  for (const k in s.player.inventory) {
    const v = s.player.inventory[k];
    if (!v && !D.materials[k]?.alwaysShow) continue;
    const chip = document.createElement('div');
    chip.className = 'res-chip';
    chip.title = label(k);
    const url = assets.iconUrl(k);
    const icon = url ? `<img src="${esc(url)}" alt="">` : D.materials[k]?.icon || '';
    chip.innerHTML = `<span class="res-icon">${icon}</span><span class="res-val">${v}</span>`;
    bar.appendChild(chip);
  }
}

export function updateKPLabel(s) {
  let t = `${s.kp} Knowledge`;
  const daily = scholarsPerDay(s);
  if (daily) t += ` (+${daily}/day)`;
  if (s.nexus.awake) t += ` · ${s.arcane} Arcane · ${s.renown} Renown`;
  $('kp-label').textContent = t;
}

export function updateDayLabel(s) {
  $('day-label').textContent = 'Day ' + s.day;
}

export function updateVitals(s) {
  $('hp-fill').style.width = (s.player.hp / s.player.maxHp) * 100 + '%';
  $('hunger-fill').style.width = (s.player.hunger / s.player.maxHunger) * 100 + '%';
  const st = $('stamina-fill');
  if (st) st.style.width = (s.player.stamina / s.player.maxStamina) * 100 + '%';
}

export function renderLog(s) {
  $('status-log').innerHTML = s.logMessages.map((m) => `<div>${esc(m)}</div>`).join('');
}

let bannerTimer = null;
/** A large line of text in the middle of the screen that fades after a few seconds. */
export function showBanner({ title, text }) {
  const el = $('banner');
  el.querySelector('.b-title').textContent = title;
  el.querySelector('.b-text').textContent = text || '';
  el.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

export function updateHallButton(s) {
  $('btn-hall').style.display = s.nexus.awake ? '' : 'none';
}
