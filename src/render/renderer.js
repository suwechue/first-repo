// Canvas drawing for the single-screen world. Reads state; never changes it.
// Every object tries its manifest sprite first and falls back to a placeholder shape.
// `view` carries derived facts the caller computes from the systems: nexusStage, nexusPrompt, target.
import { D } from '../core/content.js';
import { drawPlaceholder } from './placeholders.js';
import { drawSprite, dirIndex } from './sprites.js';

export function createRenderer(canvas, assets) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = D.game.canvas.w;
  const H = D.game.canvas.h;
  const lastPos = new Map(); // id -> {x, y}, to tell walking from standing
  let now = 0;

  /** True if `obj` moved since the last frame drawn. */
  function moved(id, obj) {
    const p = lastPos.get(id);
    lastPos.set(id, { x: obj.x, y: obj.y });
    return !!p && (Math.abs(p.x - obj.x) > 0.01 || Math.abs(p.y - obj.y) > 0.01);
  }

  /** The sprite if its art is loaded, else the placeholder shape. */
  function drawThing(key, def, obj, opts) {
    if (!drawSprite(ctx, assets, key, obj.x, obj.y, { time: now, ...opts }))
      drawPlaceholder(ctx, def, obj, obj.x, obj.y);
  }

  function drawGround() {
    ctx.fillStyle = '#3c5a30';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let i = 0; i < 140; i++) ctx.fillRect((i * 53) % W, (i * 97) % H, 2, 2);
  }

  function drawResource(node) {
    const def = D.resources[node.type];
    if (node.amount <= 0) {
      // Depleted: the sprite's second frame if there is art, otherwise hidden until respawn.
      drawSprite(ctx, assets, def.sprite, node.x, node.y, { anim: 'depleted' });
      return;
    }
    drawThing(def.sprite, def, node, { anim: 'full' });
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '9px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(node.amount, node.x, node.y - 22);
    ctx.restore();
  }

  function drawNexus(s, view, now) {
    const N = D.nexus;
    const { x, y } = N.position;
    const stage = view.nexusStage;
    const art = drawSprite(ctx, assets, N.sprites[stage], x, y, { time: now });
    ctx.save();
    ctx.translate(x, y);
    if (art) {
      // drawn from the manifest
    } else if (stage === 'buried') {
      ctx.fillStyle = '#5b4a35';
      ctx.beginPath();
      ctx.ellipse(0, 8, 40, 20, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7a7568';
      ctx.beginPath();
      ctx.moveTo(-14, 4);
      ctx.lineTo(-4, -14);
      ctx.lineTo(12, -6);
      ctx.lineTo(8, 8);
      ctx.closePath();
      ctx.fill();
      const d = s.nexus.dig / N.digSteps;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 40 * (1 - d * 0.5), 20, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const awake = stage === 'awake';
      ctx.strokeStyle = awake ? '#9fd8ff' : '#6d6a63';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = awake ? 'rgba(150,210,255,0.35)' : 'rgba(30,30,40,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      if (awake) {
        ctx.strokeStyle = 'rgba(200,240,255,0.7)';
        ctx.lineWidth = 2;
        const t = now / 600;
        ctx.beginPath();
        ctx.arc(0, 0, 14 + Math.sin(t) * 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
    if (stage === 'excavated') {
      const f = Math.min(1, s.nexus.awareness / N.awarenessNeeded);
      ctx.fillStyle = '#222';
      ctx.fillRect(x - 30, y + 40, 60, 5);
      ctx.fillStyle = '#8f7ad1';
      ctx.fillRect(x - 30, y + 40, 60 * f, 5);
    }
    const prompt = view.nexusPrompt;
    if (prompt) {
      ctx.save();
      ctx.font = '12px Georgia';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const w = ctx.measureText(prompt).width + 12;
      ctx.fillRect(x - w / 2, y - 62, w, 18);
      ctx.fillStyle = '#f0e6c8';
      ctx.fillText(prompt, x, y - 49);
      ctx.restore();
    }
  }

  function drawBuilding(b) {
    const def = D.buildings[b.type];
    drawThing(def.sprite, def, b);
  }

  function drawEnemy(e) {
    const def = D.enemies[e.type];
    const O = def.overworld;
    const toPlayer = { x: lastPlayer.x - e.x, y: lastPlayer.y - e.y };
    const attacking = e.attackCooldown > O.attackCooldown - 15;
    const walking = moved(e.id, e);
    drawThing(def.sprite, def, e, {
      anim: attacking ? 'attack' : walking ? 'walk' : 'idle',
      dir: dirIndex(
        e.state === 'aggro'
          ? toPlayer
          : e.wanderTarget && { x: e.wanderTarget.x - e.x, y: e.wanderTarget.y - e.y },
      ),
    });
    ctx.fillStyle = '#222';
    ctx.fillRect(e.x - 12, e.y - 20, 24, 4);
    ctx.fillStyle = '#c94f4f';
    ctx.fillRect(e.x - 12, e.y - 20, 24 * (e.hp / e.maxHp), 4);
  }

  let lastPlayer = { x: 0, y: 0 };

  function drawPlayer(p, s, view) {
    const walking = moved('player', p);
    const attacking = s.gatherCooldown > 0 && view.enemy;
    const anim = attacking ? 'attack' : walking ? 'walk' : 'idle';
    if (drawSprite(ctx, assets, 'player', p.x, p.y + 10, { anim, dir: dirIndex(p.facing), time: now }))
      return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#c9702e';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3a2716';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#3a2716';
    ctx.beginPath();
    ctx.arc(p.facing.x * 9, p.facing.y * 9, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTargetHint(s, view) {
    if (s.mode !== 'EXPLORE' || !view.target) return;
    const { target, enemy } = view;
    ctx.save();
    ctx.strokeStyle = enemy ? '#c94f4f' : '#f0e6c8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawPlacingGhost(s, mouse) {
    if (s.mode !== 'PLACING' || !mouse) return;
    const def = D.buildings[s.placingBuilding];
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(mouse.x, mouse.y);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return {
    draw(s, view, mouse, time) {
      now = time;
      lastPlayer = s.player;
      drawGround();
      drawNexus(s, view, now);
      for (const b of s.buildings) drawBuilding(b);
      for (const r of s.resources) drawResource(r);
      for (const e of s.enemies) drawEnemy(e);
      drawTargetHint(s, view);
      drawPlayer(s.player, s, view);
      drawPlacingGhost(s, mouse);
    },
  };
}
