// Loads the beta prototype's own logic (reference/js) into an isolated context, so tests and tools
// can run it side by side with the port. The prototype stays untouched on disk.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { D } from '../src/core/content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REFERENCE_DIR = path.join(ROOT, 'reference', 'js');

export function referenceAvailable() {
  return fs.existsSync(path.join(REFERENCE_DIR, 'missions.js'));
}

/**
 * Returns the prototype's Game namespace with config, state, characters and missions loaded.
 * `rand` replaces Game.rand. Rules the spec has changed since the beta are patched in here:
 * the talent pity now guarantees a talent after pityDryLevels dry levels (the beta used pity >= PITY_LEVELS - 1).
 */
export function loadReference(rand, { withSave = false } = {}) {
  const ctx = { console, Math, JSON, Object, Array, Set, Date };
  ctx.window = ctx;
  vm.createContext(ctx);
  const files = ['config', 'state', 'characters', 'missions'];
  if (withSave) files.push('save');
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(REFERENCE_DIR, f + '.js'), 'utf8'), ctx, {
      filename: f + '.js',
    });
  }
  const G = ctx.Game;
  G.rand = rand;
  G.config.PITY_LEVELS = D.talents.growth.pityDryLevels + 1;
  return G;
}
