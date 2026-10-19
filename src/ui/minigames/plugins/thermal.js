// THERMAL: keep the marker inside a drifting band. Heat or Cold leads; curing hides.
// The simplest plugin; copy this one to write your own (see ../registry.js for the ctx contract).

export default {
  key: 'thermal',
  label: 'Thermal Balance',
  vectorHint: ['heat', 'cold'],

  run(ctx) {
    ctx.instructionsEl.textContent =
      'Move the mouse over the canvas to keep the marker inside the glowing band.';
    const c = ctx.ctx2d;
    const W = ctx.width;
    const H = ctx.height;
    const duration = 8000;
    const bandWidth = Math.max(18, 70 - ctx.difficulty * 5);
    const driftSpeed = 0.0006 + ctx.difficulty * 0.00025;
    const phase = ctx.rand() * Math.PI * 2;
    const start = ctx.now();
    let inBand = 0;
    let frames = 0;
    let markerY = H / 2;
    let mouseY = H / 2;
    let running = true;

    const onMove = (e) => (mouseY = ctx.point(e).y);
    ctx.canvas.addEventListener('mousemove', onMove);

    function frame() {
      if (!running) return;
      const t = ctx.now() - start;
      ctx.progressEl.style.width = Math.min(100, (t / duration) * 100) + '%';
      const center = H / 2 + Math.sin(t * driftSpeed + phase) * (H / 3);
      markerY += (mouseY - markerY) * 0.25;
      c.fillStyle = '#1c1712';
      c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(230,147,74,0.25)';
      c.fillRect(0, center - bandWidth / 2, W, bandWidth);
      c.strokeStyle = '#e6934a';
      c.lineWidth = 2;
      c.strokeRect(0, center - bandWidth / 2, W, bandWidth);
      const ok = Math.abs(markerY - center) < bandWidth / 2;
      frames++;
      if (ok) inBand++;
      c.fillStyle = ok ? '#8fd18f' : '#d18f8f';
      c.beginPath();
      c.arc(W / 2, markerY, 9, 0, Math.PI * 2);
      c.fill();
      if (t >= duration) {
        running = false;
        ctx.canvas.removeEventListener('mousemove', onMove);
        ctx.finish(inBand / Math.max(1, frames));
        return;
      }
      ctx.schedule(frame);
    }
    ctx.schedule(frame);
    return () => {
      running = false;
      ctx.canvas.removeEventListener('mousemove', onMove);
    };
  },
};
