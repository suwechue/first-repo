// GameState: one plain, serializable object. Every system reads and writes through it.
import { D } from './content.js';

export function makeInitialState() {
  const realms = {};
  for (const rk in D.realms) {
    realms[rk] = {};
    for (const zk in D.realms[rk].zones) realms[rk][zk] = { explored: 0, cleared: 0, bossDown: false };
  }
  const inventory = {};
  for (const k in D.materials) inventory[k] = D.materials[k].start;
  const tech = {};
  for (const k in D.tech) tech[k] = !!D.tech[k].startUnlocked;
  const P = D.game.player;

  return {
    seed: 0,
    rngState: 0,
    frame: 0,
    day: 1,
    dayTimer: 0,
    dayLength: D.game.clock.dayLength,
    kp: 0, // Knowledge Points
    renown: 0,
    arcane: 0, // Arcane Knowledge, earned by exploring realms
    tech, // techId -> unlocked

    player: {
      x: null, // placed at the world's spawn by newGame, or by loadGame for a migrated save
      y: null,
      hp: P.hp,
      maxHp: P.hp,
      hunger: P.hunger,
      maxHunger: P.hunger,
      facing: { x: 0, y: 1 },
      weaponDmg: P.unarmedDmg,
      inventory,
    },

    // Runtime only: not saved, reset on load.
    mode: 'EXPLORE', // EXPLORE | PLACING
    placingBuilding: null,
    gatherCooldown: 0,

    nodes: {}, // nodeId -> { amount, respawnTimer }, only for nodes gathered from
    relics: {}, // relics already found, so each pays its Knowledge once
    fog: [], // explored cells, one bit per 4 by 4 tiles (see world/fog.js); sized on first use
    landmarks: {}, // landmarkId -> { found, used, cleared, hp, timer }
    fogRev: 0, // runtime only: bumps when fog or discoveries change, so the map redraws
    buildings: [],
    enemies: [], // runtime only: spawned near the player, never saved

    nexus: { dig: 0, awareness: 0, awake: false },
    roster: [], // living characters
    bonds: {}, // "idA|idB" -> -100..100
    bondMeta: {}, // "idA|idB" -> { since, missions, flags, mentor? }: when they last shared a mission
    armory: {}, // itemKey -> count of unequipped gear
    memorial: [], // the fallen
    fragments: {}, // knowledge fragments, e.g. { gravitational: 17 }
    realms, // per-zone exploration progress
    missionLog: [], // most recent reports, newest first
    recruitOffer: null,
    squads: [], // saved squads: { name, members: [ids] }
    expeditions: [], // squads out: { id, order, departed, returns, day } (frames)
    reportQueue: [], // reports of squads that have returned, oldest first, not yet read
    nextExpeditionId: 1,
    nextCharId: 1,
    stats: { missions: 0, deaths: 0 },

    logMessages: [],
  };
}

/** Replaces every field of `target` with a fresh state, in place, so cached references stay valid. */
export function resetState(target) {
  const fresh = makeInitialState();
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, fresh);
  return target;
}
