// Exploration: fog of war, landmark discovery and what landmarks do, wolf dens, and the ambient
// enemies that live near the player. Landmark progress lives in s.landmarks, keyed by landmark id:
// { found, used, cleared, hp, timer }. Overworld enemies only exist near the player.
import { D } from '../core/content.js';
import { emit } from '../core/events.js';
import { rand, weightedKey } from '../core/rng.js';
import { dist } from '../core/geometry.js';
import { worldOf, zoneAt, randomReachableNear } from '../world/world.js';
import { emptyFog, revealCircle } from '../world/fog.js';
import { addEnemy } from './combat.js';
import { give } from './inventory.js';
import { findRelic } from './gathering.js';
import { isNight } from './clock.js';
import { playerDamage } from './gear.js';
import { log, changed, cue } from './log.js';

const COMPASS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

export function landmarkState(s, lm) {
  return s.landmarks[lm.id] || (s.landmarks[lm.id] = {});
}

export function isFound(s, lm) {
  return !!s.landmarks[lm.id]?.found;
}

/** The fog array for this state, created on first use. */
export function fogOf(s) {
  const world = worldOf(s);
  const want = emptyFog(world).length;
  if (!Array.isArray(s.fog) || s.fog.length !== want) s.fog = emptyFog(world);
  return s.fog;
}

function reveal(s, x, y, radiusTiles) {
  if (revealCircle(fogOf(s), worldOf(s), x, y, radiusTiles)) {
    s.fogRev = (s.fogRev || 0) + 1;
    return true;
  }
  return false;
}

/** First sight of a landmark: pays its Knowledge once, reveals the map around a watchtower. */
export function discover(s, lm) {
  const st = landmarkState(s, lm);
  if (st.found) return false;
  st.found = true;
  const def = D.landmarks[lm.type];
  const R = def.discover || {};
  if (R.kp) {
    s.kp += R.kp;
    changed('kp');
  }
  if (R.reveal) reveal(s, lm.x, lm.y, R.reveal);
  s.fogRev = (s.fogRev || 0) + 1;
  const reward = R.kp ? `+${R.kp} Knowledge` : '';
  log(s, `Discovered: ${def.name}.${reward ? ' (' + reward + ')' : ''}`);
  cue('discover');
  emit('banner', { title: def.name, text: R.reveal ? reward + ' · the land around is revealed' : reward });
  return true;
}

/** Per frame: reveal the fog around the player, discover landmarks in reach, springs, dens, ambient spawns. */
export function updateExploration(s) {
  const world = worldOf(s);
  const F = D.game.fog;
  if (s.frame % F.every === 0) reveal(s, s.player.x, s.player.y, F.revealRadius);

  for (const lm of world.landmarks) {
    const def = D.landmarks[lm.type];
    const d = dist(s.player, lm);
    if (d < def.discoverRadius * world.ts) discover(s, lm);
    if (def.heal && d < def.heal.radius && s.frame % def.heal.every === 0 && s.player.hp < s.player.maxHp) {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + def.heal.amount);
      changed('vitals');
    }
    if (def.den) updateDen(s, lm, def.den, d);
  }
  updateAmbient(s, world);
}

function updateDen(s, lm, den, d) {
  const st = landmarkState(s, lm);
  if (st.cleared || d > den.activeWithin) return;
  st.timer = (st.timer ?? den.every) + 1;
  if (st.timer < den.every) return;
  const alive = s.enemies.filter((e) => e.den === lm.id).length;
  if (alive >= den.alive) return;
  const p = randomReachableNear(worldOf(s), lm.x, lm.y, den.spawnRadius[0], den.spawnRadius[1], rand, 20);
  if (!p) return;
  addEnemy(s, den.enemy, p.x, p.y, { den: lm.id });
  st.timer = 0;
}

/** Ambient enemies: keep each zone near the player at its biome's population, and drop far ones. */
function updateAmbient(s, world) {
  const A = D.game.ambient;
  if (s.frame % A.every !== 0) return;
  s.enemies = s.enemies.filter((e) => e.state === 'aggro' || dist(e, s.player) < A.despawnDistance);
  const p = randomReachableNear(
    world,
    s.player.x,
    s.player.y,
    A.spawnDistance[0],
    A.spawnDistance[1],
    rand,
    12,
  );
  if (!p) return;
  const biome = D.biomes[zoneAt(world, p.x, p.y)];
  if (!biome || !biome.enemies.length) return;
  const max = Math.round(biome.ambient.max * ambientMultiplier(s));
  const near = s.enemies.filter((e) => e.ambient && dist(e, p) < A.countWithin).length;
  if (near >= max) return;
  const weights = Object.fromEntries(biome.enemies.map((e) => [e.id, e.weight]));
  const type = weightedKey(weights);
  const [lo, hi] = biome.ambient.pack || [1, 1];
  const size = Math.min(max - near, lo + Math.floor(rand() * (hi - lo + 1)));
  for (let i = 0; i < size; i++) {
    const q = randomReachableNear(world, p.x, p.y, 0, A.packSpread, rand, 8) || p;
    addEnemy(s, type, q.x, q.y, { ambient: true });
  }
}

/** Night brings more wolves. */
export function ambientMultiplier(s) {
  return isNight(s) ? D.game.night.ambientMul : 1;
}

// ---------------------------------------------------------------------------
// Landmark interactions (the E key)
// ---------------------------------------------------------------------------

/** The landmark in reach that E would act on, or null: an uncleared den, an unopened cache or camp, a sign. */
export function landmarkInReach(s) {
  const world = worldOf(s);
  let best = null;
  let bestD = D.game.interact.landmarkRange;
  for (const lm of world.landmarks) {
    const def = D.landmarks[lm.type];
    const st = s.landmarks[lm.id] || {};
    const usable = (def.den && !st.cleared) || (def.open && !st.used) || def.sign;
    if (!usable) continue;
    const d = dist(s.player, lm);
    if (d < bestD) {
      bestD = d;
      best = lm;
    }
  }
  return best;
}

/** The prompt for a landmark in reach. */
export function landmarkPrompt(s, lm) {
  const def = D.landmarks[lm.type];
  if (def.den) {
    const st = s.landmarks[lm.id] || {};
    return `E: attack ${def.name} (${st.hp ?? def.den.hp})`;
  }
  if (def.open) return `E: ${def.open.verb} ${def.name}`;
  if (def.sign) return `E: read ${def.name}`;
  return def.name;
}

export function interactLandmark(s, lm) {
  const def = D.landmarks[lm.type];
  const st = landmarkState(s, lm);
  discover(s, lm);
  if (def.den) return attackDen(s, lm, def, st);
  if (def.open && !st.used) return openLandmark(s, lm, def, st);
  if (def.sign) return readSign(s, lm);
}

function attackDen(s, lm, def, st) {
  const A = D.game.player.attackSpread;
  const dmg = Math.max(1, Math.round(playerDamage(s) * (A.min + rand() * A.range)));
  st.hp = Math.max(0, (st.hp ?? def.den.hp) - dmg);
  cue('hit');
  if (st.hp > 0) {
    log(s, `You tear at the ${def.name}. (${st.hp} left)`);
    return;
  }
  st.cleared = true;
  give(s, def.den.clearReward);
  const text = Object.entries(def.den.clearReward)
    .map(([k, v]) => '+' + v + ' ' + k)
    .join(', ');
  log(s, `The ${def.name} is cleared. No more will come from it. (${text})`);
  emit('banner', { title: def.name + ' cleared', text });
}

function openLandmark(s, lm, def, st) {
  st.used = true;
  const O = def.open;
  const items = O.oneOf ? O.oneOf[Math.floor(rand() * O.oneOf.length)] : O.items;
  give(s, items);
  const text = Object.entries(items)
    .map(([k, v]) => '+' + v + ' ' + (D.materials[k]?.label || k))
    .join(', ');
  log(s, `You ${O.verb} the ${def.name}. (${text})`);
  if (O.relicKp) findRelic(s, 'lm' + lm.id, O.relicKp);
}

/** A sign points toward the nearest landmark not yet discovered. */
function readSign(s, lm) {
  const world = worldOf(s);
  let best = null;
  let bestD = Infinity;
  for (const o of world.landmarks) {
    if (o === lm || isFound(s, o) || D.landmarks[o.type].sign) continue;
    const d = dist(lm, o);
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  if (!best) {
    log(s, 'The old sign points every way at once. You have found everything it knows.');
    return null;
  }
  const ang = Math.atan2(best.y - lm.y, best.x - lm.x);
  const dir = COMPASS[(Math.round(ang / (Math.PI / 4)) + 8) % 8];
  const tiles = bestD / world.ts;
  const far = tiles < 25 ? 'not far' : tiles < 60 ? 'some way off' : 'a long walk';
  log(s, `The weathered sign points ${dir}. Something undiscovered lies that way, ${far}.`);
  return { dir, target: best };
}
