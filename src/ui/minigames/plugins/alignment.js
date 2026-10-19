// ALIGNMENT: memorize a symbol sequence, then reproduce it. Binding or Light leads; weaving.
// It hides the canvas and builds its own buttons in extraEl.

const SYMBOLS = ['◆', '●', '▲', '■', '★', '✦', '◉'];

export default {
  key: 'alignment',
  label: 'Rune Alignment',
  vectorHint: ['binding', 'light'],

  run(ctx) {
    ctx.canvas.style.display = 'none';
    const pick = () => SYMBOLS[Math.floor(ctx.rand() * SYMBOLS.length)];
    const len = Math.min(7, 4 + Math.floor(ctx.difficulty / 3));
    const target = Array.from({ length: len }, pick);
    const typed = [];
    let timer = null;
    let over = false;

    function memorize() {
      ctx.instructionsEl.textContent = 'Memorize the sequence...';
      ctx.extraEl.innerHTML = target.map((sym) => `<span class="align-slot shown">${sym}</span>`).join('');
      ctx.progressEl.style.width = '10%';
      timer = setTimeout(input, 1500 + len * 400);
    }

    function input() {
      ctx.instructionsEl.textContent = 'Now reproduce it, in order.';
      ctx.progressEl.style.width = '40%';
      const order = SYMBOLS.map((sym) => [ctx.rand(), sym])
        .sort((a, b) => a[0] - b[0])
        .map((p) => p[1]);
      ctx.extraEl.innerHTML = `<div>${target.map((_, i) => `<span class="align-slot" data-slot="${i}"></span>`).join('')}</div>
        <div class="align-palette">${order.map((sym) => `<button class="align-btn" data-sym="${sym}">${sym}</button>`).join('')}</div>`;
      ctx.extraEl.querySelectorAll('.align-btn').forEach((btn) =>
        btn.addEventListener('click', () => {
          if (over || typed.length >= target.length) return;
          typed.push(btn.dataset.sym);
          ctx.extraEl.querySelector(`[data-slot="${typed.length - 1}"]`).textContent = btn.dataset.sym;
          ctx.progressEl.style.width = 40 + (typed.length / target.length) * 60 + '%';
          if (typed.length === target.length) {
            over = true;
            const correct = typed.filter((sym, i) => sym === target[i]).length;
            timer = setTimeout(() => ctx.finish(correct / target.length), 400);
          }
        }),
      );
    }

    memorize();
    return () => {
      over = true;
      clearTimeout(timer);
    };
  },
};
