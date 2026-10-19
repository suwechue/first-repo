// Save migrations: MIGRATIONS[n] turns a version n save into version n + 1.
// Version 1 is the beta prototype's format, so prototype exports load and migrate.
import { D } from './content.js';

export const SAVE_VERSION = D.game.save.version;

const MIGRATIONS = {
  // v1 -> v2: the single-screen map becomes a seeded open world. The old map cannot be converted, so
  // a new world is generated: map positions, resource nodes, buildings and enemies are dropped, and the
  // roster, bonds, tech, Knowledge, inventory, armory, Nexus progress and mission log are kept.
  1(d) {
    const out = { ...d, v: 2, nodes: {}, buildings: [] };
    delete out.resources;
    delete out.enemies;
    if (!Number.isInteger(out.seed) || out.seed === 0)
      out.seed = Math.floor(d.savedAt || 0) % 2147483647 || 1;
    if (out.player && typeof out.player === 'object') {
      out.player = { ...out.player };
      for (const k of ['x', 'y', 'w', 'h']) delete out.player[k]; // placed at the new world's spawn
    }
    return out;
  },
  // v2 -> v3: character depth (M9). Characters gain talent ranks, proficiency, objective usage,
  // a history and recent level-ups; each bonded pair gains a record whose clock starts on load.
  2(d) {
    const objectives = Object.keys(D.mission.objectives);
    const zeros = () => Object.fromEntries(objectives.map((o) => [o, 0]));
    const out = { ...d, v: 3, bondMeta: {} };
    const upgrade = (c) => ({
      talentRanks: Object.fromEntries((c.talents || []).map((t) => [t, 1])),
      skills: zeros(),
      usage: zeros(),
      history: [{ day: 1, event: 'joined', how: 'before records were kept' }],
      ups: [],
      lean: null,
      ...c,
    });
    if (Array.isArray(out.roster)) out.roster = out.roster.map(upgrade);
    if (out.recruitOffer && typeof out.recruitOffer === 'object')
      out.recruitOffer = upgrade(out.recruitOffer);
    for (const k of Object.keys(out.bonds || {}))
      out.bondMeta[k] = { since: d.day || 1, missions: 0, flags: [] };
    return out;
  },
  // v3 -> v4: Axiom Magic (M10). A caster's Vectors become known at affinity 1 with the first Form,
  // and they carry that spell at Minor; everyone gains an empty spellbook.
  3(d) {
    const form = D.knowledgeTiers.magic.startForm;
    const upgrade = (c) => {
      if (c.knowledge) return c;
      const caster = !!D.classes[c.cls]?.caster;
      const vectors = caster ? c.vectors || [] : [];
      return {
        ...c,
        knowledge: {
          vectors: Object.fromEntries(vectors.map((v) => [v, 1])),
          forms: vectors.length ? { [form]: 1 } : {},
          pairUses: {},
          magnitudes: {},
        },
        loadout: vectors.length ? [{ vector: vectors[0], form, magnitude: 'minor' }] : [],
        specialization: null,
      };
    };
    const out = { ...d, v: 4 };
    if (Array.isArray(out.roster)) out.roster = out.roster.map(upgrade);
    if (out.recruitOffer && typeof out.recruitOffer === 'object')
      out.recruitOffer = upgrade(out.recruitOffer);
    return out;
  },
  // v4 -> v5: Hall v2 (M11). Saved squads, and every character's origin.
  4(d) {
    const origin = D.tiers.recruit.origin;
    const withOrigin = (c) => (c && typeof c === 'object' && !c.origin ? { ...c, origin } : c);
    const out = { ...d, v: 5, squads: [] };
    if (Array.isArray(out.roster)) out.roster = out.roster.map(withOrigin);
    out.recruitOffer = withOrigin(out.recruitOffer);
    return out;
  },
  // v5 -> v6: timed missions (M12). No squads are out in an older save.
  5(d) {
    return { ...d, v: 6, expeditions: [], reportQueue: [], nextExpeditionId: 1 };
  },
  // v6 -> v7: research (M13). No one is seated at a desk yet.
  6(d) {
    const seat = (c) => (c && typeof c === 'object' && !('assignment' in c) ? { ...c, assignment: null } : c);
    return {
      ...d,
      v: 7,
      researchCarry: 0,
      roster: Array.isArray(d.roster) ? d.roster.map(seat) : d.roster,
      recruitOffer: seat(d.recruitOffer),
    };
  },
  // v7 -> v8: gear (M14). Armory counts become individual pieces, a character's weapon and armor
  // move into the weapon and body slots, and the player's best weapon damage becomes a weapon worn.
  7(d) {
    let next = 1;
    const make = (base) => ({ id: 'i' + next++, base, quality: 'standard', props: [] });
    const slots = () => ({ weapon: null, offhand: null, head: null, body: null, hands: null, feet: null });
    const armory = [];
    for (const [base, n] of Object.entries(d.armory && !Array.isArray(d.armory) ? d.armory : {}))
      if (D.items[base]) for (let k = 0; k < n; k++) armory.push(make(base));
    const regear = (c) => {
      if (!c || typeof c !== 'object' || !c.gear || 'feet' in c.gear) return c;
      const g = slots();
      if (c.gear.weapon && D.items[c.gear.weapon]) g.weapon = make(c.gear.weapon);
      if (c.gear.armor && D.items[c.gear.armor]) g.body = make(c.gear.armor);
      return { ...c, gear: g };
    };
    const player = d.player && typeof d.player === 'object' ? { ...d.player, gear: slots() } : d.player;
    if (player && player.weaponDmg > 1) {
      const best = Object.keys(D.items)
        .filter((k) => D.items[k].slot === 'weapon' && D.items[k].dmg <= player.weaponDmg)
        .sort((a, b) => D.items[b].dmg - D.items[a].dmg)[0];
      if (best) player.gear.weapon = make(best);
    }
    if (player) delete player.weaponDmg;
    return {
      ...d,
      v: 8,
      player,
      armory,
      roster: Array.isArray(d.roster) ? d.roster.map(regear) : d.roster,
      recruitOffer: regear(d.recruitOffer),
      nextItemId: next,
    };
  },
  // v8 -> v9: overworld combat (M15). The player gains stamina, full.
  8(d) {
    const max = D.game.combat.stamina.max;
    const player =
      d.player && typeof d.player === 'object' ? { stamina: max, maxStamina: max, ...d.player } : d.player;
    return { ...d, v: 9, player };
  },
};

/** Returns { data } at SAVE_VERSION, or { error } with a message for the player. */
export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { error: 'Not a save file.' };
  if (typeof data.v !== 'number') return { error: 'Not a save file (no version number).' };
  if (data.v > SAVE_VERSION) {
    return { error: 'This save is from a newer version of the game (v' + data.v + ').' };
  }
  let d = data;
  while (d.v < SAVE_VERSION) {
    const step = MIGRATIONS[d.v];
    if (!step) return { error: 'Unsupported save version: ' + d.v };
    d = step(d);
  }
  return { data: d };
}
