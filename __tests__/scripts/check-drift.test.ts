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
} from "../../scripts/build-shared";

const ROOT = path.resolve(import.meta.dir, "../..");

// ---------------------------------------------------------------------------
// Helpers — DRY up repeated drift-detection and orphan-detection patterns
// ---------------------------------------------------------------------------

/**
 * Checks generated entries matching a filter against committed files on disk.
 * Returns an array of drift descriptions (empty = no drift).
 */
async function detectDrift(
  generated: Map<string, string>,
  filter: (relPath: string) => boolean,
): Promise<string[]> {
  const drifted: string[] = [];
  const entries = [...generated.entries()].filter(([p]) => filter(p));
  for (const [relPath, expected] of entries) {
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
  return drifted;
}

/**
 * Lists .md files in a directory and returns any that are not in validNames.
 */
async function detectOrphanFiles(
  dir: string,
  validNames: Set<string>,
  ext: string = ".md",
): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(ext));
  return files.filter((f) => !validNames.has(f.replace(ext, "")));
}

/**
 * Lists subdirectories in a directory and returns any not in validNames.
 */
async function detectOrphanDirs(
  dir: string,
  validNames: Set<string>,
): Promise<string[]> {
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  return entries.filter((d) => !validNames.has(d));
}

// ---------------------------------------------------------------------------
// 1. Output Freshness — committed files must match generated content
// ---------------------------------------------------------------------------

describe("Output Freshness", () => {
  let generated: Map<string, string>;

  beforeAll(async () => {
    generated = await generateAllOutputs();
  });

  test("agent outputs match source", async () => {
    const drifted = await detectDrift(
      generated,
      (p) => p.includes("/agents/") && !p.startsWith("dist/"),
    );
    expect(drifted).toEqual([]);
  });

  test("skill outputs match source", async () => {
    const drifted = await detectDrift(
      generated,
      (p) => p.includes("/skills/") && !p.startsWith("dist/"),
    );
    expect(drifted).toEqual([]);
  });

  test("rule outputs match source", async () => {
    const drifted = await detectDrift(
      generated,
      (p) => p.includes("/rules/") && !p.startsWith("dist/"),
    );
    expect(drifted).toEqual([]);
  });

  test("hook scripts match source", async () => {
    const drifted = await detectDrift(
      generated,
      (p) =>
        (p.startsWith(".claude/hooks/") || p.startsWith(".cursor/hooks/")) &&
        p.endsWith(".sh"),
    );
    expect(drifted).toEqual([]);
  });

  test("hooks config in .claude/settings.json matches source", async () => {
    const expectedJson = generated.get(".claude/settings.json__hooks");
    expect(expectedJson).toBeDefined();

    const settingsPath = path.join(ROOT, ".claude", "settings.json");
    const settingsContent = await Bun.file(settingsPath).text();
    const settings = JSON.parse(settingsContent);
    const actualJson = JSON.stringify(settings.hooks ?? {}, null, 2);

    expect(actualJson).toBe(expectedJson!);
  });

  test(".cursor/hooks.json matches source", async () => {
    const expectedJson = generated.get(".cursor/hooks.json");
    expect(expectedJson).toBeDefined();

    const hooksJsonPath = path.join(ROOT, ".cursor", "hooks.json");
    const actualJson = await Bun.file(hooksJsonPath).text();

    expect(actualJson).toBe(expectedJson!);
  });
});

// ---------------------------------------------------------------------------
// 2. Registry Completeness — every source file has a registry entry
// ---------------------------------------------------------------------------

describe("Registry Completeness", () => {
  test("every src/skills/general/*.skill.ts has a skillRegistry entry", async () => {
    const skillDir = path.join(ROOT, "src", "skills", "general");
    const files = (await readdir(skillDir)).filter((f) =>
      f.endsWith(".skill.ts"),
    );
    const registryNames = new Set(Object.keys(skillRegistry));
    const missing = files
      .map((f) => f.replace(".skill.ts", ""))
      .filter((name) => !registryNames.has(name));

    expect(missing).toEqual([]);
  });

  test("every src/agents/general/*.agent.ts has an agentRegistry entry", async () => {
    const agentDir = path.join(ROOT, "src", "agents", "general");
    const files = (await readdir(agentDir)).filter((f) =>
      f.endsWith(".agent.ts"),
    );
    const registryNames = new Set(Object.keys(agentRegistry));
    const missing = files
      .map((f) => f.replace(".agent.ts", ""))
      .filter((name) => !registryNames.has(name));

    expect(missing).toEqual([]);
  });

  test("every src/rules/general/*.rule.ts has a ruleRegistry entry", async () => {
    const ruleDir = path.join(ROOT, "src", "rules", "general");
    const files = (await readdir(ruleDir)).filter((f) =>
      f.endsWith(".rule.ts"),
    );
    const registryNames = new Set(Object.keys(ruleRegistry));
    const missing = files
      .map((f) => f.replace(".rule.ts", ""))
      .filter((name) => !registryNames.has(name));

    expect(missing).toEqual([]);
  });

  test("every src/hooks/scripts/*.sh has a hookRegistry entry", async () => {
    const hooksDir = path.join(ROOT, "src", "hooks", "scripts");
    const files = (await readdir(hooksDir)).filter((f) => f.endsWith(".sh"));
    const registryScripts = new Set(
      Object.values(hookRegistry).map((h) => h.script),
    );
    const missing = files.filter((f) => !registryScripts.has(f));

    expect(missing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. No Orphan Outputs — every output file maps back to a source entry
// ---------------------------------------------------------------------------

describe("No Orphan Outputs", () => {
  const validAgentNames = new Set(Object.keys(agentRegistry));
  const validSkillNames = new Set(Object.keys(skillRegistry));
  const validRuleNames = new Set(Object.keys(ruleRegistry));
  const validHookScripts = new Set(
    Object.values(hookRegistry).map((h) => h.script),
  );

  test("no orphan agent outputs in .claude/agents/", async () => {
    const orphans = await detectOrphanFiles(
      path.join(ROOT, ".claude", "agents"),
      validAgentNames,
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan agent outputs in .cursor/agents/", async () => {
    const orphans = await detectOrphanFiles(
      path.join(ROOT, ".cursor", "agents"),
      validAgentNames,
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan skill outputs in .claude/skills/", async () => {
    const orphans = await detectOrphanDirs(
      path.join(ROOT, ".claude", "skills"),
      validSkillNames,
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan skill outputs in .cursor/skills/", async () => {
    const orphans = await detectOrphanDirs(
      path.join(ROOT, ".cursor", "skills"),
      validSkillNames,
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan rule outputs in .claude/rules/", async () => {
    const orphans = await detectOrphanFiles(
      path.join(ROOT, ".claude", "rules"),
      validRuleNames,
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan rule outputs in .cursor/rules/", async () => {
    const orphans = await detectOrphanFiles(
      path.join(ROOT, ".cursor", "rules"),
      validRuleNames,
      ".mdc",
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan hook scripts in .claude/hooks/", async () => {
    const orphans = await detectOrphanFiles(
      path.join(ROOT, ".claude", "hooks"),
      new Set([...validHookScripts].map((s) => s.replace(".sh", ""))),
      ".sh",
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan hook scripts in .cursor/hooks/", async () => {
    const orphans = await detectOrphanFiles(
      path.join(ROOT, ".cursor", "hooks"),
      new Set([...validHookScripts].map((s) => s.replace(".sh", ""))),
      ".sh",
    );
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
    const drifted = await detectDrift(generated, (p) =>
      p.startsWith("dist/plugin/agents/"),
    );
    expect(drifted).toEqual([]);
  });

  test("plugin skill outputs match source", async () => {
    const drifted = await detectDrift(generated, (p) =>
      p.startsWith("dist/plugin/skills/"),
    );
    expect(drifted).toEqual([]);
  });

  test("plugin command outputs match source", async () => {
    const drifted = await detectDrift(generated, (p) =>
      p.startsWith("dist/plugin/commands/"),
    );
    expect(drifted).toEqual([]);
  });

  test("plugin hook scripts match source", async () => {
    const drifted = await detectDrift(generated, (p) =>
      p.startsWith("dist/plugin/scripts/"),
    );
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

    expect(actualJson).toBe(expectedJson!);
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

    expect(actualJson).toBe(expectedJson!);
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

    expect(actualJson).toBe(expectedJson!);
  });

  test("README.md matches source", async () => {
    const expectedReadme = generated.get("dist/plugin/README.md");
    expect(expectedReadme).toBeDefined();

    const readmePath = path.join(ROOT, "dist", "plugin", "README.md");
    const actualReadme = await Bun.file(readmePath).text();

    expect(actualReadme).toBe(expectedReadme!);
  });
});

// ---------------------------------------------------------------------------
// 5. Plugin No Orphan Outputs — every plugin output file maps back to source
// ---------------------------------------------------------------------------

describe("Plugin No Orphan Outputs", () => {
  const validPluginAgentNames = new Set(Object.keys(agentRegistry));
  const validPluginSkillNames = new Set(Object.keys(skillRegistry));
  const pluginHookRegistry = Object.fromEntries(
    Object.entries(hookRegistry).filter(
      ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
    ),
  );
  const validPluginHookScripts = new Set(
    Object.values(pluginHookRegistry).map((h) => h.script),
  );

  test("no orphan agent outputs in dist/plugin/agents/", async () => {
    const orphans = await detectOrphanFiles(
      path.join(ROOT, "dist", "plugin", "agents"),
      validPluginAgentNames,
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan skill outputs in dist/plugin/skills/", async () => {
    const orphans = await detectOrphanDirs(
      path.join(ROOT, "dist", "plugin", "skills"),
      validPluginSkillNames,
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan command outputs in dist/plugin/commands/", async () => {
    const dir = path.join(ROOT, "dist", "plugin", "commands");
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
    } catch {
      return; // skip if commands/ not yet generated
    }
    const validCommandNames = new Set([
      ...Object.keys(skillRegistry).filter(isCommandSkill),
      "lu",
    ]);
    const orphans = files.filter(
      (f) => !validCommandNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan hook scripts in dist/plugin/scripts/", async () => {
    const orphans = await detectOrphanFiles(
      path.join(ROOT, "dist", "plugin", "scripts"),
      new Set([...validPluginHookScripts].map((s) => s.replace(".sh", ""))),
      ".sh",
    );
    expect(orphans).toEqual([]);
  });
});
