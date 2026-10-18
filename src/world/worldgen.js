// Interim single-screen world: scatter resource nodes with a minimum spacing.
// M3 replaces this with seeded ring, biome and river generation.
import { D } from '../core/content.js';
import { rand } from '../core/rng.js';
import { dist } from '../core/geometry.js';

export function scatterResources(s) {
  const W = D.game.canvas.w;
  const H = D.game.canvas.h;
  const A = D.game.spawnArea;
  const S = D.game.scatter;
  const center = { x: W / 2, y: H / 2 };
  s.resources.length = 0;
  const placed = [];
  for (const type in S.counts) {
    let tries = 0;
    let placedCount = 0;
    while (placedCount < S.counts[type] && tries < S.tries) {
      tries++;
      const candidate = {
        x: A.left + rand() * (W - A.left - A.right),
        y: A.top + rand() * (H - A.top - A.bottom),
      };
      const tooClose =
        placed.some((p) => dist(p, candidate) < S.minSpacing) ||
        dist(candidate, center) < S.clearOfCenter ||
        dist(candidate, D.nexus.position) < S.clearOfNexus;
      if (tooClose) continue;
      const def = D.resources[type];
      s.resources.push({
        id: type + '_' + placedCount + '_' + Math.floor(rand() * 9999),
        type,
        x: candidate.x,
        y: candidate.y,
        amount: def.amount,
        maxAmount: def.amount,
        respawnTimer: 0,
        angle: rand() * Math.PI * 2,
      });
      placed.push(candidate);
      placedCount++;
    }
  }
}
