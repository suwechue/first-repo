// The Stage 1 loop, headless: gather, research, build, dig out and awaken the Nexus, launch a squad.
import { describe, it, expect } from 'vitest';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { newGame, update, handleInteract } from '../src/systems/game.js';
import { tryUnlockTech } from '../src/systems/tech.js';
import { tryCraft } from '../src/systems/crafting.js';
import { enterPlacing, tryPlaceBuilding } from '../src/systems/building.js';
import { nexusStage } from '../src/systems/nexus.js';
import { launch } from '../src/systems/missions.js';
import { nodeAmount } from '../src/systems/gathering.js';
import { worldOf } from '../src/world/world.js';

const idle = { up: false, down: false, left: false, right: false };

function frames(s, n, input = idle) {
  for (let i = 0; i < n; i++) update(s, input);
}

describe('Stage 1 playthrough', () => {
  it('plays from the first gather to an expedition', () => {
    const s = makeInitialState();
    newGame(s, 2026);
    expect(s.roster.length).toBe(4);
    const world = worldOf(s);
    expect(world.nodes.length).toBeGreaterThan(1000);
    expect([s.player.x, s.player.y]).toEqual([world.spawn.x, world.spawn.y]);

    // Gather: stand just below a tree and press E until it runs out.
    const tree = world.nodes.find((n) => n.type === 'tree');
    const full = D.resources.tree.amount;
    Object.assign(s.player, { x: tree.x, y: tree.y + 20 });
    s.enemies = [];
    for (let i = 0; i < full; i++) {
      handleInteract(s);
      frames(s, D.game.interact.cooldown.gather);
    }
    expect(s.player.inventory.wood).toBe(full);
    expect(nodeAmount(s, tree)).toBe(0);
    frames(s, D.resources.tree.respawn);
    expect(nodeAmount(s, tree)).toBe(full);
    expect(s.nodes[tree.id]).toBeUndefined(); // a full node is not stored

    // Passive Knowledge: +1 per 90 frames.
    const kp = s.kp;
    frames(s, 900);
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
    expect(s.armory.stone_spear).toBe(1);
    expect(s.player.weaponDmg).toBe(4);
    expect(tryCraft(s, 'supplies')).toBe(true);
    expect(s.player.inventory.supplies).toBe(2);

    // Dig out the Nexus: 3 digs of 4 stone and 2 wood.
    Object.assign(s.player, { x: world.nexus.x, y: world.nexus.y + 40 });
    s.enemies = [];
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
      expect(tryPlaceBuilding(s, s.player.x + dx, s.player.y + 40)).toBe(true);
    }
    frames(s, 3599);
    expect(nexusStage(s)).toBe('excavated');
    frames(s, 1);
    expect(nexusStage(s)).toBe('awake');
    expect(s.renown).toBe(10);
    expect(s.player.inventory.supplies).toBe(2 + 4);
    expect(s.recruitOffer).not.toBeNull();

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
    s.enemies.push({
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
    });
    frames(s, 1);
    expect(s.player.hp).toBe(18);
    s.player.weaponDmg = 100;
    handleInteract(s);
    expect(s.enemies.length).toBe(0);
    expect(s.player.inventory.hide).toBe(1);
  });
});
