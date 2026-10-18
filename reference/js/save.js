// ============================================================================
// SAVE — versioned JSON save/load. Browser autosave (localStorage) plus
// export/import of a .json file. Serializes Game.state and the tech-unlock
// flags (which live in config). Permadeath only means something if the world
// persists, so this is part of the core loop, not an extra.
// ============================================================================

window.Game = window.Game || {};

Game.save = (function(){
  const cfg = Game.config;
  const state = Game.state;

  // Remember the as-shipped tech flags so New Game can restore them.
  const techDefaults = {};
  for(const k in cfg.TECH) techDefaults[k] = !!cfg.TECH[k].unlocked;

  const FIELDS = ['day','dayTimer','kp','renown','arcane','player','resources','buildings','enemies',
    'nexus','roster','bonds','armory','memorial','fragments','realms','missionLog','recruitOffer',
    'nextCharId','stats','logMessages'];

  let lastSaved = null;

  function serialize(){
    const o = { v: cfg.SAVE_VERSION, savedAt: Date.now(), tech: {} };
    for(const f of FIELDS) o[f] = state[f];
    for(const k in cfg.TECH) o.tech[k] = !!cfg.TECH[k].unlocked;
    return JSON.parse(JSON.stringify(o));
  }

  // Returns null on success, or an error string.
  function apply(data){
    if(!data || typeof data !== 'object') return 'Not a save file.';
    if(data.v !== cfg.SAVE_VERSION) return 'Unsupported save version: ' + data.v;
    if(!data.player || !Array.isArray(data.roster)) return 'Save file is incomplete.';
    const fresh = Game.makeInitialState();
    for(const f of FIELDS) state[f] = data[f] !== undefined ? data[f] : fresh[f];
    state.player = Object.assign({}, fresh.player, data.player);
    state.player.inventory = Object.assign({}, fresh.player.inventory, data.player.inventory || {});
    state.nexus = Object.assign({}, fresh.nexus, data.nexus || {});
    state.stats = Object.assign({}, fresh.stats, data.stats || {});
    // merge realm progress so zones added in newer versions still exist
    for(const rk in fresh.realms){
      state.realms[rk] = Object.assign({}, fresh.realms[rk], (data.realms || {})[rk] || {});
    }
    state.keys = {};
    state.mode = 'EXPLORE';
    state.placingBuilding = null;
    state.gatherCooldown = 0;
    for(const k in cfg.TECH){
      cfg.TECH[k].unlocked = data.tech && data.tech[k] !== undefined ? !!data.tech[k] : techDefaults[k];
    }
    return null;
  }

  function store(){
    try {
      const s = JSON.stringify(serialize());
      localStorage.setItem(cfg.SAVE_KEY, s);
      lastSaved = Date.now();
      return true;
    } catch(e){ return false; }
  }

  function hasSave(){
    try { return !!localStorage.getItem(cfg.SAVE_KEY); } catch(e){ return false; }
  }

  // Returns true if a save was found and applied.
  function loadStored(){
    try {
      const raw = localStorage.getItem(cfg.SAVE_KEY);
      if(!raw) return false;
      const err = apply(JSON.parse(raw));
      if(err){ console.warn('Save not loaded:', err); return false; }
      return true;
    } catch(e){ console.warn('Save not loaded:', e); return false; }
  }

  function exportFile(){
    const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'primitive_age_save_day' + state.day + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importFile(file, done){
    const rd = new FileReader();
    rd.onload = () => {
      let err;
      try { err = apply(JSON.parse(rd.result)); } catch(e){ err = 'Could not read that file.'; }
      if(!err) store();
      done(err);
    };
    rd.onerror = () => done('Could not read that file.');
    rd.readAsText(file);
  }

  function clearStored(){ try { localStorage.removeItem(cfg.SAVE_KEY); } catch(e){} }

  // Fresh world, starter roster. Caller refreshes the UI.
  function newGame(){
    Game.resetState();
    for(const k in cfg.TECH) cfg.TECH[k].unlocked = techDefaults[k];
    Game.world.scatterResources();
    Game.characters.initStarters();
  }

  return { serialize, apply, store, hasSave, loadStored, exportFile, importFile, clearStored, newGame,
           lastSaved: () => lastSaved };
})();
