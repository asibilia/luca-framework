import { describe, test, expect } from 'bun:test';

describe('version-check', () => {
  test('checkForUpdates does not throw on import and call', async () => {
    const { checkForUpdates } = await import(
      '../../../../../packages/luca-framework/src/utils/version-check'
    );
    expect(typeof checkForUpdates).toBe('function');
    // Should not throw -- silently handles all errors
    expect(() => checkForUpdates()).not.toThrow();
  });

  test('module exports checkForUpdates function', async () => {
    const mod = await import(
      '../../../../../packages/luca-framework/src/utils/version-check'
    );
    expect(mod.checkForUpdates).toBeDefined();
    expect(typeof mod.checkForUpdates).toBe('function');
  });
});
