// npm run sim — win-rate simulation for a fresh starter squad, plus a greedy campaign to the first boss.
//
//   npm run sim                      300 missions per zone and objective, 300 campaigns
//   npm run sim -- --runs 20000      more runs for tighter numbers
//   npm run sim -- --seed 7          a different random stream
//   npm run sim -- --no-reference    skip the side-by-side run of the beta prototype
//
// Every run is seeded, so the same arguments always print the same table. When reference/ exists,
// the beta prototype's own code runs the same scenarios on the same seeds for comparison.
import fs from 'node:fs';
import { D } from '../src/core/content.js';
import { makeInitialState } from '../src/core/state.js';
import { createRng, useRandomSource } from '../src/core/rng.js';
import { initStarters, isInjured, equip, build } from '../src/systems/characters.js';
import { SLOTS, createItem, itemStat } from '../src/systems/gear.js';
import { recruit, refreshOffer, dawnArrival } from '../src/systems/recruiting.js';
import { launch, zoneUnlocked, combatPower } from '../src/systems/missions.js';
import { loadReference, referenceAvailable } from './reference.js';

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const RUNS = arg('runs', 300);
const CAMPAIGNS = arg('campaigns', 300);
const SEED = arg('seed', 1);
const WITH_REF = !args.includes('--no-reference') && referenceAvailable();
const TARGETS = JSON.parse(fs.readFileSync(new URL('./sim-targets.json', import.meta.url), 'utf8'));
const RETREAT = TARGETS.retreat;

// ---------------------------------------------------------------------------
// Engines: the port and the prototype behind one small interface.
// ---------------------------------------------------------------------------
function portEngine(seed) {
  useRandomSource(createRng(seed));
  const s = makeInitialState();
  return {
    s,
    reset() {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, makeInitialState());
      initStarters(s);
    },
    launch: (o) => launch(s, o),
    recruit: () => recruit(s),
    refreshOffer: () => refreshOffer(s),
    dawn: () => dawnArrival(s), // M11: arrivals by chance, paid for in Renown
    equip: (c, slot, item) => equip(s, c, slot, item),
    knowsItem: (base) => !!D.items[base],
    slots: SLOTS,
    count: (base) => s.armory.filter((it) => it.base === base).length,
    addItem: (base) => createItem(s, base),
    equipBestIn(c, slot) {
      const cur = c.gear[slot] ? itemStat(c.gear[slot], 'gear') : -1;
      const best = s.armory
        .filter((it) => D.items[it.base].slot === slot)
        .sort((a, b) => itemStat(b, 'gear') - itemStat(a, 'gear'))[0];
      if (best && itemStat(best, 'gear') > cur) equip(s, c, slot, best.id);
    },
    cp: (c, obj) => combatPower(c, obj),
    injured: (c) => isInjured(s, c),
    unlocked: (realm, zone) => zoneUnlocked(s, realm, zone),
  };
}

function refEngine(seed) {
  const G = loadReference(createRng(seed));
  return {
    get s() {
      return G.state;
    },
    reset() {
      G.resetState();
      G.characters.initStarters();
    },
    launch: (o) => G.missions.launch(o),
    recruit: () => G.characters.recruit(),
    refreshOffer: () => G.characters.refreshOffer(),
    dawn: () => G.characters.refreshOffer(), // the beta: a new candidate every dawn, paid in food
    equip: (c, slot, item) => G.characters.equip(c, slot, item),
    // the beta's armory counts and two slots
    slots: ['weapon', 'armor'],
    knowsItem: (base) => !!G.config.ITEMS[base] && ['weapon', 'armor'].includes(G.config.ITEMS[base].slot),
    count: (base) => G.state.armory[base] || 0,
    addItem: (base) => (G.state.armory[base] = (G.state.armory[base] || 0) + 1),
    equipBestIn(c, slot) {
      const A = G.state.armory;
      const val = (k) => G.config.ITEMS[k]?.gear || 0;
      const cur = c.gear[slot] ? val(c.gear[slot]) : 0;
      let best = null;
      for (const k in A)
        if (A[k] > 0 && G.config.ITEMS[k]?.slot === slot && val(k) > (best ? val(best) : cur)) best = k;
      if (best) G.characters.equip(c, slot, best);
    },
    cp: (c, obj) => G.missions.combatPower(c, obj),
    injured: (c) => G.characters.isInjured(c),
    unlocked: (realm, zone) => G.missions.zoneUnlocked(realm, zone),
  };
}

// ---------------------------------------------------------------------------
// Part 1: fresh starter squad, every zone and objective.
// ---------------------------------------------------------------------------
function missionRates(engine, realm, zone, objective) {
  const t = { success: 0, retreat: 0, wipe: 0, deaths: 0, anyDeath: 0 };
  for (let i = 0; i < RUNS; i++) {
    engine.reset();
    const s = engine.s;
    s.nexus.awake = true;
    s.player.inventory[D.mission.supply.item] = 100;
    for (const z in s.realms[realm]) s.realms[realm][z].explored = 100;
    const r = engine.launch({ realm, zone, objective, squad: s.roster.map((c) => c.id), retreat: RETREAT });
    if (!r.ok) throw new Error(r.error);
    t[r.report.outcome]++;
    t.deaths += r.report.dead.length;
    if (r.report.dead.length) t.anyDeath++;
  }
  const pct = (n) => (n / RUNS) * 100;
  return {
    win: pct(t.success),
    retreat: pct(t.retreat),
    wipe: pct(t.wipe),
    death: pct(t.anyDeath),
    deathsPerRun: t.deaths / RUNS,
  };
}

// ---------------------------------------------------------------------------
// Part 2: a greedy player, from the Nexus waking to the first boss kill.
// Policy: supplies, food and Overworld materials are plentiful; Renown is earned (since M11 it pays for recruits). Everyone gets the best gear the
// armory can make. Recruit whenever the roster is under 6. Explore the newest open zone until the
// next one opens; once the boss zone is open, hunt its boss. Send the 4 strongest healthy members.
// When fewer than 2 are healthy, wait a day.
// ---------------------------------------------------------------------------
const MAX_EXPEDITIONS = 300;

/** Crafts every affordable gear recipe, up to 8 of each. */
function craftGear(engine) {
  const s = engine.s;
  const inv = s.player.inventory;
  for (const [, r] of Object.entries(D.recipes)) {
    if (r.type !== 'item' || !engine.knowsItem(r.item)) continue;
    while (Object.entries(r.costs).every(([k, v]) => inv[k] >= v) && engine.count(r.item) < 8) {
      for (const [k, v] of Object.entries(r.costs)) inv[k] -= v;
      engine.addItem(r.item);
    }
  }
}

/** The strongest members get the best gear in every slot. */
function equipBest(engine) {
  const s = engine.s;
  const byLevel = s.roster.slice().sort((a, b) => b.level - a.level);
  for (const c of byLevel) for (const slot of engine.slots) engine.equipBestIn(c, slot);
}

function nextOrder(engine, realm) {
  const zones = Object.keys(D.realms[realm].zones);
  const s = engine.s;
  const bossZone = zones.find((z) => D.enemies[D.realms[realm].zones[z].hunt[0]].boss);
  let zone;
  let objective;
  if (bossZone && engine.unlocked(realm, bossZone)) {
    zone = bossZone;
    objective = 'hunt';
  } else {
    zone = zones.filter((z) => engine.unlocked(realm, z)).pop();
    objective = 'explore';
  }
  const healthy = s.roster
    .filter((c) => !engine.injured(c))
    .sort((a, b) => engine.cp(b, objective) - engine.cp(a, objective));
  return {
    realm,
    zone,
    objective,
    squad: healthy.slice(0, D.mission.squad.max).map((c) => c.id),
    retreat: RETREAT,
  };
}

function advanceDay(engine) {
  const s = engine.s;
  s.day++;
  s.dayTimer = 0;
  engine.dawn();
}

function campaign(engine) {
  engine.reset();
  const s = engine.s;
  const realm = Object.keys(D.realms)[0];
  s.nexus.awake = true;
  s.renown += D.nexus.awakenGrants.renown;
  for (const k of ['food', 'stone', 'wood', 'fiber', 'hide']) s.player.inventory[k] = 1e6;
  engine.refreshOffer();
  const bossZone = Object.keys(D.realms[realm].zones).find(
    (z) => D.enemies[D.realms[realm].zones[z].hunt[0]].boss,
  );
  let expeditions = 0;
  let idleDays = 0;
  while (expeditions < MAX_EXPEDITIONS && !s.realms[realm][bossZone].bossDown) {
    if (s.roster.length < 6 && s.recruitOffer) engine.recruit();
    craftGear(engine);
    equipBest(engine);
    const order = nextOrder(engine, realm);
    if (order.squad.length < D.mission.squad.min) {
      advanceDay(engine);
      if (++idleDays > 200) break;
      continue;
    }
    s.player.inventory[D.mission.supply.item] = 100;
    const r = engine.launch(order);
    if (!r.ok) throw new Error(r.error);
    expeditions++;
    if (s.dayTimer >= s.dayLength) advanceDay(engine);
  }
  return { expeditions, deaths: s.stats.deaths, won: s.realms[realm][bossZone].bossDown };
}

function campaignStats(engine) {
  const runs = [];
  for (let i = 0; i < CAMPAIGNS; i++) runs.push(campaign(engine));
  const won = runs.filter((r) => r.won);
  const sorted = (xs) => xs.slice().sort((a, b) => a - b);
  const median = (xs) => (xs.length ? sorted(xs)[Math.floor(xs.length / 2)] : NaN);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
  const C = TARGETS.campaign;
  return {
    reached: (won.length / runs.length) * 100,
    medianExp: median(won.map((r) => r.expeditions)),
    meanExp: mean(won.map((r) => r.expeditions)),
    meanDeaths: mean(runs.map((r) => r.deaths)),
    medianDeaths: median(runs.map((r) => r.deaths)),
    inBand:
      (runs.filter((r) => r.deaths >= C.deathsMin && r.deaths <= C.deathsMax).length / runs.length) * 100,
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '—');
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log(
  `\nNexus Project — mission simulation (seed ${SEED}, ${RUNS} runs per row, all four starters, retreat ${RETREAT}%)`,
);
console.log(`Margin of error at 95%: about ±${f1(196 * Math.sqrt(0.25 / RUNS))} points at 50%.\n`);

const realm = Object.keys(D.realms)[0];
const port = portEngine(SEED);
const ref = WITH_REF ? refEngine(SEED) : null;
const head = ['Zone', 'Objective', 'Win %', 'Retreat %', 'Wipe %', 'Any death %', 'Deaths/run'];
if (ref) head.push('Prototype win %');
head.push('Target win %');
const widths = [10, 10, 7, 10, 7, 12, 11, 16, 13];
console.log(head.map((h, i) => pad(h, widths[i])).join(' '));
console.log(
  widths
    .slice(0, head.length)
    .map((w) => '-'.repeat(w))
    .join(' '),
);

let fails = 0;
for (const zone of Object.keys(D.realms[realm].zones)) {
  for (const objective of Object.keys(D.mission.objectives)) {
    const p = missionRates(port, realm, zone, objective);
    const row = [
      zone,
      objective,
      f1(p.win),
      f1(p.retreat),
      f1(p.wipe),
      f1(p.death),
      p.deathsPerRun.toFixed(2),
    ];
    if (ref) row.push(f1(missionRates(ref, realm, zone, objective).win));
    const target = TARGETS.missions.find((t) => t.zone === zone && t.objective === objective);
    if (target) {
      const ok = Math.abs(p.win - target.win) <= TARGETS.tolerance;
      if (!ok) fails++;
      row.push(`${f1(target.win)} ${ok ? 'ok' : 'OFF'}`);
    } else row.push('');
    console.log(row.map((c, i) => (i < 2 ? pad(c, widths[i]) : padL(c, widths[i]))).join(' '));
  }
}

console.log(`\nGreedy campaign to the first boss kill (${CAMPAIGNS} campaigns)`);
const cHead = [
  '',
  'Reached boss %',
  'Median exp.',
  'Mean exp.',
  'Mean deaths',
  'Median deaths',
  `Deaths ${TARGETS.campaign.deathsMin}-${TARGETS.campaign.deathsMax} %`,
];
const cw = [11, 15, 12, 10, 12, 14, 13];
console.log(cHead.map((h, i) => pad(h, cw[i])).join(' '));
const cRow = (name, c) =>
  console.log(
    [name, f1(c.reached), c.medianExp, f1(c.meanExp), f1(c.meanDeaths), c.medianDeaths, f1(c.inBand)]
      .map((v, i) => (i ? padL(v, cw[i]) : pad(v, cw[i])))
      .join(' '),
  );
cRow('Port', campaignStats(portEngine(SEED + 1)));
if (ref) cRow('Prototype', campaignStats(refEngine(SEED + 1)));
console.log(
  `Target: about ${TARGETS.campaign.expeditions} expeditions, ${TARGETS.campaign.deathsMin} to ${TARGETS.campaign.deathsMax} deaths.`,
);
// ---------------------------------------------------------------------------
// Part 3 (M10): how a mage's Vector changes the odds. Three starters (Kael, Boris, Lin) plus a
// level 6 mage carrying a Standard Bolt and a Minor Burst of one Vector, against each zone's Hunt.
// ---------------------------------------------------------------------------
function vectorRates(vector, zone) {
  let wins = 0;
  for (let i = 0; i < RUNS; i++) {
    port.reset();
    const s = port.s;
    s.nexus.awake = true;
    s.player.inventory[D.mission.supply.item] = 100;
    for (const z in s.realms[realm]) s.realms[realm][z].explored = 100;
    const squad = s.roster.filter((c) => c.cls !== 'gatherer' && c.cls !== 'herbalist').slice(0, 3);
    if (vector) {
      const m = build(s, {
        name: 'Sim Mage',
        cls: 'mage',
        stats: { str: 4, con: 6, dex: 5, int: 12, per: 5, wil: 10 },
        traits: [],
      });
      m.level = 6;
      m.vectors = [vector];
      m.knowledge.vectors = { [vector]: 2 };
      m.knowledge.forms = { bolt: 2, burst: 1 };
      m.knowledge.magnitudes = { [vector + '+bolt']: 'standard' };
      m.loadout = [
        { vector, form: 'bolt', magnitude: 'standard' },
        { vector, form: 'burst', magnitude: 'minor' },
      ];
      s.roster.push(m);
      squad.push(m);
    }
    const r = port.launch({
      realm,
      zone,
      objective: 'hunt',
      squad: squad.map((c) => c.id),
      retreat: RETREAT,
    });
    if (!r.ok) throw new Error(r.error);
    if (r.report.outcome === 'success') wins++;
  }
  return (wins / RUNS) * 100;
}

const vectors = Object.keys(D.vectors).filter((v) => D.vectors[v].tier === 1);
const zones = Object.keys(D.realms[realm].zones);
console.log(`\nVector matchups: Hunt win % for three starters plus a level 6 mage (${RUNS} runs per cell)`);
const vw = [12, ...zones.map(() => 11)];
console.log([pad('Mage Vector', vw[0]), ...zones.map((z, i) => padL(z, vw[i + 1]))].join(' '));
for (const v of [null, ...vectors]) {
  const cells = zones.map((z, i) => {
    const quarry = D.enemies[D.realms[realm].zones[z].hunt[0]];
    const mark = !v ? '' : quarry.weakTo.includes(v) ? '+' : quarry.resists.includes(v) ? '-' : ' ';
    return padL(f1(vectorRates(v, z)) + mark, vw[i + 1]);
  });
  console.log([pad(v ? D.vectors[v].name : '(no mage)', vw[0]), ...cells].join(' '));
}
console.log('+ the quarry is weak to that Vector, - it resists it.');

console.log(
  fails
    ? `\n${fails} row(s) are more than ${TARGETS.tolerance} points from the target.`
    : `\nAll target rows are within ${TARGETS.tolerance} points.`,
);
