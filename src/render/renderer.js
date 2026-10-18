// Canvas drawing for the open world. Reads state; never changes it.
// Ground comes from cached tile chunks; objects inside the view are sorted by their anchor Y so a
// character walks behind a tree and in front of a wall. Every object tries its manifest sprite
// first and falls back to a placeholder shape.
// `view` carries derived facts the caller computes from the systems: nexusStage, nexusPrompt, target.
import { D } from '../core/content.js';
import { worldOf } from '../world/world.js';
import { drawPlaceholder } from './placeholders.js';
import { drawSprite, dirIndex } from './sprites.js';
import { createTilemap } from './tilemap.js';
import { createCamera, resizeCamera, setZoom, followCamera, snapCamera, screenToWorld } from './camera.js';

export function createRenderer(canvas, assets) {
  const ctx = canvas.getContext('2d');
  const cam = createCamera(D.world.camera);
  const tiles = createTilemap(assets);
  const lastPos = new Map(); // id -> {x, y}, to tell walking from standing
  let now = 0;
  let lastTime = null;

  /** True if `obj` moved since the last frame drawn. */
  function moved(id, obj) {
    const p = lastPos.get(id);
    lastPos.set(id, { x: obj.x, y: obj.y });
    return !!p && (Math.abs(p.x - obj.x) > 0.01 || Math.abs(p.y - obj.y) > 0.01);
  }

  function shadow(x, y, rx) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, rx * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The sprite if its art is loaded, else a shadow and the placeholder shape. */
  function drawThing(key, def, obj, opts) {
    if (drawSprite(ctx, assets, key, obj.x, obj.y, { time: now, ...opts })) return;
    shadow(obj.x, obj.y + 2, 10);
    drawPlaceholder(ctx, def, obj, obj.x, obj.y);
  }

  function label(text, x, y, color = '#f0e6c8') {
    ctx.save();
    ctx.font = '10px Georgia';
    ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - w / 2, y - 11, w, 15);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawNode(s, node) {
    const def = D.resources[node.type];
    const st = s.nodes[node.id];
    if (st && st.amount <= 0) {
      // Depleted: the sprite's second frame, else a stump where something blocking stood.
      if (drawSprite(ctx, assets, def.sprite, node.x, node.y, { anim: 'depleted' })) return;
      if (def.blocks) {
        ctx.fillStyle = def.trunk || '#4d4a44';
        ctx.beginPath();
        ctx.ellipse(node.x, node.y - 2, 6, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    drawThing(def.sprite, def, node, { anim: 'full' });
  }

  function drawNexus(s, view) {
    const N = D.nexus;
    const { x, y } = worldOf(s).nexus;
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
  }

  function drawBuilding(b) {
    const def = D.buildings[b.type];
    drawThing(def.sprite, def, b);
  }

  function drawEnemy(e, player) {
    const def = D.enemies[e.type];
    const O = def.overworld;
    const toPlayer = { x: player.x - e.x, y: player.y - e.y };
    const toTarget = e.wanderTarget && { x: e.wanderTarget.x - e.x, y: e.wanderTarget.y - e.y };
    const attacking = e.attackCooldown > O.attackCooldown - 15;
    const walking = moved(e.id, e);
    drawThing(def.sprite, def, e, {
      anim: attacking ? 'attack' : walking ? 'walk' : 'idle',
      dir: dirIndex(e.state === 'aggro' ? toPlayer : toTarget),
    });
    ctx.fillStyle = '#222';
    ctx.fillRect(e.x - 12, e.y - 20, 24, 4);
    ctx.fillStyle = '#c94f4f';
    ctx.fillRect(e.x - 12, e.y - 20, 24 * (e.hp / e.maxHp), 4);
  }

  function drawPlayer(s, view) {
    const p = s.player;
    const walking = moved('player', p);
    const attacking = s.gatherCooldown > 0 && view.enemy;
    const anim = attacking ? 'attack' : walking ? 'walk' : 'idle';
    if (drawSprite(ctx, assets, 'player', p.x, p.y + 10, { anim, dir: dirIndex(p.facing), time: now }))
      return;
    shadow(p.x, p.y + 8, 9);
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
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(target.x, target.y - 4, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    if (view.targetLabel) label(view.targetLabel, target.x, target.y - 34, enemy ? '#ffb3a8' : '#f0e6c8');
  }

  function drawPlacingGhost(s, mouseWorld) {
    if (s.mode !== 'PLACING' || !mouseWorld) return;
    const def = D.buildings[s.placingBuilding];
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.translate(mouseWorld.x, mouseWorld.y);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Every object inside the view (plus a margin for tall sprites), sorted by anchor Y. */
  function drawObjects(s, view, world) {
    const ts = world.ts;
    const x0 = cam.x - ts * 2;
    const x1 = cam.x + cam.viewW + ts * 2;
    const y0 = cam.y - ts * 2;
    const y1 = cam.y + cam.viewH + ts * 4; // tall trees below the view still reach up into it
    const inView = (o) => o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1;
    const list = [];
    const tx0 = Math.max(0, Math.floor(x0 / ts));
    const tx1 = Math.min(world.w - 1, Math.floor(x1 / ts));
    const ty0 = Math.max(0, Math.floor(y0 / ts));
    const ty1 = Math.min(world.h - 1, Math.floor(y1 / ts));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const n = world.nodeAt[ty * world.w + tx];
        if (n >= 0) list.push({ y: world.nodes[n].y, draw: () => drawNode(s, world.nodes[n]) });
      }
    }
    if (inView(world.nexus)) list.push({ y: world.nexus.y, draw: () => drawNexus(s, view) });
    for (const b of s.buildings) if (inView(b)) list.push({ y: b.y, draw: () => drawBuilding(b) });
    for (const e of s.enemies) if (inView(e)) list.push({ y: e.y, draw: () => drawEnemy(e, s.player) });
    list.push({ y: s.player.y, draw: () => drawPlayer(s, view) });
    list.sort((a, b) => a.y - b.y);
    for (const o of list) o.draw();
  }

  return {
    camera: cam,
    /** Fits the canvas to the window: the drawing buffer matches the screen pixels. */
    resize(w, h) {
      canvas.width = Math.max(1, Math.floor(w));
      canvas.height = Math.max(1, Math.floor(h));
      resizeCamera(cam, canvas.width, canvas.height);
    },
    zoomBy(step) {
      setZoom(cam, cam.zoom + step);
    },
    setZoom(z) {
      setZoom(cam, z);
    },
    snap() {
      snapCamera(cam);
    },
    /** Canvas pixel position -> world position. */
    toWorld(p) {
      return screenToWorld(cam, p.x, p.y);
    },
    draw(s, view, mouse, time) {
      const world = worldOf(s);
      now = time;
      followCamera(
        cam,
        s.player,
        world.w * world.ts,
        world.h * world.ts,
        lastTime === null ? 0 : time - lastTime,
      );
      lastTime = time;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#16121e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Whole screen pixels for the offset, so tiles never shimmer between frames.
      ctx.setTransform(
        cam.zoom,
        0,
        0,
        cam.zoom,
        -Math.round(cam.x * cam.zoom),
        -Math.round(cam.y * cam.zoom),
      );

      tiles.draw(ctx, world, cam);
      drawObjects(s, view, world);
      drawTargetHint(s, view);
      if (view.nexusPrompt) label(view.nexusPrompt, world.nexus.x, world.nexus.y - 52);
      drawPlacingGhost(s, mouse && screenToWorld(cam, mouse.x, mouse.y));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
  };
}
