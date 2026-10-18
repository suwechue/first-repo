// ============================================================================
// ASSETS — loads every file listed in config's SPRITE_MANIFEST/ICON_MANIFEST.
//
// This is the whole trick that makes the game "modular for your own art":
// every entry is attempted independently, and a missing/404 file just marks
// that key as "missing" instead of throwing an error. render.js and ui.js
// check Game.assets.ready(key) before drawing an image, and fall back to
// the built-in procedural placeholder art if it's not there.
//
// Practically: drop a PNG at the exact path listed in config.js's manifests,
// reload the page, and it's in the game. No other file needs to change.
// ============================================================================

window.Game = window.Game || {};

Game.assets = (function(){
  const images = {};
  const status = {}; // key -> 'pending' | 'loaded' | 'missing'

  function loadAll(manifest, onDone){
    const keys = Object.keys(manifest);
    let remaining = keys.length;
    if(remaining === 0){ onDone(); return; }

    keys.forEach(key => {
      status[key] = 'pending';
      const img = new Image();
      img.onload = () => {
        status[key] = 'loaded';
        images[key] = img;
        remaining--;
        if(remaining === 0) onDone();
      };
      img.onerror = () => {
        status[key] = 'missing'; // expected/normal until you add your own art
        remaining--;
        if(remaining === 0) onDone();
      };
      img.src = manifest[key];
    });
  }

  function ready(key){ return status[key] === 'loaded'; }
  function get(key){ return images[key]; }
  function statusOf(key){ return status[key] || 'unknown'; }

  return { loadAll, ready, get, statusOf };
})();
