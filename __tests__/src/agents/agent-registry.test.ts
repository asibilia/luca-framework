import { test, expect, describe } from "bun:test";
import { readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { agentRegistry } from "../../../src/agents/index";
import type { BaseAgent } from "../../../src/agents/types/agent.types";

const AGENTS_ROOT = path.join(import.meta.dir, "../../../src/agents");
const GENERAL_AGENTS_DIR = path.join(AGENTS_ROOT, "general");
const LUCA_AGENTS_DIR = path.join(AGENTS_ROOT, "luca");

/** Collect all .agent.ts file stems from a directory (if it exists). */
async function agentNamesInDir(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith(".agent.ts"))
    .map((f) => f.replace(".agent.ts", ""));
}

describe("agent registry completeness", () => {
  test("has entry for every source file in src/agents/general/ and luca/", async () => {
    const generalAgents = await agentNamesInDir(GENERAL_AGENTS_DIR);
    const lucaAgents = await agentNamesInDir(LUCA_AGENTS_DIR);
    const allAgents = [...new Set([...generalAgents, ...lucaAgents])];

    for (const agentName of allAgents) {
      expect(agentRegistry).toHaveProperty(agentName);
    }
  });

  test("has no extra entries beyond source files", async () => {
    const generalAgents = await agentNamesInDir(GENERAL_AGENTS_DIR);
    const lucaAgents = await agentNamesInDir(LUCA_AGENTS_DIR);
    const allAgents = [...new Set([...generalAgents, ...lucaAgents])];

    const registryKeys = Object.keys(agentRegistry);
    for (const key of registryKeys) {
      expect(allAgents).toContain(key);
    }
  });

  test("registry size matches deduplicated source file count", async () => {
    const generalAgents = await agentNamesInDir(GENERAL_AGENTS_DIR);
    const lucaAgents = await agentNamesInDir(LUCA_AGENTS_DIR);
    const allAgents = new Set([...generalAgents, ...lucaAgents]);
    expect(Object.keys(agentRegistry).length).toBe(allAgents.size);
  });

  test("every entry can be instantiated", () => {
    for (const [_agentName, AgentClass] of Object.entries(agentRegistry)) {
      const instance = new (AgentClass as new () => BaseAgent)();
      expect(instance).toBeDefined();
      expect(instance.name).toBeDefined();
      expect(typeof instance.name).toBe("string");
    }
  });
});
