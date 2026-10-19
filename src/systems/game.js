// Ties the systems together: a new game, the interact key, and the per-frame update.
import { D } from '../core/content.js';
import { dist } from '../core/geometry.js';
import { resetState } from '../core/state.js';
import { seedRng } from '../core/rng.js';
import { initStarters } from './characters.js';
import { apply } from '../core/save.js';
import { getWorld } from '../world/world.js';
import { nearestInRange, nearestNode, gatherNode, updateResources, nodeAmount } from './gathering.js';
import { attackEnemy, updateEnemies, updatePlayerCombat } from './combat.js';
import { inNexusRange, interactNexus, nexusPrompt } from './nexus.js';
import { updateExploration, landmarkInReach, landmarkPrompt, interactLandmark } from './exploration.js';
import { updateExpeditions } from './missions.js';
import { deskInReach, startStudy, stopStudy, updateResearch } from './research.js';
import { playerEffect } from './gear.js';
import { emit } from '../core/events.js';
import { nearBuilding, tryCraft } from './crafting.js';
import { reqsMet } from './tech.js';
import { updateBuildings } from './building.js';
import { updatePlayer, checkFaint } from './player.js';
import { updateClock } from './clock.js';
import { log } from './log.js';

/** A fresh world and the starter roster, from a seed. */
export function newGame(s, seed) {
  resetState(s);
  seedRng(seed);
  s.seed = seed;
  const { spawn } = getWorld(seed);
  s.player.x = spawn.x;
  s.player.y = spawn.y;
  initStarters(s);
  for (const m of D.game.messages.newGame) log(s, m);
}

/** Loads a save into `s`. Returns null on success, or an error message for the player. */
export function loadGame(s, data) {
  const err = apply(s, data);
  if (err) return err;
  if (!Number.isFinite(s.player.x) || !Number.isFinite(s.player.y)) {
    const { spawn } = getWorld(s.seed);
    s.player.x = spawn.x;
    s.player.y = spawn.y;
  }
  return null;
}

export function nearestEnemy(s) {
  return nearestInRange(s, s.enemies, D.game.interact.range);
}

function canCook(s) {
  const I = D.game.interact;
  const r = D.recipes[I.cook.recipe];
  const item = Object.keys(r.costs)[0];
  return (
    nearBuilding(s, r.nearBuilding, I.cook.range) && reqsMet(s, r.requires) && s.player.inventory[item] > 0
  );
}

/**
 * What the E key would do right now, in priority order: attack an enemy, act on a landmark, gather
 * a node, use the Nexus, cook at a fire. Returns { kind, obj, label, x, y } or null. The renderer
 * shows the label as the interaction prompt.
 */
export function interactTarget(s) {
  if (s.mode !== 'EXPLORE') return null;
  const enemy = nearestEnemy(s);
  if (enemy)
    return {
      kind: 'enemy',
      obj: enemy,
      x: enemy.x,
      y: enemy.y,
      label: 'E: attack ' + D.enemies[enemy.type].short,
    };
  const lm = landmarkInReach(s);
  if (lm) return { kind: 'landmark', obj: lm, x: lm.x, y: lm.y, label: landmarkPrompt(s, lm) };
  const node = nearestNode(s);
  const desk = deskInReach(s);
  // Between a node and a desk, the nearer one wins.
  if (desk && (!node || dist(s.player, desk) < dist(s.player, node)))
    return { kind: 'study', obj: desk, x: desk.x, y: desk.y, label: 'E: study at the Research Desk' };
  if (node) {
    const def = D.resources[node.type];
    const label = `E: ${def.verb || 'gather'} ${def.name} (${nodeAmount(s, node)})`;
    return { kind: 'node', obj: node, x: node.x, y: node.y, label };
  }
  if (inNexusRange(s)) return { kind: 'nexus', obj: null, label: nexusPrompt(s) };

  if (canCook(s)) return { kind: 'cook', obj: null, x: s.player.x, y: s.player.y, label: 'E: cook food' };
  return null;
}

/** The E key. */
export function handleInteract(s) {
  if (s.mode === 'STUDYING') {
    stopStudy(s);
    return;
  }
  if (s.gatherCooldown > 0) return;
  const t = interactTarget(s);
  if (!t) return;
  const C = D.game.interact.cooldown;
  if (t.kind === 'enemy') {
    attackEnemy(s, t.obj); // a light attack aimed at it; sets its own cooldown
  } else if (t.kind === 'landmark') {
    interactLandmark(s, t.obj);
    s.gatherCooldown = C.attack;
  } else if (t.kind === 'node') {
    gatherNode(s, t.obj);
    s.gatherCooldown = Math.max(
      1,
      Math.round(C.gather * (1 - Math.min(0.75, playerEffect(s, 'gatherSpeed')))),
    );
  } else if (t.kind === 'study') {
    startStudy(s);
  } else if (t.kind === 'nexus') {
    interactNexus(s);
    s.gatherCooldown = C.nexus;
  } else if (t.kind === 'cook' && tryCraft(s, D.game.interact.cook.recipe)) {
    s.gatherCooldown = C.cook;
  }
}

/** One fixed 1/60 s frame. */
export function update(s, input) {
  if (s.paused) return; // a crafting minigame is open
  if (s.mode === 'STUDYING' && (input.up || input.down || input.left || input.right)) stopStudy(s);
  if (s.mode === 'EXPLORE' && !s.player.dodge) updatePlayer(s, input);
  else if (s.gatherCooldown > 0) s.gatherCooldown--;
  updateResources(s);
  updateBuildings(s);
  updatePlayerCombat(s);
  updateEnemies(s);
  updateExploration(s);
  updateResearch(s);
  updateClock(s);
  for (const rep of updateExpeditions(s)) {
    log(s, `A squad returns from ${D.realms[rep.realm].zones[rep.zone].name}: ${rep.outcome}.`);
    emit('mission:return', rep);
  }
  checkFaint(s);
}
