// The camera: follows the player with smoothing and clamps to the map. The view is the screen
// divided by an integer zoom, so pixel art stays crisp. Pure math, no DOM.

export function createCamera({ zoom = 2, minZoom = 1, maxZoom = 3, smoothing = 0.12 } = {}) {
  return {
    x: 0,
    y: 0,
    zoom,
    minZoom,
    maxZoom,
    smoothing,
    screenW: 0,
    screenH: 0,
    viewW: 0,
    viewH: 0,
    snap: true,
  };
}

export function resizeCamera(cam, screenW, screenH) {
  cam.screenW = screenW;
  cam.screenH = screenH;
  cam.viewW = screenW / cam.zoom;
  cam.viewH = screenH / cam.zoom;
}

/** Sets an integer zoom within the limits, keeping the view centered on the same point. */
export function setZoom(cam, zoom) {
  const z = Math.max(cam.minZoom, Math.min(cam.maxZoom, Math.round(zoom)));
  if (z === cam.zoom) return;
  const cx = cam.x + cam.viewW / 2;
  const cy = cam.y + cam.viewH / 2;
  cam.zoom = z;
  resizeCamera(cam, cam.screenW, cam.screenH);
  cam.x = cx - cam.viewW / 2;
  cam.y = cy - cam.viewH / 2;
}

function clampAxis(pos, view, size) {
  if (view >= size) return (size - view) / 2; // the map is smaller than the view: center it
  return Math.max(0, Math.min(size - view, pos));
}

/**
 * Eases toward `target` (frame-rate independent) and clamps to a map of worldW by worldH pixels.
 * Jumps straight there after snapCamera() or when the target is more than a screen away.
 */
export function followCamera(cam, target, worldW, worldH, dtMs = 1000 / 60) {
  const tx = target.x - cam.viewW / 2;
  const ty = target.y - cam.viewH / 2;
  const far = Math.abs(tx - cam.x) > cam.viewW || Math.abs(ty - cam.y) > cam.viewH;
  const k = cam.snap || far ? 1 : 1 - Math.pow(1 - cam.smoothing, Math.max(0, dtMs) / (1000 / 60));
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.x = clampAxis(cam.x, cam.viewW, worldW);
  cam.y = clampAxis(cam.y, cam.viewH, worldH);
  cam.snap = false;
}

/** The next follow jumps straight to the target (new game, load). */
export function snapCamera(cam) {
  cam.snap = true;
}

export function screenToWorld(cam, sx, sy) {
  return { x: cam.x + sx / cam.zoom, y: cam.y + sy / cam.zoom };
}

export function worldToScreen(cam, wx, wy) {
  return { x: (wx - cam.x) * cam.zoom, y: (wy - cam.y) * cam.zoom };
}
