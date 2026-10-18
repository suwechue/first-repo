// The port must behave exactly like the beta prototype. Both run on identical random streams,
// so every roll, report and resulting state has to match field for field.
import { describe, it, expect, afterEach } from 'vitest';
import { loadReference, referenceAvailable } from '../tools/reference.js';
import { createRng, useRandomSource } from '../src/core/rng.js';
import { makeInitialState } from '../src/core/state.js';
import { initStarters, byId, isInjured } from '../src/systems/characters.js';
import { generate, refreshOffer, recruit } from '../src/systems/recruiting.js';
import { launch, zoneUnlocked } from '../src/systems/missions.js';

const plain = (o) => JSON.parse(JSON.stringify(o));

function pair(seed) {
  const ref = loadReference(createRng(seed));
  ref.resetState();
  useRandomSource(createRng(seed));
  const s = makeInitialState();
  return { ref, s };
}

afterEach(() => useRandomSource(null));

describe.skipIf(!referenceAvailable())('equivalence with the beta prototype', () => {
  it('builds the same starter roster and starting bonds', () => {
    for (const seed of [1, 2, 3, 99]) {
      const { ref, s } = pair(seed);
      ref.characters.initStarters();
      initStarters(s);
      expect(plain(s.roster)).toEqual(plain(ref.state.roster));
      expect(plain(s.bonds)).toEqual(plain(ref.state.bonds));
    }
  });

  it('generates the same recruits, with and without mage research', () => {
    const { ref, s } = pair(7);
    for (let i = 0; i < 400; i++) {
      const mages = i >= 200;
      ref.config.TECH.elemental_attunement.unlocked = mages;
      s.tech.elemental_attunement = mages;
      const a = ref.characters.generate();
      const b = generate(s);
      expect(plain(b)).toEqual(plain(a));
      // Names must stay unique against the roster, so keep both rosters in step.
      ref.state.roster.push(a);
      s.roster.push(b);
      if (ref.state.roster.length > 20) {
        ref.state.roster.shift();
        s.roster.shift();
      }
    }
  });

  it('resolves long mission campaigns identically', () => {
    const seen = { missions: 0, deaths: 0, levelups: 0, talents: 0, wipes: 0, bosses: 0 };
    for (const seed of [11, 12, 13]) {
      const { ref, s } = pair(seed);
      const choose = createRng(seed * 1000); // drives the choices for both sides
      ref.characters.initStarters();
      initStarters(s);
      ref.state.nexus.awake = s.nexus.awake = true;
      ref.state.player.inventory.food = s.player.inventory.food = 10000;
      const realm = 'verdant_wilds';
      const zones = Object.keys(s.realms[realm]);
      const objectives = ['explore', 'gather', 'hunt'];
      const retreats = [25, 35, 50, 70];

      for (let m = 0; m < 150; m++) {
        ref.state.player.inventory.supplies = s.player.inventory.supplies = 8;
        // A new day every few missions: recruits arrive and the wounded heal.
        if (m % 3 === 0) {
          ref.state.day++;
          s.day++;
          ref.characters.refreshOffer();
          refreshOffer(s);
          expect(plain(s.recruitOffer)).toEqual(plain(ref.state.recruitOffer));
          if (s.roster.length < 6) {
            const a = ref.characters.recruit();
            const b = recruit(s);
            expect(b.ok).toBe(a.ok);
          }
        }
        const open = zones.filter((z) => zoneUnlocked(s, realm, z));
        const zone = open[Math.floor(choose() * open.length)];
        const objective = objectives[Math.floor(choose() * 3)];
        const retreat = retreats[Math.floor(choose() * 4)];
        const healthy = s.roster.filter((c) => !isInjured(s, c)).map((c) => c.id);
        if (healthy.length < 2) {
          ref.state.day += 3;
          s.day += 3;
          continue;
        }
        const size = Math.min(healthy.length, 2 + Math.floor(choose() * 3));
        const start = Math.floor(choose() * healthy.length);
        const squad = healthy.slice(start).concat(healthy.slice(0, start)).slice(0, size);
        expect(squad.every((id) => byId(s, id))).toBe(true);

        const order = { realm, zone, objective, squad, retreat };
        const a = ref.missions.launch(plain(order));
        const b = launch(s, plain(order));
        seen.missions++;
        seen.deaths += b.report.dead.length;
        seen.levelups += b.report.levelups.length;
        seen.talents += b.report.levelups.filter((u) => u.talent).length;
        seen.wipes += b.report.outcome === 'wipe' ? 1 : 0;
        seen.bosses += Object.keys(b.report.fragments).length;
        expect(plain(b)).toEqual(plain(a));
        expect(plain(s.roster)).toEqual(plain(ref.state.roster));
        expect(plain(s.bonds)).toEqual(plain(ref.state.bonds));
        expect(plain(s.memorial)).toEqual(plain(ref.state.memorial));
        expect(plain(s.realms)).toEqual(plain(ref.state.realms));
        expect(plain(s.player.inventory)).toEqual(plain(ref.state.player.inventory));
        expect([s.renown, s.arcane, s.dayTimer]).toEqual([
          ref.state.renown,
          ref.state.arcane,
          ref.state.dayTimer,
        ]);
        expect(plain(s.fragments)).toEqual(plain(ref.state.fragments));
        if (!s.roster.length) break;
      }
    }
    // The campaigns must actually exercise deaths, growth, talents and the boss.
    expect(seen.missions).toBeGreaterThan(300);
    expect(seen.deaths).toBeGreaterThan(5);
    expect(seen.talents).toBeGreaterThan(10);
    expect(seen.bosses).toBeGreaterThan(0);
  });
});
