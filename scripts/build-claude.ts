#!/usr/bin/env bun

/**
 * build-claude.ts — Build script for generating Claude-compatible files
 *
 * Compiles every agent, skill, and rule definition in src/ into
 * Claude-specific markdown files under .claude/.
 *
 * Usage:
 *   bun run build:claude          # via package.json script
 *   bun ./scripts/build-claude.ts # direct invocation
 *
 * Prerequisites:
 *   - All agent/skill/rule source classes must compile without errors
 *   - ClaudeCompiler must be available in src/compilers/
 *
 * Output paths:
 *   .claude/agents/*.md
 *   .claude/skills/<name>/SKILL.md
 *   .claude/rules/*.md
 */
import { agentRegistry } from "../src/agents/index";
import { ruleRegistry } from "../src/rules/index";
import { skillRegistry } from "../src/skills/index";
import { hookRegistry } from "../src/hooks/index";
import { generateClaudeHooksConfig } from "./build-shared";
import type { BaseAgent } from "../src/agents/types/agent.types";
import type { BaseSkill } from "../src/skills/types/skill.types";
import type { BaseRule } from "../src/rules/types/rule.types";
import { LuExecutorAgent } from "../src/agents/luca/lu-executor.agent";
import { LuPlannerAgent } from "../src/agents/luca/lu-planner.agent";
import { LuSkill } from "../src/skills/luca/lu.skill";
import { LuWorkflowRule } from "../src/rules/lu-workflow.rule";
import { ClaudeCompiler } from "../src/compilers/claude.compiler";
import { cleanDirectory, cleanSkillsDirectory, ensureDir } from "./build-utils";
import path from "path";

async function main() {
  const compiler = new ClaudeCompiler();

  // Define output directories
  const claudeDir = path.join(process.cwd(), ".claude");
  const agentsDir = path.join(claudeDir, "agents");
  const skillsDir = path.join(claudeDir, "skills");
  const rulesDir = path.join(claudeDir, "rules");

  // Ensure output directories exist
  await ensureDir(agentsDir);
  await ensureDir(skillsDir);
  await ensureDir(rulesDir);

  // Clean stale files before writing
  const removedAgents = await cleanDirectory(agentsDir, [".md"]);
  const removedSkills = await cleanSkillsDirectory(skillsDir);
  const removedRules = await cleanDirectory(rulesDir, [".md"]);

  if (removedAgents.length)
    console.log(`Cleaned ${removedAgents.length} stale agent files`);
  if (removedSkills.length)
    console.log(`Cleaned ${removedSkills.length} stale skill directories`);
  if (removedRules.length)
    console.log(`Cleaned ${removedRules.length} stale rule files`);

  let agentCount = 0;
  let skillCount = 0;
  let ruleCount = 0;

  // --- Agents ---

  // General agents from registry
  for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
    try {
      const instance = new (AgentClass as new () => BaseAgent)();
      const content = compiler.compileAgent(instance, "CLAUDE");
      const outputPath = path.join(agentsDir, `${agentName}.md`);
      await Bun.write(outputPath, content);
      console.log(`✓ Generated .claude/agents/${agentName}.md`);
      agentCount++;
    } catch (error) {
      console.error(
        `✗ Failed to generate .claude/agents/${agentName}.md:`,
        error,
      );
    }
  }

  // Luca-specific agents
  const luExecutor = new LuExecutorAgent();
  await Bun.write(
    path.join(agentsDir, "lu-executor.md"),
    compiler.compileAgent(luExecutor, "CLAUDE"),
  );
  console.log("✓ Generated .claude/agents/lu-executor.md");
  agentCount++;

  const luPlanner = new LuPlannerAgent();
  await Bun.write(
    path.join(agentsDir, "lu-planner.md"),
    compiler.compileAgent(luPlanner, "CLAUDE"),
  );
  console.log("✓ Generated .claude/agents/lu-planner.md");
  agentCount++;

  // --- Skills ---

  // General skills from registry
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    try {
      const instance = new (SkillClass as new () => BaseSkill)();
      const content = compiler.compileSkill(instance, "CLAUDE");
      const skillDir = path.join(skillsDir, skillName);
      await ensureDir(skillDir);
      await Bun.write(path.join(skillDir, "SKILL.md"), content);
      console.log(`✓ Generated .claude/skills/${skillName}/SKILL.md`);
      skillCount++;
    } catch (error) {
      console.error(
        `✗ Failed to generate .claude/skills/${skillName}/SKILL.md:`,
        error,
      );
    }
  }

  // Luca-specific skill
  const luSkill = new LuSkill();
  const luSkillDir = path.join(skillsDir, "lu");
  await ensureDir(luSkillDir);
  await Bun.write(
    path.join(luSkillDir, "SKILL.md"),
    compiler.compileSkill(luSkill, "CLAUDE"),
  );
  console.log("✓ Generated .claude/skills/lu/SKILL.md");
  skillCount++;

  // --- Rules ---

  // General rules from registry
  for (const [ruleName, RuleClass] of Object.entries(ruleRegistry)) {
    try {
      const instance = new (RuleClass as new () => BaseRule)();
      const content = compiler.compileRule(instance, "CLAUDE");
      const outputPath = path.join(rulesDir, `${ruleName}.md`);
      await Bun.write(outputPath, content);
      console.log(`✓ Generated .claude/rules/${ruleName}.md`);
      ruleCount++;
    } catch (error) {
      console.error(
        `✗ Failed to generate .claude/rules/${ruleName}.md:`,
        error,
      );
    }
  }

  // Luca-specific rule
  const luWorkflowRule = new LuWorkflowRule();
  await Bun.write(
    path.join(rulesDir, "lu-workflow.md"),
    compiler.compileRule(luWorkflowRule, "CLAUDE"),
  );
  console.log("✓ Generated .claude/rules/lu-workflow.md");
  ruleCount++;

  // --- Hooks (Claude-only) ---

  const hooksDir = path.join(claudeDir, "hooks");
  await ensureDir(hooksDir);

  // Clean existing hook scripts
  const removedHooks = await cleanDirectory(hooksDir, [".sh"]);
  if (removedHooks.length)
    console.log(`Cleaned ${removedHooks.length} stale hook scripts`);

  let hookCount = 0;

  // Copy hook scripts from src/hooks/scripts/ to .claude/hooks/
  const hookScriptsDir = path.join(process.cwd(), "src", "hooks", "scripts");
  for (const [hookName, hookDef] of Object.entries(hookRegistry)) {
    try {
      const srcPath = path.join(hookScriptsDir, hookDef.script);
      const destPath = path.join(hooksDir, hookDef.script);

      const srcFile = Bun.file(srcPath);
      if (!(await srcFile.exists())) {
        console.error(
          `✗ Hook script not found: src/hooks/scripts/${hookDef.script}`,
        );
        continue;
      }

      await Bun.write(destPath, srcFile);

      // Make script executable
      const { exitCode } = Bun.spawnSync(["chmod", "+x", destPath]);
      if (exitCode !== 0) {
        console.error(`✗ Failed to chmod +x ${destPath}`);
      }

      console.log(`✓ Generated .claude/hooks/${hookDef.script}`);
      hookCount++;
    } catch (error) {
      console.error(
        `✗ Failed to generate .claude/hooks/${hookDef.script}:`,
        error,
      );
    }
  }

  // Generate .claude/settings.json with hooks configuration
  const settingsPath = path.join(claudeDir, "settings.json");
  let existingSettings: Record<string, unknown> = {};

  // Preserve any existing settings (but NOT from settings.local.json)
  try {
    const settingsFile = Bun.file(settingsPath);
    if (await settingsFile.exists()) {
      existingSettings = JSON.parse(await settingsFile.text());
    }
  } catch {
    // File doesn't exist or is invalid JSON -- start fresh
  }

  // Merge hooks config into settings
  const hooksConfig = generateClaudeHooksConfig(hookRegistry, {
    commandPrefix: '"$CLAUDE_PROJECT_DIR"/.claude/hooks',
  });
  existingSettings.hooks = hooksConfig;

  await Bun.write(
    settingsPath,
    JSON.stringify(existingSettings, null, 2) + "\n",
  );
  console.log(`✓ Generated .claude/settings.json with ${hookCount} hook(s)`);

  // Summary
  console.log(`\n=== Claude Build Summary ===`);
  console.log(`Agents: ${agentCount}`);
  console.log(`Skills: ${skillCount}`);
  console.log(`Rules:  ${ruleCount}`);
  console.log(`Hooks:  ${hookCount} (Claude-only)`);
}

main().catch((error) => {
  console.error("\n========================================");
  console.error("  BUILD FAILED: build-claude");
  console.error("========================================\n");
  console.error("What failed:", error.message || error);
  console.error("\nTroubleshooting:");
  console.error(
    "  1. Ensure all source classes in src/ compile: bun build ./src/index.ts",
  );
  console.error(
    "  2. Check that ClaudeCompiler exists in src/compilers/claude.compiler.ts",
  );
  console.error(
    "  3. Verify the registries export correctly from src/*/index.ts",
  );
  console.error("\nStack trace:");
  console.error(error.stack || error);
  process.exit(1);
});
