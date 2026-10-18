// Fixed-timestep loop: the simulation always advances in 1/60 s frames, whatever the display rate.
// The scheduler and clock are injected, so this module never touches the browser itself.

export const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_TICK = 10; // after a long pause (hidden tab), drop time instead of fast-forwarding

export function createLoop({ update, render, schedule, now }) {
  let acc = 0;
  let last = null;
  let running = false;

  function tick() {
    if (!running) return;
    const t = now();
    if (last === null) last = t - STEP_MS;
    acc += t - last;
    last = t;
    let steps = 0;
    while (acc >= STEP_MS && steps < MAX_STEPS_PER_TICK) {
      update();
      acc -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS_PER_TICK) acc = 0;
    render();
    schedule(tick);
  }

  return {
    start() {
      running = true;
      last = null;
      schedule(tick);
    },
    stop() {
      running = false;
    },
  };
}
