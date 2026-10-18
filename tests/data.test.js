// Data validation: the shipped content is consistent, and the checker catches broken references.
import { describe, it, expect } from 'vitest';
import { RAW, D } from '../src/core/content.js';
import { checkData } from '../tools/check-data.js';

describe('Content data', () => {
  it('passes check:data', () => {
    expect(checkData(RAW)).toEqual([]);
  });

  it('reports a zone that lists a missing enemy, and a misspelled tech prerequisite', () => {
    const broken = structuredClone(RAW);
    broken.realms.verdant_wilds.zones.fringe.enemies.push({ id: 'dire_badger', w: 5 });
    broken.tech.cooking.prereq = ['fire_makin'];
    const errors = checkData(broken);
    expect(errors).toContain('realms.verdant_wilds.fringe.enemies: unknown enemy "dire_badger"');
    expect(errors).toContain('tech.cooking.prereq: unknown tech "fire_makin"');
  });

  it('is frozen at runtime, so game state can never leak into content', () => {
    expect(Object.isFrozen(D.tech.cooking)).toBe(true);
    expect(() => {
      'use strict';
      D.tech.cooking.cost = 0;
    }).toThrow();
  });
});
