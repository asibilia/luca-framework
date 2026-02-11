import { describe, test, expect } from 'bun:test';
import {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
  COMPLEXITY_TIER,
  meetsThreshold,
  getTier,
} from '../../../src/complexity';
import type { ComplexityLevel } from '../../../src/complexity';

describe('complexity levels', () => {
  test('has exactly 5 levels', () => {
    expect(COMPLEXITY_LEVELS).toHaveLength(5);
  });

  test('levels are in order from least to most complex', () => {
    expect(COMPLEXITY_LEVELS).toEqual(['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL']);
  });

  test('COMPLEXITY_ORDER maps each level to a numeric index', () => {
    expect(COMPLEXITY_ORDER.TRIVIAL).toBe(0);
    expect(COMPLEXITY_ORDER.SIMPLE).toBe(1);
    expect(COMPLEXITY_ORDER.MODERATE).toBe(2);
    expect(COMPLEXITY_ORDER.COMPLEX).toBe(3);
    expect(COMPLEXITY_ORDER.CRITICAL).toBe(4);
  });
});

describe('complexity tiers', () => {
  test('TRIVIAL and SIMPLE are lightweight', () => {
    expect(COMPLEXITY_TIER.TRIVIAL).toBe('lightweight');
    expect(COMPLEXITY_TIER.SIMPLE).toBe('lightweight');
  });

  test('MODERATE is standard', () => {
    expect(COMPLEXITY_TIER.MODERATE).toBe('standard');
  });

  test('COMPLEX and CRITICAL are thorough', () => {
    expect(COMPLEXITY_TIER.COMPLEX).toBe('thorough');
    expect(COMPLEXITY_TIER.CRITICAL).toBe('thorough');
  });

  test('getTier returns correct tier', () => {
    expect(getTier('TRIVIAL')).toBe('lightweight');
    expect(getTier('MODERATE')).toBe('standard');
    expect(getTier('CRITICAL')).toBe('thorough');
  });
});

describe('meetsThreshold', () => {
  test('same level meets its own threshold', () => {
    for (const level of COMPLEXITY_LEVELS) {
      expect(meetsThreshold(level, level)).toBe(true);
    }
  });

  test('higher level meets lower threshold', () => {
    expect(meetsThreshold('COMPLEX', 'SIMPLE')).toBe(true);
    expect(meetsThreshold('MODERATE', 'TRIVIAL')).toBe(true);
    expect(meetsThreshold('CRITICAL', 'MODERATE')).toBe(true);
  });

  test('lower level does not meet higher threshold', () => {
    expect(meetsThreshold('TRIVIAL', 'SIMPLE')).toBe(false);
    expect(meetsThreshold('SIMPLE', 'MODERATE')).toBe(false);
    expect(meetsThreshold('MODERATE', 'COMPLEX')).toBe(false);
    expect(meetsThreshold('COMPLEX', 'CRITICAL')).toBe(false);
  });
});
