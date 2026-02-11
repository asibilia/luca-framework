import { describe, test, expect } from 'bun:test';
import { loadHarnessConfig } from '../../../src/harness/runner';
import { DEFAULT_HARNESS_CONFIG } from '../../../src/harness/types';
import path from 'path';

const PROJECT_DIR = path.join(import.meta.dir, '../../..');

describe('harness config loading', () => {
  test('loads config from .planning/config.json', async () => {
    const config = await loadHarnessConfig(PROJECT_DIR);
    expect(config).toBeDefined();
    expect(config.enabled).toBe(true);
  });

  test('default config has 4 checks', () => {
    expect(DEFAULT_HARNESS_CONFIG.checks).toHaveLength(4);
  });

  test('default config enables test and typecheck', () => {
    const testCheck = DEFAULT_HARNESS_CONFIG.checks.find(c => c.name === 'test');
    const typecheckCheck = DEFAULT_HARNESS_CONFIG.checks.find(c => c.name === 'typecheck');
    expect(testCheck?.enabled).toBe(true);
    expect(typecheckCheck?.enabled).toBe(true);
  });

  test('default config disables lint', () => {
    const lintCheck = DEFAULT_HARNESS_CONFIG.checks.find(c => c.name === 'lint');
    expect(lintCheck?.enabled).toBe(false);
  });

  test('maxFixIterations defaults to 3', () => {
    expect(DEFAULT_HARNESS_CONFIG.maxFixIterations).toBe(3);
  });

  test('loaded project config has 4 checks', async () => {
    const config = await loadHarnessConfig(PROJECT_DIR);
    expect(config.checks).toHaveLength(4);
  });

  test('loaded project config enables build', async () => {
    const config = await loadHarnessConfig(PROJECT_DIR);
    const buildCheck = config.checks.find(c => c.name === 'build');
    expect(buildCheck?.enabled).toBe(true);
  });

  test('loaded project config disables lint', async () => {
    const config = await loadHarnessConfig(PROJECT_DIR);
    const lintCheck = config.checks.find(c => c.name === 'lint');
    expect(lintCheck?.enabled).toBe(false);
  });

  test('falls back to defaults when no harness section exists', async () => {
    // Use a temp dir without config
    const tmpDir = '/tmp/harness-test-no-config-' + Date.now();
    const config = await loadHarnessConfig(tmpDir);
    expect(config.enabled).toBe(DEFAULT_HARNESS_CONFIG.enabled);
    expect(config.checks).toHaveLength(DEFAULT_HARNESS_CONFIG.checks.length);
    expect(config.maxFixIterations).toBe(DEFAULT_HARNESS_CONFIG.maxFixIterations);
  });
});
