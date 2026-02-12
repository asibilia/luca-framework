#!/usr/bin/env bun

/**
 * check-drift.test.ts — Validates output freshness, registry completeness,
 * and orphan detection for the Luca Framework build pipeline.
 *
 * Runs as part of `bun test` to catch drift introduced by manual edits
 * to .claude/, .cursor/, or dist/plugin/ output files.
 */

import { describe, test, expect } from "bun:test";
import { readdirSync } from "node:fs";
import path from "path";

import { agentRegistry } from "../src/agents/index";
import { skillRegistry } from "../src/skills/index";
import { ruleRegistry } from "../src/rules/index";
import {
  hookRegistry,
  generateHooksConfig,
  generateCursorHooksConfig,
} from "../src/hooks/index";
import type { BaseAgent } from "../src/agents/types/agent.types";
import type { BaseSkill } from "../src/skills/types/skill.types";
import type { BaseRule } from "../src/rules/types/rule.types";
import { LuExecutorAgent } from "../src/agents/luca/lu-executor.agent";
import { LuPlannerAgent } from "../src/agents/luca/lu-planner.agent";
import { LuSkill } from "../src/skills/luca/lu.skill";
import { LuWorkflowRule } from "../src/rules/lu-workflow.rule";
import { CursorCompiler } from "../src/compilers/cursor.compiler";
import { ClaudeCompiler } from "../src/compilers/claude.compiler";
import { PluginCompiler } from "../src/compilers/plugin.compiler";
import { generatePluginManifest } from "../src/compilers/plugin.types";
import {
  PLUGIN_EXCLUDED_HOOKS,
  generatePluginHooksConfig,
  readVersion,
  generateReadme,
} from "./build-shared";

const ROOT = path.resolve(import.meta.dir, "..");
const cursorCompiler = new CursorCompiler();
const claudeCompiler = new ClaudeCompiler();
const pluginCompiler = new PluginCompiler();

// ---------------------------------------------------------------------------
// Helper: generate expected content for a given output file
// ---------------------------------------------------------------------------

function generateExpected(): Map<string, string> {
  const generated = new Map<string, string>();

  // Agents (registry)
  for (const [name, AgentClass] of Object.entries(agentRegistry)) {
    const instance = new (AgentClass as new () => BaseAgent)();
    generated.set(
      `.claude/agents/${name}.md`,
      claudeCompiler.compileAgent(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/agents/${name}.md`,
      cursorCompiler.compileAgent(instance, "CURSOR"),
    );
  }

  // Luca-specific agents
  const luExecutor = new LuExecutorAgent();
  generated.set(
    ".claude/agents/lu-executor.md",
    claudeCompiler.compileAgent(luExecutor, "CLAUDE"),
  );
  generated.set(
    ".cursor/agents/lu-executor.md",
    cursorCompiler.compileAgent(luExecutor, "CURSOR"),
  );
  const luPlanner = new LuPlannerAgent();
  generated.set(
    ".claude/agents/lu-planner.md",
    claudeCompiler.compileAgent(luPlanner, "CLAUDE"),
  );
  generated.set(
    ".cursor/agents/lu-planner.md",
    cursorCompiler.compileAgent(luPlanner, "CURSOR"),
  );

  // Skills (registry)
  for (const [name, SkillClass] of Object.entries(skillRegistry)) {
    const instance = new (SkillClass as new () => BaseSkill)();
    generated.set(
      `.claude/skills/${name}/SKILL.md`,
      claudeCompiler.compileSkill(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/skills/${name}/SKILL.md`,
      cursorCompiler.compileSkill(instance, "CURSOR"),
    );
  }

  // Luca-specific skill
  const luSkill = new LuSkill();
  generated.set(
    ".claude/skills/lu/SKILL.md",
    claudeCompiler.compileSkill(luSkill, "CLAUDE"),
  );
  generated.set(
    ".cursor/skills/lu/SKILL.md",
    cursorCompiler.compileSkill(luSkill, "CURSOR"),
  );

  // Rules (registry)
  for (const [name, RuleClass] of Object.entries(ruleRegistry)) {
    const instance = new (RuleClass as new () => BaseRule)();
    generated.set(
      `.claude/rules/${name}.md`,
      claudeCompiler.compileRule(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/rules/${name}.mdc`,
      cursorCompiler.compileRule(instance, "CURSOR"),
    );
  }

  // Luca-specific rule
  const luWorkflowRule = new LuWorkflowRule();
  generated.set(
    ".claude/rules/lu-workflow.md",
    claudeCompiler.compileRule(luWorkflowRule, "CLAUDE"),
  );
  generated.set(
    ".cursor/rules/lu-workflow.mdc",
    cursorCompiler.compileRule(luWorkflowRule, "CURSOR"),
  );

  return generated;
}

// ---------------------------------------------------------------------------
// 1. Output Freshness — committed files must match generated content
// ---------------------------------------------------------------------------

describe("Output Freshness", () => {
  const generated = generateExpected();

  // Group by entity type for clearer test output
  const agentFiles = [...generated.entries()].filter(([p]) =>
    p.includes("/agents/"),
  );
  const skillFiles = [...generated.entries()].filter(([p]) =>
    p.includes("/skills/"),
  );
  const ruleFiles = [...generated.entries()].filter(([p]) =>
    p.includes("/rules/"),
  );

  test("agent outputs match source", () => {
    const drifted: string[] = [];
    for (const [relPath, expected] of agentFiles) {
      const absPath = path.join(ROOT, relPath);
      const file = Bun.file(absPath);
      // File must exist
      if (!file.size) {
        drifted.push(`${relPath}: missing`);
        continue;
      }
      // Synchronous read via Bun.file — we use a workaround
      const actual = require("fs").readFileSync(absPath, "utf8");
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("skill outputs match source", () => {
    const drifted: string[] = [];
    for (const [relPath, expected] of skillFiles) {
      const absPath = path.join(ROOT, relPath);
      try {
        const actual = require("fs").readFileSync(absPath, "utf8");
        if (actual !== expected) {
          drifted.push(`${relPath}: content differs`);
        }
      } catch {
        drifted.push(`${relPath}: missing`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("rule outputs match source", () => {
    const drifted: string[] = [];
    for (const [relPath, expected] of ruleFiles) {
      const absPath = path.join(ROOT, relPath);
      try {
        const actual = require("fs").readFileSync(absPath, "utf8");
        if (actual !== expected) {
          drifted.push(`${relPath}: content differs`);
        }
      } catch {
        drifted.push(`${relPath}: missing`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("hook scripts match source", () => {
    const drifted: string[] = [];
    const hookScriptsDir = path.join(ROOT, "src", "hooks", "scripts");

    for (const [_hookName, hookDef] of Object.entries(hookRegistry)) {
      const srcPath = path.join(hookScriptsDir, hookDef.script);
      try {
        const srcContent = require("fs").readFileSync(srcPath, "utf8");

        // Check Claude output
        const claudePath = path.join(ROOT, ".claude", "hooks", hookDef.script);
        try {
          const claudeContent = require("fs").readFileSync(claudePath, "utf8");
          if (claudeContent !== srcContent) {
            drifted.push(`.claude/hooks/${hookDef.script}: content differs`);
          }
        } catch {
          drifted.push(`.claude/hooks/${hookDef.script}: missing`);
        }

        // Check Cursor output
        const cursorPath = path.join(ROOT, ".cursor", "hooks", hookDef.script);
        try {
          const cursorContent = require("fs").readFileSync(cursorPath, "utf8");
          if (cursorContent !== srcContent) {
            drifted.push(`.cursor/hooks/${hookDef.script}: content differs`);
          }
        } catch {
          drifted.push(`.cursor/hooks/${hookDef.script}: missing`);
        }
      } catch {
        // Source script missing — separate concern
        drifted.push(`src/hooks/scripts/${hookDef.script}: source missing`);
      }
    }
    expect(drifted).toEqual([]);
  });

  test("hooks config in .claude/settings.json matches source", () => {
    const expectedHooks = generateHooksConfig(hookRegistry);
    const expectedJson = JSON.stringify(expectedHooks, null, 2);

    const settingsPath = path.join(ROOT, ".claude", "settings.json");
    const settingsContent = require("fs").readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(settingsContent);
    const actualJson = JSON.stringify(settings.hooks ?? {}, null, 2);

    expect(actualJson).toBe(expectedJson);
  });

  test(".cursor/hooks.json matches source", () => {
    const expectedConfig = generateCursorHooksConfig(hookRegistry);
    const expectedJson = JSON.stringify(expectedConfig, null, 2) + "\n";

    const hooksJsonPath = path.join(ROOT, ".cursor", "hooks.json");
    const actualJson = require("fs").readFileSync(hooksJsonPath, "utf8");

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

  test("every src/skills/general/*.skill.ts has a skillRegistry entry", () => {
    const skillDir = path.join(ROOT, "src", "skills", "general");
    const files = readdirSync(skillDir).filter((f) => f.endsWith(".skill.ts"));
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

  test("every src/agents/general/*.agent.ts has an agentRegistry entry", () => {
    const agentDir = path.join(ROOT, "src", "agents", "general");
    const files = readdirSync(agentDir).filter((f) => f.endsWith(".agent.ts"));
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

  test("every src/rules/general/*.rule.ts has a ruleRegistry entry", () => {
    const ruleDir = path.join(ROOT, "src", "rules", "general");
    const files = readdirSync(ruleDir).filter((f) => f.endsWith(".rule.ts"));
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

  test("every src/hooks/scripts/*.sh has a hookRegistry entry", () => {
    const hooksDir = path.join(ROOT, "src", "hooks", "scripts");
    const files = readdirSync(hooksDir).filter((f) => f.endsWith(".sh"));
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

  test("no orphan agent outputs in .claude/agents/", () => {
    const dir = path.join(ROOT, ".claude", "agents");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validAgentNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan agent outputs in .cursor/agents/", () => {
    const dir = path.join(ROOT, ".cursor", "agents");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validAgentNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan skill outputs in .claude/skills/", () => {
    const dir = path.join(ROOT, ".claude", "skills");
    const dirs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const orphans = dirs.filter((d) => !validSkillNames.has(d));
    expect(orphans).toEqual([]);
  });

  test("no orphan skill outputs in .cursor/skills/", () => {
    const dir = path.join(ROOT, ".cursor", "skills");
    const dirs = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const orphans = dirs.filter((d) => !validSkillNames.has(d));
    expect(orphans).toEqual([]);
  });

  test("no orphan rule outputs in .claude/rules/", () => {
    const dir = path.join(ROOT, ".claude", "rules");
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const orphans = files.filter(
      (f) => !validRuleNames.has(f.replace(".md", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan rule outputs in .cursor/rules/", () => {
    const dir = path.join(ROOT, ".cursor", "rules");
    const files = readdirSync(dir).filter((f) => f.endsWith(".mdc"));
    const orphans = files.filter(
      (f) => !validRuleNames.has(f.replace(".mdc", "")),
    );
    expect(orphans).toEqual([]);
  });

  test("no orphan hook scripts in .claude/hooks/", () => {
    const dir = path.join(ROOT, ".claude", "hooks");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sh"));
    const orphans = files.filter((f) => !validHookScripts.has(f));
    expect(orphans).toEqual([]);
  });

  test("no orphan hook scripts in .cursor/hooks/", () => {
    const dir = path.join(ROOT, ".cursor", "hooks");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sh"));
    const orphans = files.filter((f) => !validHookScripts.has(f));
    expect(orphans).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Plugin Output Freshness — committed plugin files must match generated content
// ---------------------------------------------------------------------------

describe("Plugin Output Freshness", () => {
  const hookScriptsDir = path.join(ROOT, "src", "hooks", "scripts");

  // Filtered hook registry for plugin context
  const pluginHookRegistry = Object.fromEntries(
    Object.entries(hookRegistry).filter(
      ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
    ),
  );

  test("plugin agent outputs match source", () => {
    const drifted: string[] = [];

    // Registry agents
    for (const [name, AgentClass] of Object.entries(agentRegistry)) {
      const instance = new (AgentClass as new () => BaseAgent)();
      const expected = pluginCompiler.compileAgent(instance, "CLAUDE");
      const relPath = `dist/plugin/agents/${name}.md`;
      const absPath = path.join(ROOT, relPath);
      try {
        const actual = require("fs").readFileSync(absPath, "utf8");
        if (actual !== expected) {
          drifted.push(`${relPath}: content differs`);
        }
      } catch {
        drifted.push(`${relPath}: missing`);
      }
    }

    // Luca-specific agents
    const luExecutor = new LuExecutorAgent();
    const luPlanner = new LuPlannerAgent();
    for (const [name, instance] of [
      ["lu-executor", luExecutor],
      ["lu-planner", luPlanner],
    ] as const) {
      const expected = pluginCompiler.compileAgent(
        instance as BaseAgent,
        "CLAUDE",
      );
      const relPath = `dist/plugin/agents/${name}.md`;
      const absPath = path.join(ROOT, relPath);
      try {
        const actual = require("fs").readFileSync(absPath, "utf8");
        if (actual !== expected) {
          drifted.push(`${relPath}: content differs`);
        }
      } catch {
        drifted.push(`${relPath}: missing`);
      }
    }

    expect(drifted).toEqual([]);
  });

  test("plugin skill outputs match source", () => {
    const drifted: string[] = [];

    // Registry skills
    for (const [name, SkillClass] of Object.entries(skillRegistry)) {
      const instance = new (SkillClass as new () => BaseSkill)();
      const expected = pluginCompiler.compileSkill(instance, "CLAUDE");
      const relPath = `dist/plugin/skills/${name}/SKILL.md`;
      const absPath = path.join(ROOT, relPath);
      try {
        const actual = require("fs").readFileSync(absPath, "utf8");
        if (actual !== expected) {
          drifted.push(`${relPath}: content differs`);
        }
      } catch {
        drifted.push(`${relPath}: missing`);
      }
    }

    // Luca-specific skill
    const luSkill = new LuSkill();
    const expected = pluginCompiler.compileSkill(luSkill, "CLAUDE");
    const relPath = "dist/plugin/skills/lu/SKILL.md";
    const absPath = path.join(ROOT, relPath);
    try {
      const actual = require("fs").readFileSync(absPath, "utf8");
      if (actual !== expected) {
        drifted.push(`${relPath}: content differs`);
      }
    } catch {
      drifted.push(`${relPath}: missing`);
    }

    expect(drifted).toEqual([]);
  });

  test("plugin hook scripts match source", () => {
    const drifted: string[] = [];

    for (const [_hookName, hookDef] of Object.entries(pluginHookRegistry)) {
      const srcPath = path.join(hookScriptsDir, hookDef.script);
      try {
        const srcContent = require("fs").readFileSync(srcPath, "utf8");
        const pluginPath = path.join(
          ROOT,
          "dist",
          "plugin",
          "scripts",
          hookDef.script,
        );
        try {
          const pluginContent = require("fs").readFileSync(pluginPath, "utf8");
          if (pluginContent !== srcContent) {
            drifted.push(
              `dist/plugin/scripts/${hookDef.script}: content differs`,
            );
          }
        } catch {
          drifted.push(`dist/plugin/scripts/${hookDef.script}: missing`);
        }
      } catch {
        drifted.push(`src/hooks/scripts/${hookDef.script}: source missing`);
      }
    }

    expect(drifted).toEqual([]);
  });

  test("plugin hooks.json matches source", () => {
    const expectedConfig = generatePluginHooksConfig(pluginHookRegistry);
    const expectedJson = JSON.stringify(expectedConfig, null, 2) + "\n";

    const hooksJsonPath = path.join(
      ROOT,
      "dist",
      "plugin",
      "hooks",
      "hooks.json",
    );
    const actualJson = require("fs").readFileSync(hooksJsonPath, "utf8");

    expect(actualJson).toBe(expectedJson);
  });

  test("plugin.json matches source", async () => {
    const version = await readVersion();

    const manifest = generatePluginManifest({
      name: "luca",
      version,
      description:
        "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
      author: { name: "Alec Sibilia" },
      keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
    });

    const expectedJson = JSON.stringify(manifest, null, 2) + "\n";
    const pluginJsonPath = path.join(
      ROOT,
      "dist",
      "plugin",
      ".claude-plugin",
      "plugin.json",
    );
    const actualJson = require("fs").readFileSync(pluginJsonPath, "utf8");

    expect(actualJson).toBe(expectedJson);
  });

  test("marketplace.json matches source", async () => {
    const version = await readVersion();

    const marketplaceManifest = {
      $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
      name: "luca-marketplace",
      owner: {
        name: "Alec Sibilia",
      },
      plugins: [
        {
          name: "luca",
          description:
            "Agentic development framework with cognitive memory and spec-driven workflow",
          source: ".",
          category: "development",
          version,
          author: {
            name: "Alec Sibilia",
          },
          homepage: "https://github.com/alecsibilia/luca-framework",
          repository: "https://github.com/alecsibilia/luca-framework",
          license: "MIT",
          keywords: [
            "agent",
            "ai",
            "framework",
            "luca",
            "workflow",
            "cognitive",
          ],
        },
      ],
    };

    const expectedJson = JSON.stringify(marketplaceManifest, null, 2) + "\n";
    const marketplaceJsonPath = path.join(
      ROOT,
      "dist",
      "plugin",
      ".claude-plugin",
      "marketplace.json",
    );
    const actualJson = require("fs").readFileSync(marketplaceJsonPath, "utf8");

    expect(actualJson).toBe(expectedJson);
  });

  test("README.md matches source", async () => {
    const version = await readVersion();
    const pluginSkillNames = [...Object.keys(skillRegistry), "lu"];
    const pluginAgentNames = [
      ...Object.keys(agentRegistry),
      "lu-executor",
      "lu-planner",
    ];
    const pluginHookNames = Object.keys(pluginHookRegistry);

    const expectedReadme = generateReadme(
      pluginSkillNames,
      pluginAgentNames,
      pluginHookNames.length,
    );

    const readmePath = path.join(ROOT, "dist", "plugin", "README.md");
    const actualReadme = require("fs").readFileSync(readmePath, "utf8");

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

  test("no orphan hook scripts in dist/plugin/scripts/", () => {
    const dir = path.join(ROOT, "dist", "plugin", "scripts");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sh"));
    const orphans = files.filter((f) => !validPluginHookScripts.has(f));
    expect(orphans).toEqual([]);
  });
});
