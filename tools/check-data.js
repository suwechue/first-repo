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
  for (const [k, r] of Object.entries(d.resources))
    need(`resources.${k}.yields`, r.yields, d.materials, 'material');
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
  need('tiers.recruit.costItem', d.tiers.recruit.costItem, d.materials, 'material');
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
  ids(d.game.scatter.counts).forEach((r) => need('game.scatter.counts', r, d.resources, 'resource'));

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
