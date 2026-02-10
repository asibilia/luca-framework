import { describe, test, expect } from 'bun:test';
import { readdirSync, existsSync, readFileSync } from 'fs';
import path from 'path';

const TEMPLATES_DIR = path.join(import.meta.dir, '../../../packages/luca-framework/templates');
const HOOKS_SCRIPTS_DIR = path.join(TEMPLATES_DIR, 'hooks', 'scripts');
const HOOKS_SETTINGS = path.join(TEMPLATES_DIR, 'hooks', 'settings-hooks.json');

describe('hook templates for luca init', () => {
  test('hooks template directory exists', () => {
    expect(existsSync(path.join(TEMPLATES_DIR, 'hooks'))).toBe(true);
  });

  test('all 5 hook scripts exist in templates', () => {
    const scripts = readdirSync(HOOKS_SCRIPTS_DIR).filter(f => f.endsWith('.sh'));
    expect(scripts.length).toBe(5);
    expect(scripts.sort()).toEqual([
      'context-monitor.sh',
      'post-edit-format.sh',
      'post-edit-typecheck.sh',
      'pre-commit-gate.sh',
      'session-persist.sh',
    ]);
  });

  test('settings-hooks.json exists and is valid', () => {
    expect(existsSync(HOOKS_SETTINGS)).toBe(true);
    const content = readFileSync(HOOKS_SETTINGS, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty('hooks');
    expect(Object.keys(parsed.hooks).sort()).toEqual([
      'PostToolUse', 'PreToolUse', 'SessionEnd', 'Stop'
    ]);
  });

  test('hook scripts in templates match src/hooks/scripts/', () => {
    const srcDir = path.join(import.meta.dir, '../../../src/hooks/scripts');
    const templateScripts = readdirSync(HOOKS_SCRIPTS_DIR).filter(f => f.endsWith('.sh'));
    const srcScripts = readdirSync(srcDir).filter(f => f.endsWith('.sh'));

    // Every template script should exist in src
    for (const script of templateScripts) {
      expect(srcScripts).toContain(script);
    }

    // Every src script should exist in templates
    for (const script of srcScripts) {
      expect(templateScripts).toContain(script);
    }
  });
});
