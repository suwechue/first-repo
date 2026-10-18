// ============================================================================
// CHARACTERS — the roster: creation, traits/talents, XP and growth, bonds,
// equipment, recruiting and permadeath. Pure logic (no DOM). Content (classes,
// traits, talents, names, tier budgets) all comes from config.js.
// ============================================================================

window.Game = window.Game || {};

Game.characters = (function(){
  const cfg = Game.config;
  const state = Game.state;
  const R = () => Game.rand();

  // ---------------- helpers ----------------
  function weightedKey(weights){
    let total = 0;
    for(const k in weights) total += Math.max(0, weights[k]);
    if(total <= 0) return null;
    let r = R() * total;
    for(const k in weights){
      r -= Math.max(0, weights[k]);
      if(r < 0) return k;
    }
    return Object.keys(weights)[0];
  }
  function weightsOf(table, field){
    const o = {};
    for(const k in table) o[k] = table[k][field];
    return o;
  }
  function pairKey(a, b){ return a < b ? a + '|' + b : b + '|' + a; }
  function inPairs(pairs, a, b){
    return pairs.some(p => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
  }

  // ---------------- queries ----------------
  function byId(id){ return state.roster.find(c => c.id === id) || null; }
  function isInjured(c){ return (c.injuredUntil || 0) > state.day; }
  function isAvailable(c){ return !isInjured(c); }
  function traitDefs(c){
    return c.traits.map(t => cfg.TRAITS[t]).filter(Boolean)
      .concat(c.talents.map(t => cfg.TALENTS[t]).filter(Boolean));
  }
  // Sum a numeric effect across all of a character's traits and talents.
  function sumEffect(c, key){
    return traitDefs(c).reduce((a, d) => a + (d[key] || 0), 0);
  }
  // Multiply a multiplier effect (default 1) across traits and talents.
  function prodEffect(c, key){
    return traitDefs(c).reduce((a, d) => a * (d[key] !== undefined ? d[key] : 1), 1);
  }
  function hasEffect(c, key){ return traitDefs(c).some(d => d[key]); }
  function statEff(c, stat){
    let v = c.stats[stat];
    if(stat === 'con') v += sumEffect(c, 'conBonus');
    if(stat === 'per') v += sumEffect(c, 'perBonus');
    return v;
  }
  function arcanePower(c){
    const cl = cfg.CLASSES[c.cls];
    let a = (cl.arcaneBase || 0) + sumEffect(c, 'arcane');
    if(cl.arcane) a += Math.floor((c.stats.int + c.stats.wil) / 3);
    return a;
  }
  function xpToNext(level){ return 20 * level; }

  // ---------------- bonds ----------------
  function getBond(a, b){ return state.bonds[pairKey(a, b)] || 0; }
  function setBond(a, b, v){ state.bonds[pairKey(a, b)] = Math.max(-100, Math.min(100, Math.round(v))); }
  function addBond(a, b, d){ setBond(a, b, getBond(a, b) + d); }
  function bondTier(v){
    for(const t of cfg.BOND_TIERS) if(v >= t.min) return t;
    return cfg.BOND_TIERS[cfg.BOND_TIERS.length - 1];
  }
  function seedBond(a, b){
    let v = Math.round(R() * 25 - 10);
    for(const ta of a.traits) for(const tb of b.traits){
      if(inPairs(cfg.TRAIT_CLASH, ta, tb)) v -= 15;
      if(inPairs(cfg.TRAIT_SYNERGY, ta, tb)) v += 10;
    }
    setBond(a.id, b.id, v);
  }

  // ---------------- creation ----------------
  function uniqueName(){
    for(let i = 0; i < 40; i++){
      const f = cfg.FIRST_NAMES[Math.floor(R() * cfg.FIRST_NAMES.length)];
      const s = cfg.SURNAMES[Math.floor(R() * cfg.SURNAMES.length)];
      const n = f + ' ' + s;
      if(!state.roster.some(c => c.name === n) && !state.memorial.some(c => c.name === n)) return n;
    }
    return 'Villager ' + state.nextCharId;
  }

  function rollTraits(n){
    const picked = [];
    let guard = 0;
    while(picked.length < n && guard++ < 60){
      const rarity = weightedKey(cfg.TRAIT_POOL_WEIGHTS);
      const pool = Object.keys(cfg.TRAITS).filter(k => cfg.TRAITS[k].rarity === rarity && picked.indexOf(k) < 0);
      if(!pool.length) continue;
      const t = pool[Math.floor(R() * pool.length)];
      // An unlucky pairing is rerolled, so recruits don't arrive self-contradictory.
      if(picked.some(p => inPairs(cfg.TRAIT_CLASH, p, t))) continue;
      picked.push(t);
    }
    return picked;
  }

  function build(spec){
    const cl = cfg.CLASSES[spec.cls];
    const c = {
      id: 'c' + (state.nextCharId++),
      name: spec.name, cls: spec.cls,
      tier: spec.tier || 'common', bg: spec.bg || null,
      level: 1, xp: 0, pity: 0,
      stats: Object.assign({}, spec.stats),
      traits: spec.traits.slice(), talents: [],
      vectors: [],
      gear: { weapon: null, armor: null },
      injuredUntil: 0, grief: 0,
      missions: 0, kills: 0
    };
    if(cl.arcane){
      c.vectors = [cfg.VECTORS[Math.floor(R() * cfg.VECTORS.length)]];
    }
    return c;
  }

  function generate(opts){
    opts = opts || {};
    const tier = opts.tier || weightedKey(weightsOf(cfg.TIERS, 'weight'));
    const bgKey = weightedKey(weightsOf(cfg.BACKGROUNDS, 'weight'));
    const bg = cfg.BACKGROUNDS[bgKey];
    const clsW = Object.assign({}, bg.classes);
    if(cfg.TECH.elemental_attunement.unlocked) clsW.mage = 15;
    const cls = weightedKey(clsW);
    const cl = cfg.CLASSES[cls];

    const stats = {};
    const keys = Object.keys(cfg.STAT_LABELS);
    keys.forEach(k => stats[k] = cfg.STAT_FLOOR);
    let budget = cfg.TIERS[tier].budget;
    while(budget > 0){
      const w = {};
      keys.forEach(k => {
        if(stats[k] >= 14){ w[k] = 0; return; }
        w[k] = (cl.primary.indexOf(k) >= 0 ? 3 : 1) * ((bg.nudge && bg.nudge[k]) || 1);
      });
      stats[weightedKey(w)]++;
      budget--;
    }
    return build({
      name: uniqueName(), cls, tier, bg: bgKey, stats,
      traits: rollTraits(cfg.TIERS[tier].traits)
    });
  }

  function initStarters(){
    state.roster = [];
    state.bonds = {};
    for(const s of cfg.STARTER_ROSTER){
      state.roster.push(build({ name: s.name, cls: s.cls, stats: s.stats, traits: s.traits, tier: 'common', bg: null }));
    }
    for(let i = 0; i < state.roster.length; i++)
      for(let j = i + 1; j < state.roster.length; j++) seedBond(state.roster[i], state.roster[j]);
  }

  // ---------------- recruiting ----------------
  const ROSTER_CAP = 8;
  function refreshOffer(){
    state.recruitOffer = state.roster.length < ROSTER_CAP ? generate() : null;
  }
  function recruitCost(c){ return cfg.TIERS[c.tier].cost; }
  function recruit(){
    const o = state.recruitOffer;
    if(!o) return { ok:false, msg:'No one is looking for a home right now.' };
    if(state.roster.length >= ROSTER_CAP) return { ok:false, msg:'Your roster is full (' + ROSTER_CAP + ').' };
    const cost = recruitCost(o);
    if(state.player.inventory.food < cost) return { ok:false, msg:'You need ' + cost + ' food to feed a new recruit through the first week.' };
    state.player.inventory.food -= cost;
    state.roster.push(o);
    for(const other of state.roster) if(other !== o) seedBond(o, other);
    state.recruitOffer = null;
    return { ok:true, msg:o.name + ' joins your settlement.', char:o };
  }

  // ---------------- gear ----------------
  function equip(c, slot, itemKey){
    const cur = c.gear[slot];
    if(cur === (itemKey || null)) return;
    if(itemKey){
      if(!(state.armory[itemKey] > 0)) return;
      if(cfg.ITEMS[itemKey].slot !== slot) return;
      state.armory[itemKey]--;
    }
    if(cur) state.armory[cur] = (state.armory[cur] || 0) + 1;
    c.gear[slot] = itemKey || null;
  }
  function gearPower(c){
    let g = 0;
    for(const s in c.gear) if(c.gear[s]) g += cfg.ITEMS[c.gear[s]].gear;
    return g;
  }
  function armorMod(c){
    const a = c.gear.armor;
    return a ? (cfg.ITEMS[a].armorMod || 0) : 0;
  }

  // ---------------- growth ----------------
  function rollTalent(c){
    const table = Object.assign({}, cfg.TALENT_TABLES[c.cls] || {});
    c.talents.forEach(t => delete table[t]);
    if(!Object.keys(table).length) return null;
    return weightedKey(table);
  }

  // Adds XP, applies any level-ups, and returns what happened for the report.
  function addXp(c, amount){
    amount = Math.round(amount * prodEffect(c, 'xpMul'));
    c.xp += amount;
    const ups = [];
    while(c.level < 20 && c.xp >= xpToNext(c.level)){
      c.xp -= xpToNext(c.level);
      c.level++;
      const gains = {};
      const cl = cfg.CLASSES[c.cls];
      for(let i = 0; i < 2; i++){
        const w = {};
        Object.keys(c.stats).forEach(k => { w[k] = c.stats[k] >= 15 ? 0 : (cl.primary.indexOf(k) >= 0 ? 3 : 1); });
        const k = weightedKey(w);
        if(k){ c.stats[k]++; gains[k] = (gains[k] || 0) + 1; }
      }
      let talent = null;
      if(R() < cfg.TALENT_ROLL_CHANCE || c.pity >= cfg.PITY_LEVELS - 1){
        talent = rollTalent(c);
        if(talent){ c.talents.push(talent); c.pity = 0; } else c.pity++;
      } else c.pity++;
      ups.push({ level: c.level, gains, talent });
    }
    if(c.level >= 20) c.xp = 0;
    return { xp: amount, ups };
  }

  // ---------------- permadeath ----------------
  function die(c, cause){
    state.memorial.push({ name: c.name, cls: c.cls, level: c.level, day: state.day, cause: cause || 'fell on an expedition' });
    state.roster = state.roster.filter(x => x !== c);
    for(const k of Object.keys(state.bonds)) if(k.split('|').indexOf(c.id) >= 0) delete state.bonds[k];
    state.stats.deaths++;
    // Anything they carried goes back to the armory.
    for(const s in c.gear) if(c.gear[s]) state.armory[c.gear[s]] = (state.armory[c.gear[s]] || 0) + 1;
  }

  return {
    ROSTER_CAP,
    byId, isInjured, isAvailable, traitDefs, sumEffect, prodEffect, hasEffect,
    statEff, arcanePower, xpToNext,
    getBond, setBond, addBond, bondTier, pairKey, inPairs,
    generate, initStarters, refreshOffer, recruitCost, recruit,
    equip, gearPower, armorMod,
    addXp, die, weightedKey
  };
})();
