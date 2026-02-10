import { test, expect, describe } from 'bun:test';
import { readdir } from 'fs/promises';
import path from 'path';
import { ruleRegistry } from '../../../src/rules/index';
import type { BaseRule } from '../../../src/rules/types/rule.types';

const GENERAL_RULES_DIR = path.join(import.meta.dir, '../../../src/rules/general');

describe('rule registry completeness', () => {
  test('has entry for every source file in src/rules/general/', async () => {
    const files = await readdir(GENERAL_RULES_DIR);
    const ruleFiles = files
      .filter(f => f.endsWith('.rule.ts'))
      .map(f => f.replace('.rule.ts', ''));

    for (const ruleName of ruleFiles) {
      expect(ruleRegistry).toHaveProperty(ruleName);
    }
  });

  test('has no extra entries beyond source files', async () => {
    const files = await readdir(GENERAL_RULES_DIR);
    const ruleFiles = files
      .filter(f => f.endsWith('.rule.ts'))
      .map(f => f.replace('.rule.ts', ''));

    const registryKeys = Object.keys(ruleRegistry);
    for (const key of registryKeys) {
      expect(ruleFiles).toContain(key);
    }
  });

  test('has exactly 21 entries', () => {
    expect(Object.keys(ruleRegistry).length).toBe(21);
  });

  test('every entry can be instantiated', () => {
    for (const [_ruleName, RuleClass] of Object.entries(ruleRegistry)) {
      const instance = new (RuleClass as new () => BaseRule)();
      expect(instance).toBeDefined();
      expect(instance.description).toBeDefined();
      expect(typeof instance.description).toBe('string');
    }
  });
});
