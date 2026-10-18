// npm run check:assets — your art to-do list.
// Lists every manifest entry whose file does not exist yet (it draws as a placeholder), and every
// sprite key named in src/data that the manifest does not define. Exits 1 only if the manifest is unreadable.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RAW } from '../src/core/content.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'public', 'assets');

/** Every sprite key the game data asks for, with where it was named. */
export function spritesNamedInData(d) {
  const out = [];
  const add = (key, where) => key && out.push({ key, where });
  for (const [k, v] of Object.entries(d.resources)) add(v.sprite, `resources.${k}`);
  for (const [k, v] of Object.entries(d.buildings)) add(v.sprite, `buildings.${k}`);
  for (const [k, v] of Object.entries(d.enemies)) if (v.overworld) add(v.sprite, `enemies.${k}`);
  for (const [stage, key] of Object.entries(d.nexus.sprites || {})) add(key, `nexus.sprites.${stage}`);
  for (const [k, v] of Object.entries(d.landmarks || {})) add(v.sprite, `landmarks.${k}`);
  for (const [k, v] of Object.entries(d.props || {})) add(v.sprite, `props.${k}`);
  for (const [rk, realm] of Object.entries(d.realms))
    for (const [zk, z] of Object.entries(realm.zones)) add(z.banner, `realms.${rk}.${zk}.banner`);
  return out;
}

/** Tileset keys the world data asks for. */
export function tilesetsNamedInData(d) {
  const out = [];
  for (const [k, t] of Object.entries(d.world?.terrain || {}))
    if (t.tileset) out.push({ key: t.tileset, where: `world.terrain.${k}` });
  return out;
}

/**
 * Compares the manifest with the files on disk and the data. `exists(relPath)` is injectable for tests.
 * Returns { entries: [{ group, key, file, present }], undefinedInManifest: [{ key, where }] }.
 */
export function checkAssets(manifest, d, exists) {
  const entries = [];
  for (const [k, v] of Object.entries(manifest.sprites || {}))
    entries.push({ group: 'sprite', key: k, file: v.file });
  for (const [k, v] of Object.entries(manifest.tilesets || {}))
    entries.push({ group: 'tileset', key: k, file: v.file });
  for (const [k, f] of Object.entries(manifest.icons || {})) entries.push({ group: 'icon', key: k, file: f });
  for (const [k, f] of Object.entries(manifest.audio || {}))
    entries.push({ group: 'audio', key: k, file: f });
  for (const e of entries) e.present = typeof e.file === 'string' && exists(e.file);

  const undefinedInManifest = [];
  for (const s of spritesNamedInData(d)) if (!manifest.sprites?.[s.key]) undefinedInManifest.push(s);
  for (const t of tilesetsNamedInData(d)) if (!manifest.tilesets?.[t.key]) undefinedInManifest.push(t);
  for (const k of Object.keys(d.materials)) {
    if (!manifest.icons?.[k]) undefinedInManifest.push({ key: k, where: `materials.${k} (icon)` });
  }
  return { entries, undefinedInManifest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
  } catch (e) {
    console.error('check:assets: cannot read public/assets/manifest.json: ' + e.message);
    process.exit(1);
  }
  const { entries, undefinedInManifest } = checkAssets(manifest, RAW, (rel) =>
    fs.existsSync(path.join(ASSETS, rel)),
  );
  const missing = entries.filter((e) => !e.present);
  const groups = [...new Set(entries.map((e) => e.group))];
  console.log(`check:assets: ${entries.length - missing.length} of ${entries.length} manifest files exist.`);
  for (const g of groups) {
    const list = missing.filter((e) => e.group === g);
    if (!list.length) continue;
    console.log(`\n  ${g} — still a placeholder (${list.length}):`);
    for (const e of list) console.log(`    ${e.key.padEnd(26)} public/assets/${e.file}`);
  }
  if (undefinedInManifest.length) {
    console.log(`\n  Named in src/data but not in the manifest (drawn as placeholders):`);
    for (const u of undefinedInManifest) console.log(`    ${u.key.padEnd(26)} ${u.where}`);
  }
}
