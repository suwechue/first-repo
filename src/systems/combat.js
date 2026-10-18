// Direct-control overworld combat: the player against roaming enemies.
// This is the simple immediate model; squads use the mission math in missions.js.
import { D } from '../core/content.js';
import { rand } from '../core/rng.js';
import { dist } from '../core/geometry.js';
import { give } from './inventory.js';
import { log, changed } from './log.js';

function randomSpawnPoint() {
  const A = D.game.spawnArea;
  const W = D.game.canvas.w;
  const H = D.game.canvas.h;
  return {
    x: A.left + rand() * (W - A.left - A.right),
    y: A.top + rand() * (H - A.top - A.bottom),
  };
}

/** Spawns an overworld enemy at a random spot at least `minDistance` from the player. */
export function spawnEnemy(s, type, minDistance, tries) {
  const O = D.enemies[type].overworld;
  let p;
  let ok = false;
  let t = 0;
  while (!ok && t < tries) {
    t++;
    p = randomSpawnPoint();
    if (dist(p, s.player) > minDistance) ok = true;
  }
  s.enemies.push({
    id: type + '_' + Math.floor(rand() * 99999),
    type,
    x: p.x,
    y: p.y,
    hp: O.hp,
    maxHp: O.hp,
    dmg: O.dmg,
    speed: O.speed,
    state: 'wander',
    wanderTarget: { x: p.x, y: p.y },
    attackCooldown: 0,
  });
}

function enemyName(e) {
  return D.enemies[e.type].name;
}

export function attackEnemy(s, enemy) {
  const A = D.game.player.attackSpread;
  const dmg = Math.max(1, Math.round(s.player.weaponDmg * (A.min + rand() * A.range)));
  enemy.hp -= dmg;
  log(s, `You hit the ${enemyName(enemy)} for ${dmg}.`);
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
  for (const e of s.enemies) {
    const O = D.enemies[e.type].overworld;
    if (e.attackCooldown > 0) e.attackCooldown--;
    const dToPlayer = dist(e, s.player);
    if (dToPlayer < O.aggro) e.state = 'aggro';

    if (e.state === 'aggro') {
      const dx = s.player.x - e.x;
      const dy = s.player.y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      if (dToPlayer > O.attackRange) {
        e.x += (dx / len) * e.speed;
        e.y += (dy / len) * e.speed;
      } else if (e.attackCooldown <= 0) {
        s.player.hp = Math.max(0, s.player.hp - e.dmg);
        e.attackCooldown = O.attackCooldown;
        log(s, `The ${enemyName(e)} bites you for ${e.dmg}!`);
        changed('vitals');
      }
    } else {
      const dx = e.wanderTarget.x - e.x;
      const dy = e.wanderTarget.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) {
        e.wanderTarget = randomSpawnPoint();
      } else {
        e.x += (dx / d) * O.wanderSpeed;
        e.y += (dy / d) * O.wanderSpeed;
      }
    }
  }
}
