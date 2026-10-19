// Overworld combat: the player against roaming enemies, in real time. Light, heavy and ranged
// attacks and a dodge, paid for with stamina; enemies wind up before they strike.
// Rules: docs/SPEC.md, Systems reference, Overworld combat (M15). Squads use missions.js instead.
import { D } from '../core/content.js';
import { rand } from '../core/rng.js';
import { dist } from '../core/geometry.js';
import { worldOf, randomReachableNear, tileOf, isSolidTile } from '../world/world.js';
import { moveCircle } from '../world/collision.js';
import { buildingTiles } from './building.js';
import { give } from './inventory.js';
import { playerDamage, damageToPlayer, playerEffect, itemStat } from './gear.js';
import { log, changed, cue } from './log.js';

const E = D.game.enemies;
const K = D.game.combat;

/** Adds an enemy of `type` at (x, y). */
export function addEnemy(s, type, x, y, extra = {}) {
  const O = D.enemies[type].overworld;
  const e = {
    id: type + '_' + Math.floor(rand() * 99999),
    type,
    x,
    y,
    hp: O.hp,
    maxHp: O.hp,
    dmg: O.dmg,
    speed: O.speed,
    state: 'wander',
    wanderTarget: { x, y },
    attackCooldown: 0,
    windup: 0,
    stun: 0,
    ...extra,
  };
  s.enemies.push(e);
  return e;
}

/** Spawns an enemy on a reachable tile between `minDistance` and the spawn radius from the player. */
export function spawnEnemy(s, type, minDistance, tries) {
  const p = randomReachableNear(worldOf(s), s.player.x, s.player.y, minDistance, E.spawnRadius, rand, tries);
  return p ? addEnemy(s, type, p.x, p.y) : null;
}

function enemyName(e) {
  return D.enemies[e.type].name;
}

// ---------------- the player's weapon and stamina ----------------
/** The weapon type the player fights with: their weapon's, or bare fists. */
export function weaponType(s) {
  const w = s.player.gear?.weapon;
  const key = (w && D.items[w.base].weaponType) || K.unarmedType;
  return { key, ...D.gear.weaponTypes[key] };
}

/** Spends stamina if there is enough. Returns false, spending nothing, if not. */
export function spendStamina(s, n) {
  const p = s.player;
  if (p.stamina < n) return false;
  p.stamina -= n;
  p.staminaRest = 0;
  changed('vitals');
  return true;
}

/** Whether the player is in a dodge's untouchable frames. */
export function invulnerable(s) {
  const d = s.player.dodge;
  return !!d && d.t < K.dodge.iframes;
}

function rollDamage(base) {
  const A = D.game.player.attackSpread;
  return Math.max(1, Math.round(base * (A.min + rand() * A.range)));
}

/** Deals `dmg` to an enemy; on a kill, pays its drops and removes it. */
export function hurtEnemy(s, e, dmg, how = 'hit') {
  e.hp -= dmg;
  e.state = 'aggro';
  log(s, `You ${how} the ${enemyName(e)} for ${dmg}.`);
  cue('hit');
  if (e.hp > 0) return false;
  const drops = D.enemies[e.type].overworld.drops;
  const text = Object.entries(drops)
    .map(([k, v]) => '+' + v + ' ' + k)
    .join(', ');
  log(s, `The ${enemyName(e)} falls. (${text})`);
  give(s, drops);
  s.enemies = s.enemies.filter((x) => x !== e);
  return true;
}

/** Enemies inside a swing: within `reach` of the player and `arc` degrees of the aim. */
export function enemiesInSwing(s, aim, reach, arc) {
  const half = ((arc / 2) * Math.PI) / 180;
  const a0 = Math.atan2(aim.y, aim.x);
  return s.enemies.filter((e) => {
    const dx = e.x - s.player.x;
    const dy = e.y - s.player.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + E.radius) return false;
    if (d < E.radius) return true; // on top of the player
    let diff = Math.abs(Math.atan2(dy, dx) - a0);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    return diff <= half;
  });
}

function aimAt(s, target) {
  if (target) {
    const dx = target.x - s.player.x;
    const dy = target.y - s.player.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }
  return { ...s.player.facing };
}

/**
 * A light attack toward `target` (a point or an enemy; null aims where the player faces).
 * Returns the enemies hit, or null if it could not be made (cooldown, stamina).
 */
export function lightAttack(s, target = null) {
  if (s.gatherCooldown > 0 || s.player.dodge) return null;
  if (!spendStamina(s, K.light.stamina)) return null;
  const W = weaponType(s);
  const aim = aimAt(s, target);
  s.player.facing = aim;
  const hit = enemiesInSwing(s, aim, W.reach, W.arc);
  for (const e of hit) {
    knockback(s, e, aim, W.knockback || 0);
    hurtEnemy(s, e, rollDamage(playerDamage(s)));
  }
  s.player.swing = { t: 0, aim, reach: W.reach, arc: W.arc, heavy: false };
  s.gatherCooldown = W.cooldown;
  return hit;
}

/** The old E-key attack on one enemy: a light attack aimed at it. */
export function attackEnemy(s, enemy) {
  return lightAttack(s, enemy);
}

export function startCharge(s) {
  if (s.player.dodge || s.gatherCooldown > 0) return false;
  s.player.charge = 0;
  return true;
}

/** Releases a charged heavy attack. Under the minimum charge it is a light attack instead. */
export function releaseHeavy(s, target = null) {
  const charge = s.player.charge;
  s.player.charge = null;
  if (charge === null || charge === undefined) return null;
  if (charge < K.heavy.minCharge) {
    s.gatherCooldown = 0;
    return lightAttack(s, target);
  }
  if (!spendStamina(s, K.heavy.stamina)) return null;
  const W = weaponType(s);
  const f = Math.min(1, (charge - K.heavy.minCharge) / (K.heavy.chargeFrames - K.heavy.minCharge));
  const mul = K.heavy.mul[0] + (K.heavy.mul[1] - K.heavy.mul[0]) * f;
  const aim = aimAt(s, target);
  s.player.facing = aim;
  const arc = W.arc + K.heavy.extraArc;
  const hit = enemiesInSwing(s, aim, W.reach, arc);
  for (const e of hit) {
    knockback(s, e, aim, (W.knockback || 0) * K.heavy.knockbackMul + K.heavy.knockbackBase);
    e.stun = K.heavy.stun;
    e.windup = 0;
    hurtEnemy(s, e, rollDamage(playerDamage(s) * mul), 'smash');
  }
  s.player.swing = { t: 0, aim, reach: W.reach, arc, heavy: true };
  s.gatherCooldown = W.cooldown + K.heavy.recovery;
  return hit;
}

function knockback(s, e, aim, px) {
  if (!px) return;
  moveCircle(worldOf(s), e, aim.x * px, aim.y * px, E.radius, buildingTiles(s).solid);
}

/** The nearest enemy within `range` of the player, or null. */
function nearestEnemyWithin(s, range) {
  let best = null;
  let bd = range;
  for (const e of s.enemies) {
    const d = dist(e, s.player);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** Throws a stone, or fires a sling, at the nearest enemy in range. Returns the projectile or null. */
export function fireRanged(s) {
  const R = K.ranged;
  if (s.gatherCooldown > 0 || s.player.dodge) return null;
  const W = weaponType(s);
  const sling = !!W.ranged;
  const range = sling ? W.ranged.range : R.range;
  const target = nearestEnemyWithin(s, range);
  if (!target) {
    log(s, 'Nothing in range to shoot at.');
    return null;
  }
  if (!(s.player.inventory[R.ammo] > 0)) {
    log(s, `You need ${D.materials[R.ammo].label.toLowerCase()} to throw.`);
    return null;
  }
  if (!spendStamina(s, R.stamina)) return null;
  s.player.inventory[R.ammo]--;
  changed('inventory');
  const aim = aimAt(s, target);
  s.player.facing = aim;
  const dmg = sling ? itemStat(s.player.gear.weapon, 'dmg') : R.dmg;
  const p = {
    x: s.player.x,
    y: s.player.y,
    vx: aim.x * R.speed,
    vy: aim.y * R.speed,
    dmg,
    left: range,
  };
  s.projectiles.push(p);
  s.gatherCooldown = R.cooldown;
  return p;
}

/** Starts a dodge in direction `dir` (or the facing). Returns false if it cannot. */
export function dodge(s, dir = null) {
  const p = s.player;
  if (p.dodge || p.dodgeCooldown > 0) return false;
  if (!spendStamina(s, K.dodge.stamina)) return false;
  const d = dir && (dir.x || dir.y) ? dir : p.facing;
  const len = Math.hypot(d.x, d.y) || 1;
  p.dodge = { t: 0, x: d.x / len, y: d.y / len };
  p.charge = null;
  return true;
}

/** Per frame: stamina, charge, dodge movement, swing animation and projectiles. */
export function updatePlayerCombat(s) {
  const p = s.player;
  const S = K.stamina;
  p.staminaRest = (p.staminaRest || 0) + 1;
  if (p.staminaRest > S.regenDelay && p.stamina < p.maxStamina) {
    p.stamina = Math.min(p.maxStamina, p.stamina + S.regen);
    if (s.frame % 10 === 0) changed('vitals');
  }
  if (p.charge !== null && p.charge !== undefined) p.charge++;
  if (p.dodgeCooldown > 0) p.dodgeCooldown--;
  if (p.dodge) {
    const step = K.dodge.distance / K.dodge.frames;
    moveCircle(
      worldOf(s),
      p,
      p.dodge.x * step,
      p.dodge.y * step,
      D.game.player.radius,
      buildingTiles(s).solid,
    );
    p.dodge.t++;
    if (p.dodge.t >= K.dodge.frames) {
      p.dodge = null;
      p.dodgeCooldown = K.dodge.cooldown;
    }
  }
  if (p.swing && ++p.swing.t > K.swingFrames) p.swing = null;
  updateProjectiles(s);
}

function updateProjectiles(s) {
  const world = worldOf(s);
  for (const pr of s.projectiles) {
    pr.x += pr.vx;
    pr.y += pr.vy;
    pr.left -= Math.hypot(pr.vx, pr.vy);
    if (isSolidTile(world, tileOf(world, pr.x), tileOf(world, pr.y))) pr.left = 0;
    const hit = s.enemies.find((e) => dist(e, pr) < E.radius + 4);
    if (hit) {
      hurtEnemy(s, hit, rollDamage(pr.dmg), 'strike');
      pr.left = 0;
    }
  }
  s.projectiles = s.projectiles.filter((pr) => pr.left > 0);
}

// ---------------- enemies ----------------
function strike(s, e, O) {
  if (dist(e, s.player) > O.attackRange + K.reachSlack || invulnerable(s)) {
    log(s, `The ${enemyName(e)} lunges and misses.`);
    return;
  }
  if (rand() < playerEffect(s, 'blockChance')) {
    log(s, `You block the ${enemyName(e)}'s attack.`);
    cue('hit');
    return;
  }
  const dmg = damageToPlayer(s, e.dmg);
  s.player.hp = Math.max(0, s.player.hp - dmg);
  log(s, `The ${enemyName(e)} bites you for ${dmg}!`);
  cue('hurt');
  changed('vitals');
}

export function updateEnemies(s) {
  const world = worldOf(s);
  const walls = buildingTiles(s).solid;
  for (const e of s.enemies.slice()) {
    const O = D.enemies[e.type].overworld;
    if (e.attackCooldown > 0) e.attackCooldown--;
    if (e.stun > 0) {
      e.stun--;
      continue;
    }
    // A wind-up runs to the end, then the strike lands or misses.
    if (e.windup > 0) {
      e.windup--;
      if (e.windup === 0) {
        strike(s, e, O);
        e.attackCooldown = O.attackCooldown;
      }
      continue;
    }
    const dToPlayer = dist(e, s.player);
    if (dToPlayer < O.aggro) e.state = 'aggro';
    else if (e.state === 'aggro' && O.leash && dToPlayer > O.leash) e.state = 'wander';

    if (e.state === 'aggro') {
      const dx = s.player.x - e.x;
      const dy = s.player.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      if (dToPlayer > O.attackRange) {
        moveCircle(world, e, (dx / len) * e.speed, (dy / len) * e.speed, E.radius, walls);
      } else if (e.attackCooldown <= 0) {
        e.windup = O.windup; // the telegraph: the player sees it coming
      }
    } else {
      const dx = e.wanderTarget.x - e.x;
      const dy = e.wanderTarget.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 4 || e.stuck > E.stuckFrames) {
        e.stuck = 0;
        e.wanderTarget = randomReachableNear(world, e.x, e.y, E.wander[0], E.wander[1], rand, 10) || {
          x: e.x,
          y: e.y,
        };
      } else {
        const bx = e.x;
        const by = e.y;
        moveCircle(world, e, (dx / d) * O.wanderSpeed, (dy / d) * O.wanderSpeed, E.radius, walls);
        e.stuck = bx === e.x && by === e.y ? (e.stuck || 0) + 1 : 0;
      }
    }
  }
}
