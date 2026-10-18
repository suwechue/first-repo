// The player avatar: movement, hunger and eating, and fainting.
import { D } from '../core/content.js';
import { log, changed } from './log.js';

/** Moves the player from the held direction keys: { up, down, left, right }. */
export function updatePlayer(s, input) {
  let dx = 0;
  let dy = 0;
  if (input.up) dy -= 1;
  if (input.down) dy += 1;
  if (input.left) dx -= 1;
  if (input.right) dx += 1;
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    const A = D.game.playArea;
    const speed = D.game.player.speed;
    s.player.facing = { x: dx, y: dy };
    s.player.x = Math.max(A.minX, Math.min(D.game.canvas.w - A.marginRight, s.player.x + dx * speed));
    s.player.y = Math.max(A.minY, Math.min(D.game.canvas.h - A.marginBottom, s.player.y + dy * speed));
  }
  if (s.gatherCooldown > 0) s.gatherCooldown--;
}

/** Eats the best food available when hunger is low. */
export function autoEat(s) {
  const H = D.game.hunger;
  if (s.player.hunger >= H.eatBelow) return;
  for (const f of H.foods) {
    if (s.player.inventory[f.item] > 0) {
      s.player.inventory[f.item]--;
      s.player.hunger = Math.min(s.player.maxHunger, s.player.hunger + f.restore);
      log(s, f.log);
      changed('inventory');
      changed('vitals');
      return;
    }
  }
}

export function hungerTick(s) {
  const H = D.game.hunger;
  s.player.hunger = Math.max(0, s.player.hunger - H.loss);
  if (s.player.hunger <= 0) s.player.hp = Math.max(0, s.player.hp - H.starveDamage);
  changed('vitals');
}

/** At zero health the player wakes at camp at half health. Nothing is lost. */
export function checkFaint(s) {
  const p = s.player;
  if (p.hp > 0) return;
  const F = D.game.faint;
  p.hp = Math.ceil(p.maxHp * F.hpFraction);
  p.hunger = Math.max(p.hunger, F.minHunger);
  p.x = D.game.canvas.w / 2;
  p.y = D.game.canvas.h / 2;
  s.enemies = [];
  log(s, 'You collapse and wake at camp, shaky but alive.');
  changed('vitals');
}
