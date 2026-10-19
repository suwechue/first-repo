// SYNTHESIS: steer a marker into the target with a limited pool of ingredient nudges, then
// bottle it. Plays when the allocation spreads over 3 or more Vectors with none leading.

const INGREDIENTS = [
  { label: '▲ North', dx: 0, dy: -40 },
  { label: '▼ South', dx: 0, dy: 40 },
  { label: '▶ East', dx: 40, dy: 0 },
  { label: '◀ West', dx: -40, dy: 0 },
  { label: '◤ NE blend', dx: 28, dy: -28 },
  { label: '◢ SW blend', dx: -28, dy: 28 },
];

export default {
  key: 'synthesis',
  label: 'Synthesis',
  vectorHint: [],

  run(ctx) {
    ctx.instructionsEl.textContent =
      'Use ingredients to steer the marker into the glowing zone, then Bottle It.';
    const c = ctx.ctx2d;
    const W = ctx.width;
    const H = ctx.height;
    const radius = Math.max(20, 55 - ctx.difficulty * 3);
    const target = { x: 160 + ctx.rand() * (W - 320), y: 70 + ctx.rand() * (H - 140) };
    const marker = { x: W / 2, y: H / 2 };
    const shown = { ...marker };
    const pool = Math.max(4, 14 - ctx.difficulty);
    let left = pool;
    let over = false;
    let running = true;
    const trail = [{ ...marker }];

    function finish() {
      if (over) return;
      over = true;
      running = false;
      const d = Math.hypot(marker.x - target.x, marker.y - target.y);
      let perf = Math.max(0, Math.min(1, 1 - d / (Math.hypot(W, H) / 2)));
      if (d <= radius) perf = Math.max(perf, 0.9);
      ctx.finish(Math.min(1, perf + left * 0.015)); // a little extra for ingredients left over
    }

    function buttons() {
      ctx.extraEl.innerHTML = `<div class="small">Ingredients left: <b>${left}</b></div>
        ${INGREDIENTS.map((g, i) => `<button class="craft-btn" data-ing="${i}" ${left <= 0 || over ? 'disabled' : ''}>${g.label}</button>`).join(' ')}
        <button class="craft-btn" id="mg-bottle" ${over ? 'disabled' : ''}>Bottle it</button>`;
      ctx.extraEl.querySelectorAll('[data-ing]').forEach((b) =>
        b.addEventListener('click', () => {
          if (over || left <= 0) return;
          const g = INGREDIENTS[Number(b.dataset.ing)];
          marker.x = Math.max(20, Math.min(W - 20, marker.x + g.dx));
          marker.y = Math.max(20, Math.min(H - 20, marker.y + g.dy));
          trail.push({ ...marker });
          left--;
          ctx.progressEl.style.width = ((pool - left) / pool) * 100 + '%';
          buttons();
          if (left <= 0) setTimeout(finish, 500);
        }),
      );
      ctx.extraEl.querySelector('#mg-bottle')?.addEventListener('click', finish);
    }

    function frame() {
      if (!running) return;
      shown.x += (marker.x - shown.x) * 0.2;
      shown.y += (marker.y - shown.y) * 0.2;
      c.fillStyle = '#1c1712';
      c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(143,209,143,0.2)';
      c.strokeStyle = '#8fd18f';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(target.x, target.y, radius, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.strokeStyle = 'rgba(230,147,74,0.4)';
      c.beginPath();
      trail.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.stroke();
      c.fillStyle = '#e6934a';
      c.beginPath();
      c.arc(shown.x, shown.y, 9, 0, Math.PI * 2);
      c.fill();
      ctx.schedule(frame);
    }
    ctx.schedule(frame);
    buttons();
    return () => {
      running = false;
      over = true;
    };
  },
};
