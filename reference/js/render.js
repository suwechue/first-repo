// ============================================================================
// RENDER — all canvas drawing. Every draw function checks Game.assets.ready()
// first and draws your PNG if it's there; otherwise it falls back to a
// simple procedural placeholder shape so the game always looks like
// *something*, even with zero art assets in the project.
//
// This is the file to extend if you want animation (spritesheets, frame
// cycling) later — right now each entity draws a single static frame.
// ============================================================================

window.Game = window.Game || {};

Game.render = (function(){
  const cfg = Game.config;
  const state = Game.state;

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // --------------------------------------------------------------------
  // Ground
  // --------------------------------------------------------------------
  function drawGround(){
    if(Game.assets.ready('ground')){
      const img = Game.assets.get('ground');
      // simple tiling fill
      const pattern = ctx.createPattern(img, 'repeat');
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, cfg.CANVAS_W, cfg.CANVAS_H);
      return;
    }
    ctx.fillStyle = '#3c5a30';
    ctx.fillRect(0, 0, cfg.CANVAS_W, cfg.CANVAS_H);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for(let i = 0; i < 140; i++){
      const x = (i * 53) % cfg.CANVAS_W, y = (i * 97) % cfg.CANVAS_H;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // --------------------------------------------------------------------
  // Helper: draw a sprite image centered at (x,y) using config's SPRITE_SIZES
  // --------------------------------------------------------------------
  function drawSprite(key, x, y){
    const img = Game.assets.get(key);
    const size = cfg.SPRITE_SIZES[key] || { w: 24, h: 24 };
    ctx.drawImage(img, x - size.w/2, y - size.h/2, size.w, size.h);
  }

  // --------------------------------------------------------------------
  // Resource nodes
  // --------------------------------------------------------------------
  function drawResource(node){
    const def = cfg.RESOURCE_TYPES[node.type];
    if(node.amount <= 0) return; // depleted, hidden until respawn

    if(Game.assets.ready(node.type)){
      drawSprite(node.type, node.x, node.y);
    } else {
      ctx.save();
      ctx.translate(node.x, node.y);
      if(node.type === 'tree'){
        ctx.fillStyle = def.trunk;
        ctx.fillRect(-3, 4, 6, 12);
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.arc(0, -6, 15, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-8, 2, 10, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(8, 2, 10, 0, Math.PI*2); ctx.fill();
      } else if(node.type === 'rock'){
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(-12,6); ctx.lineTo(-6,-8); ctx.lineTo(4,-10); ctx.lineTo(12,2); ctx.lineTo(6,8); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#4d4a44'; ctx.lineWidth = 1; ctx.stroke();
      } else {
        ctx.fillStyle = def.color;
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = def.berry;
        for(let i = 0; i < 3; i++){
          const ang = node.angle + i * 2.1;
          ctx.beginPath(); ctx.arc(Math.cos(ang)*6, Math.sin(ang)*6, 2.4, 0, Math.PI*2); ctx.fill();
        }
      }
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '9px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText(node.amount, node.x, node.y - 22);
    ctx.restore();
  }

  // --------------------------------------------------------------------
  // The Nexus (buried -> excavated -> awake)
  // --------------------------------------------------------------------
  function drawNexus(){
    const N = cfg.NEXUS, stage = Game.world.nexusStage();
    const key = stage === 'buried' ? 'nexus_buried' : stage === 'excavated' ? 'nexus_excavated' : 'nexus_awake';
    if(Game.assets.ready(key)){
      drawSprite(key, N.x, N.y);
    } else {
      ctx.save();
      ctx.translate(N.x, N.y);
      if(stage === 'buried'){
        ctx.fillStyle = '#5b4a35';
        ctx.beginPath(); ctx.ellipse(0, 8, 40, 20, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#7a7568';
        ctx.beginPath(); ctx.moveTo(-14,4); ctx.lineTo(-4,-14); ctx.lineTo(12,-6); ctx.lineTo(8,8); ctx.closePath(); ctx.fill();
        const d = state.nexus.dig / N.digSteps;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(0, 8, 40 * (1 - d * 0.5), 20, 0, 0, Math.PI*2); ctx.fill();
      } else {
        ctx.strokeStyle = stage === 'awake' ? '#9fd8ff' : '#6d6a63';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = stage === 'awake' ? 'rgba(150,210,255,0.35)' : 'rgba(30,30,40,0.5)';
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI*2); ctx.fill();
        if(stage === 'awake'){
          ctx.strokeStyle = 'rgba(200,240,255,0.7)'; ctx.lineWidth = 2;
          const t = performance.now() / 600;
          ctx.beginPath(); ctx.arc(0, 0, 14 + Math.sin(t) * 4, 0, Math.PI*2); ctx.stroke();
        }
      }
      ctx.restore();
    }
    if(stage === 'excavated'){
      const f = Math.min(1, state.nexus.awareness / N.awarenessNeeded);
      ctx.fillStyle = '#222'; ctx.fillRect(N.x - 30, N.y + 40, 60, 5);
      ctx.fillStyle = '#8f7ad1'; ctx.fillRect(N.x - 30, N.y + 40, 60 * f, 5);
    }
    const prompt = Game.world.nexusPrompt();
    if(prompt){
      ctx.save();
      ctx.font = '12px Georgia'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const w = ctx.measureText(prompt).width + 12;
      ctx.fillRect(N.x - w/2, N.y - 62, w, 18);
      ctx.fillStyle = '#f0e6c8';
      ctx.fillText(prompt, N.x, N.y - 49);
      ctx.restore();
    }
  }

  // --------------------------------------------------------------------
  // Buildings
  // --------------------------------------------------------------------
  function drawBuilding(b){
    if(Game.assets.ready(b.type)){
      drawSprite(b.type, b.x, b.y);
      return;
    }
    ctx.save();
    ctx.translate(b.x, b.y);
    if(b.type === 'campfire'){
      ctx.fillStyle = '#5a3d24';
      ctx.fillRect(-8, 2, 16, 4);
      ctx.fillStyle = '#e6934a';
      ctx.beginPath(); ctx.moveTo(0,-14); ctx.quadraticCurveTo(8,0,0,4); ctx.quadraticCurveTo(-8,0,0,-14); ctx.fill();
      ctx.fillStyle = 'rgba(230,147,74,0.15)';
      ctx.beginPath(); ctx.arc(0, 0, b.radius*2.2, 0, Math.PI*2); ctx.fill();
    } else if(b.type === 'hut'){
      ctx.fillStyle = '#8a5a34';
      ctx.beginPath(); ctx.moveTo(-18,10); ctx.lineTo(0,-16); ctx.lineTo(18,10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5a3d24';
      ctx.fillRect(-16, 8, 32, 10);
    } else if(b.type === 'shrine'){
      ctx.fillStyle = '#6d6a63';
      ctx.fillRect(-10, 4, 20, 8);
      ctx.fillStyle = '#8f7ad1';
      ctx.beginPath(); ctx.moveTo(0,-16); ctx.lineTo(8,4); ctx.lineTo(-8,4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(143,122,209,0.18)';
      ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI*2); ctx.fill();
    } else if(b.type === 'farm_plot'){
      ctx.fillStyle = '#5a4326'; // tilled soil
      ctx.fillRect(-15, -8, 30, 16);
      ctx.strokeStyle = '#3a2c18'; ctx.lineWidth = 1;
      for(let row = -6; row <= 6; row += 4){ ctx.beginPath(); ctx.moveTo(-15,row); ctx.lineTo(15,row); ctx.stroke(); }
      ctx.fillStyle = b.color; // sprouts, uses this building's configured color
      for(let i = -12; i <= 12; i += 6){ ctx.beginPath(); ctx.arc(i, -2, 2, 0, Math.PI*2); ctx.fill(); }
    } else {
      // generic fallback for any future building type with no dedicated
      // drawing branch yet — uses the building's own configured color
      // rather than a hardcoded one, so at least it's not literally invisible
      ctx.fillStyle = b.color || '#5a3d24';
      ctx.fillRect(-3, -14, 6, 26);
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------
  // Enemies
  // --------------------------------------------------------------------
  function drawEnemy(e){
    if(Game.assets.ready('wolf')){
      drawSprite('wolf', e.x, e.y);
    } else {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = e.state === 'aggro' ? '#5a5a5a' : '#787878';
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath(); ctx.moveTo(8,-3); ctx.lineTo(15,-6); ctx.lineTo(9,1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.fillStyle = '#222';
    ctx.fillRect(e.x - 12, e.y - 20, 24, 4);
    ctx.fillStyle = '#c94f4f';
    ctx.fillRect(e.x - 12, e.y - 20, 24 * (e.hp / e.maxHp), 4);
    ctx.restore();
  }

  // --------------------------------------------------------------------
  // Player
  // --------------------------------------------------------------------
  function drawPlayer(){
    const p = state.player;
    if(Game.assets.ready('player')){
      drawSprite('player', p.x, p.y);
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = '#c9702e';
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#3a2716'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#3a2716';
    ctx.beginPath(); ctx.arc(p.facing.x*9, p.facing.y*9, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  // --------------------------------------------------------------------
  // Overlays: gather-range hint ring, building-placement ghost
  // --------------------------------------------------------------------
  function drawGatherRangeHint(){
    if(state.mode !== 'EXPLORE') return;
    const enemy = Game.world.nearestInRange(state.enemies, cfg.GATHER_RANGE);
    const node = enemy ? null : Game.world.nearestInRange(state.resources.filter(r => r.amount > 0), cfg.GATHER_RANGE);
    const target = enemy || node;
    if(target){
      ctx.save();
      ctx.strokeStyle = enemy ? '#c94f4f' : '#f0e6c8';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(target.x, target.y, 20, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlacingGhost(mouse){
    if(state.mode !== 'PLACING' || !mouse) return;
    const def = cfg.BUILDINGS[state.placingBuilding];
    ctx.save();
    ctx.globalAlpha = 0.5;
    if(Game.assets.ready(state.placingBuilding)){
      drawSprite(state.placingBuilding, mouse.x, mouse.y);
    } else {
      ctx.translate(mouse.x, mouse.y);
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  // --------------------------------------------------------------------
  // Main draw
  // --------------------------------------------------------------------
  function draw(mousePos){
    drawGround();
    drawNexus();
    for(const b of state.buildings) drawBuilding(b);
    for(const r of state.resources) drawResource(r);
    for(const e of state.enemies) drawEnemy(e);
    drawGatherRangeHint();
    drawPlayer();
    drawPlacingGhost(mousePos);
  }

  return { draw, canvas, ctx };
})();
