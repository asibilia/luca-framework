import { test, expect, describe } from 'bun:test';
import { readdir } from 'fs/promises';
import path from 'path';
import { agentRegistry } from '../../../src/agents/index';
import type { BaseAgent } from '../../../src/agents/types/agent.types';

const GENERAL_AGENTS_DIR = path.join(import.meta.dir, '../../../src/agents/general');

describe('agent registry completeness', () => {
  test('has entry for every source file in src/agents/general/', async () => {
    const files = await readdir(GENERAL_AGENTS_DIR);
    const agentFiles = files
      .filter(f => f.endsWith('.agent.ts'))
      .map(f => f.replace('.agent.ts', ''));

    for (const agentName of agentFiles) {
      expect(agentRegistry).toHaveProperty(agentName);
    }
  });

  test('has no extra entries beyond source files', async () => {
    const files = await readdir(GENERAL_AGENTS_DIR);
    const agentFiles = files
      .filter(f => f.endsWith('.agent.ts'))
      .map(f => f.replace('.agent.ts', ''));

    const registryKeys = Object.keys(agentRegistry);
    for (const key of registryKeys) {
      expect(agentFiles).toContain(key);
    }
  });

  test('registry size matches source files minus luca-specific exclusions', async () => {
    const files = await readdir(GENERAL_AGENTS_DIR);
    const agentFiles = files
      .filter(f => f.endsWith('.agent.ts'))
      .map(f => f.replace('.agent.ts', ''));
    // lu-executor and lu-planner live in src/agents/general/ but are imported
    // separately by build scripts, not included in the general registry
    const lucaSpecificInGeneral = ['lu-executor', 'lu-planner'];
    const expectedCount = agentFiles.filter(f => !lucaSpecificInGeneral.includes(f)).length;
    expect(Object.keys(agentRegistry).length).toBe(expectedCount);
  });

  test('every entry can be instantiated', () => {
    for (const [_agentName, AgentClass] of Object.entries(agentRegistry)) {
      const instance = new (AgentClass as new () => BaseAgent)();
      expect(instance).toBeDefined();
      expect(instance.name).toBeDefined();
      expect(typeof instance.name).toBe('string');
    }
  });
});
