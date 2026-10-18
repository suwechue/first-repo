// ============================================================================
// WORLD — world generation, gathering, combat, tech/craft/build actions,
// and the per-frame update logic. No DOM or canvas code lives here; this
// module only touches Game.state and Game.config.
// ============================================================================

window.Game = window.Game || {};

Game.world = (function(){
  const cfg = Game.config;
  const state = Game.state;
  const dist = Game.util.dist;
  const log = Game.util.log;

  // --------------------------------------------------------------------
  // WORLD GEN — seeded scatter with a minimum-distance check.
  // (Full noise-based terrain is Stage 5+ engine work — see the
  // demo_systems_gaps design doc. This is intentionally the simple version.)
  // --------------------------------------------------------------------
  function scatterResources(){
    state.resources.length = 0;
    const counts = { tree: 16, rock: 9, bush: 7, berrybush: 5 };
    const placed = [];
    for(const type in counts){
      let tries = 0, placedCount = 0;
      while(placedCount < counts[type] && tries < 400){
        tries++;
        const x = 40 + Math.random() * (cfg.CANVAS_W - 80);
        const y = 90 + Math.random() * (cfg.CANVAS_H - 160);
        const candidate = { x, y };
        const tooClose = placed.some(p => dist(p, candidate) < 46) ||
                          dist(candidate, { x: cfg.CANVAS_W/2, y: cfg.CANVAS_H/2 }) < 70 ||
                          dist(candidate, cfg.NEXUS) < 90;
        if(!tooClose){
          const def = cfg.RESOURCE_TYPES[type];
          state.resources.push({
            id: type + '_' + placedCount + '_' + Math.floor(Math.random()*9999),
            type, x, y,
            amount: def.amount, maxAmount: def.amount,
            respawnTimer: 0, angle: Math.random() * Math.PI * 2
          });
          placed.push(candidate);
          placedCount++;
        }
      }
    }
  }

  function spawnWolf(){
    let x, y, ok = false, tries = 0;
    while(!ok && tries < 100){
      tries++;
      x = 40 + Math.random() * (cfg.CANVAS_W - 80);
      y = 90 + Math.random() * (cfg.CANVAS_H - 160);
      if(dist({x,y}, state.player) > 220) ok = true;
    }
    state.enemies.push({
      id: 'wolf_' + Math.floor(Math.random()*99999),
      x, y, hp: 8, maxHp: 8, dmg: 2,
      speed: 1.4, state: 'wander', wanderTarget: { x, y }, attackCooldown: 0
    });
  }

  function nearestInRange(list, range){
    let best = null, bestD = Infinity;
    for(const obj of list){
      const d = dist(state.player, obj);
      if(d < range && d < bestD){ bestD = d; best = obj; }
    }
    return best;
  }

  // --------------------------------------------------------------------
  // GATHER / DIRECT-CONTROL COMBAT
  // (see demo_systems_gaps.md, Section 3 — this is deliberately a simple,
  // immediate model, distinct from the autonomous-expedition math used
  // once the Nexus opens in later stages)
  // --------------------------------------------------------------------
  function handleInteract(){
    if(state.mode !== 'EXPLORE') return;
    if(state.gatherCooldown > 0) return;

    const enemy = nearestInRange(state.enemies, cfg.GATHER_RANGE);
    if(enemy){ attackEnemy(enemy); state.gatherCooldown = 20; return; }

    const node = nearestInRange(state.resources.filter(r => r.amount > 0), cfg.GATHER_RANGE);
    if(node){ gatherNode(node); state.gatherCooldown = 18; return; }

    if(dist(state.player, cfg.NEXUS) < cfg.NEXUS.interactRange){ interactNexus(); state.gatherCooldown = 25; return; }

    const fire = state.buildings.find(b => b.type === 'campfire' && dist(b, state.player) < 40);
    if(fire && state.player.inventory.food > 0 && cfg.TECH.cooking.unlocked){
      state.player.inventory.food -= 1;
      state.player.inventory.cookedfood += 1;
      log('Cooked food over the campfire.');
      state.gatherCooldown = 18;
      Game.ui.updateResourceBar();
    }
  }

  function gatherNode(node){
    const def = cfg.RESOURCE_TYPES[node.type];
    node.amount -= 1;
    state.player.inventory[def.yields] += 1;
    log(`Gathered 1 ${def.yields}. (${node.amount}/${node.maxAmount} left)`);
    if(node.amount <= 0) node.respawnTimer = def.respawn;
    Game.ui.updateResourceBar();
  }

  function attackEnemy(enemy){
    const dmg = Math.max(1, Math.round(state.player.weaponDmg * (0.85 + Math.random()*0.3)));
    enemy.hp -= dmg;
    log(`You hit the wolf for ${dmg}.`);
    if(enemy.hp <= 0){
      log('The wolf falls. (+1 fiber, +1 food, +1 hide)');
      state.player.inventory.fiber += 1;
      state.player.inventory.food += 1;
      state.player.inventory.hide += 1;
      state.enemies = state.enemies.filter(e => e !== enemy);
      Game.ui.updateResourceBar();
    } else {
      enemy.state = 'aggro';
    }
  }

  // --------------------------------------------------------------------
  // BUILDING PLACEMENT
  // --------------------------------------------------------------------
  function canAfford(costs){
    for(const k in costs){ if(state.player.inventory[k] < costs[k]) return false; }
    return true;
  }
  function spend(costs){
    for(const k in costs){ state.player.inventory[k] -= costs[k]; }
    Game.ui.updateResourceBar();
  }
  function reqsMet(reqs){
    return reqs.every(r => cfg.TECH[r] && cfg.TECH[r].unlocked);
  }

  function enterPlacing(buildingKey){
    state.mode = 'PLACING';
    state.placingBuilding = buildingKey;
    Game.ui.closeAllPanels();
    log(`Placing ${cfg.BUILDINGS[buildingKey].name} — click on the map, ESC to cancel.`);
  }
  function exitPlacing(){
    if(state.mode === 'PLACING'){ state.mode = 'EXPLORE'; state.placingBuilding = null; }
  }
  function tryPlaceBuilding(x, y){
    const key = state.placingBuilding;
    const def = cfg.BUILDINGS[key];
    if(!canAfford(def.costs)){ log('Not enough resources.'); return; }
    spend(def.costs);
    const building = { type: key, x, y, radius: def.radius, color: def.color };
    // Buildings with a growthTime in their config get a per-instance timer.
    // This is the general pattern for "a building does something over time":
    // stash whatever mutable state it needs directly on the instance here.
    if(def.growthTime){ building.growthTimer = def.growthTime; }
    if(def.awarenessTime){ building.awarenessTimer = def.awarenessTime; }
    state.buildings.push(building);
    log(`Built ${def.name}.`);
    state.mode = 'EXPLORE';
    state.placingBuilding = null;
  }

  // --------------------------------------------------------------------
  // TECH / CRAFTING ACTIONS
  // --------------------------------------------------------------------
  function tryUnlockTech(key){
    const t = cfg.TECH[key];
    if(t.unlocked) return;
    if(!t.prereq.every(p => cfg.TECH[p].unlocked)){ log('Missing prerequisite technology.'); return; }
    if(t.needsNexus && !state.nexus.awake){ log('This knowledge needs an awakened Nexus.'); return; }
    if(state.kp < t.cost){ log('Not enough Knowledge Points.'); return; }
    if((t.arcane || 0) > state.arcane){ log('Not enough Arcane Knowledge — explore other realms.'); return; }
    if(t.extra && !canAfford(t.extra)){ log('Missing materials for this research.'); return; }
    state.kp -= t.cost;
    state.arcane -= (t.arcane || 0);
    if(t.extra) spend(t.extra);
    t.unlocked = true;
    log(`Unlocked technology: ${t.name}!`);
    Game.ui.renderTechPanel();
    Game.ui.renderCraftPanel();
    Game.ui.renderBuildPanel();
    Game.ui.updateKPLabel();
  }

  function tryCraft(key){
    const r = cfg.RECIPES[key];
    if(!reqsMet(r.requires)) return;
    if(!canAfford(r.costs)){ log('Not enough resources.'); return; }

    if(r.type === 'item'){
      spend(r.costs);
      const it = cfg.ITEMS[r.item];
      state.armory[r.item] = (state.armory[r.item] || 0) + 1;
      if(it.slot === 'weapon' && it.dmg) state.player.weaponDmg = Math.max(state.player.weaponDmg, it.dmg);
      log(`Crafted ${it.name}. Equip it from the Roster.`);
      Game.ui.renderRosterIfOpen();
    } else if(r.type === 'cook'){
      const fire = state.buildings.find(b => b.type === 'campfire' && dist(b, state.player) < 60);
      if(!fire){ log('You need to be near a lit Campfire.'); return; }
      spend(r.costs);
      state.player.inventory.cookedfood += 1;
      log('Cooked a portion of food.');
    } else if(r.type === 'supply'){
      spend(r.costs);
      for(const k in r.yields) state.player.inventory[k] += r.yields[k];
      log('Packed ' + r.name + '.');
    }
    Game.ui.renderCraftPanel();
  }

  // --------------------------------------------------------------------
  // THE NEXUS — buried -> excavated -> awake
  // --------------------------------------------------------------------
  function nexusStage(){
    const n = state.nexus;
    if(n.awake) return 'awake';
    if(n.dig >= cfg.NEXUS.digSteps) return 'excavated';
    return 'buried';
  }
  function interactNexus(){
    const n = state.nexus, N = cfg.NEXUS, stage = nexusStage();
    if(stage === 'buried'){
      if(!cfg.TECH.foundation_engineering.unlocked){
        log('Something huge lies buried here. You lack the engineering to dig it out safely (Foundation Engineering).');
        return;
      }
      if(!canAfford(N.digCost)){ log('Digging needs ' + Object.entries(N.digCost).map(([k,v]) => v + ' ' + k).join(' + ') + '.'); return; }
      spend(N.digCost);
      n.dig++;
      if(n.dig >= N.digSteps) log('The Nexus is uncovered — a ring of cold stone. Build Shrines nearby to attune your people to it.');
      else log('You dig around the buried structure. (' + n.dig + '/' + N.digSteps + ')');
    } else if(stage === 'excavated'){
      log('The Nexus is silent. Awareness ' + Math.floor(n.awareness) + '/' + N.awarenessNeeded + ' — Shrines slowly attune your people.');
    } else {
      Game.ui.openPanel('hall');
    }
  }
  function addAwareness(amount){
    const n = state.nexus, N = cfg.NEXUS;
    if(n.awake || n.dig < N.digSteps) return;
    n.awareness = Math.min(N.awarenessCap, n.awareness + amount);
    if(n.awareness >= N.awarenessNeeded) awakenNexus();
  }
  function awakenNexus(){
    const n = state.nexus, N = cfg.NEXUS;
    if(n.awake) return;
    n.awake = true;
    state.player.inventory.supplies += N.startingSupplies;
    state.renown += N.startingRenown;
    Game.characters.refreshOffer();
    log('The Nexus awakens! A doorway of light opens. (+' + N.startingSupplies + ' Expedition Supplies)');
    Game.ui.refreshAll();
  }
  function nexusPrompt(){
    if(dist(state.player, cfg.NEXUS) >= cfg.NEXUS.interactRange) return null;
    const stage = nexusStage();
    if(stage === 'buried') return 'E: dig (' + state.nexus.dig + '/' + cfg.NEXUS.digSteps + ')';
    if(stage === 'excavated') return 'Awareness ' + Math.floor(state.nexus.awareness) + '/' + cfg.NEXUS.awarenessNeeded;
    return 'E: Expedition Hall';
  }

  function checkFaint(){
    const p = state.player;
    if(p.hp > 0) return;
    p.hp = Math.ceil(p.maxHp / 2);
    p.hunger = Math.max(p.hunger, 50);
    p.x = cfg.CANVAS_W/2; p.y = cfg.CANVAS_H/2;
    state.enemies = [];
    log('You collapse and wake at camp, shaky but alive.');
    Game.ui.updateVitals();
  }

  // --------------------------------------------------------------------
  // PER-FRAME UPDATE
  // --------------------------------------------------------------------
  function updatePlayer(){
    let dx = 0, dy = 0;
    if(state.keys['w']) dy -= 1;
    if(state.keys['s']) dy += 1;
    if(state.keys['a']) dx -= 1;
    if(state.keys['d']) dx += 1;
    if(dx !== 0 || dy !== 0){
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      state.player.facing = { x: dx, y: dy };
      state.player.x = Math.max(16, Math.min(cfg.CANVAS_W - 16, state.player.x + dx * cfg.PLAYER_SPEED));
      state.player.y = Math.max(80, Math.min(cfg.CANVAS_H - 16, state.player.y + dy * cfg.PLAYER_SPEED));
    }
    if(state.gatherCooldown > 0) state.gatherCooldown--;
  }

  function updateResources(){
    for(const node of state.resources){
      if(node.amount <= 0){
        node.respawnTimer--;
        if(node.respawnTimer <= 0) node.amount = node.maxAmount;
      }
    }
  }

  // Generic tick for any building that has a growthTimer (currently just
  // Farm Plot, but any future building with a growthTime in its config
  // automatically works here too — nothing farm_plot-specific except the
  // resource it yields, which comes straight from config).
  function updateBuildings(){
    for(const b of state.buildings){
      if(b.awarenessTimer !== undefined){
        b.awarenessTimer--;
        if(b.awarenessTimer <= 0){
          const def = cfg.BUILDINGS[b.type];
          b.awarenessTimer = def.awarenessTime;
          addAwareness(1);
        }
      }
      if(b.growthTimer === undefined) continue;
      b.growthTimer--;
      if(b.growthTimer <= 0){
        const def = cfg.BUILDINGS[b.type];
        state.player.inventory.food += def.yieldAmount;
        b.growthTimer = def.growthTime;
        log(`Your ${def.name} produced ${def.yieldAmount} food.`);
        Game.ui.updateResourceBar();
      }
    }
  }

  function updateEnemies(){
    for(const e of state.enemies){
      if(e.attackCooldown > 0) e.attackCooldown--;
      const dToPlayer = dist(e, state.player);
      if(dToPlayer < 120) e.state = 'aggro';

      if(e.state === 'aggro'){
        const dx = state.player.x - e.x, dy = state.player.y - e.y;
        const len = Math.hypot(dx, dy) || 1;
        if(dToPlayer > 22){
          e.x += (dx/len) * e.speed;
          e.y += (dy/len) * e.speed;
        } else if(e.attackCooldown <= 0){
          state.player.hp = Math.max(0, state.player.hp - e.dmg);
          e.attackCooldown = 50;
          log(`The wolf bites you for ${e.dmg}!`);
          Game.ui.updateVitals();
        }
      } else {
        const dx = e.wanderTarget.x - e.x, dy = e.wanderTarget.y - e.y;
        const d = Math.hypot(dx, dy);
        if(d < 4){
          e.wanderTarget = { x: 40 + Math.random()*(cfg.CANVAS_W-80), y: 90 + Math.random()*(cfg.CANVAS_H-160) };
        } else {
          e.x += (dx/d) * 0.5; e.y += (dy/d) * 0.5;
        }
      }
    }
  }

  let frame = 0;
  function updateWorldClock(){
    frame++;
    state.dayTimer++;

    if(frame % 90 === 0){
      state.kp += 1;
      Game.ui.updateKPLabel();
      Game.ui.renderTechPanel();
      Game.ui.renderCraftPanel();
      Game.ui.renderBuildPanel();
    }

    if(frame % 200 === 0){
      state.player.hunger = Math.max(0, state.player.hunger - 1);
      if(state.player.hunger <= 0) state.player.hp = Math.max(0, state.player.hp - 1);
      Game.ui.updateVitals();
    }

    if(state.dayTimer >= state.dayLength){
      state.dayTimer = 0;
      state.day++;
      Game.ui.updateDayLabel();
      log(`Day ${state.day} begins.`);
      if(state.nexus.awake) Game.characters.refreshOffer();
      if(state.day > 1 && Game.rand() < 0.6 && state.enemies.length < 3) spawnWolf();
    }

    if(state.player.hunger < 40){
      if(state.player.inventory.cookedfood > 0){
        state.player.inventory.cookedfood--;
        state.player.hunger = Math.min(100, state.player.hunger + 30);
        log('Ate cooked food. Hunger restored.');
        Game.ui.updateResourceBar(); Game.ui.updateVitals();
      } else if(state.player.inventory.food > 0){
        state.player.inventory.food--;
        state.player.hunger = Math.min(100, state.player.hunger + 15);
        log('Ate raw food. Hunger restored a little.');
        Game.ui.updateResourceBar(); Game.ui.updateVitals();
      }
    }
  }

  function update(){
    if(state.mode !== 'PLACING') updatePlayer();
    updateResources();
    updateBuildings();
    updateEnemies();
    updateWorldClock();
    checkFaint();
  }

  return {
    scatterResources, spawnWolf, nearestInRange,
    handleInteract, gatherNode, attackEnemy,
    canAfford, spend, reqsMet,
    enterPlacing, exitPlacing, tryPlaceBuilding,
    tryUnlockTech, tryCraft,
    nexusStage, nexusPrompt, interactNexus, addAwareness, awakenNexus,
    update
  };
})();
