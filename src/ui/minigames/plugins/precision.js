// PRECISION: click (or press Space) as the sweeping marker crosses the zone, 5 passes.
// Force or Motion leads; knapping and fitting.

export default {
  key: 'precision',
  label: 'Precision Strike',
  vectorHint: ['force', 'motion'],

  run(ctx) {
    ctx.instructionsEl.textContent =
      'Click (or press Space) when the marker crosses the glowing zone. 5 passes.';
    const c = ctx.ctx2d;
    const W = ctx.width;
    const H = ctx.height;
    const passes = 5;
    const zoneWidth = Math.max(30, 110 - ctx.difficulty * 8);
    const speed = 2.2 + ctx.difficulty * 0.35;
    const zoneCenter = 120 + ctx.rand() * (W - 240);
    let x = 20;
    let dir = 1;
    let pass = 0;
    const scores = [];
    let running = true;

    function attempt() {
      if (!running) return;
      scores.push(Math.max(0, 1 - Math.abs(x - zoneCenter) / (zoneWidth / 2)));
      pass++;
      x = 20;
      dir = 1;
      ctx.progressEl.style.width = (pass / passes) * 100 + '%';
      if (pass >= passes) {
        stop();
        ctx.finish(scores.reduce((a, b) => a + b, 0) / scores.length);
      }
    }
    const onClick = () => attempt();
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        attempt();
      }
    };
    function stop() {
      running = false;
      ctx.canvas.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKey);
    }
    ctx.canvas.addEventListener('click', onClick);
    window.addEventListener('keydown', onKey);

    function frame() {
      if (!running) return;
      x += speed * dir;
      if (x > W - 20) [x, dir] = [W - 20, -1];
      if (x < 20) [x, dir] = [20, 1];
      c.fillStyle = '#1c1712';
      c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(76,93,58,0.3)';
      c.fillRect(zoneCenter - zoneWidth / 2, 100, zoneWidth, 100);
      c.strokeStyle = '#8fd18f';
      c.strokeRect(zoneCenter - zoneWidth / 2, 100, zoneWidth, 100);
      c.fillStyle = '#e6934a';
      c.fillRect(x - 4, 60, 8, 180);
      c.fillStyle = '#f0e6c8';
      c.font = '12px Georgia';
      c.fillText(`Pass ${Math.min(passes, pass + 1)} / ${passes}`, 10, 20);
      ctx.schedule(frame);
    }
    ctx.schedule(frame);
    return stop;
  },
};
