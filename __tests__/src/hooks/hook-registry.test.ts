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

  test('has exactly 5 entries', () => {
    expect(Object.keys(hookRegistry).length).toBe(5);
  });

  test('post-edit-typecheck is async', () => {
    expect(hookRegistry['post-edit-typecheck'].async).toBe(true);
  });

  test('pre-commit-gate is synchronous', () => {
    expect(hookRegistry['pre-commit-gate'].async).toBe(false);
  });

  test('post-edit hooks share the same event and matcher', () => {
    const format = hookRegistry['post-edit-format'];
    const typecheck = hookRegistry['post-edit-typecheck'];
    expect(format.event).toBe(typecheck.event);
    expect(format.matcher).toBe(typecheck.matcher);
  });

  test('pre-commit-gate matches Bash tool', () => {
    expect(hookRegistry['pre-commit-gate'].event).toBe('PreToolUse');
    expect(hookRegistry['pre-commit-gate'].matcher).toBe('Bash');
  });

  test('generateHooksConfig groups same-event-same-matcher hooks', () => {
    const config = generateHooksConfig(hookRegistry);
    // PostToolUse should have 1 group with 2 hooks (format + typecheck)
    const postToolUse = config.PostToolUse as Array<{ hooks: unknown[] }>;
    expect(postToolUse.length).toBe(1);
    expect(postToolUse[0].hooks.length).toBe(2);
  });

  test('context-monitor fires on Stop event', () => {
    expect(hookRegistry['context-monitor'].event).toBe('Stop');
    expect(hookRegistry['context-monitor'].matcher).toBeUndefined();
  });

  test('session-persist fires on SessionEnd event', () => {
    expect(hookRegistry['session-persist'].event).toBe('SessionEnd');
    expect(hookRegistry['session-persist'].matcher).toBeUndefined();
  });

  test('generateHooksConfig produces 4 event types', () => {
    const config = generateHooksConfig(hookRegistry);
    const events = Object.keys(config).sort();
    expect(events).toEqual(['PostToolUse', 'PreToolUse', 'SessionEnd', 'Stop']);
  });
});
