// The Stage 1 loop, headless: gather, research, build, dig out and awaken the Nexus, launch a squad.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame, update, handleInteract, interactTarget } from '../src/systems/game.js';
import { tryUnlockTech } from '../src/systems/tech.js';
import { tryCraft } from '../src/systems/crafting.js';
import { enterPlacing, tryPlaceBuilding, placementCheck } from '../src/systems/building.js';
import { nexusStage, nexusPrompt, inNexusRange } from '../src/systems/nexus.js';
import { launch } from '../src/systems/missions.js';
import { nodeAmount, nearestNode } from '../src/systems/gathering.js';
import { worldOf, zoneAt, nodesNear, nodeAtTile } from '../src/world/world.js';
import { playerDamage } from '../src/systems/gear.js';
import { on } from '../src/core/events.js';
import { walkTo } from './helpers/walk.js';

const idle = { up: false, down: false, left: false, right: false };

/** Runs n frames standing still. Overworld enemies are cleared: this test is about the loop, not fights. */
function frames(s, n, input = idle) {
  for (let i = 0; i < n; i++) {
    update(s, input);
    s.enemies = [];
  }
}

describe('Stage 1 playthrough', () => {
  it('walks from Mossgate through gathering, a relic, research and the Nexus to an expedition', () => {
    const s = makeInitialState();
    newGame(s, 2026);
    expect(s.roster.length).toBe(4);
    const world = worldOf(s);
    expect(world.nodes.length).toBeGreaterThan(1000);
    expect([s.player.x, s.player.y]).toEqual([world.spawn.x, world.spawn.y]);
    expect(zoneAt(world, s.player.x, s.player.y)).toBe('mossgate');
    const range = D.game.interact.range;
    const near = (x, y, o) => Math.hypot((x + 0.5) * world.ts - o.x, (y + 0.5) * world.ts - o.y);

    // Gather: walk to a tile beside a tree with nothing else in reach, and press E until it runs out.
    walkTo(s, (x, y) => {
      const ns = nodesNear(world, (x + 0.5) * world.ts, (y + 0.5) * world.ts, range);
      return ns.length === 1 && ns[0].type === 'tree';
    });
    const tree = nearestNode(s);
    expect(tree.type).toBe('tree');
    const full = D.resources.tree.amount;
    const wood = s.player.inventory.wood;
    for (let i = 0; i < full; i++) {
      handleInteract(s);
      frames(s, D.game.interact.cooldown.gather);
    }
    expect(s.player.inventory.wood).toBe(wood + full);
    expect(nodeAmount(s, tree)).toBe(0);
    frames(s, D.resources.tree.respawn);
    expect(nodeAmount(s, tree)).toBe(full);
    expect(s.nodes[tree.id]).toBeUndefined(); // a full node is not stored

    // Salvage: a pile with a relic pays stone and fiber, and 3 Knowledge once when emptied.
    const pile = world.nodes.find((n) => n.type === 'salvage_pile' && n.relic);
    expect(pile).toBeDefined();
    walkTo(s, (x, y) => x === pile.tx && y === pile.ty);
    expect(nearestNode(s)).toBe(pile);
    const before = { stone: s.player.inventory.stone, fiber: s.player.inventory.fiber, kp: s.kp };
    const salvage = D.resources.salvage_pile;
    for (let i = 0; i < salvage.amount; i++) {
      handleInteract(s);
      frames(s, D.game.interact.cooldown.gather);
    }
    const got = s.player.inventory.stone - before.stone + (s.player.inventory.fiber - before.fiber);
    expect(got).toBe(salvage.amount);
    expect(s.relics[pile.id]).toBe(true);
    expect(s.kp).toBeGreaterThanOrEqual(before.kp + salvage.relic.kp);
    frames(s, salvage.respawn); // the pile refills, but its relic is gone
    const kpAfter = s.kp;
    for (let i = 0; i < salvage.amount; i++) {
      handleInteract(s);
      frames(s, 1);
      s.kp = kpAfter;
      frames(s, D.game.interact.cooldown.gather - 1);
    }
    expect(s.kp).toBe(kpAfter);

    // No passive Knowledge (M13): time alone earns nothing; study at a Research Desk does.
    const kp = s.kp;
    frames(s, 900);
    expect(s.kp).toBe(kp);
    // Find a clear spot with nothing to gather in reach, and build a desk beside it.
    walkTo(
      s,
      (x, y) =>
        nodesNear(world, (x + 0.5) * world.ts, (y + 0.5) * world.ts, 90).length === 0 &&
        Math.hypot(x - pile.tx, y - pile.ty) < 12,
    );
    Object.assign(s.player.inventory, { wood: 4, stone: 2 });
    enterPlacing(s, 'research_desk');
    const spot = [];
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const p = placementCheck(s, 'research_desk', s.player.x + dx * 32, s.player.y + dy * 32);
        if (p.ok && Math.hypot(p.x - s.player.x, p.y - s.player.y) < D.game.research.studyRange) spot.push(p);
      }
    expect(tryPlaceBuilding(s, spot[0].x, spot[0].y)).toBe(true);
    s.gatherCooldown = 0;
    const study = interactTarget(s);
    expect(study.kind).toBe('study');
    handleInteract(s);
    expect(s.mode).toBe('STUDYING');
    frames(s, 450);
    expect(s.kp).toBe(kp + 10); // 1 per 45 frames
    update(s, { ...idle, left: true }); // moving stops the study
    expect(s.mode).toBe('EXPLORE');
    frames(s, 450);
    expect(s.kp).toBe(kp + 10);

    // Research, with Knowledge and materials provided.
    s.kp = 1000;
    Object.assign(s.player.inventory, { wood: 200, stone: 200, fiber: 200, food: 200 });
    for (const t of [
      'woodworking',
      'basic_construction',
      'foundation_engineering',
      'shamanic_rites',
      'cooking',
    ]) {
      expect(tryUnlockTech(s, t)).toBe(true);
    }
    expect(tryUnlockTech(s, 'elemental_attunement')).toBe(false); // needs the awake Nexus

    // Craft gear and supplies.
    expect(tryCraft(s, 'stone_spear')).toBe(true);
    // a fresh piece goes straight onto the player when the slot is free
    expect(s.player.gear.weapon.base).toBe('stone_spear');
    expect(playerDamage(s)).toBe(4);
    expect(tryCraft(s, 'supplies')).toBe(true);
    expect(s.player.inventory.supplies).toBe(2);

    // Walk into the city to the buried Nexus under the plaza, and dig it out: 3 digs of 4 stone and 2 wood.
    expect(inNexusRange(s)).toBe(false);
    walkTo(s, (x, y) => near(x, y, world.nexus) < D.nexus.interactRange - 6 && !nodeAtTile(world, x, y));
    expect(inNexusRange(s)).toBe(true);
    expect(nexusPrompt(s)).toMatch(/dig/);
    const stone = s.player.inventory.stone;
    for (let i = 0; i < D.nexus.digSteps; i++) {
      handleInteract(s);
      frames(s, D.game.interact.cooldown.nexus);
    }
    expect(nexusStage(s)).toBe('excavated');
    expect(s.player.inventory.stone).toBe(stone - 12);

    // Two Shrines: each adds 1 Awareness per 180 frames, so 40 Awareness takes 3,600 frames.
    for (const dx of [-60, 60]) {
      enterPlacing(s, 'shrine');
      expect(tryPlaceBuilding(s, world.nexus.x + dx, world.nexus.y + 64)).toBe(true);
    }
    frames(s, 3599);
    expect(nexusStage(s)).toBe('excavated');
    frames(s, 1);
    expect(nexusStage(s)).toBe('awake');
    expect(s.renown).toBe(10);
    expect(s.player.inventory.supplies).toBe(2 + 4);
    expect(s.recruitOffer).not.toBeNull();

    // E at the awake Nexus opens the Expedition Hall.
    const opened = [];
    const stop = on('panel:open', (k) => opened.push(k));
    s.gatherCooldown = 0;
    handleInteract(s);
    stop();
    expect(opened).toEqual(['hall']);

    // The Expedition Hall: send the four starters into the Fringe.
    const r = launch(s, {
      realm: 'verdant_wilds',
      zone: 'fringe',
      objective: 'explore',
      squad: s.roster.map((c) => c.id),
      retreat: 35,
    });
    expect(r.ok).toBe(true);
    expect(s.missionLog.length).toBe(1);
    expect(s.player.inventory.supplies).toBe(2);
  });

  it('a day is 3,600 frames; the player eats below 40 hunger and faints safely at 0 health', () => {
    const s = makeInitialState();
    newGame(s, 7);
    frames(s, 3600);
    expect(s.day).toBe(2);
    s.player.hunger = 39;
    s.player.inventory.food = 1;
    frames(s, 1);
    expect(s.player.hunger).toBe(54);
    expect(s.player.inventory.food).toBe(0);
    s.player.hp = 0;
    frames(s, 1);
    expect(s.player.hp).toBe(10);
    const { center } = worldOf(s);
    expect([s.player.x, s.player.y]).toEqual([center.x, center.y]);
  });

  it('wolves bite, and die to the player for fiber, food and hide', () => {
    const s = makeInitialState();
    newGame(s, 8);
    s.enemies = [];
    const wolf = {
      id: 'w',
      type: 'wolf',
      x: s.player.x + 10,
      y: s.player.y,
      hp: 8,
      maxHp: 8,
      dmg: 2,
      speed: 1.4,
      state: 'wander',
      wanderTarget: { x: 0, y: 0 },
      attackCooldown: 0,
    };
    s.enemies.push(wolf);
    s.frame = 1; // not an ambient spawn frame
    update(s, idle);
    expect(s.player.hp).toBe(18);
    for (let i = 0; i < 20 && s.enemies.includes(wolf); i++) {
      s.gatherCooldown = 0;
      s.player.hp = s.player.maxHp;
      handleInteract(s);
    }
    expect(s.enemies.includes(wolf)).toBe(false);
    expect(s.player.inventory.hide).toBe(1);
  });
});
