import { describe, test, expect } from 'bun:test';
import { readdirSync } from 'fs';
import path from 'path';
import { hookRegistry, generateHooksConfig } from '../../../src/hooks/index';

const HOOK_SCRIPTS_DIR = path.join(import.meta.dir, '../../../src/hooks/scripts');

describe('hookRegistry', () => {
  test('every hook entry has a corresponding script file', () => {
    const scriptFiles = readdirSync(HOOK_SCRIPTS_DIR);
    for (const [name, def] of Object.entries(hookRegistry)) {
      expect(scriptFiles).toContain(def.script);
    }
  });

  test('generateHooksConfig produces valid structure', () => {
    const config = generateHooksConfig(hookRegistry);
    // Should have at least one event
    expect(Object.keys(config).length).toBeGreaterThan(0);

    // Each event should be an array of matcher groups
    for (const [event, groups] of Object.entries(config)) {
      expect(Array.isArray(groups)).toBe(true);
      for (const group of groups as Array<Record<string, unknown>>) {
        expect(group).toHaveProperty('hooks');
        expect(Array.isArray(group.hooks)).toBe(true);
      }
    }
  });

  test('all hook commands reference .claude/hooks/ path', () => {
    const config = generateHooksConfig(hookRegistry);
    for (const groups of Object.values(config)) {
      for (const group of groups as Array<{ hooks: Array<{ command: string }> }>) {
        for (const hook of group.hooks) {
          expect(hook.command).toContain('.claude/hooks/');
        }
      }
    }
  });
});
