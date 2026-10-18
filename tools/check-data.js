// npm run check:data — validates every cross-reference between the JSON files in src/data.
// Exits with code 1 and a list of problems if any id is misspelled or missing.
import { fileURLToPath } from 'node:url';
import { RAW } from '../src/core/content.js';

export function checkData(d) {
  const errors = [];
  const need = (where, id, table, tableName) => {
    if (!table || !Object.hasOwn(table, id)) errors.push(`${where}: unknown ${tableName} "${id}"`);
  };
  const ids = (obj) => Object.keys(obj || {});
  const statKeys = d.tiers.stats.labels;
  const traits = d.traits.traits;
  const talents = d.talents.talents;
  const objectives = d.mission.objectives;

  for (const k of ids(d.materials)) {
    if (typeof d.materials[k].start !== 'number') errors.push(`materials.${k}: start must be a number`);
  }
  for (const [k, r] of Object.entries(d.resources)) {
    if (typeof r.yields === 'string') need(`resources.${k}.yields`, r.yields, d.materials, 'material');
    else ids(r.yields).forEach((m) => need(`resources.${k}.yields`, m, d.materials, 'material'));
  }
  for (const [k, t] of Object.entries(d.tech)) {
    t.prereq.forEach((p) => need(`tech.${k}.prereq`, p, d.tech, 'tech'));
    ids(t.extra).forEach((m) => need(`tech.${k}.extra`, m, d.materials, 'material'));
  }
  for (const [k, it] of Object.entries(d.items)) {
    if (!['weapon', 'armor'].includes(it.slot)) errors.push(`items.${k}.slot: must be weapon or armor`);
  }
  for (const [k, r] of Object.entries(d.recipes)) {
    r.requires.forEach((t) => need(`recipes.${k}.requires`, t, d.tech, 'tech'));
    ids(r.costs).forEach((m) => need(`recipes.${k}.costs`, m, d.materials, 'material'));
    ids(r.yields).forEach((m) => need(`recipes.${k}.yields`, m, d.materials, 'material'));
    if (r.type === 'item') need(`recipes.${k}.item`, r.item, d.items, 'item');
    if (r.nearBuilding) need(`recipes.${k}.nearBuilding`, r.nearBuilding, d.buildings, 'building');
    if (!['item', 'cook', 'supply'].includes(r.type)) errors.push(`recipes.${k}.type: unknown "${r.type}"`);
  }
  for (const [k, b] of Object.entries(d.buildings)) {
    b.requires.forEach((t) => need(`buildings.${k}.requires`, t, d.tech, 'tech'));
    ids(b.costs).forEach((m) => need(`buildings.${k}.costs`, m, d.materials, 'material'));
    ids(b.produces?.yields).forEach((m) => need(`buildings.${k}.produces`, m, d.materials, 'material'));
  }
  const N = d.nexus;
  need('nexus.digTech', N.digTech, d.tech, 'tech');
  ids(N.digCost).forEach((m) => need('nexus.digCost', m, d.materials, 'material'));
  ids(N.awakenGrants.items).forEach((m) => need('nexus.awakenGrants', m, d.materials, 'material'));

  for (const [k, c] of Object.entries(d.classes)) {
    c.primary.forEach((st) => need(`classes.${k}.primary`, st, statKeys, 'stat'));
    ids(c.skill).forEach((o) => need(`classes.${k}.skill`, o, objectives, 'objective'));
    if (c.needsTech) need(`classes.${k}.needsTech`, c.needsTech, d.tech, 'tech');
    need(`classes.${k}.tables`, k, d.talents.tables, 'talent table');
  }
  for (const [k, t] of Object.entries(traits))
    need(`traits.${k}.rarity`, t.rarity, d.tiers.traitPoolWeights, 'rarity');
  for (const list of ['clash', 'synergy']) {
    d.traits[list].forEach((p) => p.forEach((t) => need(`traits.${list}`, t, traits, 'trait')));
  }
  for (const [cls, table] of Object.entries(d.talents.tables)) {
    need(`talents.tables.${cls}`, cls, d.classes, 'class');
    ids(table).forEach((t) => need(`talents.tables.${cls}`, t, talents, 'talent'));
  }
  for (const [k, bg] of Object.entries(d.backgrounds)) {
    ids(bg.classes).forEach((c) => need(`backgrounds.${k}.classes`, c, d.classes, 'class'));
    ids(bg.nudge).forEach((st) => need(`backgrounds.${k}.nudge`, st, statKeys, 'stat'));
  }
  need('tiers.recruit.starterTier', d.tiers.recruit.starterTier, d.tiers.tiers, 'tier');
  need('tiers.recruit.origin', d.tiers.recruit.origin, d.tiers.origins, 'origin');
  ids(d.tiers.recruit.odds).forEach((t) => need('tiers.recruit.odds', t, d.tiers.tiers, 'tier'));
  for (const [k, t] of Object.entries(d.tiers.tiers))
    if (!(t.renown > 0)) errors.push(`tiers.tiers.${k}.renown: must be a positive Renown cost`);
  d.starterRoster.forEach((sp, i) => {
    need(`starter_roster[${i}].cls`, sp.cls, d.classes, 'class');
    sp.traits.forEach((t) => need(`starter_roster[${i}].traits`, t, traits, 'trait'));
    ids(statKeys).forEach((st) => {
      if (typeof sp.stats[st] !== 'number') errors.push(`starter_roster[${i}].stats: missing ${st}`);
    });
  });
  for (const [k, e] of Object.entries(d.enemies)) {
    ids(e.overworld?.drops).forEach((m) => need(`enemies.${k}.overworld.drops`, m, d.materials, 'material'));
    ids(e.etr !== undefined ? e.drops : {}).forEach((m) =>
      need(`enemies.${k}.drops`, m, d.materials, 'material'),
    );
  }
  need('mission.supply.item', d.mission.supply.item, d.materials, 'material');
  for (const [k, o] of Object.entries(objectives)) {
    if (o.explore === undefined || o.resourceShare === undefined)
      errors.push(`mission.objectives.${k}: needs explore and resourceShare`);
  }
  need('game.dawnSpawn.enemy', d.game.dawnSpawn.enemy, d.enemies, 'enemy');
  need('game.interact.cook.recipe', d.game.interact.cook.recipe, d.recipes, 'recipe');
  d.game.hunger.foods.forEach((f) => need('game.hunger.foods', f.item, d.materials, 'material'));

  // The world and its biomes.
  const W = d.world;
  const terrain = W.terrain;
  for (const [k, b] of Object.entries(d.biomes)) {
    need(`biomes.${k}.ground`, b.ground, terrain, 'terrain');
    ids(b.density).forEach((r) => need(`biomes.${k}.density`, r, d.resources, 'resource'));
    if (b.fill) {
      need(`biomes.${k}.fill`, b.fill, d.resources, 'resource');
      if (d.resources[b.fill] && !(d.resources[b.fill].blocks > 0))
        errors.push(`biomes.${k}.fill: "${b.fill}" must block movement`);
    }
    (b.enemies || []).forEach((e) => {
      need(`biomes.${k}.enemies`, e.id, d.enemies, 'enemy');
      if (d.enemies[e.id] && !d.enemies[e.id].overworld)
        errors.push(`biomes.${k}.enemies: "${e.id}" has no overworld stats`);
    });
    const total = Object.values(b.density).reduce((a, v) => a + v, 0);
    if (total > 1) errors.push(`biomes.${k}.density: densities add up to more than 1`);
  }
  W.rings.forEach((r, i) => need(`world.rings[${i}].zone`, r.zone, d.biomes, 'zone'));
  need('world.seal.zone', W.seal.zone, d.biomes, 'zone');
  need('world.spawn.zone', W.spawn.zone, d.biomes, 'zone');
  need('world.hills.zone', W.hills.zone, d.biomes, 'zone');
  need('world.hills.within', W.hills.within, d.biomes, 'zone');
  need('world.hills.ground', W.hills.ground, terrain, 'terrain');
  need('world.hills.rock', W.hills.rock, terrain, 'terrain');
  need('world.river.zone', W.river.zone, d.biomes, 'zone');
  need('world.river.water', W.river.water, terrain, 'terrain');
  need('world.river.ford', W.river.ford, terrain, 'terrain');
  need('world.roads.terrain', W.roads.terrain, terrain, 'terrain');
  need('world.meadows.terrain', W.meadows.terrain, terrain, 'terrain');
  W.meadows.zones.forEach((z) => need('world.meadows.zones', z, d.biomes, 'zone'));
  for (const [k, r] of Object.entries(d.resources)) {
    if (typeof r.blocks !== 'number') errors.push(`resources.${k}.blocks: must be a number (0 for none)`);
    if (r.blocks >= W.tileSize / 2) errors.push(`resources.${k}.blocks: must be under half a tile`);
  }

  // Landmarks.
  for (const [k, l] of Object.entries(d.landmarks)) {
    const at = `landmarks.${k}`;
    if (!Number.isInteger(l.count) || l.count < 1)
      errors.push(`${at}.count: must be a whole number of 1 or more`);
    if (typeof l.discoverRadius !== 'number') errors.push(`${at}.discoverRadius: must be a number of tiles`);
    if (l.at && l.at !== 'nexus') errors.push(`${at}.at: only "nexus" is supported`);
    if (!l.at) (l.zones || []).forEach((z) => need(`${at}.zones`, z, d.biomes, 'zone'));
    if (!l.at && !(l.zones || []).length) errors.push(`${at}.zones: needs at least one zone`);
    if (l.nearTerrain) need(`${at}.nearTerrain`, l.nearTerrain, terrain, 'terrain');
    if (l.den) {
      need(`${at}.den.enemy`, l.den.enemy, d.enemies, 'enemy');
      ids(l.den.clearReward).forEach((m) => need(`${at}.den.clearReward`, m, d.materials, 'material'));
    }
    if (l.open) {
      ids(l.open.items).forEach((m) => need(`${at}.open.items`, m, d.materials, 'material'));
      (l.open.oneOf || []).forEach((o) =>
        ids(o).forEach((m) => need(`${at}.open.oneOf`, m, d.materials, 'material')),
      );
    }
  }

  // Axiom Magic.
  const KT = d.knowledgeTiers;
  const mags = KT.magnitudes;
  KT.tiers.forEach((t, i) => {
    if (t.tech) need(`knowledge_tiers.tiers[${i}].tech`, t.tech, d.tech, 'tech');
    need(`knowledge_tiers.tiers[${i}].maxMagnitude`, t.maxMagnitude, mags, 'magnitude');
  });
  need('knowledge_tiers.magic.startForm', KT.magic.startForm, d.forms, 'form');
  for (const kind of ['vectors', 'forms']) {
    for (const [cls, table] of Object.entries(d.growthTables[kind])) {
      if (cls !== 'default') need(`growth_tables.${kind}.${cls}`, cls, d.classes, 'class');
      ids(table).forEach((k) => need(`growth_tables.${kind}.${cls}`, k, d[kind], kind.slice(0, -1)));
    }
  }
  for (const [k, c] of Object.entries(d.classes)) {
    (c.vectorPool || []).forEach((v) => need(`classes.${k}.vectorPool`, v, d.vectors, 'vector'));
  }
  for (const [k, sp] of Object.entries(d.specializations)) {
    sp.from.forEach((c) => need(`specializations.${k}.from`, c, d.classes, 'class'));
    ids(sp.rollMods).forEach((v) => need(`specializations.${k}.rollMods`, v, d.vectors, 'vector'));
    if (sp.startForm) need(`specializations.${k}.startForm`, sp.startForm, d.forms, 'form');
  }
  for (const [k, e] of Object.entries(d.enemies)) {
    for (const list of ['weakTo', 'resists'])
      (e[list] || []).forEach((v) => need(`enemies.${k}.${list}`, v, d.vectors, 'vector'));
  }

  // City prefabs and their props.
  need('world.city.prefab', W.city.prefab, d.prefabs, 'prefab');
  for (const [k, pf] of Object.entries(d.prefabs)) {
    const at = `prefabs.${k}`;
    for (const [ch, cell] of Object.entries(pf.legend)) {
      need(`${at}.legend["${ch}"].zone`, cell.zone, d.biomes, 'zone');
      if (cell.terrain) need(`${at}.legend["${ch}"].terrain`, cell.terrain, terrain, 'terrain');
      if (cell.prop) need(`${at}.legend["${ch}"].prop`, cell.prop, d.props, 'prop');
      if (cell.node) need(`${at}.legend["${ch}"].node`, cell.node, d.resources, 'resource');
    }
    pf.rows.forEach((row, y) => {
      for (const ch of row) if (!pf.legend[ch]) errors.push(`${at}.rows[${y}]: "${ch}" is not in the legend`);
    });
    if (k === W.city.prefab) {
      if (pf.rows.length !== W.city.size[1]) errors.push(`${at}: needs ${W.city.size[1]} rows`);
      pf.rows.forEach((row, y) => {
        if (row.length !== W.city.size[0]) errors.push(`${at}.rows[${y}]: must be ${W.city.size[0]} wide`);
      });
      const count = (pt) =>
        pf.rows
          .join('')
          .split('')
          .filter((ch) => pf.legend[ch]?.point === pt).length;
      for (const pt of ['spawn', 'center', 'nexus'])
        if (count(pt) !== 1) errors.push(`${at}: needs exactly one "${pt}" point`);
    }
  }
  for (const [k, p] of Object.entries(d.props)) {
    if (!p.solid && !(typeof p.blocks === 'number' && p.blocks < W.tileSize / 2))
      errors.push(`props.${k}: needs "solid": true or "blocks" under half a tile`);
  }

  for (const [rk, realm] of Object.entries(d.realms)) {
    for (const [zk, z] of Object.entries(realm.zones)) {
      const at = `realms.${rk}.${zk}`;
      z.enemies.forEach((e) => {
        need(`${at}.enemies`, e.id, d.enemies, 'enemy');
        if (d.enemies[e.id] && d.enemies[e.id].etr === undefined)
          errors.push(`${at}.enemies: "${e.id}" has no etr`);
      });
      z.resources.forEach((r) => need(`${at}.resources`, r.id, d.materials, 'material'));
      z.hunt.forEach((h) => need(`${at}.hunt`, h, d.enemies, 'enemy'));
      if (!z.hunt.length) errors.push(`${at}.hunt: needs at least one quarry`);
      if (z.unlock) need(`${at}.unlock.zone`, z.unlock.zone, realm.zones, 'zone');
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = checkData(RAW);
  if (errors.length) {
    console.error(`check:data found ${errors.length} problem(s):`);
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('check:data: all cross-references resolve.');
}
