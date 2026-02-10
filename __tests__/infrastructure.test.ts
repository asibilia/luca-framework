import { test, expect, describe } from 'bun:test';

describe('test infrastructure', () => {
  test('bun:test is working', () => {
    expect(1 + 1).toBe(2);
  });

  test('shared fixtures can be imported', async () => {
    const { validLucaConfig } = await import('./utils/fixtures');
    expect(validLucaConfig).toBeDefined();
    expect(validLucaConfig.branding.frameworkName).toBe('Luca');
  });

  test('temp-dir helper works', async () => {
    const { createTempDir, cleanupTempDir } = await import('./utils/temp-dir');
    const dir = await createTempDir();
    expect(dir).toContain('luca-test-');

    const { existsSync } = await import('fs');
    expect(existsSync(dir)).toBe(true);

    await cleanupTempDir(dir);
    expect(existsSync(dir)).toBe(false);
  });
});
