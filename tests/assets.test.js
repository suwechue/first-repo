// The asset pipeline: manifest loading, placeholder fallback, spritesheet animation, check:assets.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createAssets } from '../src/render/assets.js';
import { animInfo, frameRect, dirIndex, drawSprite } from '../src/render/sprites.js';
import { checkAssets } from '../tools/check-assets.js';
import { RAW } from '../src/core/content.js';

const manifestPath = path.resolve(__dirname, '../public/assets/manifest.json');
const realManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const SHEET = {
  file: 'sprites/characters/player.png',
  frameW: 32,
  frameH: 32,
  anchor: [0.5, 1],
  dirs: 4,
  anims: { idle: { frames: 2, fps: 3 }, walk: { frames: 4, fps: 8 }, attack: { frames: 3, fps: 12 } },
};

function recorder() {
  const calls = [];
  return { calls, drawImage: (...a) => calls.push(a) };
}

describe('Spritesheet animation', () => {
  it('places animations side by side in manifest order', () => {
    expect(animInfo(SHEET, 'idle')).toEqual({ start: 0, frames: 2, fps: 3 });
    expect(animInfo(SHEET, 'walk')).toEqual({ start: 2, frames: 4, fps: 8 });
    expect(animInfo(SHEET, 'attack')).toEqual({ start: 6, frames: 3, fps: 12 });
    expect(animInfo(SHEET, 'missing').start).toBe(0); // falls back to the first animation
    expect(animInfo({ frameW: 8, frameH: 8 }, 'idle')).toEqual({ start: 0, frames: 1, fps: 0 });
    expect(animInfo({ anims: { a: { frames: 2 }, b: { frames: 1, start: 9 } } }, 'b').start).toBe(9);
  });

  it('advances frames with time and picks the direction row', () => {
    // walk at 8 fps: 0.5 s is frame 4 of 4 -> wraps to 0; 0.25 s is frame 2.
    expect(frameRect(SHEET, 'walk', 0, 250)).toEqual({ sx: (2 + 2) * 32, sy: 0, sw: 32, sh: 32 });
    expect(frameRect(SHEET, 'walk', 0, 500).sx).toBe(2 * 32);
    expect(frameRect(SHEET, 'walk', 3, 0).sy).toBe(3 * 32);
    expect(frameRect({ ...SHEET, dirs: 1 }, 'walk', 3, 0).sy).toBe(0);
  });

  it('maps a facing vector to down, left, right, up', () => {
    expect(dirIndex({ x: 0, y: 1 })).toBe(0);
    expect(dirIndex({ x: -1, y: 0 })).toBe(1);
    expect(dirIndex({ x: 1, y: 0.2 })).toBe(2);
    expect(dirIndex({ x: 0, y: -1 })).toBe(3);
    expect(dirIndex(null)).toBe(0);
  });
});

describe('Asset loading', () => {
  it('a sheet dropped at its manifest path animates with no code change', async () => {
    const img = { width: 288, height: 128 };
    const assets = createAssets({
      base: 'assets/',
      fetchJson: async () => ({ sprites: { player: SHEET } }),
      loadImage: async (url) => {
        if (url === 'assets/' + SHEET.file) return img;
        throw new Error('404');
      },
    });
    await assets.load();
    expect(assets.status('sprite', 'player')).toBe('loaded');
    const ctx = recorder();
    expect(drawSprite(ctx, assets, 'player', 100, 200, { anim: 'walk', dir: 2, time: 125 })).toBe(true);
    // walk frame 1 (125 ms at 8 fps), right-facing row 2, anchored bottom center.
    expect(ctx.calls[0]).toEqual([img, 3 * 32, 2 * 32, 32, 32, 84, 168, 32, 32]);
  });

  it('a missing file never throws and draws nothing, so the placeholder shows', async () => {
    const assets = createAssets({
      fetchJson: async () => realManifest,
      loadImage: () => {
        throw new Error('synchronous failure');
      },
    });
    await expect(assets.load()).resolves.toBeUndefined();
    expect(assets.status('sprite', 'player')).toBe('missing');
    expect(assets.sprite('player')).toBeNull();
    expect(assets.iconUrl('wood')).toBeNull();
    const ctx = recorder();
    expect(drawSprite(ctx, assets, 'player', 0, 0)).toBe(false);
    expect(drawSprite(ctx, assets, 'not_in_manifest', 0, 0)).toBe(false);
    expect(drawSprite(ctx, assets, undefined, 0, 0)).toBe(false);
    expect(ctx.calls.length).toBe(0);
  });

  it('an unreachable or malformed manifest leaves an empty registry', async () => {
    for (const fetchJson of [
      async () => Promise.reject(new Error('offline')),
      async () => null,
      async () => 7,
    ]) {
      const assets = createAssets({ fetchJson, loadImage: async () => ({}) });
      await expect(assets.load()).resolves.toBeUndefined();
      expect(assets.sprite('player')).toBeNull();
      expect(assets.audioUrl('sfx_click')).toBeNull();
    }
  });

  it('tells listeners when art arrives', async () => {
    const assets = createAssets({
      fetchJson: async () => ({ icons: { wood: 'icons/wood.png', stone: 'icons/stone.png' } }),
      loadImage: async (url) => {
        if (url.endsWith('wood.png')) return {};
        throw new Error('404');
      },
    });
    const heard = [];
    assets.onLoad((g, k) => heard.push(g + ':' + k));
    await assets.load();
    expect(heard).toEqual(['icon:wood']);
    expect(assets.iconUrl('wood')).toBe('assets/icons/wood.png');
    expect(assets.iconUrl('stone')).toBeNull();
  });
});

describe('check:assets', () => {
  it('lists every manifest file that does not exist yet', () => {
    const { entries } = checkAssets(realManifest, RAW, (f) => f === 'sprites/characters/player.png');
    const player = entries.find((e) => e.key === 'player');
    expect(player.present).toBe(true);
    expect(entries.filter((e) => !e.present).length).toBe(entries.length - 1);
    expect(entries.some((e) => e.group === 'audio')).toBe(true);
  });

  it('every sprite named in the data is defined in the manifest', () => {
    const { undefinedInManifest } = checkAssets(realManifest, RAW, () => false);
    expect(undefinedInManifest).toEqual([]);
  });

  it('flags a data sprite the manifest lacks', () => {
    const d = structuredClone(RAW);
    d.resources.tree.sprite = 'tree_oak';
    const { undefinedInManifest } = checkAssets(realManifest, d, () => false);
    expect(undefinedInManifest).toEqual([{ key: 'tree_oak', where: 'resources.tree' }]);
  });
});
