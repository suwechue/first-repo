// Direct-control overworld combat: the player against roaming enemies.
// This is the simple immediate model; squads use the mission math in missions.js.
import { D } from '../core/content.js';
import { rand } from '../core/rng.js';
import { dist } from '../core/geometry.js';
import { worldOf, randomReachableNear } from '../world/world.js';
import { moveCircle } from '../world/collision.js';
import { buildingTiles } from './building.js';
import { give } from './inventory.js';
import { playerDamage, damageToPlayer, playerEffect } from './gear.js';
import { log, changed, cue } from './log.js';

const E = D.game.enemies;

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

export function attackEnemy(s, enemy) {
  const A = D.game.player.attackSpread;
  const dmg = Math.max(1, Math.round(playerDamage(s) * (A.min + rand() * A.range)));
  enemy.hp -= dmg;
  log(s, `You hit the ${enemyName(enemy)} for ${dmg}.`);
  cue('hit');
  if (enemy.hp <= 0) {
    const drops = D.enemies[enemy.type].overworld.drops;
    const text = Object.entries(drops)
      .map(([k, v]) => '+' + v + ' ' + k)
      .join(', ');
    log(s, `The ${enemyName(enemy)} falls. (${text})`);
    give(s, drops);
    s.enemies = s.enemies.filter((e) => e !== enemy);
  } else {
    enemy.state = 'aggro';
  }
}

export function updateEnemies(s) {
  const world = worldOf(s);
  const walls = buildingTiles(s).solid;
  for (const e of s.enemies) {
    const O = D.enemies[e.type].overworld;
    if (e.attackCooldown > 0) e.attackCooldown--;
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
        e.attackCooldown = O.attackCooldown;
        if (rand() < playerEffect(s, 'blockChance')) {
          log(s, `You block the ${enemyName(e)}'s attack.`);
          cue('hit');
        } else {
          const dmg = damageToPlayer(s, e.dmg);
          s.player.hp = Math.max(0, s.player.hp - dmg);
          log(s, `The ${enemyName(e)} bites you for ${dmg}!`);
          cue('hurt');
        }
        changed('vitals');
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
