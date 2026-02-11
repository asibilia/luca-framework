import { test, expect, describe } from 'bun:test';
import { readdir, lstat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { agentRegistry } from '../../src/agents/index';
import { skillRegistry } from '../../src/skills/index';
import { ruleRegistry } from '../../src/rules/index';

const ROOT = path.join(import.meta.dir, '../..');
const CURSOR_DIR = path.join(ROOT, '.cursor');
const CLAUDE_DIR = path.join(ROOT, '.claude');

/**
 * These tests verify post-build output correctness.
 * They are automatically skipped if build artifacts don't exist.
 * Run `bun run build:all` to generate the artifacts first.
 */

const hasBuildOutput = existsSync(path.join(CURSOR_DIR, 'agents')) &&
  existsSync(path.join(CLAUDE_DIR, 'agents'));

describe.skipIf(!hasBuildOutput)('build output — .cursor', () => {
  describe('agents', () => {
    const agentsDir = path.join(CURSOR_DIR, 'agents');

    test('contains expected number of agent files (registry + luca-specific)', async () => {
      const files = await readdir(agentsDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      // 23 general (from agentRegistry) + 2 luca-specific (lu-executor, lu-planner)
      expect(mdFiles.length).toBe(Object.keys(agentRegistry).length + 2);
    });

    test('every registry agent has a corresponding .md file', async () => {
      const files = await readdir(agentsDir);
      for (const agentName of Object.keys(agentRegistry)) {
        expect(files).toContain(`${agentName}.md`);
      }
    });

    test('luca-specific agents exist', async () => {
      const files = await readdir(agentsDir);
      expect(files).toContain('lu-executor.md');
      expect(files).toContain('lu-planner.md');
    });

    test('agent files are non-empty', async () => {
      const files = await readdir(agentsDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      for (const file of mdFiles) {
        const bunFile = Bun.file(path.join(agentsDir, file));
        const size = bunFile.size;
        expect(size).toBeGreaterThan(0);
      }
    });
  });

  describe('skills', () => {
    const skillsDir = path.join(CURSOR_DIR, 'skills');

    test('contains expected number of skill directories (registry + luca-specific)', async () => {
      const entries = await readdir(skillsDir);
      const dirs: string[] = [];
      for (const entry of entries) {
        const stat = await lstat(path.join(skillsDir, entry));
        if (stat.isDirectory()) dirs.push(entry);
      }
      // 36 general (from skillRegistry) + 1 luca-specific (lu)
      expect(dirs.length).toBe(Object.keys(skillRegistry).length + 1);
    });

    test('every registry skill has a corresponding directory with SKILL.md', async () => {
      for (const skillName of Object.keys(skillRegistry)) {
        const skillFile = Bun.file(path.join(skillsDir, skillName, 'SKILL.md'));
        expect(skillFile.size).toBeGreaterThan(0);
      }
    });

    test('luca-specific skill exists', async () => {
      const skillFile = Bun.file(path.join(skillsDir, 'lu', 'SKILL.md'));
      expect(skillFile.size).toBeGreaterThan(0);
    });
  });

  describe('rules', () => {
    const rulesDir = path.join(CURSOR_DIR, 'rules');

    test('contains expected number of rule files', async () => {
      const files = await readdir(rulesDir);
      const mdcFiles = files.filter(f => f.endsWith('.mdc'));
      // ruleRegistry already contains lu-workflow, so luca-specific overwrites it
      // unique count = registry size (20)
      expect(mdcFiles.length).toBe(Object.keys(ruleRegistry).length);
    });

    test('every registry rule has a corresponding .mdc file', async () => {
      const files = await readdir(rulesDir);
      for (const ruleName of Object.keys(ruleRegistry)) {
        expect(files).toContain(`${ruleName}.mdc`);
      }
    });

    test('no symlinks in rules directory', async () => {
      const entries = await readdir(rulesDir);
      for (const entry of entries) {
        const stat = await lstat(path.join(rulesDir, entry));
        expect(stat.isSymbolicLink()).toBe(false);
      }
    });

    test('no subdirectories in rules directory', async () => {
      const entries = await readdir(rulesDir);
      for (const entry of entries) {
        const stat = await lstat(path.join(rulesDir, entry));
        expect(stat.isDirectory()).toBe(false);
      }
    });

    test('rule files are non-empty', async () => {
      const files = await readdir(rulesDir);
      const mdcFiles = files.filter(f => f.endsWith('.mdc'));
      for (const file of mdcFiles) {
        const bunFile = Bun.file(path.join(rulesDir, file));
        expect(bunFile.size).toBeGreaterThan(0);
      }
    });
  });
});

describe.skipIf(!hasBuildOutput)('build output — .claude', () => {
  describe('agents', () => {
    const agentsDir = path.join(CLAUDE_DIR, 'agents');

    test('contains expected number of agent files (registry + luca-specific)', async () => {
      const files = await readdir(agentsDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      expect(mdFiles.length).toBe(Object.keys(agentRegistry).length + 2);
    });

    test('every registry agent has a corresponding .md file', async () => {
      const files = await readdir(agentsDir);
      for (const agentName of Object.keys(agentRegistry)) {
        expect(files).toContain(`${agentName}.md`);
      }
    });

    test('luca-specific agents exist', async () => {
      const files = await readdir(agentsDir);
      expect(files).toContain('lu-executor.md');
      expect(files).toContain('lu-planner.md');
    });
  });

  describe('skills', () => {
    const skillsDir = path.join(CLAUDE_DIR, 'skills');

    test('contains expected number of skill directories (registry + luca-specific)', async () => {
      const entries = await readdir(skillsDir);
      const dirs: string[] = [];
      for (const entry of entries) {
        const stat = await lstat(path.join(skillsDir, entry));
        if (stat.isDirectory()) dirs.push(entry);
      }
      expect(dirs.length).toBe(Object.keys(skillRegistry).length + 1);
    });

    test('every registry skill has a corresponding directory with SKILL.md', async () => {
      for (const skillName of Object.keys(skillRegistry)) {
        const skillFile = Bun.file(path.join(skillsDir, skillName, 'SKILL.md'));
        expect(skillFile.size).toBeGreaterThan(0);
      }
    });

    test('luca-specific skill exists', async () => {
      const skillFile = Bun.file(path.join(skillsDir, 'lu', 'SKILL.md'));
      expect(skillFile.size).toBeGreaterThan(0);
    });
  });

  describe('rules', () => {
    const rulesDir = path.join(CLAUDE_DIR, 'rules');

    test('contains expected number of rule files', async () => {
      const files = await readdir(rulesDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      // ruleRegistry already contains lu-workflow, so luca-specific overwrites it
      // unique count = registry size (20)
      expect(mdFiles.length).toBe(Object.keys(ruleRegistry).length);
    });

    test('every registry rule has a corresponding .md file', async () => {
      const files = await readdir(rulesDir);
      for (const ruleName of Object.keys(ruleRegistry)) {
        expect(files).toContain(`${ruleName}.md`);
      }
    });

    test('rule files are non-empty', async () => {
      const files = await readdir(rulesDir);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      for (const file of mdFiles) {
        const bunFile = Bun.file(path.join(rulesDir, file));
        expect(bunFile.size).toBeGreaterThan(0);
      }
    });
  });
});
