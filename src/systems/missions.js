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
import { D } from '../core/content.js';
import { rand, weightedKey, stochRound } from '../core/rng.js';
import * as C from './characters.js';
import { getBond, addBond, bondTier, inPairs } from './bonds.js';

const M = D.mission;

export const OBJECTIVES = M.objectives;

// ---------------- Combat Power ----------------
export function combatPower(c, objective) {
  const cl = D.classes[c.cls];
  const sum = C.statEff(c, cl.primary[0]) + C.statEff(c, cl.primary[1]);
  const gear = C.gearPower(c);
  const skill =
    (cl.skill[objective] || 0) + C.sumEffect(c, 'cp') + C.sumEffect(c, M.objectives[objective].cpEffect);
  const arcane = C.arcanePower(c);
  let cp = M.combatPower.perLevel * c.level + M.combatPower.perPrimaryStat * sum + gear + skill + arcane;
  if (c.grief > 0) cp *= M.grief.cpMul;
  return cp;
}

function role(c) {
  return D.classes[c.cls].role;
}

// ---------------- Synergy ----------------
export function synergy(s, squad) {
  const S = M.synergy;
  const parts = [];
  let v = 0;
  const n = squad.length;
  // Every pair contributes its bond tier modifier, divided by (n - 1)
  // so a full squad is not six times stronger than a pair for the same relationships.
  let bondSum = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) bondSum += bondTier(getBond(s, squad[i].id, squad[j].id)).mod;
  const bondPart = n > 1 ? bondSum / (n - 1) : 0;
  if (bondPart) parts.push(['Bonds', bondPart]);
  v += bondPart;
  let tr = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (const ta of squad[i].traits)
        for (const tb of squad[j].traits) {
          if (inPairs(D.traits.clash, ta, tb)) tr -= S.traitPair;
          if (inPairs(D.traits.synergy, ta, tb)) tr += S.traitPair;
        }
  if (tr) {
    parts.push(['Trait clashes/synergies', tr]);
    v += tr;
  }
  if (squad.some((c) => role(c) === M.roles.front)) {
    parts.push(['Front-liner', S.frontLiner]);
    v += S.frontLiner;
  }
  if (squad.some((c) => role(c) === M.roles.support)) {
    parts.push(['Support', S.support]);
    v += S.support;
  }
  if (squad.some((c) => C.sumEffect(c, 'synergy') > 0)) {
    parts.push(['Natural Leader', S.leader]);
    v += S.leader;
  }
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

export function matchupBonus(c, enemy) {
  let b = 0;
  for (const v of c.vectors) {
    if (enemy.weakTo.indexOf(v) >= 0) b += M.matchup.weakTo;
    if (enemy.resists.indexOf(v) >= 0) b += M.matchup.resists;
  }
  return b;
}

export function squadPower(s, members, objective, enemy, hurt) {
  const syn = synergy(s, members);
  let sum = 0;
  for (const c of members) {
    let cp = combatPower(c, objective);
    if (enemy) cp += matchupBonus(c, enemy);
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
  }
  const need = ids.length * M.supply.perMember;
  if (s.player.inventory[M.supply.item] < need) return 'You need ' + need + ' Expedition Supplies.';
  return null;
}

// ---------------- one fight ----------------
function fight(s, members, hurt, enemyKey, objective, z, events) {
  const enemy = D.enemies[enemyKey];
  const pw = squadPower(s, members, objective, enemy, hurt);
  const pWin = winChance(pw.sp, enemy.etr);
  const won = rand() < pWin;
  const close = closeness(pWin);
  const supportAlive = members.some((c) => role(c) === M.roles.support);
  const medic = members.reduce((a, c) => a * C.prodEffect(c, 'squadDeathMul'), 1);

  events.push(
    (won ? 'Victory against ' : 'Defeated by ') + enemy.name + ' (' + Math.round(pWin * 100) + '% odds).',
  );
  const dead = [];
  for (const c of members.slice()) {
    if (rand() >= injuryChance(c, close, won)) continue;
    const pDeath = deathChance(c, {
      deathScale: z.deathScale,
      won,
      supportAlive,
      alreadyWounded: hurt.has(c.id),
      medic,
    });
    if (rand() < pDeath) {
      dead.push(c);
      events.push(c.name + ' was killed.');
    } else {
      hurt.add(c.id);
      events.push(c.name + ' was wounded.');
    }
  }
  return { won, pWin, enemy, dead };
}

// ---------------- the mission ----------------
/** Runs a whole mission and applies its results to the state. Returns { ok, report } or { ok: false, error }. */
export function launch(s, o) {
  const err = validate(s, o);
  if (err) return { ok: false, error: err };

  const z = zoneDef(o.realm, o.zone);
  const zs = s.realms[o.realm][o.zone];
  const obj = M.objectives[o.objective];
  const squad = o.squad.map((id) => C.byId(s, id));
  const inv = s.player.inventory;
  inv[M.supply.item] -= squad.length * M.supply.perMember;

  const retreat = o.retreat || M.defaultRetreat;
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
  const startSyn = synergy(s, squad);

  for (let step = 1; step <= z.steps; step++) {
    const finalFight = !!obj.finalFight && step === z.steps;
    let enemyKey = null;
    if (finalFight) enemyKey = quarryOf(z);
    else if (rand() < z.encounterChance * encMul) enemyKey = pickEnemy(z);

    let lost = false;
    if (enemyKey) {
      const f = fight(s, live, hurt, enemyKey, o.objective, z, rep.events);
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

    // Resources found along the way.
    for (const r of z.resources) {
      gain(
        r.id,
        stochRound(
          r.base * (M.resourceRoll.min + rand() * M.resourceRoll.range) * obj.resourceShare * (1 + yieldMul),
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
  if (rep.outcome === 'success' && obj.finalFight && !rep.kills.length) rep.outcome = 'retreat';

  // ----- exploration, Arcane Knowledge, Renown -----
  const frac = rep.stepsDone / z.steps;
  if (rep.outcome !== 'wipe') {
    const delta = Math.round(obj.explore * frac);
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
  for (const d of deadAll) {
    rep.dead.push({ name: d.name, cls: d.cls, level: d.level });
    for (const sv of live) {
      if (C.hasEffect(sv, 'stoic')) continue;
      if (getBond(s, sv.id, d.id) >= M.grief.bondAtLeast) {
        sv.grief = M.grief.missions;
        rep.events.push(sv.name + ' is grieving ' + d.name + '.');
      }
    }
    C.die(s, d, 'fell in ' + z.name + ' (' + D.realms[o.realm].name + ')');
  }
  // Bonds between survivors.
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      addBond(s, live[i].id, live[j].id, rep.outcome === 'success' ? M.bondGain.success : M.bondGain.retreat);
    }
  // XP.
  for (const c of live) {
    const amt = M.xp.base * frac + xpPool + (rep.outcome === 'success' ? M.xp.success : 0);
    const r = C.addXp(c, amt);
    rep.xp[c.name] = r.xp;
    for (const u of r.ups)
      rep.levelups.push({ name: c.name, level: u.level, gains: u.gains, talent: u.talent });
    c.kills += rep.kills.length;
  }

  rep.synergy = startSyn.value;
  s.stats.missions++;
  s.dayTimer += Math.floor(s.dayLength * M.clockDayFraction);
  s.missionLog.unshift(rep);
  if (s.missionLog.length > M.logSize) s.missionLog.pop();
  return { ok: true, report: rep };
}
