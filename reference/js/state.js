// ============================================================================
// STATE — the single mutable game-state object, plus small shared utilities.
// Every other module reads/writes through Game.state; nothing else keeps its
// own copy of game data, so there is one source of truth for save/load.
//
// IMPORTANT: other modules cache `const state = Game.state`, so the object
// must never be re-assigned — reset/load mutate it IN PLACE (Game.resetState).
// ============================================================================

window.Game = window.Game || {};

// All randomness goes through Game.rand so tests can inject a seeded RNG.
Game.rand = function(){ return Math.random(); };

Game.makeInitialState = function(){
  const cfg = Game.config;
  const realms = {};
  for(const rk in cfg.REALMS){
    realms[rk] = {};
    for(const zk in cfg.REALMS[rk].zones) realms[rk][zk] = { explored: 0, cleared: 0, bossDown: false };
  }
  return {
    day: 1,
    dayTimer: 0,
    dayLength: 60 * 60,  // frames (~60fps -> 60s per "day")
    kp: 0,               // Knowledge Points
    renown: 0,
    arcane: 0,           // Arcane Knowledge (earned by exploring realms)

    player: {
      x: cfg.CANVAS_W/2, y: cfg.CANVAS_H/2,
      w: 20, h: 20,
      hp: 20, maxHp: 20,
      hunger: 100, maxHunger: 100,
      facing: { x:0, y:1 },
      weaponDmg: 1, // bare hands
      inventory: Object.assign({}, cfg.INVENTORY_DEFAULTS)
    },

    keys: {},
    mode: 'EXPLORE',        // EXPLORE | PLACING
    placingBuilding: null,

    resources: [],
    buildings: [],
    enemies: [],

    // --- Stage 2 ---
    nexus: { dig: 0, awareness: 0, awake: false },
    roster: [],             // living characters
    bonds: {},              // "idA|idB" -> -100..100
    armory: {},             // itemKey -> count (unequipped gear)
    memorial: [],           // the fallen
    fragments: {},          // knowledge fragments, e.g. { gravitational: 17 }
    realms,                 // per-zone exploration progress
    missionLog: [],         // most recent reports (newest first)
    recruitOffer: null,
    nextCharId: 1,
    stats: { missions: 0, deaths: 0 },

    logMessages: [],
    gatherCooldown: 0
  };
};

Game.state = Game.makeInitialState();

// Replace every field of Game.state in place (see note at top of file).
Game.resetState = function(){
  const fresh = Game.makeInitialState();
  for(const k of Object.keys(Game.state)) delete Game.state[k];
  Object.assign(Game.state, fresh);
};

Game.util = {
  dist: function(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); },

  log: function(msg){
    const s = Game.state;
    s.logMessages.unshift(msg);
    if(s.logMessages.length > 6) s.logMessages.pop();
    if(Game.ui && Game.ui.renderLog) Game.ui.renderLog();
  }
};
