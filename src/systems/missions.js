// Autonomous expedition resolution. The formulas are the Systems reference in docs/SPEC.md:
//
//   CP  = 4*Level + 1.5*(two primary stats) + Gear + Skill + Arcane
//   SP  = (sum of squad CP) * (1 + Synergy)
//   P_win = SP / (SP + ETR)
//   Closeness = max(0.1, 1 - 2|P_win - 0.5|)
//   P_injury = Closeness * 0.35 * (1 - ConMod) * (1 - ArmorMod)
//
// A mission is a series of steps through one zone. Each step is quiet travel or an encounter.
// Vigor drains as the squad fights; at the chosen retreat threshold the squad turns back.
// M9 added composition synergy, Perception-scaled yields, the hunt locate check, Life Debt,
// Witnessed Death and the closeness-based bond formula (see the Systems reference).
import { D } from '../core/content.js';
import { rand, weightedKey, stochRound } from '../core/rng.js';
import * as C from './characters.js';
import * as Mg from './magic.js';
import {
  getBond,
  addBond,
  bondTier,
  addFlag,
  addHistory,
  missionBondGain,
  recordSharedMission,
} from './bonds.js';

const M = D.mission;

export const OBJECTIVES = M.objectives;

// ---------------- Combat Power ----------------
/**
 * CP for an objective. A caster adds their Repertoire at Matchup 1 unless `opts.repertoire` is false
 * (in a fight, what they actually cast is added instead).
 */
export function combatPower(c, objective, opts = {}) {
  const cl = D.classes[c.cls];
  const sum = C.statEff(c, cl.primary[0]) + C.statEff(c, cl.primary[1]);
  const gear = C.gearPower(c);
  const skill =
    (cl.skill[objective] || 0) +
    C.sumEffect(c, 'cp') +
    C.sumEffect(c, M.objectives[objective].cpEffect) +
    D.talents.growth.proficiencyCp * (c.skills?.[objective] || 0);
  const arcane = C.arcanePower(c);
  const rep = opts.repertoire === false ? 0 : Mg.repertoire(c);
  let cp =
    M.combatPower.perLevel * c.level + M.combatPower.perPrimaryStat * sum + gear + skill + arcane + rep;
  if (c.grief > 0) cp *= M.grief.cpMul;
  return cp;
}

function role(c) {
  return D.classes[c.cls].role;
}

// ---------------- Synergy ----------------
/** Team chemistry (bond tier modifiers over the number of pairs) plus composition. */
export function synergy(s, squad) {
  const S = M.synergy;
  const R = M.roles;
  const parts = [];
  let v = 0;
  const n = squad.length;
  let bondSum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      bondSum += bondTier(getBond(s, squad[i].id, squad[j].id)).mod;
      pairs++;
    }
  const chemistry = pairs ? bondSum / pairs : 0;
  if (chemistry) parts.push(['Team chemistry', chemistry]);
  v += chemistry;
  const has = (r) => squad.some((c) => role(c) === r);
  const add = (label, x) => {
    parts.push([label, x]);
    v += x;
  };
  if (has(R.front) && R.backLine.some(has)) add('Front and back lines', S.frontBack);
  if (has(R.support)) add('Support', S.support);
  if (has(R.caster) && !has(R.front)) add('Casters without a front-liner', S.casterNoFront);
  if (squad.some((c) => C.sumEffect(c, 'synergy') > 0)) add('Natural Leader', S.leader);
  v = Math.max(S.min, Math.min(S.max, v));
  return { value: v, parts };
}

// ---------------- helpers ----------------
export function zoneDef(realm, zone) {
  return D.realms[realm].zones[zone];
}

export function zoneUnlocked(s, realm, zone) {
  const z = zoneDef(realm, zone);
  if (!z.unlock) return true;
  return s.realms[realm][z.unlock.zone].explored >= z.unlock.explored;
}

/** The quarry a Hunt fights on its last step. */
export function quarryOf(z) {
  return z.hunt[0];
}

function pickEnemy(z) {
  const w = {};
  z.enemies.forEach((e) => (w[e.id] = e.w));
  return weightedKey(w);
}

/**
 * Squad Power. `cast` (a Map of caster id -> Repertoire actually cast in this fight) replaces each
 * caster's at-rest Repertoire; without it every equipped spell counts at Matchup 1 (the preview).
 */
export function squadPower(s, members, objective, enemy, hurt, cast = null) {
  const syn = synergy(s, members);
  let sum = 0;
  for (const c of members) {
    let cp = cast
      ? combatPower(c, objective, { repertoire: false }) + (cast.get(c.id) || 0)
      : combatPower(c, objective);
    if (hurt && hurt.has(c.id)) cp *= M.woundedCpMul;
    sum += Math.max(M.combatPower.minPerMember, cp);
  }
  return { cp: sum, syn, sp: sum * (1 + syn.value) };
}

export function winChance(sp, etr) {
  return sp / (sp + etr);
}

export function closeness(pWin) {
  return Math.max(M.closenessMin, 1 - 2 * Math.abs(pWin - 0.5));
}

/** 1 + 0.04 x (average effective PER - 6), clamped: sharp eyes find more. */
export function perceptionMod(members) {
  const P = M.perception;
  if (!members.length) return 1;
  const avg = members.reduce((a, c) => a + C.statEff(c, 'per'), 0) / members.length;
  return Math.max(P.min, Math.min(P.max, 1 + P.perPoint * (avg - P.pivot)));
}

/** Chance to find a Hunt's quarry on one attempt. */
export function locateChance(members) {
  const L = M.locate;
  const per = Math.max(0, ...members.map((c) => C.statEff(c, 'per')));
  const prof = Math.max(0, ...members.map((c) => c.skills?.hunt || 0));
  return Math.min(L.max, L.base + L.perPer * per + L.perProficiency * prof);
}

export function conMod(c) {
  const I = M.injury;
  return Math.min(I.conModMax, Math.max(0, (C.statEff(c, 'con') - I.conPivot) * I.conPerPoint));
}

/** Chance that one member is hurt in a fight. */
export function injuryChance(c, close, won) {
  let p = close * M.injury.base * (1 - conMod(c)) * (1 - C.armorMod(c)) * C.prodEffect(c, 'injuryMul');
  if (!won) p *= M.injury.lossMul;
  return Math.min(M.injury.cap, p);
}

/** Chance that a hurt member dies. `medic` is the product of squadDeathMul over members still standing. */
export function deathChance(c, { deathScale, won, supportAlive, alreadyWounded, medic }) {
  let p = M.death.base * deathScale * C.prodEffect(c, 'deathMul') * medic;
  if (!won) p *= M.death.lossMul;
  if (supportAlive) p *= M.death.supportAliveMul;
  if (alreadyWounded) p *= M.death.alreadyWoundedMul; // a second wound is far more dangerous
  return Math.min(M.death.cap, p);
}

/** Pre-launch estimate shown in the Expedition Hall. */
export function preview(s, ids, realm, zone, objective) {
  const members = ids.map((id) => C.byId(s, id)).filter(Boolean);
  if (!members.length) return null;
  const z = zoneDef(realm, zone);
  const pw = squadPower(s, members, objective, null);
  let etr = 0;
  let tw = 0;
  z.enemies.forEach((e) => {
    etr += D.enemies[e.id].etr * e.w;
    tw += e.w;
  });
  etr /= tw;
  const target = M.objectives[objective].finalFight ? D.enemies[quarryOf(z)] : null;
  return {
    members,
    cp: pw.cp,
    syn: pw.syn,
    sp: pw.sp,
    typicalEtr: etr,
    pTypical: winChance(pw.sp, etr),
    target,
    pTarget: target ? winChance(pw.sp, target.etr) : null,
  };
}

/** The first pair in a squad at Blood Feud, or null. */
export function bloodFeud(s, ids) {
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      if (getBond(s, ids[i], ids[j]) <= M.bloodFeud) return [C.byId(s, ids[i]), C.byId(s, ids[j])];
    }
  return null;
}

/** Every pair in a squad with its bond and tier, and the team chemistry they add up to. */
export function chemistry(s, ids) {
  const pairs = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const v = getBond(s, ids[i], ids[j]);
      pairs.push({
        a: C.byId(s, ids[i]),
        b: C.byId(s, ids[j]),
        value: v,
        tier: bondTier(v),
        feud: v <= M.bloodFeud,
      });
    }
  const value = pairs.length ? pairs.reduce((a, p) => a + p.tier.mod, 0) / pairs.length : 0;
  return { pairs, value };
}

// ---------------- time (M12) ----------------
/** The expedition a character is away on, or null. */
export function awayOn(s, id) {
  return (s.expeditions || []).find((e) => e.order.squad.includes(id)) || null;
}

/** How long a mission to a zone takes, in frames: `stepFrames` per step. */
export function missionFrames(realm, zone) {
  const z = zoneDef(realm, zone);
  return (z.stepFrames || M.timing.stepFrames) * z.steps;
}

/**
 * Sends a squad out: checks the order, pays the supplies, and records the expedition with its return
 * frame. The mission resolves when the squad returns (updateExpeditions). Returns { ok, expedition }.
 */
export function dispatch(s, o) {
  const err = validate(s, o);
  if (err) return { ok: false, error: err };
  if (s.expeditions.length >= M.timing.maxOut)
    return { ok: false, error: `Only ${M.timing.maxOut} squads can be out at once.` };
  s.player.inventory[M.supply.item] -= o.squad.length * M.supply.perMember;
  const e = {
    id: s.nextExpeditionId++,
    order: {
      realm: o.realm,
      zone: o.zone,
      objective: o.objective,
      squad: o.squad.slice(),
      retreat: o.retreat || M.defaultRetreat,
    },
    departed: s.frame,
    returns: s.frame + missionFrames(o.realm, o.zone),
    day: s.day,
  };
  s.expeditions.push(e);
  return { ok: true, expedition: e };
}

/**
 * Brings home every squad whose time is up, in the order they return (ties in the order they set
 * out): resolves each mission and queues its report. Returns the reports, oldest first.
 */
export function updateExpeditions(s) {
  if (!s.expeditions.length) return [];
  const due = s.expeditions
    .filter((e) => e.returns <= s.frame)
    .sort((a, b) => a.returns - b.returns || a.id - b.id);
  const reports = [];
  for (const e of due) {
    s.expeditions = s.expeditions.filter((x) => x !== e);
    const squad = e.order.squad.filter((id) => C.byId(s, id));
    if (!squad.length) continue;
    const rep = resolve(s, { ...e.order, squad });
    rep.departedDay = e.day;
    s.reportQueue.push(rep);
    reports.push(rep);
  }
  return reports;
}

/** The oldest unread report, removed from the queue, or null. */
export function nextReport(s) {
  return s.reportQueue.shift() || null;
}

export function validate(s, o) {
  if (!s.nexus.awake) return 'The Nexus is not awake.';
  if (!D.realms[o.realm] || !zoneDef(o.realm, o.zone)) return 'Unknown destination.';
  if (!zoneUnlocked(s, o.realm, o.zone)) return 'That zone has not been opened yet.';
  if (!M.objectives[o.objective]) return 'Unknown objective.';
  const ids = o.squad || [];
  if (new Set(ids).size !== ids.length) return 'Duplicate squad member.';
  if (ids.length < M.squad.min || ids.length > M.squad.max) {
    return 'A squad needs ' + M.squad.min + '-' + M.squad.max + ' members.';
  }
  for (const id of ids) {
    const c = C.byId(s, id);
    if (!c) return 'Unknown squad member.';
    if (C.isInjured(s, c)) return c.name + ' is recovering from an injury.';
    if (c.assignment === 'research') return c.name + ' is researching at the desk.';
    const away = awayOn(s, c.id);
    if (away) return c.name + ' is away in ' + zoneDef(away.order.realm, away.order.zone).name + '.';
  }
  const feud = bloodFeud(s, ids);
  if (feud) return `${feud[0].name} and ${feud[1].name} are in a Blood Feud and refuse to deploy together.`;
  const need = ids.length * M.supply.perMember;
  if (s.player.inventory[M.supply.item] < need) return 'You need ' + need + ' Expedition Supplies.';
  return null;
}

// ---------------- casting ----------------
/**
 * The casters' spells for one fight. Each caster casts their loadout in order while FP lasts. A cast
 * costing more than half their current FP is held back unless the squad is losing without it, and
 * then needs a Stability Check. Spends `fp` (id -> current FP) and counts pair uses. Returns the
 * Map of id -> Repertoire cast.
 */
function castSpells(s, members, objective, enemy, hurt, fp, events) {
  const I = D.knowledgeTiers.magic.instability;
  const tier = Mg.knowledgeTier(s);
  const cast = new Map();
  const risky = [];
  const use = (c, sp) => {
    const k = Mg.spellPair(sp.vector, sp.form);
    c.knowledge.pairUses[k] = (c.knowledge.pairUses[k] || 0) + 1;
  };
  for (const c of members) {
    if (!Mg.isCaster(c)) continue;
    let v = 0;
    for (const sp of c.loadout || []) {
      const cost = Mg.spellCost(c, sp);
      if (cost > fp[c.id]) continue;
      if (cost > I.threshold * fp[c.id]) {
        risky.push({ c, sp, cost });
        continue;
      }
      fp[c.id] -= cost;
      v += Mg.spellValue(c, sp) * Mg.matchup(sp.vector, enemy);
      use(c, sp);
    }
    cast.set(c.id, v);
  }
  for (const { c, sp, cost } of risky) {
    if (cost > fp[c.id]) continue;
    const pw = squadPower(s, members, objective, enemy, hurt, cast);
    if (winChance(pw.sp, enemy.etr) >= I.riskBelow) continue; // comfortably ahead: hold it back
    const chk = Mg.stabilityCheck(c, cost, fp[c.id], tier);
    fp[c.id] -= cost;
    use(c, sp);
    const name = `${D.vectors[sp.vector].name} ${D.forms[sp.form].name}`;
    let v = Mg.spellValue(c, sp) * Mg.matchup(sp.vector, enemy) * chk.mul;
    if (chk.result === 'success') events.push(`${c.name} risks a ${sp.magnitude} ${name}, and it holds.`);
    else if (chk.result === 'reduced') events.push(`${c.name}'s ${name} wavers (reduced effect).`);
    else if (chk.result === 'misfire') events.push(`${c.name}'s ${name} misfires.`);
    else if (chk.result === 'backlash') {
      hurt.add(c.id);
      events.push(`${c.name}'s ${name} backlashes, and ${c.name} is wounded.`);
    } else {
      const surge = Mg.wildSurge(enemy);
      v = surge.value;
      events.push(`${c.name}'s ${name} tears loose into a wild surge of ${D.vectors[surge.vector].name}.`);
    }
    cast.set(c.id, cast.get(c.id) + v);
  }
  return cast;
}

// ---------------- one fight ----------------
function fight(s, members, hurt, enemyKey, objective, z, events, fp) {
  const enemy = D.enemies[enemyKey];
  const cast = castSpells(s, members, objective, enemy, hurt, fp, events);
  const pw = squadPower(s, members, objective, enemy, hurt, cast);
  const pWin = winChance(pw.sp, enemy.etr);
  const won = rand() < pWin;
  const close = closeness(pWin);
  const supportAlive = members.some((c) => role(c) === M.roles.support);
  const medic = members.reduce((a, c) => a * C.prodEffect(c, 'squadDeathMul'), 1);
  const saves = [];

  events.push(
    (won ? 'Victory against ' : 'Defeated by ') + enemy.name + ' (' + Math.round(pWin * 100) + '% odds).',
  );
  const dead = [];
  for (const c of members.slice()) {
    if (rand() >= injuryChance(c, close, won)) continue;
    const odds = {
      deathScale: z.deathScale,
      won,
      supportAlive,
      alreadyWounded: hurt.has(c.id),
      medic,
    };
    const pDeath = deathChance(c, odds);
    const r = rand();
    if (r < pDeath) {
      dead.push(c);
      events.push(c.name + ' was killed.');
    } else {
      hurt.add(c.id);
      events.push(c.name + ' was wounded.');
      // Life Debt: the roll would have killed them without another member's help.
      const alone = deathChance(c, {
        ...odds,
        supportAlive: role(c) === M.roles.support,
        medic: C.prodEffect(c, 'squadDeathMul'),
      });
      if (r < alone) {
        const others = members.filter((o) => o !== c && !dead.includes(o));
        // the strongest medic among the others, else a living support
        const medics = others.filter((o) => C.prodEffect(o, 'squadDeathMul') < 1);
        medics.sort((a, b) => C.prodEffect(a, 'squadDeathMul') - C.prodEffect(b, 'squadDeathMul'));
        const saver = medics[0] || others.find((o) => role(o) === M.roles.support);
        if (saver) {
          saves.push({ saved: c, saver });
          events.push(saver.name + ' pulled ' + c.name + " back from death's edge.");
        }
      }
    }
  }
  return { won, pWin, close, enemy, dead, saves };
}

// ---------------- the mission ----------------
/** Runs a whole mission and applies its results to the state. Returns { ok, report } or { ok: false, error }. */
export function launch(s, o) {
  const err = validate(s, o);
  if (err) return { ok: false, error: err };
  s.player.inventory[M.supply.item] -= o.squad.length * M.supply.perMember;
  return { ok: true, report: resolve(s, o) };
}

/** Plays out a whole mission for an order whose supplies are paid, applies its results and returns the report. */
export function resolve(s, o) {
  const z = zoneDef(o.realm, o.zone);
  const zs = s.realms[o.realm][o.zone];
  const obj = M.objectives[o.objective];
  const squad = o.squad.map((id) => C.byId(s, id));
  const inv = s.player.inventory;

  const retreat = o.retreat || M.defaultRetreat;
  for (const c of squad) {
    if (c.missions === 0) addHistory(s, c, 'first_expedition', { zone: z.name });
    if (c.usage) c.usage[o.objective] = (c.usage[o.objective] || 0) + 1;
  }
  const encMul = squad.reduce((a, c) => a * C.prodEffect(c, 'encounterMul'), 1);
  const yieldMul = squad.reduce((a, c) => a + C.sumEffect(c, 'yieldMul'), 0);

  const rep = {
    day: s.day,
    realm: o.realm,
    zone: o.zone,
    objective: o.objective,
    retreat,
    squad: squad.map((c) => c.name),
    events: [],
    gains: {},
    levelups: [],
    injured: [],
    dead: [],
    outcome: 'success',
    stepsDone: 0,
    steps: z.steps,
    explored: 0,
    renown: 0,
    arcane: 0,
    fragments: {},
    kills: [],
    xp: {},
    lifeDebts: [],
    bonds: {},
  };
  function gain(k, n) {
    if (n > 0) {
      rep.gains[k] = (rep.gains[k] || 0) + n;
      inv[k] = (inv[k] || 0) + n;
    }
  }

  let live = squad.slice();
  const hurt = new Set();
  const deadAll = [];
  let vigor = M.vigor.start;
  let xpPool = 0;
  let bossKilled = false;
  let maxClose = 0; // the mission's closeness, for bond growth
  const fp = Object.fromEntries(squad.map((c) => [c.id, Mg.isCaster(c) ? Mg.fpMax(c) : 0])); // rested at the start
  const saves = [];
  const startSyn = synergy(s, squad);

  for (let step = 1; step <= z.steps; step++) {
    const finalFight = !!obj.finalFight && step === z.steps;
    let enemyKey = null;
    if (finalFight) enemyKey = quarryOf(z);
    else if (rand() < z.encounterChance * encMul) enemyKey = pickEnemy(z);

    let lost = false;
    if (finalFight) {
      // The locate check: find the quarry first, or turn back without the fight.
      const p = locateChance(live);
      let found = false;
      for (let t = 0; t < M.locate.tries && !found; t++) {
        if (rand() < p) found = true;
        else {
          vigor -= M.locate.vigorCost;
          rep.events.push('The squad searches for ' + D.enemies[enemyKey].name + ' but finds only tracks.');
          if (vigor <= retreat) break;
        }
      }
      if (!found) {
        rep.outcome = 'retreat';
        rep.events.push('The quarry eluded them, and the squad turned back.');
        break;
      }
      rep.events.push('The squad tracks down ' + D.enemies[enemyKey].name + '.');
    }
    if (enemyKey) {
      const f = fight(s, live, hurt, enemyKey, o.objective, z, rep.events, fp);
      maxClose = Math.max(maxClose, f.close);
      saves.push(...f.saves);
      for (const c of f.dead) {
        live = live.filter((x) => x !== c);
        deadAll.push(c);
      }
      if (f.won) {
        vigor -= M.vigor.wonFight;
        xpPool += f.enemy.xp;
        rep.kills.push(f.enemy.short);
        for (const dk in f.enemy.drops) {
          const d = f.enemy.drops[dk]; // [amount, chance]
          if (rand() < d[1]) gain(dk, d[0]);
        }
        if (finalFight && f.enemy.boss) bossKilled = true;
        if (finalFight) zs.cleared++;
      } else {
        vigor -= M.vigor.lostFight;
        lost = true;
      }
    } else {
      vigor -= M.vigor.quietStep;
      rep.events.push('Step ' + step + ': a quiet stretch of ' + z.name + '.');
    }

    if (live.length === 0) {
      rep.outcome = 'wipe';
      rep.events.push('No one is left standing. The squad is lost.');
      break;
    }
    rep.stepsDone = step;

    // Resources found along the way; sharp eyes find more.
    const perMod = perceptionMod(live);
    for (const r of z.resources) {
      gain(
        r.id,
        stochRound(
          r.base *
            (M.resourceRoll.min + rand() * M.resourceRoll.range) *
            obj.resourceShare *
            (1 + yieldMul) *
            perMod,
        ),
      );
    }

    if (finalFight && lost) {
      rep.outcome = 'retreat';
      rep.events.push('The squad could not bring down its quarry and fell back.');
      break;
    }
    if (step < z.steps && vigor <= retreat) {
      rep.outcome = 'retreat';
      rep.events.push(
        'Vigor fell to ' +
          Math.max(0, Math.round(vigor)) +
          '% — the squad turned back at your ' +
          retreat +
          '% threshold.',
      );
      break;
    }
  }
  rep.vigorEnd = Math.max(0, Math.round(vigor));
  rep.closeness = maxClose;
  if (rep.outcome === 'success' && obj.finalFight && !rep.kills.length) rep.outcome = 'retreat';

  // ----- exploration, Arcane Knowledge, Renown -----
  const frac = rep.stepsDone / z.steps;
  if (rep.outcome !== 'wipe') {
    // Time-based Explore: the map revealed per step scales with Perception.
    const delta = Math.round(
      obj.explore * frac * (obj.paysArcane ? perceptionMod(squad.filter((c) => live.includes(c))) : 1),
    );
    const before = zs.explored;
    zs.explored = Math.min(100, zs.explored + delta);
    rep.explored = zs.explored - before;
    if (obj.paysArcane) {
      rep.arcane = Math.round(z.exploreArcane * frac);
      if (rep.outcome === 'success') rep.arcane = Math.max(M.arcaneMinOnSuccess, rep.arcane);
      s.arcane += rep.arcane;
    }
    const rmul = live.reduce((a, c) => a * C.prodEffect(c, 'renownMul'), 1);
    rep.renown = Math.round(z.renown * frac * (rep.outcome === 'success' ? 1 : M.renownPartialMul) * rmul);
    s.renown += rep.renown;
  }
  if (bossKilled && !zs.bossDown) {
    zs.bossDown = true;
    const fr = D.enemies[quarryOf(z)].fragment;
    if (fr) {
      s.fragments[fr.id] = (s.fragments[fr.id] || 0) + fr.amount;
      rep.fragments[fr.id] = fr.amount;
    }
  }

  // ----- aftermath: deaths, injuries, grief, bonds, XP -----
  squad.forEach((c) => {
    if (c.grief > 0) c.grief--;
    c.missions++;
  });
  for (const c of live)
    if (hurt.has(c.id)) {
      c.injuredUntil = s.day + (rep.outcome === 'success' ? M.injuredDays.success : M.injuredDays.otherwise);
      rep.injured.push(c.name);
    }
  // Witnessed Death: every survivor grieves (unless Stoic), longer for someone they were close to.
  for (const d of deadAll) {
    rep.dead.push({ name: d.name, cls: d.cls, level: d.level });
    for (const sv of live) {
      addHistory(s, sv, 'witnessed_death', { name: d.name });
      if (C.hasEffect(sv, 'stoic')) continue;
      const close = getBond(s, sv.id, d.id) >= M.grief.bondAtLeast;
      sv.grief = Math.max(sv.grief, close ? M.grief.closeMissions : M.grief.missions);
      rep.events.push(sv.name + ' is grieving ' + d.name + '.');
    }
    C.die(s, d, 'fell in ' + z.name + ' (' + D.realms[o.realm].name + ')');
  }
  // Bonds between survivors: closeness, trait compatibility and outcome; a death draws them together.
  const success = rep.outcome === 'success';
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const [a, b] = [live[i], live[j]];
      let d = missionBondGain(a, b, maxClose, success);
      if (deadAll.length) d += M.bondGain.witnessedDeath;
      addBond(s, a.id, b.id, d);
      rep.bonds[a.name + ' & ' + b.name] = d;
      recordSharedMission(s, a, b);
    }
  // Life Debts between survivors.
  for (const { saved, saver } of saves) {
    if (!live.includes(saved) || !live.includes(saver)) continue;
    addBond(s, saved.id, saver.id, D.bonds.events.lifeDebt);
    addFlag(s, saved.id, saver.id, 'life_debt');
    saved.lean = 'protective';
    addHistory(s, saved, 'life_debt', { with: saver.name, saved: true });
    addHistory(s, saver, 'life_debt', { with: saved.name, saved: false });
    rep.lifeDebts.push({ saved: saved.name, saver: saver.name });
  }
  // XP.
  for (const c of live) {
    const amt = M.xp.base * frac + xpPool + (rep.outcome === 'success' ? M.xp.success : 0);
    const r = C.addXp(c, amt, s);
    rep.xp[c.name] = r.xp;
    for (const u of r.ups)
      rep.levelups.push({
        name: c.name,
        level: u.level,
        gains: u.gains,
        talent: u.talent,
        rolls: u.rolls,
        breakthrough: u.breakthrough,
      });
    c.kills += rep.kills.length;
  }

  rep.synergy = startSyn.value;
  s.stats.missions++;
  s.missionLog.unshift(rep);
  if (s.missionLog.length > M.logSize) s.missionLog.pop();
  return rep;
}
