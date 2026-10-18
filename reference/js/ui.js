// ============================================================================
// UI — all DOM manipulation (resource bar, panels, roster, Expedition Hall,
// reports, system menu). No canvas drawing lives here; that's render.js.
// ============================================================================

window.Game = window.Game || {};

Game.ui = (function(){
  const cfg = Game.config;
  const state = Game.state;
  const C = Game.characters;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
  const label = k => cfg.RES_LABEL[k] || k;

  // --------------------------------------------------------------------
  // Resource bar — icon PNGs if present, else emoji
  // --------------------------------------------------------------------
  function iconMarkup(key){
    if(Game.assets.ready(key)) return `<span class="res-icon"><img src="${cfg.ICON_MANIFEST[key]}" alt="${key}"></span>`;
    return `<span class="res-icon">${cfg.RES_ICON_FALLBACK[key] || ''}</span>`;
  }
  function updateResourceBar(){
    const bar = $('resource-bar');
    bar.innerHTML = '';
    for(const k in state.player.inventory){
      const v = state.player.inventory[k];
      if(!v && cfg.CORE_RES.indexOf(k) < 0) continue;
      const chip = document.createElement('div');
      chip.className = 'res-chip';
      chip.title = label(k);
      chip.innerHTML = `${iconMarkup(k)}<span class="res-val">${v}</span>`;
      bar.appendChild(chip);
    }
  }
  function updateKPLabel(){
    let t = `${state.kp} Knowledge`;
    if(state.nexus.awake) t += ` · ${state.arcane} Arcane · ${state.renown} Renown`;
    $('kp-label').textContent = t;
  }
  function updateDayLabel(){ $('day-label').textContent = 'Day ' + state.day; }
  function updateVitals(){
    $('hp-fill').style.width = (state.player.hp / state.player.maxHp * 100) + '%';
    $('hunger-fill').style.width = (state.player.hunger / state.player.maxHunger * 100) + '%';
  }
  function renderLog(){
    $('status-log').innerHTML = state.logMessages.map(m => `<div>${esc(m)}</div>`).join('');
  }

  // --------------------------------------------------------------------
  // Tech / Craft / Build panels
  // --------------------------------------------------------------------
  function techCostText(t){
    const bits = [`${t.cost} Knowledge`];
    if(t.arcane) bits.push(`${t.arcane} Arcane`);
    if(t.extra) bits.push(Object.entries(t.extra).map(([k, v]) => `${v} ${label(k)}`).join(', '));
    return bits.join(' · ');
  }
  function renderTechPanel(){
    const el = $('tech-list');
    el.innerHTML = '';
    for(const key in cfg.TECH){
      const t = cfg.TECH[key];
      const row = document.createElement('div');
      row.className = 'tech-node ' + (t.unlocked ? 'unlocked' : 'locked');
      const prereqText = t.prereq.length ? `Requires: ${t.prereq.map(p => cfg.TECH[p].name).join(', ')}` : 'No prerequisites';
      const nexusNote = t.needsNexus && !state.nexus.awake ? ' · needs awakened Nexus' : '';
      row.innerHTML = `
        <div>
          <div class="item-name">${t.name} ${t.unlocked ? '✔' : ''}</div>
          <div class="item-desc">${t.desc}</div>
          <div class="item-cost">${prereqText} · Cost: ${techCostText(t)}${nexusNote}</div>
        </div>
        ${t.unlocked ? '' : `<button class="craft-btn" data-tech="${key}">Unlock</button>`}`;
      el.appendChild(row);
    }
    el.querySelectorAll('button[data-tech]').forEach(btn =>
      btn.addEventListener('click', () => Game.world.tryUnlockTech(btn.getAttribute('data-tech'))));
  }
  function costString(costs){
    return Object.entries(costs).map(([k, v]) => {
      const have = state.player.inventory[k] >= v;
      return `<span class="${have ? 'met' : 'unmet'}">${v} ${esc(label(k))}</span>`;
    }).join(' · ');
  }
  function renderCraftPanel(){
    const el = $('craft-list');
    el.innerHTML = '';
    for(const key in cfg.RECIPES){
      const r = cfg.RECIPES[key];
      const unlocked = Game.world.reqsMet(r.requires);
      const row = document.createElement('div');
      row.className = 'item-row' + (unlocked ? '' : ' locked');
      row.innerHTML = `
        <div>
          <div class="item-name">${r.name}</div>
          <div class="item-desc">${r.desc}</div>
          <div class="item-cost">${unlocked ? costString(r.costs) : 'Locked — requires ' + r.requires.map(x => cfg.TECH[x].name).join(', ')}</div>
        </div>
        <button class="craft-btn" data-recipe="${key}" ${unlocked && Game.world.canAfford(r.costs) ? '' : 'disabled'}>Craft</button>`;
      el.appendChild(row);
    }
    el.querySelectorAll('button[data-recipe]').forEach(btn =>
      btn.addEventListener('click', () => Game.world.tryCraft(btn.getAttribute('data-recipe'))));
  }
  function renderBuildPanel(){
    const el = $('build-list');
    el.innerHTML = '';
    for(const key in cfg.BUILDINGS){
      const b = cfg.BUILDINGS[key];
      const unlocked = Game.world.reqsMet(b.requires);
      const row = document.createElement('div');
      row.className = 'item-row' + (unlocked ? '' : ' locked');
      row.innerHTML = `
        <div>
          <div class="item-name">${b.name}</div>
          <div class="item-desc">${b.desc}</div>
          <div class="item-cost">${unlocked ? costString(b.costs) : 'Locked — requires ' + b.requires.map(x => cfg.TECH[x].name).join(', ')}</div>
        </div>
        <button class="craft-btn" data-build="${key}" ${unlocked && Game.world.canAfford(b.costs) ? '' : 'disabled'}>Place</button>`;
      el.appendChild(row);
    }
    el.querySelectorAll('button[data-build]').forEach(btn =>
      btn.addEventListener('click', () => Game.world.enterPlacing(btn.getAttribute('data-build'))));
  }

  // --------------------------------------------------------------------
  // ROSTER
  // --------------------------------------------------------------------
  function traitChips(c){
    const t = c.traits.map(k => `<span class="chip trait-${cfg.TRAITS[k].rarity}" title="${esc(cfg.TRAITS[k].desc)}">${cfg.TRAITS[k].name}</span>`);
    const ta = c.talents.map(k => `<span class="chip talent" title="${esc(cfg.TALENTS[k].desc)}">★ ${cfg.TALENTS[k].name}</span>`);
    return t.concat(ta).join('');
  }
  function statusText(c){
    const bits = [];
    if(C.isInjured(c)) bits.push(`<span class="bad">Injured until day ${c.injuredUntil}</span>`);
    if(c.grief > 0) bits.push(`<span class="bad">Grieving (${c.grief} mission${c.grief > 1 ? 's' : ''})</span>`);
    return bits.length ? bits.join(' · ') : '<span class="good">Ready</span>';
  }
  function gearSelect(c, slot){
    const cur = c.gear[slot];
    const opts = [`<option value="">— none —</option>`];
    if(cur) opts.push(`<option value="${cur}" selected>${cfg.ITEMS[cur].name}</option>`);
    for(const k in state.armory){
      if(state.armory[k] > 0 && cfg.ITEMS[k].slot === slot) opts.push(`<option value="${k}">${cfg.ITEMS[k].name} (×${state.armory[k]})</option>`);
    }
    return `<label>${slot}: <select data-equip="${c.id}" data-slot="${slot}">${opts.join('')}</select></label>`;
  }
  function renderRoster(){
    const el = $('roster-list');
    let html = '';
    for(const c of state.roster){
      const cl = cfg.CLASSES[c.cls];
      const stats = Object.keys(cfg.STAT_LABELS).map(k =>
        `<span class="stat${cl.primary.indexOf(k) >= 0 ? ' primary' : ''}">${cfg.STAT_LABELS[k]} ${c.stats[k]}</span>`).join('');
      const pct = c.level >= 20 ? 100 : Math.round(c.xp / C.xpToNext(c.level) * 100);
      const bonds = state.roster.filter(o => o !== c).map(o => {
        const v = C.getBond(c.id, o.id);
        return `${esc(o.name.split(' ')[0])}: ${C.bondTier(v).name} (${v >= 0 ? '+' : ''}${v})`;
      }).join(' · ');
      const vec = c.vectors.length ? ` · Vector: ${c.vectors.join(', ')}` : '';
      html += `
      <div class="char-card ${C.isInjured(c) ? 'hurt' : ''}">
        <div class="char-head"><b>${esc(c.name)}</b> <span class="muted">${cl.name} · Lv ${c.level} · ${cfg.TIERS[c.tier].label}${vec}</span>
          <span class="status">${statusText(c)}</span></div>
        <div class="xpbar"><div style="width:${pct}%"></div></div>
        <div class="stats">${stats}<span class="stat cpval" title="Combat Power (explore)">CP ${Math.round(Game.missions.combatPower(c, 'explore'))}</span></div>
        <div class="chips">${traitChips(c)}</div>
        <div class="gear">${gearSelect(c, 'weapon')} ${gearSelect(c, 'armor')}</div>
        <div class="bondline">${bonds || 'No bonds yet.'}</div>
      </div>`;
    }
    if(!state.roster.length) html = '<p class="muted">Your roster is empty.</p>';

    // recruiting
    let rec = '';
    if(state.nexus.awake){
      const o = state.recruitOffer;
      if(o){
        const cl = cfg.CLASSES[o.cls];
        const st = Object.keys(cfg.STAT_LABELS).map(k => `${cfg.STAT_LABELS[k]} ${o.stats[k]}`).join(' ');
        rec = `<div class="char-card offer"><div class="char-head"><b>${esc(o.name)}</b> <span class="muted">${cl.name} · ${cfg.TIERS[o.tier].label}</span></div>
          <div class="stats muted">${st}</div><div class="chips">${traitChips(o)}</div>
          <button class="craft-btn" id="btn-recruit">Recruit (${C.recruitCost(o)} food)</button></div>`;
      } else if(state.roster.length >= C.ROSTER_CAP){
        rec = `<p class="muted">Roster full (${C.ROSTER_CAP}).</p>`;
      } else rec = '<p class="muted">No one new today. Check back tomorrow.</p>';
      html += `<h4>Newcomers</h4>` + rec;
    }
    el.innerHTML = html;
    el.querySelectorAll('select[data-equip]').forEach(sel => sel.addEventListener('change', () => {
      C.equip(C.byId(sel.getAttribute('data-equip')), sel.getAttribute('data-slot'), sel.value);
      renderRoster();
    }));
    const rb = $('btn-recruit');
    if(rb) rb.addEventListener('click', () => {
      const r = C.recruit();
      Game.util.log(r.msg);
      renderRoster(); updateResourceBar();
    });
  }
  function renderRosterIfOpen(){ if($('panel-roster').classList.contains('open')) renderRoster(); }

  // --------------------------------------------------------------------
  // EXPEDITION HALL
  // --------------------------------------------------------------------
  const sel = { realm: 'verdant_wilds', zone: 'fringe', objective: 'explore', retreat: 35, squad: [] };

  function renderHall(){
    const el = $('hall-body');
    if(!state.nexus.awake){ el.innerHTML = '<p class="muted">The Nexus sleeps.</p>'; return; }
    const M = Game.missions;
    const realm = cfg.REALMS[sel.realm];
    if(!M.zoneUnlocked(sel.realm, sel.zone)) sel.zone = 'fringe';
    sel.squad = sel.squad.filter(id => C.byId(id) && !C.isInjured(C.byId(id)));
    const z = realm.zones[sel.zone];

    let html = `<div class="realm-name">${realm.name}</div><div class="muted">${realm.blurb}</div><div class="zones">`;
    for(const zk in realm.zones){
      const zz = realm.zones[zk], prog = state.realms[sel.realm][zk];
      const open = M.zoneUnlocked(sel.realm, zk);
      html += `<button class="zone-btn ${zk === sel.zone ? 'active' : ''}" data-zone="${zk}" ${open ? '' : 'disabled'}>
        ${zz.name}<br><small>${open ? prog.explored + '% explored' + (prog.bossDown ? ' · ★' : '') : 'Locked'}</small></button>`;
    }
    html += '</div>';

    html += '<div class="row"><b>Objective</b>';
    for(const ok in M.OBJECTIVES){
      html += `<label title="${esc(M.OBJECTIVES[ok].desc)}"><input type="radio" name="obj" value="${ok}" ${sel.objective === ok ? 'checked' : ''}> ${M.OBJECTIVES[ok].label}</label>`;
    }
    html += `</div><div class="muted small">${M.OBJECTIVES[sel.objective].desc}${sel.objective === 'hunt' ? ' Quarry: ' + esc(cfg.ENEMIES[z.hunt[0]].short) + ' (threat ' + cfg.ENEMIES[z.hunt[0]].etr + ').' : ''}</div>`;

    html += '<div class="row"><b>Retreat at</b> <select id="sel-retreat">' +
      cfg.MISSION.RETREAT_OPTIONS.map(r => `<option value="${r}" ${sel.retreat === r ? 'selected' : ''}>${r}% vigor${r === 25 ? ' (bold)' : r === 70 ? ' (cautious)' : ''}</option>`).join('') +
      '</select></div>';

    html += `<div class="row"><b>Squad</b> <span class="muted">(${cfg.MISSION.MIN_SQUAD}-${cfg.MISSION.MAX_SQUAD}; 1 Supply each — you have ${state.player.inventory.supplies})</span></div><div class="squad-pick">`;
    for(const c of state.roster){
      const hurt = C.isInjured(c);
      html += `<label class="pick ${hurt ? 'locked' : ''}"><input type="checkbox" data-pick="${c.id}" ${sel.squad.indexOf(c.id) >= 0 ? 'checked' : ''} ${hurt ? 'disabled' : ''}>
        ${esc(c.name)} <small>${cfg.CLASSES[c.cls].name} L${c.level} · CP ${Math.round(M.combatPower(c, sel.objective))}${hurt ? ' · injured' : ''}${c.grief > 0 ? ' · grieving' : ''}</small></label>`;
    }
    html += '</div>';

    const pv = sel.squad.length ? M.preview(sel.squad, sel.realm, sel.zone, sel.objective) : null;
    if(pv){
      const synParts = pv.syn.parts.map(p => `${p[0]} ${p[1] >= 0 ? '+' : ''}${Math.round(p[1] * 100)}%`).join(', ');
      html += `<div class="preview">Squad CP <b>${Math.round(pv.cp)}</b> · Synergy <b>${pv.syn.value >= 0 ? '+' : ''}${Math.round(pv.syn.value * 100)}%</b>
        <span class="muted">(${synParts || 'none'})</span><br>
        Squad Power <b>${Math.round(pv.sp)}</b> · typical encounter odds <b>${Math.round(pv.pTypical * 100)}%</b>
        ${pv.target ? ` · vs ${esc(pv.target.short)} <b>${Math.round(pv.pTarget * 100)}%</b>` : ''}</div>`;
    }
    const err = M.validate({ realm: sel.realm, zone: sel.zone, objective: sel.objective, squad: sel.squad });
    html += `<div class="row"><button class="craft-btn big" id="btn-launch" ${err ? 'disabled' : ''}>Launch Expedition</button>
      <span class="muted small">${err ? esc(err) : 'Ready.'}</span></div>`;

    html += '<h4>Recent reports</h4>';
    if(!state.missionLog.length) html += '<p class="muted small">No expeditions yet.</p>';
    state.missionLog.forEach((r, i) => {
      html += `<div class="log-row" data-report="${i}">Day ${r.day} · ${esc(cfg.REALMS[r.realm].zones[r.zone].name)} · ${cfg.MISSION && M.OBJECTIVES[r.objective].label} — <b class="out-${r.outcome}">${r.outcome}</b></div>`;
    });
    el.innerHTML = html;

    el.querySelectorAll('[data-zone]').forEach(b => b.addEventListener('click', () => { sel.zone = b.getAttribute('data-zone'); renderHall(); }));
    el.querySelectorAll('input[name=obj]').forEach(r => r.addEventListener('change', () => { sel.objective = r.value; renderHall(); }));
    $('sel-retreat').addEventListener('change', e => { sel.retreat = parseInt(e.target.value, 10); });
    el.querySelectorAll('[data-pick]').forEach(cb => cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-pick');
      if(cb.checked){
        if(sel.squad.length >= cfg.MISSION.MAX_SQUAD){ cb.checked = false; return; }
        sel.squad.push(id);
      } else sel.squad = sel.squad.filter(x => x !== id);
      renderHall();
    }));
    $('btn-launch').addEventListener('click', () => {
      const res = M.launch({ realm: sel.realm, zone: sel.zone, objective: sel.objective, squad: sel.squad.slice(), retreat: sel.retreat });
      if(!res.ok){ Game.util.log(res.error); renderHall(); return; }
      sel.squad = [];
      Game.save.store();
      refreshAll();
      showReport(res.report);
      renderHall();
    });
    el.querySelectorAll('[data-report]').forEach(r => r.addEventListener('click', () => showReport(state.missionLog[parseInt(r.getAttribute('data-report'), 10)])));
  }

  function showReport(r){
    const zn = cfg.REALMS[r.realm].zones[r.zone].name;
    const fmt = o => Object.entries(o).map(([k, v]) => `${v} ${esc(label(k))}`).join(', ') || 'nothing';
    let h = `<h3>${esc(zn)} — ${Game.missions.OBJECTIVES[r.objective].label}</h3>
      <div class="out-banner out-${r.outcome}">${r.outcome === 'success' ? 'Expedition succeeded' : r.outcome === 'retreat' ? 'The squad retreated' : 'The squad was lost'}</div>
      <div class="muted small">Squad: ${r.squad.map(esc).join(', ')} · ${r.stepsDone}/${r.steps} steps · vigor ${r.vigorEnd}% · synergy ${r.synergy >= 0 ? '+' : ''}${Math.round(r.synergy * 100)}% · retreat at ${r.retreat}%</div>
      <h4>Account</h4><ul class="events">${r.events.map(e => `<li>${esc(e)}</li>`).join('')}</ul>
      <h4>Spoils</h4><p>${fmt(r.gains)}${r.renown ? ` · +${r.renown} Renown` : ''}${r.arcane ? ` · +${r.arcane} Arcane Knowledge` : ''}${r.explored ? ` · zone +${r.explored}% explored` : ''}</p>`;
    for(const k in r.fragments) h += `<p class="fragment">Knowledge fragment recovered: <b>${esc(k)}</b> +${r.fragments[k]}%</p>`;
    if(r.injured.length) h += `<p class="bad">Wounded: ${r.injured.map(esc).join(', ')}</p>`;
    if(r.dead.length) h += `<p class="bad">Fallen: ${r.dead.map(d => esc(d.name) + ' (' + cfg.CLASSES[d.cls].name + ', Lv ' + d.level + ')').join(', ')}. They will not return.</p>`;
    if(r.levelups.length){
      h += '<h4>Growth</h4><ul class="events">' + r.levelups.map(u => {
        const g = Object.entries(u.gains).map(([k, v]) => `${cfg.STAT_LABELS[k]} +${v}`).join(' ');
        return `<li><b>${esc(u.name)}</b> reached level ${u.level} (${g})${u.talent ? ` — learned <b>${cfg.TALENTS[u.talent].name}</b>: ${esc(cfg.TALENTS[u.talent].desc)}` : ''}</li>`;
      }).join('') + '</ul>';
    }
    $('modal-body').innerHTML = h;
    $('modal').classList.add('open');
  }
  function closeModal(){ $('modal').classList.remove('open'); }

  // --------------------------------------------------------------------
  // SYSTEM MENU
  // --------------------------------------------------------------------
  let confirmNew = false;
  function renderSys(){
    const el = $('sys-body');
    const fr = Object.entries(state.fragments).map(([k, v]) => `${esc(k)}: ${v}%`).join(' · ') || 'none yet';
    const mem = state.memorial.length
      ? '<ul class="events">' + state.memorial.map(m => `<li>${esc(m.name)}, ${cfg.CLASSES[m.cls].name} Lv ${m.level} — day ${m.day}, ${esc(m.cause)}</li>`).join('') + '</ul>'
      : '<p class="muted small">No one has fallen. Yet.</p>';
    el.innerHTML = `
      <div class="row">
        <button class="craft-btn" id="sys-save">Save now</button>
        <button class="craft-btn" id="sys-export">Export file</button>
        <button class="craft-btn" id="sys-import">Import file</button>
        <button class="craft-btn danger" id="sys-new">${confirmNew ? 'Click again to erase everything' : 'New game'}</button>
        <input type="file" id="sys-file" accept="application/json,.json" style="display:none">
      </div>
      <div class="muted small" id="sys-msg">Autosaves every few seconds in this browser.</div>
      <h4>Progress</h4>
      <p class="small">Day ${state.day} · Expeditions: ${state.stats.missions} · Fallen: ${state.stats.deaths}<br>
      Renown ${state.renown} · Arcane Knowledge ${state.arcane}<br>Knowledge fragments: ${fr}</p>
      <h4>Memorial</h4>${mem}`;
    $('sys-save').onclick = () => { $('sys-msg').textContent = Game.save.store() ? 'Saved.' : 'Browser storage unavailable — use Export.'; };
    $('sys-export').onclick = () => Game.save.exportFile();
    $('sys-import').onclick = () => $('sys-file').click();
    $('sys-file').onchange = e => {
      const f = e.target.files[0]; if(!f) return;
      Game.save.importFile(f, err => {
        if(err) $('sys-msg').textContent = 'Import failed: ' + err;
        else { refreshAll(); renderSys(); Game.util.log('Save imported.'); }
      });
    };
    $('sys-new').onclick = () => {
      if(!confirmNew){ confirmNew = true; renderSys(); return; }
      confirmNew = false;
      Game.save.clearStored();
      Game.save.newGame();
      refreshAll(); closeAllPanels();
      Game.util.log('A new world begins.');
    };
  }

  // --------------------------------------------------------------------
  // Panel management
  // --------------------------------------------------------------------
  const PANELS = ['craft', 'build', 'tech', 'roster', 'hall', 'sys'];
  const RENDER = { craft: renderCraftPanel, build: renderBuildPanel, tech: renderTechPanel,
                   roster: renderRoster, hall: renderHall, sys: renderSys };
  function closeAllPanels(){
    PANELS.forEach(k => { $('panel-' + k).classList.remove('open'); $('btn-' + k).classList.remove('active'); });
    confirmNew = false;
  }
  function openPanel(key){
    closeAllPanels();
    RENDER[key]();
    $('panel-' + key).classList.add('open');
    $('btn-' + key).classList.add('active');
  }
  function togglePanel(key){
    if($('panel-' + key).classList.contains('open')) closeAllPanels(); else openPanel(key);
  }
  function updateHallButton(){
    $('btn-hall').style.display = state.nexus.awake ? '' : 'none';
  }
  // Re-render everything that depends on loaded/changed state.
  function refreshAll(){
    updateResourceBar(); updateKPLabel(); updateDayLabel(); updateVitals(); renderLog();
    renderTechPanel(); renderCraftPanel(); renderBuildPanel(); updateHallButton();
    PANELS.forEach(k => { if($('panel-' + k).classList.contains('open')) RENDER[k](); });
  }

  function initAll(){
    PANELS.forEach(k => $('btn-' + k).addEventListener('click', () => togglePanel(k)));
    $('modal-close').addEventListener('click', closeModal);
    refreshAll();
  }

  return {
    updateResourceBar, updateKPLabel, updateDayLabel, updateVitals, renderLog,
    renderTechPanel, renderCraftPanel, renderBuildPanel, renderRosterIfOpen,
    closeAllPanels, togglePanel, openPanel, refreshAll, initAll, showReport, closeModal
  };
})();
