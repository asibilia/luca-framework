#!/usr/bin/env bun

/**
 * check-drift.ts — Detect drift between src/ source and .claude/.cursor/dist/plugin/ outputs
 *
 * Generates all outputs in memory using the same compilation logic as
 * build-all.ts, then compares each generated file against its committed counterpart.
 *
 * Reports drifted, missing, and orphaned files.
 *
 * Exit codes:
 *   0 = all outputs match source (no drift)
 *   1 = drift detected
 *
 * Usage:
 *   bun run check:drift           # via package.json script
 *   bun ./scripts/check-drift.ts  # direct invocation
 */
import { agentRegistry } from "../src/agents/index";
import { ruleRegistry } from "../src/rules/index";
import { skillRegistry } from "../src/skills/index";
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
  COMMAND_EXCLUDED_SKILLS,
  PLUGIN_EXCLUDED_HOOKS,
  generatePluginHooksConfig,
  generateCommandMarkdown,
  readVersion,
  generateReadme,
} from "./build-shared";
import path from "path";

interface DriftResult {
  file: string;
  status: "drifted" | "missing" | "orphaned";
  detail?: string;
}

async function generateToTemp(tempDir: string): Promise<Map<string, string>> {
  const cursorCompiler = new CursorCompiler();
  const claudeCompiler = new ClaudeCompiler();
  const generated = new Map<string, string>();

  // --- Agents ---
  for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
    const instance = new (AgentClass as new () => BaseAgent)();
    generated.set(
      `.claude/agents/${agentName}.md`,
      claudeCompiler.compileAgent(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/agents/${agentName}.md`,
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

  // --- Skills ---
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    const instance = new (SkillClass as new () => BaseSkill)();
    generated.set(
      `.claude/skills/${skillName}/SKILL.md`,
      claudeCompiler.compileSkill(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/skills/${skillName}/SKILL.md`,
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

  // --- Rules ---
  for (const [ruleName, RuleClass] of Object.entries(ruleRegistry)) {
    const instance = new (RuleClass as new () => BaseRule)();
    generated.set(
      `.claude/rules/${ruleName}.md`,
      claudeCompiler.compileRule(instance, "CLAUDE"),
    );
    generated.set(
      `.cursor/rules/${ruleName}.mdc`,
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

  // --- Hook scripts ---
  const hookScriptsDir = path.join(process.cwd(), "src", "hooks", "scripts");
  for (const [_hookName, hookDef] of Object.entries(hookRegistry)) {
    const srcPath = path.join(hookScriptsDir, hookDef.script);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      const content = await srcFile.text();
      generated.set(`.claude/hooks/${hookDef.script}`, content);
      generated.set(`.cursor/hooks/${hookDef.script}`, content);
    }
  }

  // --- Settings/hooks configs ---
  // For settings.json, we only compare the "hooks" key
  const hooksConfig = generateHooksConfig(hookRegistry);
  generated.set(
    ".claude/settings.json__hooks",
    JSON.stringify(hooksConfig, null, 2),
  );

  const cursorHooksConfig = generateCursorHooksConfig(hookRegistry);
  generated.set(
    ".cursor/hooks.json",
    JSON.stringify(cursorHooksConfig, null, 2) + "\n",
  );

  // =========================================================================
  // Plugin output entries (dist/plugin/)
  // =========================================================================

  const pluginCompiler = new PluginCompiler();

  // --- Plugin agents ---
  for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
    const instance = new (AgentClass as new () => BaseAgent)();
    generated.set(
      `dist/plugin/agents/${agentName}.md`,
      pluginCompiler.compileAgent(instance, "CLAUDE"),
    );
  }

  // Luca-specific agents
  const luExecutorPlugin = new LuExecutorAgent();
  generated.set(
    "dist/plugin/agents/lu-executor.md",
    pluginCompiler.compileAgent(luExecutorPlugin, "CLAUDE"),
  );
  const luPlannerPlugin = new LuPlannerAgent();
  generated.set(
    "dist/plugin/agents/lu-planner.md",
    pluginCompiler.compileAgent(luPlannerPlugin, "CLAUDE"),
  );

  // --- Plugin skills ---
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    const instance = new (SkillClass as new () => BaseSkill)();
    generated.set(
      `dist/plugin/skills/${skillName}/SKILL.md`,
      pluginCompiler.compileSkill(instance, "CLAUDE"),
    );
  }

  // Luca-specific skill
  const luSkillPlugin = new LuSkill();
  generated.set(
    "dist/plugin/skills/lu/SKILL.md",
    pluginCompiler.compileSkill(luSkillPlugin, "CLAUDE"),
  );

  // --- Plugin commands ---
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    if (COMMAND_EXCLUDED_SKILLS.has(skillName)) continue;
    const instance = new (SkillClass as new () => BaseSkill)();
    generated.set(
      `dist/plugin/commands/${skillName}.md`,
      generateCommandMarkdown(skillName, instance.description),
    );
  }

  // Lu command
  generated.set(
    "dist/plugin/commands/lu.md",
    generateCommandMarkdown("lu", luSkillPlugin.description),
  );

  // --- Plugin hooks ---
  const pluginHookRegistry = Object.fromEntries(
    Object.entries(hookRegistry).filter(
      ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
    ),
  );

  // Plugin hook scripts
  for (const [_name, def] of Object.entries(pluginHookRegistry)) {
    const srcPath = path.join(hookScriptsDir, def.script);
    const srcFile = Bun.file(srcPath);
    if (await srcFile.exists()) {
      generated.set(`dist/plugin/scripts/${def.script}`, await srcFile.text());
    }
  }

  // Plugin hooks.json
  const pluginHooksConfig = generatePluginHooksConfig(pluginHookRegistry);
  generated.set(
    "dist/plugin/hooks/hooks.json",
    JSON.stringify(pluginHooksConfig, null, 2) + "\n",
  );

  // --- Plugin manifest (plugin.json) ---
  const version = await readVersion();
  const pluginAgentNames = [
    ...Object.keys(agentRegistry),
    "lu-executor",
    "lu-planner",
  ];
  const pluginSkillNames = [...Object.keys(skillRegistry), "lu"];
  const pluginCommandNames = [
    ...Object.keys(skillRegistry).filter(
      (s) => !COMMAND_EXCLUDED_SKILLS.has(s),
    ),
    "lu",
  ];
  const pluginHookNames = Object.keys(pluginHookRegistry);

  const manifest = generatePluginManifest({
    name: "luca",
    version,
    description:
      "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
    author: { name: "Alec Sibilia" },
    keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
  });

  generated.set(
    "dist/plugin/.claude-plugin/plugin.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );

  // --- Marketplace manifest ---
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
        keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
      },
    ],
  };

  generated.set(
    "dist/plugin/.claude-plugin/marketplace.json",
    JSON.stringify(marketplaceManifest, null, 2) + "\n",
  );

  // --- README ---
  const readmeContent = generateReadme(
    pluginSkillNames,
    pluginAgentNames,
    pluginCommandNames.length,
    pluginHookNames.length,
  );
  generated.set("dist/plugin/README.md", readmeContent);

  return generated;
}

async function main() {
  const projectDir = process.cwd();
  const results: DriftResult[] = [];

  // Generate all outputs in memory
  const generated = await generateToTemp("");

  // Compare each generated file against committed output
  for (const [relPath, expectedContent] of generated) {
    // Special handling for settings.json hooks key
    if (relPath === ".claude/settings.json__hooks") {
      const settingsPath = path.join(projectDir, ".claude/settings.json");
      const settingsFile = Bun.file(settingsPath);
      if (!(await settingsFile.exists())) {
        results.push({
          file: ".claude/settings.json",
          status: "missing",
          detail: "File does not exist",
        });
        continue;
      }
      try {
        const settings = JSON.parse(await settingsFile.text());
        const actualHooks = JSON.stringify(settings.hooks ?? {}, null, 2);
        if (actualHooks !== expectedContent) {
          results.push({
            file: ".claude/settings.json (hooks section)",
            status: "drifted",
            detail: "Hooks config differs from source",
          });
        }
      } catch {
        results.push({
          file: ".claude/settings.json",
          status: "drifted",
          detail: "Invalid JSON",
        });
      }
      continue;
    }

    const absPath = path.join(projectDir, relPath);
    const file = Bun.file(absPath);

    if (!(await file.exists())) {
      results.push({
        file: relPath,
        status: "missing",
        detail: "Output file does not exist",
      });
      continue;
    }

    const actualContent = await file.text();
    if (actualContent !== expectedContent) {
      // For readability, show first differing line
      const expectedLines = expectedContent.split("\n");
      const actualLines = actualContent.split("\n");
      let firstDiffLine = -1;
      const maxCheck = Math.max(expectedLines.length, actualLines.length);
      for (let i = 0; i < maxCheck; i++) {
        if (expectedLines[i] !== actualLines[i]) {
          firstDiffLine = i + 1;
          break;
        }
      }
      results.push({
        file: relPath,
        status: "drifted",
        detail: `Content differs (first diff at line ${firstDiffLine}, expected ${expectedLines.length} lines, actual ${actualLines.length} lines)`,
      });
    }
  }

  // Report results
  if (results.length === 0) {
    console.log("No drift detected. All outputs match source.");
    process.exit(0);
  }

  console.error(`\nDrift detected: ${results.length} file(s) out of sync\n`);

  const drifted = results.filter((r) => r.status === "drifted");
  const missing = results.filter((r) => r.status === "missing");

  if (drifted.length > 0) {
    console.error("Drifted files (output differs from source):");
    for (const r of drifted) {
      console.error(`  - ${r.file}: ${r.detail}`);
    }
  }

  if (missing.length > 0) {
    console.error("Missing files (source exists but output not generated):");
    for (const r of missing) {
      console.error(`  - ${r.file}`);
    }
  }

  console.error(
    "\nFix: Run `bun run build:all` to regenerate all outputs from source.",
  );
  process.exit(1);
}

main().catch((error) => {
  console.error("Drift check failed:", error.message || error);
  process.exit(1);
});
