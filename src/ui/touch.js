// Optional touch controls: a virtual stick for movement and a button for the E key.
// `input` is read by the game loop alongside the keyboard.

const DEAD_ZONE = 0.3;

export function createTouchControls(root, { onInteract }) {
  const input = { up: false, down: false, left: false, right: false };
  const pad = document.createElement('div');
  pad.id = 'touch-pad';
  pad.innerHTML = '<div class="knob"></div>';
  const btn = document.createElement('button');
  btn.id = 'touch-e';
  btn.textContent = 'E';
  root.appendChild(pad);
  root.appendChild(btn);
  const knob = pad.querySelector('.knob');
  let pointer = null;

  function setFrom(e) {
    const r = pad.getBoundingClientRect();
    const radius = r.width / 2 || 1;
    let dx = (e.clientX - (r.left + radius)) / radius;
    let dy = (e.clientY - (r.top + radius)) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    input.left = dx < -DEAD_ZONE;
    input.right = dx > DEAD_ZONE;
    input.up = dy < -DEAD_ZONE;
    input.down = dy > DEAD_ZONE;
    knob.style.transform = `translate(${dx * radius * 0.6}px, ${dy * radius * 0.6}px)`;
  }
  function release() {
    pointer = null;
    input.up = input.down = input.left = input.right = false;
    knob.style.transform = '';
  }
  pad.addEventListener('pointerdown', (e) => {
    pointer = e.pointerId;
    pad.setPointerCapture?.(e.pointerId);
    setFrom(e);
    e.preventDefault();
  });
  pad.addEventListener('pointermove', (e) => e.pointerId === pointer && setFrom(e));
  pad.addEventListener('pointerup', release);
  pad.addEventListener('pointercancel', release);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    onInteract();
  });

  return {
    input,
    /** Shows or hides the controls. */
    show(on) {
      pad.style.display = on ? '' : 'none';
      btn.style.display = on ? '' : 'none';
      if (!on) release();
    },
  };
}

/** True on a device whose main pointer is a finger. */
export function prefersTouch() {
  return !!globalThis.matchMedia?.('(pointer: coarse)').matches;
}
