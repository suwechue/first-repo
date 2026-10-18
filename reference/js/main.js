// ============================================================================
// MAIN — input wiring, the render/update loop, and startup sequence.
// This is the last file loaded; everything it calls (Game.world, Game.ui,
// Game.render, Game.assets) already exists by the time this runs.
// ============================================================================

(function(){
  "use strict";

  const state = Game.state;
  const canvas = Game.render.canvas;

  // ---- Input ----
  window.addEventListener('keydown', e => {
    state.keys[e.key.toLowerCase()] = true;
    if(e.key === 'Escape'){ Game.world.exitPlacing(); Game.ui.closeModal(); }
    if(e.key.toLowerCase() === 'e') Game.world.handleInteract();
  });
  window.addEventListener('keyup', e => { state.keys[e.key.toLowerCase()] = false; });

  let mousePos = null;
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mousePos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  });
  canvas.addEventListener('click', e => {
    if(state.mode === 'PLACING'){
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      Game.world.tryPlaceBuilding(x, y);
    }
  });

  // ---- Loop ----
  let autosaveTimer = 0;
  function loop(){
    Game.world.update();
    if(++autosaveTimer >= 900){ autosaveTimer = 0; Game.save.store(); }
    Game.render.draw(mousePos);
    requestAnimationFrame(loop);
  }

  // ---- Init ----
  function start(){
    const resumed = Game.save.loadStored();
    if(!resumed) Game.save.newGame();
    Game.ui.initAll();
    if(resumed){
      Game.util.log('Save loaded — welcome back to day ' + state.day + '.');
    } else {
      Game.util.log('You wake at the edge of a clearing. Wood, stone, and berries are within reach.');
      Game.util.log('Something large lies buried to the north-east...');
    }
    window.addEventListener('beforeunload', () => Game.save.store());
    loop();
  }

  const manifest = Object.assign({}, Game.config.SPRITE_MANIFEST, Game.config.ICON_MANIFEST);
  Game.assets.loadAll(manifest, start);
})();
