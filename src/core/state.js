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
      x: D.game.canvas.w / 2,
      y: D.game.canvas.h / 2,
      w: P.size,
      h: P.size,
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

    resources: [],
    buildings: [],
    enemies: [],

    nexus: { dig: 0, awareness: 0, awake: false },
    roster: [], // living characters
    bonds: {}, // "idA|idB" -> -100..100
    armory: {}, // itemKey -> count of unequipped gear
    memorial: [], // the fallen
    fragments: {}, // knowledge fragments, e.g. { gravitational: 17 }
    realms, // per-zone exploration progress
    missionLog: [], // most recent reports, newest first
    recruitOffer: null,
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
