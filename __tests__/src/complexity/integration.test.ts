import { describe, test, expect } from 'bun:test';
import { ruleRegistry } from '../../../src/rules/index';
import {
  COMPLEXITY_LEVELS,
  DEFAULT_COMPLEXITY_CONFIG,
  DEFAULT_COMPLEXITY_MATRIX,
  COMPLEXITY_CLASSIFICATIONS,
  meetsThreshold,
} from '../../../src/complexity';

describe('complexity integration', () => {
  test('complexity-gating rule is registered', () => {
    expect(ruleRegistry).toHaveProperty('complexity-gating');
  });

  test('project config.json has complexity section', async () => {
    const file = Bun.file('.planning/config.json');
    const config = await file.json();
    expect(config).toHaveProperty('complexity');
    expect(config.complexity.defaultLevel).toBe('auto');
    expect(config.complexity.matrix).toBeDefined();
    for (const level of COMPLEXITY_LEVELS) {
      expect(config.complexity.matrix).toHaveProperty(level);
    }
  });

  test('template config.json has complexity section', async () => {
    const file = Bun.file('packages/luca-framework/templates/framework/templates/config.json');
    const config = await file.json();
    expect(config).toHaveProperty('complexity');
    expect(config.complexity.matrix).toBeDefined();
  });

  test('matrix entries have all required gate fields', () => {
    const requiredFields = [
      'cognitivePreflight',
      'research',
      'discussion',
      'planVerificationIterations',
      'harnessFixIterations',
      'verificationMode',
      'codeReviewAgents',
      'uat',
      'learningCapture',
    ];

    for (const level of COMPLEXITY_LEVELS) {
      const gate = DEFAULT_COMPLEXITY_MATRIX[level];
      for (const field of requiredFields) {
        expect(gate).toHaveProperty(field);
      }
    }
  });

  test('lightweight tier skips code review', () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.TRIVIAL.codeReviewAgents).toEqual([]);
    expect(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.codeReviewAgents).toEqual([]);
  });

  test('thorough tier enables all code review agents', () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.codeReviewAgents.length).toBeGreaterThanOrEqual(3);
    expect(DEFAULT_COMPLEXITY_MATRIX.CRITICAL.codeReviewAgents).toContain('security-auditor');
  });

  test('classifications and matrix have same level keys', () => {
    const classificationKeys = Object.keys(COMPLEXITY_CLASSIFICATIONS).sort();
    const matrixKeys = Object.keys(DEFAULT_COMPLEXITY_MATRIX).sort();
    expect(classificationKeys).toEqual(matrixKeys);
  });

  test('verification modes scale with complexity', () => {
    expect(DEFAULT_COMPLEXITY_MATRIX.TRIVIAL.verificationMode).toBe('quick');
    expect(DEFAULT_COMPLEXITY_MATRIX.SIMPLE.verificationMode).toBe('quick');
    expect(DEFAULT_COMPLEXITY_MATRIX.MODERATE.verificationMode).toBe('standard');
    expect(DEFAULT_COMPLEXITY_MATRIX.COMPLEX.verificationMode).toBe('full');
    expect(DEFAULT_COMPLEXITY_MATRIX.CRITICAL.verificationMode).toBe('full+human');
  });

  test('state template mentions 5 levels', async () => {
    const file = Bun.file('packages/luca-framework/templates/framework/templates/state.md');
    const content = await file.text();
    expect(content).toContain('TRIVIAL');
    expect(content).toContain('SIMPLE');
    expect(content).toContain('MODERATE');
    expect(content).toContain('COMPLEX');
    expect(content).toContain('CRITICAL');
  });

  test('complexity reference document exists', async () => {
    const file = Bun.file('packages/luca-framework/templates/framework/references/complexity-matrix.md');
    const exists = await file.exists();
    expect(exists).toBe(true);
  });
});
