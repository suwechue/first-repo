// Panel management and the glue between system events and the DOM.
import { on } from '../core/events.js';
import { D } from '../core/content.js';
import { $ } from './dom.js';
import * as hud from './hud.js';
import { renderCraftPanel } from './craft.js';
import { renderBuildPanel } from './build.js';
import { renderTechPanel } from './tech.js';
import { renderRoster } from './roster.js';
import { renderHall } from './hall.js';
import { renderSys, resetMenuConfirm } from './menu.js';
import { showReport, closeModal } from './report.js';
import { store } from './persistence.js';

const PANELS = ['craft', 'build', 'tech', 'roster', 'hall', 'sys'];

export function createUI(s, actions) {
  const RENDER = {
    craft: () => renderCraftPanel(s),
    build: () => renderBuildPanel(s),
    tech: () => renderTechPanel(s),
    roster: () => renderRoster(s),
    hall: () => renderHall(s),
    sys: () => renderSys(s, actions),
  };
  const isOpen = (k) => $('panel-' + k).classList.contains('open');

  function closeAllPanels() {
    PANELS.forEach((k) => {
      $('panel-' + k).classList.remove('open');
      $('btn-' + k).classList.remove('active');
    });
    resetMenuConfirm();
  }
  function openPanel(key) {
    closeAllPanels();
    RENDER[key]();
    $('panel-' + key).classList.add('open');
    $('btn-' + key).classList.add('active');
  }
  function togglePanel(key) {
    if (isOpen(key)) closeAllPanels();
    else openPanel(key);
  }
  function renderOpen(keys) {
    keys.forEach((k) => isOpen(k) && RENDER[k]());
  }
  function refreshAll() {
    hud.updateResourceBar(s);
    hud.updateKPLabel(s);
    hud.updateDayLabel(s);
    hud.updateVitals(s);
    hud.renderLog(s);
    hud.updateHallButton(s);
    renderOpen(PANELS);
  }

  // Each change topic refreshes only what depends on it.
  const ON_CHANGE = {
    inventory: () => {
      hud.updateResourceBar(s);
      renderOpen(['craft', 'build', 'hall']);
    },
    vitals: () => hud.updateVitals(s),
    kp: () => {
      hud.updateKPLabel(s);
      renderOpen(['tech', 'craft', 'build']);
    },
    tech: () => {
      hud.updateKPLabel(s);
      renderOpen(['tech', 'craft', 'build']);
    },
    day: () => hud.updateDayLabel(s),
    roster: () => renderOpen(['roster', 'hall']),
    craft: () => renderOpen(['craft']),
    nexus: () => {},
    placing: () => closeAllPanels(),
    all: refreshAll,
  };

  on('log', () => hud.renderLog(s));
  on('banner', hud.showBanner);
  on('changed', (topic) => (ON_CHANGE[topic] || refreshAll)());
  on('panel:open', openPanel);
  on('mission:report', (r) => {
    store(s);
    showReport(r);
  });
  // A squad came home: its report waits in the Hall's queue.
  on('mission:return', (r) => {
    store(s);
    hud.showBanner({
      title: 'A squad returns',
      text: `${D.realms[r.realm].zones[r.zone].name}: ${r.outcome}${r.dead.length ? ' · ' + r.dead.length + ' fallen' : ''} · the report waits in the Hall`,
    });
    refreshAll();
  });

  PANELS.forEach((k) => $('btn-' + k).addEventListener('click', () => togglePanel(k)));
  $('modal-close').addEventListener('click', closeModal);
  refreshAll();

  return { refreshAll, closeAllPanels, closeModal, isOpen };
}
