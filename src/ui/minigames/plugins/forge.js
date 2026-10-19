// FORGE: rhythm hammering. Bars travel to the anvil line; press Space (or click) as each arrives.
// Heat or Cold leads on a weapon or armor; the default for weapons.

export default {
  key: 'forge',
  label: 'Forge Rhythm',
  vectorHint: ['heat', 'force'],

  run(ctx) {
    ctx.instructionsEl.textContent = 'Press Space (or click) as each glowing bar reaches the anvil line.';
    const c = ctx.ctx2d;
    const W = ctx.width;
    const H = ctx.height;
    const HIT_X = 140;
    const SPAWN_X = W - 20;
    const count = Math.min(14, 6 + ctx.difficulty);
    const interval = Math.max(380, 950 - ctx.difficulty * 55);
    const travel = Math.max(600, 1400 - ctx.difficulty * 60);
    const tolerance = Math.max(90, 220 - ctx.difficulty * 12);
    const beats = Array.from({ length: count }, (_, i) => ({
      time: 900 + i * interval + (ctx.rand() - 0.5) * interval * 0.2,
      judged: false,
      acc: 0,
      flash: 0,
    }));
    const total = beats.at(-1).time + tolerance + 400;
    const start = ctx.now();
    let running = true;

    function hit() {
      if (!running) return;
      const now = ctx.now() - start;
      let best = null;
      let bestDiff = Infinity;
      for (const b of beats) {
        const d = Math.abs(now - b.time);
        if (!b.judged && d < bestDiff) [best, bestDiff] = [b, d];
      }
      if (best && bestDiff <= tolerance * 2.2) {
        best.judged = true;
        best.acc = Math.max(0, 1 - bestDiff / tolerance);
        best.flash = 12;
      }
    }
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        hit();
      }
    };
    const onClick = () => hit();
    function stop() {
      running = false;
      window.removeEventListener('keydown', onKey);
      ctx.canvas.removeEventListener('click', onClick);
    }
    window.addEventListener('keydown', onKey);
    ctx.canvas.addEventListener('click', onClick);

    function frame() {
      if (!running) return;
      const now = ctx.now() - start;
      ctx.progressEl.style.width = Math.min(100, (now / total) * 100) + '%';
      for (const b of beats) if (!b.judged && now > b.time + tolerance) b.judged = true;
      c.fillStyle = '#221a12';
      c.fillRect(0, 0, W, H);
      c.strokeStyle = '#e6934a';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(HIT_X, 40);
      c.lineTo(HIT_X, 260);
      c.stroke();
      for (const b of beats) {
        const spawn = b.time - travel;
        if (now < spawn - 100 || now > b.time + tolerance + 300) continue;
        const x = SPAWN_X - ((now - spawn) / travel) * (SPAWN_X - HIT_X);
        c.fillStyle = b.judged ? (b.acc > 0.4 ? '#8fd18f' : '#8c5a5a') : '#e6934a';
        c.fillRect(x - 6, 60, 12, 180);
        if (b.flash > 0) {
          c.fillStyle = `rgba(255,255,255,${(b.flash / 12) * 0.6})`;
          c.fillRect(HIT_X - 16, 50, 32, 200);
          b.flash--;
        }
      }
      c.fillStyle = '#f0e6c8';
      c.font = '12px Georgia';
      c.fillText(`Beat ${beats.filter((b) => b.judged).length} / ${count}`, 10, 20);
      if (now >= total) {
        stop();
        ctx.finish(beats.reduce((a, b) => a + b.acc, 0) / beats.length);
        return;
      }
      ctx.schedule(frame);
    }
    ctx.schedule(frame);
    return stop;
  },
};
