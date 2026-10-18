// ============================================================================
// MISSIONS — autonomous expedition resolution (master design doc, section 8).
//
//   CP  = 4*Level + 1.5*(two primary stats) + Gear + Skill + Arcane
//   SP  = (sum of squad CP) * (1 + Synergy)
//   P_win = SP / (SP + ETR)
//   Closeness = 1 - 2|P_win - 0.5|
//   P_injury = Closeness * 0.35 * (1 - ConMod) * (1 - ArmorMod)
//   P_death  = 0.2 * P_injury   (given an injury; x1.5 on a lost fight,
//                                x0.6 with a support character alive)
//
// A mission is a series of steps through one zone. Each step is quiet travel
// or an encounter. "Vigor" drains as the squad fights; when it falls to the
// chosen retreat threshold the squad turns back with what it has.
// Pure logic: no DOM. Returns a report object the UI displays.
// ============================================================================

window.Game = window.Game || {};

Game.missions = (function(){
  const cfg = Game.config;
  const state = Game.state;
  const C = Game.characters;
  const M = cfg.MISSION;
  const R = () => Game.rand();

  const OBJ_KEY = { explore:'exploreCp', hunt:'huntCp', gather:'gatherCp' };
  const OBJECTIVES = {
    explore: { label:'Explore', desc:'Map the zone. Opens the next zone and earns Arcane Knowledge.' },
    gather:  { label:'Gather',  desc:'Haul back the zone\'s native resources.' },
    hunt:    { label:'Hunt',    desc:'Track the zone\'s prize quarry. The final step is a fight with it.' }
  };
  const EXPLORE_FULL = 40, EXPLORE_OTHER = 10;

  // ---------------- Combat Power ----------------
  function combatPower(c, objective){
    const cl = cfg.CLASSES[c.cls];
    const sum = C.statEff(c, cl.primary[0]) + C.statEff(c, cl.primary[1]);
    const gear = C.gearPower(c);
    const skill = (cl.skill[objective] || 0) + C.sumEffect(c, 'cp') + C.sumEffect(c, OBJ_KEY[objective]);
    const arcane = C.arcanePower(c);
    let cp = 4 * c.level + 1.5 * sum + gear + skill + arcane;
    if(c.grief > 0) cp *= M.GRIEF_CP_MUL;
    return cp;
  }

  // ---------------- Synergy ----------------
  function synergy(squad){
    const parts = [];
    let v = 0;
    const n = squad.length;
    // bonds: every pair contributes its tier modifier; divided by (n-1) so a
    // full squad is not 6x stronger than a pair for the same relationships
    let bondSum = 0;
    for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){
      bondSum += C.bondTier(C.getBond(squad[i].id, squad[j].id)).mod;
    }
    const bondPart = n > 1 ? bondSum / (n - 1) : 0;
    if(bondPart) parts.push(['Bonds', bondPart]);
    v += bondPart;
    let tr = 0;
    for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++){
      for(const ta of squad[i].traits) for(const tb of squad[j].traits){
        if(C.inPairs(cfg.TRAIT_CLASH, ta, tb)) tr -= 0.03;
        if(C.inPairs(cfg.TRAIT_SYNERGY, ta, tb)) tr += 0.03;
      }
    }
    if(tr){ parts.push(['Trait clashes/synergies', tr]); v += tr; }
    const hasFront = squad.some(c => cfg.CLASSES[c.cls].role === 'front');
    const hasSupport = squad.some(c => cfg.CLASSES[c.cls].role === 'support');
    if(hasFront){ parts.push(['Front-liner', 0.03]); v += 0.03; }
    if(hasSupport){ parts.push(['Support', 0.03]); v += 0.03; }
    if(squad.some(c => C.sumEffect(c, 'synergy') > 0)){ parts.push(['Natural Leader', 0.03]); v += 0.03; }
    v = Math.max(-0.4, Math.min(0.6, v));
    return { value: v, parts };
  }

  // ---------------- helpers ----------------
  function zoneDef(realm, zone){ return cfg.REALMS[realm].zones[zone]; }
  function zoneUnlocked(realm, zone){
    const z = zoneDef(realm, zone);
    if(!z.unlock) return true;
    return state.realms[realm][z.unlock.zone].explored >= z.unlock.explored;
  }
  function pickEnemy(z){
    const w = {};
    z.enemies.forEach(e => w[e.id] = e.w);
    return C.weightedKey(w);
  }
  function matchupBonus(c, enemy){
    let b = 0;
    for(const v of c.vectors){
      if(enemy.weakTo.indexOf(v) >= 0) b += 4;
      if(enemy.resists.indexOf(v) >= 0) b -= 3;
    }
    return b;
  }
  function squadPower(members, objective, enemy, hurt){
    const syn = synergy(members);
    let sum = 0;
    for(const c of members){
      let cp = combatPower(c, objective);
      if(enemy) cp += matchupBonus(c, enemy);
      if(hurt && hurt.has(c.id)) cp *= 0.8;
      sum += Math.max(1, cp);
    }
    return { cp: sum, syn, sp: sum * (1 + syn.value) };
  }

  // Pre-launch estimate shown in the Expedition Hall.
  function preview(ids, realm, zone, objective){
    const members = ids.map(C.byId).filter(Boolean);
    if(!members.length) return null;
    const z = zoneDef(realm, zone);
    const pw = squadPower(members, objective, null);
    let etr = 0, tw = 0;
    z.enemies.forEach(e => { etr += cfg.ENEMIES[e.id].etr * e.w; tw += e.w; });
    etr /= tw;
    const target = objective === 'hunt' ? cfg.ENEMIES[z.hunt[0]] : null;
    return {
      members, cp: pw.cp, syn: pw.syn, sp: pw.sp,
      typicalEtr: etr, pTypical: pw.sp / (pw.sp + etr),
      target, pTarget: target ? pw.sp / (pw.sp + target.etr) : null
    };
  }

  function validate(o){
    if(!state.nexus.awake) return 'The Nexus is not awake.';
    if(!cfg.REALMS[o.realm] || !zoneDef(o.realm, o.zone)) return 'Unknown destination.';
    if(!zoneUnlocked(o.realm, o.zone)) return 'That zone has not been opened yet.';
    if(!OBJECTIVES[o.objective]) return 'Unknown objective.';
    const ids = o.squad || [];
    if(new Set(ids).size !== ids.length) return 'Duplicate squad member.';
    if(ids.length < M.MIN_SQUAD || ids.length > M.MAX_SQUAD) return 'A squad needs ' + M.MIN_SQUAD + '-' + M.MAX_SQUAD + ' members.';
    for(const id of ids){
      const c = C.byId(id);
      if(!c) return 'Unknown squad member.';
      if(C.isInjured(c)) return c.name + ' is recovering from an injury.';
    }
    if(state.player.inventory.supplies < ids.length) return 'You need ' + ids.length + ' Expedition Supplies.';
    return null;
  }

  // ---------------- one fight ----------------
  function fight(members, hurt, enemyKey, objective, z, events, rep){
    const enemy = cfg.ENEMIES[enemyKey];
    const pw = squadPower(members, objective, enemy, hurt);
    const pWin = pw.sp / (pw.sp + enemy.etr);
    const won = R() < pWin;
    const closeness = Math.max(0.1, 1 - 2 * Math.abs(pWin - 0.5));
    const supportAlive = members.some(c => cfg.CLASSES[c.cls].role === 'support');
    const medic = members.reduce((a, c) => a * C.prodEffect(c, 'squadDeathMul'), 1);

    events.push((won ? 'Victory against ' : 'Defeated by ') + enemy.name + ' (' + Math.round(pWin * 100) + '% odds).');
    const dead = [];
    for(const c of members.slice()){
      const conMod = Math.min(0.3, Math.max(0, (C.statEff(c, 'con') - 5) * 0.03));
      let pInj = closeness * M.INJURY_BASE * (1 - conMod) * (1 - C.armorMod(c)) * C.prodEffect(c, 'injuryMul');
      if(!won) pInj *= M.LOSS_INJURY_MUL;
      pInj = Math.min(0.9, pInj);
      if(R() >= pInj) continue;
      let pDeath = M.DEATH_BASE * z.deathScale * C.prodEffect(c, 'deathMul') * medic;
      if(!won) pDeath *= M.LOSS_DEATH_MUL;
      if(supportAlive) pDeath *= M.SUPPORT_DEATH_MUL;
      if(hurt.has(c.id)) pDeath *= 2;   // a second wound is far more dangerous
      if(R() < Math.min(0.9, pDeath)){
        dead.push(c);
        events.push(c.name + ' was killed.');
      } else {
        hurt.add(c.id);
        events.push(c.name + ' was wounded.');
      }
    }
    return { won, pWin, enemy, dead };
  }

  function stochRound(x){ const f = Math.floor(x); return f + (R() < x - f ? 1 : 0); }

  // ---------------- the mission ----------------
  function launch(o){
    const err = validate(o);
    if(err) return { ok:false, error: err };

    const z = zoneDef(o.realm, o.zone);
    const zs = state.realms[o.realm][o.zone];
    const squad = o.squad.map(C.byId);
    const inv = state.player.inventory;
    inv.supplies -= squad.length;

    const retreat = o.retreat || 35;
    const encMul = squad.reduce((a, c) => a * C.prodEffect(c, 'encounterMul'), 1);
    const yieldMul = squad.reduce((a, c) => a + C.sumEffect(c, 'yieldMul'), 0);

    const rep = {
      day: state.day, realm: o.realm, zone: o.zone, objective: o.objective, retreat,
      squad: squad.map(c => c.name), events: [], gains: {}, levelups: [],
      injured: [], dead: [], outcome: 'success', stepsDone: 0, steps: z.steps,
      explored: 0, renown: 0, arcane: 0, fragments: {}, kills: [], xp: {}
    };
    function gain(k, n){ if(n > 0){ rep.gains[k] = (rep.gains[k] || 0) + n; inv[k] = (inv[k] || 0) + n; } }

    let live = squad.slice();
    const hurt = new Set();
    const deadAll = [];
    let vigor = 100, xpPool = 0, bossKilled = false;
    const startSyn = synergy(squad);

    for(let step = 1; step <= z.steps; step++){
      const finalHunt = o.objective === 'hunt' && step === z.steps;
      let enemyKey = null;
      if(finalHunt) enemyKey = z.hunt[0];
      else if(R() < z.encounterChance * encMul) enemyKey = pickEnemy(z);

      let lost = false;
      if(enemyKey){
        const f = fight(live, hurt, enemyKey, o.objective, z, rep.events, rep);
        for(const c of f.dead){ live = live.filter(x => x !== c); deadAll.push(c); }
        if(f.won){
          vigor -= 8;
          xpPool += f.enemy.xp;
          rep.kills.push(f.enemy.short);
          for(const dk in f.enemy.drops){
            const d = f.enemy.drops[dk];
            if(R() < d[1]) gain(dk, d[0]);
          }
          if(finalHunt && f.enemy.boss) bossKilled = true;
          if(finalHunt) zs.cleared++;
        } else {
          vigor -= 25; lost = true;
        }
      } else {
        vigor -= 3;
        rep.events.push('Step ' + step + ': a quiet stretch of ' + z.name + '.');
      }

      if(live.length === 0){ rep.outcome = 'wipe'; rep.events.push('No one is left standing. The squad is lost.'); break; }
      rep.stepsDone = step;

      // resources found along the way
      const share = o.objective === 'gather' ? 1 : 0.3;
      for(const r of z.resources){
        gain(r.id, stochRound(r.base * (0.6 + R() * 0.8) * share * (1 + yieldMul)));
      }

      if(finalHunt && lost){
        rep.outcome = 'retreat';
        rep.events.push('The squad could not bring down its quarry and fell back.');
        break;
      }
      if(step < z.steps && vigor <= retreat){
        rep.outcome = 'retreat';
        rep.events.push('Vigor fell to ' + Math.max(0, Math.round(vigor)) + '% — the squad turned back at your ' + retreat + '% threshold.');
        break;
      }
    }
    rep.vigorEnd = Math.max(0, Math.round(vigor));
    if(rep.outcome === 'success' && o.objective === 'hunt' && !rep.kills.length) rep.outcome = 'retreat';

    // ----- exploration / arcane / renown -----
    const frac = rep.stepsDone / z.steps;
    if(rep.outcome !== 'wipe'){
      const delta = Math.round((o.objective === 'explore' ? EXPLORE_FULL : EXPLORE_OTHER) * frac);
      const before = zs.explored;
      zs.explored = Math.min(100, zs.explored + delta);
      rep.explored = zs.explored - before;
      if(o.objective === 'explore'){
        rep.arcane = Math.round(z.exploreArcane * frac);
        if(rep.outcome === 'success') rep.arcane = Math.max(1, rep.arcane);
        state.arcane += rep.arcane;
      }
      const rmul = live.reduce((a, c) => a * C.prodEffect(c, 'renownMul'), 1);
      rep.renown = Math.round(z.renown * frac * (rep.outcome === 'success' ? 1 : 0.5) * rmul);
      state.renown += rep.renown;
    }
    if(bossKilled && !zs.bossDown){
      zs.bossDown = true;
      const fr = cfg.ENEMIES[z.hunt[0]].fragment;
      if(fr){
        state.fragments[fr.id] = (state.fragments[fr.id] || 0) + fr.amount;
        rep.fragments[fr.id] = fr.amount;
      }
    }

    // ----- aftermath: deaths, injuries, grief, bonds, XP -----
    squad.forEach(c => { if(c.grief > 0) c.grief--; c.missions++; });
    for(const c of live) if(hurt.has(c.id)){
      c.injuredUntil = state.day + (rep.outcome === 'success' ? 2 : 3);
      rep.injured.push(c.name);
    }
    for(const d of deadAll){
      rep.dead.push({ name: d.name, cls: d.cls, level: d.level });
      for(const s of live){
        if(C.hasEffect(s, 'stoic')) continue;
        if(C.getBond(s.id, d.id) >= 41){ s.grief = M.GRIEF_MISSIONS; rep.events.push(s.name + ' is grieving ' + d.name + '.'); }
      }
      C.die(d, 'fell in ' + z.name + ' (' + cfg.REALMS[o.realm].name + ')');
    }
    // bonds between survivors
    for(let i = 0; i < live.length; i++) for(let j = i + 1; j < live.length; j++){
      const d = rep.outcome === 'success' ? 3 : 1;
      C.addBond(live[i].id, live[j].id, d);
    }
    // XP
    for(const c of live){
      let amt = M.XP_BASE * frac + xpPool + (rep.outcome === 'success' ? M.XP_SUCCESS : 0);
      const r = C.addXp(c, amt);
      rep.xp[c.name] = r.xp;
      for(const u of r.ups) rep.levelups.push({ name: c.name, level: u.level, gains: u.gains, talent: u.talent });
      c.kills += rep.kills.length;
    }

    rep.synergy = startSyn.value;
    state.stats.missions++;
    state.dayTimer += Math.floor(state.dayLength * 0.25);
    state.missionLog.unshift(rep);
    if(state.missionLog.length > 12) state.missionLog.pop();
    return { ok:true, report: rep };
  }

  return { OBJECTIVES, combatPower, synergy, preview, validate, launch, zoneUnlocked, zoneDef, squadPower };
})();
