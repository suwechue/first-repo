// The parts of the port that still follow the beta's rules must behave exactly like the beta
// prototype. Both run on identical random streams, so every roll has to match field for field.
// M9 replaced the beta's growth, bond and synergy rules on purpose (docs/SPEC.md, Systems reference),
// so whole mission campaigns no longer match; the exact M1 port is kept at git tag `beta-port`.
// Characters carry fields the beta never had, so they are compared on the beta's fields only.
import { describe, it, expect, afterEach } from 'vitest';
import { loadReference, referenceAvailable } from '../tools/reference.js';
import { createRng, useRandomSource } from '../src/core/rng.js';
import { makeInitialState } from '../src/core/state.js';
import { initStarters } from '../src/systems/characters.js';
import { generate } from '../src/systems/recruiting.js';

const plain = (o) => JSON.parse(JSON.stringify(o));
/** The port's character limited to the fields the beta's character has. */
const asBeta = (c, ref) => Object.fromEntries(Object.keys(ref).map((k) => [k, plain(c)[k]]));

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
      expect(s.roster.map((c, i) => asBeta(c, ref.state.roster[i]))).toEqual(plain(ref.state.roster));
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
      expect(asBeta(b, a)).toEqual(plain(a));
      // Names must stay unique against the roster, so keep both rosters in step.
      ref.state.roster.push(a);
      s.roster.push(b);
      if (ref.state.roster.length > 20) {
        ref.state.roster.shift();
        s.roster.shift();
      }
    }
  });
});
