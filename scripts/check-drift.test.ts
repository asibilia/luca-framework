#!/usr/bin/env bun

/**
 * check-drift.test.ts — Validates output freshness, registry completeness,
 * and orphan detection for the Luca Framework build pipeline.
 *
 * Runs as part of `bun test` to catch drift introduced by manual edits
 * to .claude/, .cursor/, or dist/plugin/ output files.
 */

import { describe, test, expect, beforeAll } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "path";

import {
  generateAllOutputs,
  agentRegistry,
  skillRegistry,
  ruleRegistry,
  hookRegistry,
  PLUGIN_EXCLUDED_HOOKS,
  isCommandSkill,
} from "./build-shared";

const ROOT = path.resolve(import.meta.dir, "..");

// ---------------------------------------------------------------------------
// 1. Output Freshness — committed files must match generated content
// ---------------------------------------------------------------------------

describe("Output Freshness", () => {
  let generated: Map<string, string>;

  beforeAll(async () => {
    generated = await generateAllOutputs();
  });

  test("agent outputs match source", async () => {
    const drifted: string[] = [];
    const agentFiles = [...generated.entries()].filter(
      ([p]) => p.includes("/agents/") && !p.startsWith("dist/"),
    );
    for (const [relPath, expected] of agentFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      if (!(await file.exists())) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      const actual = await file.text();
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("skill outputs match source", async () => {
    const drifted: string[] = [];
    const skillFiles = [...generated.entries()].filter(
      ([p]) => p.includes("/skills/") && !p.startsWith("dist/"),
    );
    for (const [relPath, expected] of skillFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      if (!(await file.exists())) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      const actual = await file.text();
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("rule outputs match source", async () => {
    const drifted: string[] = [];
    const ruleFiles = [...generated.entries()].filter(
      ([p]) => p.includes("/rules/") && !p.startsWith("dist/"),
    );
    for (const [relPath, expected] of ruleFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      if (!(await file.exists())) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      const actual = await file.text();
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("hook scripts match source", async () => {
    const drifted: string[] = [];
    const hookFiles = [...generated.entries()].filter(
      ([p]) =>
        (p.startsWith(".claude/hooks/") || p.startsWith(".cursor/hooks/")) &&
        p.endsWith(".sh"),
    );
    for (const [relPath, expected] of hookFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      if (!(await file.exists())) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      const actual = await file.text();
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("hooks config in .claude/settings.json matches source", async () => {
    const expectedJson = generated.get(".claude/settings.json__hooks");
    expect(expectedJson).toBeDefined();

    const settingsPath = path.join(ROOT, ".claude", "settings.json");
    const settingsContent = await Bun.file(settingsPath).text();
    const settings = JSON.parse(settingsContent);
    const actualJson = JSON.stringify(settings.hooks ?? {}, null, 2);

    expect(actualJson).toBe(expectedJson);
  });

  test(".cursor/hooks.json matches source", async () => {
    const expectedJson = generated.get(".cursor/hooks.json");
    expect(expectedJson).toBeDefined();

    const hooksJsonPath = path.join(ROOT, ".cursor", "hooks.json");
    const actualJson = await Bun.file(hooksJsonPath).text();

    expect(actualJson).toBe(expectedJson);
  });
});

// ---------------------------------------------------------------------------
// 2. Registry Completeness — every source file has a registry entry
// ---------------------------------------------------------------------------

describe("Registry Completeness", () => {
  // Known Luca-specific entities that live in luca/ subdirectories
  // and are compiled separately (not via registry)
  const LUCA_SPECIFIC_AGENTS = new Set([
    "lu-executor.agent.ts",
    "lu-planner.agent.ts",
  ]);
  const LUCA_SPECIFIC_SKILLS = new Set(["lu.skill.ts"]);
  const LUCA_SPECIFIC_RULES = new Set(["lu-workflow.rule.ts"]);

  test("every src/skills/general/*.skill.ts has a skillRegistry entry", async () => {
    const skillDir = path.join(ROOT, "src", "skills", "general");
    const files = (await readdir(skillDir)).filter((f) =>
      f.endsWith(".skill.ts"),
    );
    const registryNames = new Set(Object.keys(skillRegistry));
    const missing: string[] = [];

    for (const file of files) {
      if (LUCA_SPECIFIC_SKILLS.has(file)) continue;
      const name = file.replace(".skill.ts", "");
      if (!registryNames.has(name)) {
        missing.push(file);
      }
    }

    expect(missing).toEqual([]);
  });

  test("every src/agents/general/*.agent.ts has an agentRegistry entry", async () => {
    const agentDir = path.join(ROOT, "src", "agents", "general");
    const files = (await readdir(agentDir)).filter((f) =>
      f.endsWith(".agent.ts"),
    );
    const registryNames = new Set(Object.keys(agentRegistry));
    const missing: string[] = [];

    for (const file of files) {
      if (LUCA_SPECIFIC_AGENTS.has(file)) continue;
      const name = file.replace(".agent.ts", "");
      if (!registryNames.has(name)) {
        missing.push(file);
      }
    }

    expect(missing).toEqual([]);
  });

  test("every src/rules/general/*.rule.ts has a ruleRegistry entry", async () => {
    const ruleDir = path.join(ROOT, "src", "rules", "general");
    const files = (await readdir(ruleDir)).filter((f) =>
      f.endsWith(".rule.ts"),
    );
    const registryNames = new Set(Object.keys(ruleRegistry));
    const missing: string[] = [];

    for (const file of files) {
      if (LUCA_SPECIFIC_RULES.has(file)) continue;
      const name = file.replace(".rule.ts", "");
      if (!registryNames.has(name)) {
        missing.push(file);
      }
    }

    expect(missing).toEqual([]);
  });

  test("every src/hooks/scripts/*.sh has a hookRegistry entry", async () => {
    const hooksDir = path.join(ROOT, "src", "hooks", "scripts");
    const files = (await readdir(hooksDir)).filter((f) => f.endsWith(".sh"));
    const registryScripts = new Set(
      Object.values(hookRegistry).map((h) => h.script),
    );
    const missing: string[] = [];

    for (const file of files) {
      if (!registryScripts.has(file)) {
        missing.push(file);
      }
    }

    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. No Orphan Outputs — every output file maps back to a source entry
// ---------------------------------------------------------------------------

describe("No Orphan Outputs", () => {
  // All valid output names = registry keys + Luca-specific
  const validAgentNames = new Set([
    ...Object.keys(agentRegistry),
    "lu-executor",
    "lu-planner",
  ]);
  const validSkillNames = new Set([...Object.keys(skillRegistry), "lu"]);
  const validRuleNames = new Set([...Object.keys(ruleRegistry), "lu-workflow"]);
  const validHookScripts = new Set(
    Object.values(hookRegistry).map((h) => h.script),
  );

  test("no orphan agent outputs in .claude/agents/", async () => {
    const dir = path.join(ROOT, ".claude", "agents");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validAgentNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan agent outputs in .cursor/agents/", async () => {
    const dir = path.join(ROOT, ".cursor", "agents");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validAgentNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan skill outputs in .claude/skills/", async () => {
    const dir = path.join(ROOT, ".claude", "skills");
    const dirs = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const orphans = dirs.filter((d) => !validSkillNames.has(d));
    expect(orphans).toEqual([]);
  });

  test("no orphan skill outputs in .cursor/skills/", async () => {
    const dir = path.join(ROOT, ".cursor", "skills");
    const dirs = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const orphans = dirs.filter((d) => !validSkillNames.has(d));
    expect(orphans).toEqual([]);
  });

  test("no orphan rule outputs in .claude/rules/", async () => {
    const dir = path.join(ROOT, ".claude", "rules");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validRuleNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan rule outputs in .cursor/rules/", async () => {
    const dir = path.join(ROOT, ".cursor", "rules");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".mdc"));
    const orphans = files.filter(
      (f) => !validRuleNames.has(f.replace(".mdc", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan hook scripts in .claude/hooks/", async () => {
    const dir = path.join(ROOT, ".claude", "hooks");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sh"));
    const orphans = files.filter((f) => !validHookScripts.has(f));
    expect(orphans).toEqual([]);
  });

  test("no orphan hook scripts in .cursor/hooks/", async () => {
    const dir = path.join(ROOT, ".cursor", "hooks");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sh"));
    const orphans = files.filter((f) => !validHookScripts.has(f));
    expect(orphans).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Plugin Output Freshness — committed plugin files must match generated content
// ---------------------------------------------------------------------------

describe("Plugin Output Freshness", () => {
  let generated: Map<string, string>;

  beforeAll(async () => {
    generated = await generateAllOutputs();
  });

  test("plugin agent outputs match source", async () => {
    const drifted: string[] = [];
    const pluginAgentFiles = [...generated.entries()].filter(([p]) =>
      p.startsWith("dist/plugin/agents/"),
    );
    for (const [relPath, expected] of pluginAgentFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      if (!(await file.exists())) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      const actual = await file.text();
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("plugin skill outputs match source", async () => {
    const drifted: string[] = [];
    const pluginSkillFiles = [...generated.entries()].filter(([p]) =>
      p.startsWith("dist/plugin/skills/"),
    );
    for (const [relPath, expected] of pluginSkillFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      if (!(await file.exists())) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      const actual = await file.text();
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("plugin command outputs match source", async () => {
    const drifted: string[] = [];
    const pluginCommandFiles = [...generated.entries()].filter(([p]) =>
      p.startsWith("dist/plugin/commands/"),
    );
    for (const [relPath, expected] of pluginCommandFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      if (!(await file.exists())) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      const actual = await file.text();
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("plugin hook scripts match source", async () => {
    const drifted: string[] = [];
    const pluginScriptFiles = [...generated.entries()].filter(([p]) =>
      p.startsWith("dist/plugin/scripts/"),
    );
    for (const [relPath, expected] of pluginScriptFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      if (!(await file.exists())) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      const actual = await file.text();
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("plugin hooks.json matches source", async () => {
    const expectedJson = generated.get("dist/plugin/hooks/hooks.json");
    expect(expectedJson).toBeDefined();

    const hooksJsonPath = path.join(
      ROOT,
      "dist",
      "plugin",
      "hooks",
      "hooks.json",
    );
    const actualJson = await Bun.file(hooksJsonPath).text();

    expect(actualJson).toBe(expectedJson);
  });

  test("plugin.json matches source", async () => {
    const expectedJson = generated.get(
      "dist/plugin/.claude-plugin/plugin.json",
    );
    expect(expectedJson).toBeDefined();

    const pluginJsonPath = path.join(
      ROOT,
      "dist",
      "plugin",
      ".claude-plugin",
      "plugin.json",
    );
    const actualJson = await Bun.file(pluginJsonPath).text();

    expect(actualJson).toBe(expectedJson);
  });

  test("marketplace.json matches source", async () => {
    const expectedJson = generated.get(
      "dist/plugin/.claude-plugin/marketplace.json",
    );
    expect(expectedJson).toBeDefined();

    const marketplaceJsonPath = path.join(
      ROOT,
      "dist",
      "plugin",
      ".claude-plugin",
      "marketplace.json",
    );
    const actualJson = await Bun.file(marketplaceJsonPath).text();

    expect(actualJson).toBe(expectedJson);
  });

  test("README.md matches source", async () => {
    const expectedReadme = generated.get("dist/plugin/README.md");
    expect(expectedReadme).toBeDefined();

    const readmePath = path.join(ROOT, "dist", "plugin", "README.md");
    const actualReadme = await Bun.file(readmePath).text();

    expect(actualReadme).toBe(expectedReadme);
  });
});

// ---------------------------------------------------------------------------
// 5. Plugin No Orphan Outputs — every plugin output file maps back to source
// ---------------------------------------------------------------------------

describe("Plugin No Orphan Outputs", () => {
  const validPluginAgentNames = new Set([
    ...Object.keys(agentRegistry),
    "lu-executor",
    "lu-planner",
  ]);
  const validPluginSkillNames = new Set([...Object.keys(skillRegistry), "lu"]);
  const pluginHookRegistry = Object.fromEntries(
    Object.entries(hookRegistry).filter(
      ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
    ),
  );
  const validPluginHookScripts = new Set(
    Object.values(pluginHookRegistry).map((h) => h.script),
  );

  test("no orphan agent outputs in dist/plugin/agents/", () => {
    const dir = path.join(ROOT, "dist", "plugin", "agents");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validPluginAgentNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan skill outputs in dist/plugin/skills/", () => {
    const dir = path.join(ROOT, "dist", "plugin", "skills");
    const dirs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const orphans = dirs.filter((d) => !validPluginSkillNames.has(d));
    expect(orphans).toEqual([]);
  });

  test("no orphan command outputs in dist/plugin/commands/", () => {
    const dir = path.join(ROOT, "dist", "plugin", "commands");
    if (!existsSync(dir)) return; // skip if commands/ not yet generated
    const validCommandNames = new Set([
      ...Object.keys(skillRegistry).filter(isCommandSkill),
      "lu",
    ]);
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validCommandNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan hook scripts in dist/plugin/scripts/", () => {
    const dir = path.join(ROOT, "dist", "plugin", "scripts");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sh"));
    const orphans = files.filter((f) => !validPluginHookScripts.has(f));
    expect(orphans).toEqual([]);
  });
});
