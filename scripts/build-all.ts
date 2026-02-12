#!/usr/bin/env bun

/**
 * build-all.ts — Unified build script for Cursor + Claude + Plugin output
 *
 * Compiles every agent, skill, and rule definition in src/ into
 * platform-specific markdown files under .cursor/, .claude/, and dist/plugin/.
 *
 * Usage:
 *   bun run build:all          # via package.json script
 *   bun ./scripts/build-all.ts # direct invocation
 *
 * Prerequisites:
 *   - All agent/skill/rule source classes must compile without errors
 *   - CursorCompiler, ClaudeCompiler, and PluginCompiler must be available
 *
 * Output paths:
 *   .cursor/agents/*.md
 *   .cursor/skills/<name>/SKILL.md
 *   .cursor/rules/*.mdc
 *   .claude/agents/*.md
 *   .claude/skills/<name>/SKILL.md
 *   .claude/rules/*.md
 *   dist/plugin/ (complete plugin package)
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
import { cleanDirectory, cleanSkillsDirectory, ensureDir } from "./build-utils";
import {
  COMMAND_EXCLUDED_SKILLS,
  PLUGIN_EXCLUDED_HOOKS,
  generatePluginHooksConfig,
  generateCommandMarkdown,
  readVersion,
  generateReadme,
} from "./build-shared";
import path from "path";

async function main() {
  const cursorCompiler = new CursorCompiler();
  const claudeCompiler = new ClaudeCompiler();

  // Define output directories
  const cursorDir = path.join(process.cwd(), ".cursor");
  const cursorAgentsDir = path.join(cursorDir, "agents");
  const cursorSkillsDir = path.join(cursorDir, "skills");
  const cursorRulesDir = path.join(cursorDir, "rules");

  const claudeDir = path.join(process.cwd(), ".claude");
  const claudeAgentsDir = path.join(claudeDir, "agents");
  const claudeSkillsDir = path.join(claudeDir, "skills");
  const claudeRulesDir = path.join(claudeDir, "rules");

  // Ensure all output directories exist
  await Promise.all([
    ensureDir(cursorAgentsDir),
    ensureDir(cursorSkillsDir),
    ensureDir(cursorRulesDir),
    ensureDir(claudeAgentsDir),
    ensureDir(claudeSkillsDir),
    ensureDir(claudeRulesDir),
  ]);

  // Clean all 6 output directories before writing
  const [
    removedCursorAgents,
    removedCursorSkills,
    removedCursorRules,
    removedClaudeAgents,
    removedClaudeSkills,
    removedClaudeRules,
  ] = await Promise.all([
    cleanDirectory(cursorAgentsDir, [".md"]),
    cleanSkillsDirectory(cursorSkillsDir),
    cleanDirectory(cursorRulesDir, [".mdc"]),
    cleanDirectory(claudeAgentsDir, [".md"]),
    cleanSkillsDirectory(claudeSkillsDir),
    cleanDirectory(claudeRulesDir, [".md"]),
  ]);

  const totalRemoved =
    removedCursorAgents.length +
    removedCursorSkills.length +
    removedCursorRules.length +
    removedClaudeAgents.length +
    removedClaudeSkills.length +
    removedClaudeRules.length;

  if (totalRemoved)
    console.log(`Cleaned ${totalRemoved} stale files/directories`);

  let agentCount = 0;
  let skillCount = 0;
  let ruleCount = 0;
  const failures: Array<{ type: string; name: string; error: unknown }> = [];

  // --- Agents ---

  // General agents from registry
  for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
    try {
      const instance = new (AgentClass as new () => BaseAgent)();
      const cursorContent = cursorCompiler.compileAgent(instance, "CURSOR");
      const claudeContent = claudeCompiler.compileAgent(instance, "CLAUDE");

      await Bun.write(
        path.join(cursorAgentsDir, `${agentName}.md`),
        cursorContent,
      );
      await Bun.write(
        path.join(claudeAgentsDir, `${agentName}.md`),
        claudeContent,
      );

      console.log(`✓ Generated agents/${agentName}.md (Cursor + Claude)`);
      agentCount++;
    } catch (error) {
      console.error(`✗ Failed to generate agents/${agentName}.md:`, error);
      failures.push({ type: "agent", name: agentName, error });
    }
  }

  // Luca-specific agents
  const luExecutor = new LuExecutorAgent();
  await Bun.write(
    path.join(cursorAgentsDir, "lu-executor.md"),
    cursorCompiler.compileAgent(luExecutor, "CURSOR"),
  );
  await Bun.write(
    path.join(claudeAgentsDir, "lu-executor.md"),
    claudeCompiler.compileAgent(luExecutor, "CLAUDE"),
  );
  console.log("✓ Generated agents/lu-executor.md (Cursor + Claude)");
  agentCount++;

  const luPlanner = new LuPlannerAgent();
  await Bun.write(
    path.join(cursorAgentsDir, "lu-planner.md"),
    cursorCompiler.compileAgent(luPlanner, "CURSOR"),
  );
  await Bun.write(
    path.join(claudeAgentsDir, "lu-planner.md"),
    claudeCompiler.compileAgent(luPlanner, "CLAUDE"),
  );
  console.log("✓ Generated agents/lu-planner.md (Cursor + Claude)");
  agentCount++;

  // --- Skills ---

  // General skills from registry
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    try {
      const instance = new (SkillClass as new () => BaseSkill)();
      const cursorContent = cursorCompiler.compileSkill(instance, "CURSOR");
      const claudeContent = claudeCompiler.compileSkill(instance, "CLAUDE");

      const cursorSkillDir = path.join(cursorSkillsDir, skillName);
      const claudeSkillDir = path.join(claudeSkillsDir, skillName);
      await ensureDir(cursorSkillDir);
      await ensureDir(claudeSkillDir);

      await Bun.write(path.join(cursorSkillDir, "SKILL.md"), cursorContent);
      await Bun.write(path.join(claudeSkillDir, "SKILL.md"), claudeContent);

      console.log(`✓ Generated skills/${skillName}/SKILL.md (Cursor + Claude)`);
      skillCount++;
    } catch (error) {
      console.error(
        `✗ Failed to generate skills/${skillName}/SKILL.md:`,
        error,
      );
      failures.push({ type: "skill", name: skillName, error });
    }
  }

  // Luca-specific skill
  const luSkill = new LuSkill();
  const cursorLuSkillDir = path.join(cursorSkillsDir, "lu");
  const claudeLuSkillDir = path.join(claudeSkillsDir, "lu");
  await ensureDir(cursorLuSkillDir);
  await ensureDir(claudeLuSkillDir);
  await Bun.write(
    path.join(cursorLuSkillDir, "SKILL.md"),
    cursorCompiler.compileSkill(luSkill, "CURSOR"),
  );
  await Bun.write(
    path.join(claudeLuSkillDir, "SKILL.md"),
    claudeCompiler.compileSkill(luSkill, "CLAUDE"),
  );
  console.log("✓ Generated skills/lu/SKILL.md (Cursor + Claude)");
  skillCount++;

  // --- Rules ---

  // General rules from registry
  for (const [ruleName, RuleClass] of Object.entries(ruleRegistry)) {
    try {
      const instance = new (RuleClass as new () => BaseRule)();
      const cursorContent = cursorCompiler.compileRule(instance, "CURSOR");
      const claudeContent = claudeCompiler.compileRule(instance, "CLAUDE");

      await Bun.write(
        path.join(cursorRulesDir, `${ruleName}.mdc`),
        cursorContent,
      );
      await Bun.write(
        path.join(claudeRulesDir, `${ruleName}.md`),
        claudeContent,
      );

      console.log(`✓ Generated rules/${ruleName} (Cursor .mdc + Claude .md)`);
      ruleCount++;
    } catch (error) {
      console.error(`✗ Failed to generate rules/${ruleName}:`, error);
      failures.push({ type: "rule", name: ruleName, error });
    }
  }

  // Luca-specific rule
  const luWorkflowRule = new LuWorkflowRule();
  await Bun.write(
    path.join(cursorRulesDir, "lu-workflow.mdc"),
    cursorCompiler.compileRule(luWorkflowRule, "CURSOR"),
  );
  await Bun.write(
    path.join(claudeRulesDir, "lu-workflow.md"),
    claudeCompiler.compileRule(luWorkflowRule, "CLAUDE"),
  );
  console.log("✓ Generated rules/lu-workflow (Cursor .mdc + Claude .md)");
  ruleCount++;

  // --- Hooks (Claude) ---

  const claudeHooksDir = path.join(claudeDir, "hooks");
  await ensureDir(claudeHooksDir);

  // Clean existing hook scripts
  const removedHooks = await cleanDirectory(claudeHooksDir, [".sh"]);
  if (removedHooks.length)
    console.log(`Cleaned ${removedHooks.length} stale hook scripts`);

  let hookCount = 0;

  // Copy hook scripts from src/hooks/scripts/ to .claude/hooks/
  const hookScriptsDir = path.join(process.cwd(), "src", "hooks", "scripts");
  for (const [hookName, hookDef] of Object.entries(hookRegistry)) {
    try {
      const srcPath = path.join(hookScriptsDir, hookDef.script);
      const destPath = path.join(claudeHooksDir, hookDef.script);

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
      failures.push({ type: "claude-hook", name: hookDef.script, error });
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
  const hooksConfig = generateHooksConfig(hookRegistry);
  existingSettings.hooks = hooksConfig;

  await Bun.write(
    settingsPath,
    JSON.stringify(existingSettings, null, 2) + "\n",
  );
  console.log(`✓ Generated .claude/settings.json with ${hookCount} hook(s)`);

  // --- Hooks (Cursor) ---

  const cursorHooksDir = path.join(cursorDir, "hooks");
  await ensureDir(cursorHooksDir);

  const removedCursorHooks = await cleanDirectory(cursorHooksDir, [".sh"]);
  if (removedCursorHooks.length)
    console.log(
      `Cleaned ${removedCursorHooks.length} stale Cursor hook scripts`,
    );

  let cursorHookCount = 0;

  for (const [_hookName, hookDef] of Object.entries(hookRegistry)) {
    try {
      const srcPath = path.join(hookScriptsDir, hookDef.script);
      const destPath = path.join(cursorHooksDir, hookDef.script);

      const srcFile = Bun.file(srcPath);
      if (!(await srcFile.exists())) {
        console.error(
          `✗ Hook script not found: src/hooks/scripts/${hookDef.script}`,
        );
        continue;
      }

      await Bun.write(destPath, srcFile);
      const { exitCode } = Bun.spawnSync(["chmod", "+x", destPath]);
      if (exitCode !== 0) {
        console.error(`✗ Failed to chmod +x ${destPath}`);
      }

      console.log(`✓ Generated .cursor/hooks/${hookDef.script}`);
      cursorHookCount++;
    } catch (error) {
      console.error(
        `✗ Failed to generate .cursor/hooks/${hookDef.script}:`,
        error,
      );
      failures.push({ type: "cursor-hook", name: hookDef.script, error });
    }
  }

  // Generate .cursor/hooks.json
  const cursorHooksConfig = generateCursorHooksConfig(hookRegistry);
  await Bun.write(
    path.join(cursorDir, "hooks.json"),
    JSON.stringify(cursorHooksConfig, null, 2) + "\n",
  );
  console.log(`✓ Generated .cursor/hooks.json with ${cursorHookCount} hook(s)`);

  // --- Plugin ---
  console.log("\n--- Plugin ---");

  const pluginCompiler = new PluginCompiler();

  // Define plugin output directories
  const pluginDir = path.join(process.cwd(), "dist", "plugin");
  const pluginManifestDir = path.join(pluginDir, ".claude-plugin");
  const pluginAgentsDir = path.join(pluginDir, "agents");
  const pluginSkillsDir = path.join(pluginDir, "skills");
  const pluginCommandsDir = path.join(pluginDir, "commands");
  const pluginHooksDir = path.join(pluginDir, "hooks");
  const pluginScriptsDir = path.join(pluginDir, "scripts");

  // Ensure all plugin output directories exist
  await Promise.all([
    ensureDir(pluginManifestDir),
    ensureDir(pluginAgentsDir),
    ensureDir(pluginSkillsDir),
    ensureDir(pluginCommandsDir),
    ensureDir(pluginHooksDir),
    ensureDir(pluginScriptsDir),
  ]);

  // Clean stale plugin files before writing
  const [
    removedPluginAgents,
    removedPluginSkills,
    removedPluginCommands,
    removedPluginHooks,
    removedPluginScripts,
  ] = await Promise.all([
    cleanDirectory(pluginAgentsDir, [".md"]),
    cleanSkillsDirectory(pluginSkillsDir),
    cleanDirectory(pluginCommandsDir, [".md"]),
    cleanDirectory(pluginHooksDir, [".json"]),
    cleanDirectory(pluginScriptsDir, [".sh"]),
  ]);

  const totalPluginRemoved =
    removedPluginAgents.length +
    removedPluginSkills.length +
    removedPluginCommands.length +
    removedPluginHooks.length +
    removedPluginScripts.length;

  if (totalPluginRemoved)
    console.log(`Cleaned ${totalPluginRemoved} stale files/directories`);

  let pluginAgentCount = 0;
  let pluginSkillCount = 0;
  let pluginCommandCount = 0;
  let pluginHookCount = 0;
  const pluginAgentNames: string[] = [];
  const pluginSkillNames: string[] = [];
  const pluginCommandNames: string[] = [];
  const pluginHookNames: string[] = [];

  // --- Plugin Agents ---

  // General agents from registry
  for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
    try {
      const instance = new (AgentClass as new () => BaseAgent)();
      const content = pluginCompiler.compileAgent(instance, "CLAUDE");

      await Bun.write(path.join(pluginAgentsDir, `${agentName}.md`), content);

      console.log(`  Generated agents/${agentName}.md`);
      pluginAgentNames.push(agentName);
      pluginAgentCount++;
    } catch (error) {
      console.error(`  Failed to generate agents/${agentName}.md:`, error);
      failures.push({ type: "plugin-agent", name: agentName, error });
    }
  }

  // Luca-specific agents
  try {
    const pluginLuExecutor = new LuExecutorAgent();
    await Bun.write(
      path.join(pluginAgentsDir, "lu-executor.md"),
      pluginCompiler.compileAgent(pluginLuExecutor, "CLAUDE"),
    );
    console.log("  Generated agents/lu-executor.md");
    pluginAgentNames.push("lu-executor");
    pluginAgentCount++;
  } catch (error) {
    console.error("  Failed to generate agents/lu-executor.md:", error);
    failures.push({ type: "plugin-agent", name: "lu-executor", error });
  }

  try {
    const pluginLuPlanner = new LuPlannerAgent();
    await Bun.write(
      path.join(pluginAgentsDir, "lu-planner.md"),
      pluginCompiler.compileAgent(pluginLuPlanner, "CLAUDE"),
    );
    console.log("  Generated agents/lu-planner.md");
    pluginAgentNames.push("lu-planner");
    pluginAgentCount++;
  } catch (error) {
    console.error("  Failed to generate agents/lu-planner.md:", error);
    failures.push({ type: "plugin-agent", name: "lu-planner", error });
  }

  // --- Plugin Skills ---

  // General skills from registry
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    try {
      const instance = new (SkillClass as new () => BaseSkill)();
      const content = pluginCompiler.compileSkill(instance, "CLAUDE");

      const pluginSkillDir = path.join(pluginSkillsDir, skillName);
      await ensureDir(pluginSkillDir);
      await Bun.write(path.join(pluginSkillDir, "SKILL.md"), content);

      console.log(`  Generated skills/${skillName}/SKILL.md`);
      pluginSkillNames.push(skillName);
      pluginSkillCount++;
    } catch (error) {
      console.error(
        `  Failed to generate skills/${skillName}/SKILL.md:`,
        error,
      );
      failures.push({ type: "plugin-skill", name: skillName, error });
    }
  }

  // Luca-specific skill
  try {
    const pluginLuSkill = new LuSkill();
    const pluginLuSkillDir = path.join(pluginSkillsDir, "lu");
    await ensureDir(pluginLuSkillDir);
    await Bun.write(
      path.join(pluginLuSkillDir, "SKILL.md"),
      pluginCompiler.compileSkill(pluginLuSkill, "CLAUDE"),
    );
    console.log("  Generated skills/lu/SKILL.md");
    pluginSkillNames.push("lu");
    pluginSkillCount++;
  } catch (error) {
    console.error("  Failed to generate skills/lu/SKILL.md:", error);
    failures.push({ type: "plugin-skill", name: "lu", error });
  }

  // --- Plugin Commands ---

  // Generate commands from general skills (excluding non-command skills)
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    if (COMMAND_EXCLUDED_SKILLS.has(skillName)) {
      continue;
    }

    try {
      const instance = new (SkillClass as new () => BaseSkill)();
      const commandContent = generateCommandMarkdown(
        skillName,
        instance.description,
      );

      await Bun.write(
        path.join(pluginCommandsDir, `${skillName}.md`),
        commandContent,
      );

      console.log(`  Generated commands/${skillName}.md`);
      pluginCommandNames.push(skillName);
      pluginCommandCount++;
    } catch (error) {
      console.error(`  Failed to generate commands/${skillName}.md:`, error);
      failures.push({ type: "plugin-command", name: skillName, error });
    }
  }

  // Generate command for luca-specific lu skill
  try {
    const pluginLuSkillForCmd = new LuSkill();
    const luCommandContent = generateCommandMarkdown(
      "lu",
      pluginLuSkillForCmd.description,
    );

    await Bun.write(path.join(pluginCommandsDir, "lu.md"), luCommandContent);

    console.log("  Generated commands/lu.md");
    pluginCommandNames.push("lu");
    pluginCommandCount++;
  } catch (error) {
    console.error("  Failed to generate commands/lu.md:", error);
    failures.push({ type: "plugin-command", name: "lu", error });
  }

  // --- Plugin Hook Scripts ---

  // Filter hooks for plugin context (exclude development-only hooks)
  const pluginHookRegistry = Object.fromEntries(
    Object.entries(hookRegistry).filter(
      ([name]) => !PLUGIN_EXCLUDED_HOOKS.has(name),
    ),
  );

  if (PLUGIN_EXCLUDED_HOOKS.size > 0) {
    console.log(
      `  Excluded ${PLUGIN_EXCLUDED_HOOKS.size} hook(s): ${[...PLUGIN_EXCLUDED_HOOKS].join(", ")}`,
    );
  }

  for (const [hookName, hookDef] of Object.entries(pluginHookRegistry)) {
    try {
      const srcPath = path.join(hookScriptsDir, hookDef.script);
      const destPath = path.join(pluginScriptsDir, hookDef.script);

      const srcFile = Bun.file(srcPath);
      if (!(await srcFile.exists())) {
        console.error(
          `  Hook script not found: src/hooks/scripts/${hookDef.script}`,
        );
        failures.push({
          type: "plugin-hook",
          name: hookName,
          error: new Error(`Script not found: ${hookDef.script}`),
        });
        continue;
      }

      await Bun.write(destPath, srcFile);

      // Make script executable
      const { exitCode } = Bun.spawnSync(["chmod", "+x", destPath]);
      if (exitCode !== 0) {
        console.error(`  Failed to chmod +x ${destPath}`);
      }

      console.log(`  Generated scripts/${hookDef.script}`);
      pluginHookNames.push(hookName);
      pluginHookCount++;
    } catch (error) {
      console.error(`  Failed to copy hook script ${hookDef.script}:`, error);
      failures.push({ type: "plugin-hook", name: hookName, error });
    }
  }

  // --- Plugin Hooks Configuration ---

  const pluginHooksConfig = generatePluginHooksConfig(pluginHookRegistry);
  await Bun.write(
    path.join(pluginHooksDir, "hooks.json"),
    JSON.stringify(pluginHooksConfig, null, 2) + "\n",
  );
  console.log("  Generated hooks/hooks.json");

  // --- Plugin Manifest ---

  const version = await readVersion();

  const manifest = generatePluginManifest({
    name: "luca",
    version,
    description:
      "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
    author: {
      name: "Alec Sibilia",
    },
    keywords: ["agent", "ai", "framework", "luca", "workflow", "cognitive"],
    commands: pluginCommandNames,
    agents: pluginAgentNames,
    skills: pluginSkillNames,
    hooks: pluginHookNames,
  });

  await Bun.write(
    path.join(pluginManifestDir, "plugin.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log("  Generated .claude-plugin/plugin.json");

  // --- Plugin Marketplace Manifest ---

  const marketplaceManifest = {
    $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
    name: "luca-marketplace",
    description:
      "Luca - Agentic development framework with cognitive memory and spec-driven workflow",
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

  await Bun.write(
    path.join(pluginManifestDir, "marketplace.json"),
    JSON.stringify(marketplaceManifest, null, 2) + "\n",
  );
  console.log("  Generated .claude-plugin/marketplace.json");

  // --- Plugin README ---

  const readmeContent = generateReadme(
    pluginSkillNames,
    pluginAgentNames,
    pluginCommandCount,
    pluginHookCount,
  );

  await Bun.write(path.join(pluginDir, "README.md"), readmeContent);
  console.log("  Generated README.md");

  // --- Plugin Summary ---

  const pluginTotalFiles =
    pluginAgentCount +
    pluginSkillCount +
    pluginCommandCount +
    pluginHookCount +
    4; // +4 for hooks.json, plugin.json, marketplace.json, README.md

  console.log("\n=== Plugin Build Summary ===");
  console.log(`Agents:   ${pluginAgentCount}`);
  console.log(`Skills:   ${pluginSkillCount}`);
  console.log(`Commands: ${pluginCommandCount}`);
  console.log(`Hooks:    ${pluginHookCount}`);
  console.log(`Manifests:   plugin.json + marketplace.json`);
  console.log(`Docs:        README.md`);
  console.log(`Total:    ${pluginTotalFiles} files`);
  console.log(`Output:   dist/plugin/`);

  // --- Unified Summary ---

  console.log(`\n=== Build All Summary ===`);
  console.log(`Agents: ${agentCount} (x2 formats = ${agentCount * 2} files)`);
  console.log(`Skills: ${skillCount} (x2 formats = ${skillCount * 2} files)`);
  console.log(`Rules:  ${ruleCount} (x2 formats = ${ruleCount * 2} files)`);
  console.log(`Hooks:  ${hookCount} (Claude) + ${cursorHookCount} (Cursor)`);
  console.log(
    `Plugin: ${pluginAgentCount} agents, ${pluginSkillCount} skills, ${pluginCommandCount} commands, ${pluginHookCount} hooks + plugin.json + marketplace.json`,
  );

  const claudeCursorFiles =
    (agentCount + skillCount + ruleCount) * 2 + hookCount + cursorHookCount;
  const pluginFiles =
    pluginAgentCount +
    pluginSkillCount +
    pluginCommandCount +
    pluginHookCount +
    4;
  console.log(`Total:  ${claudeCursorFiles + pluginFiles} files`);

  console.log("\n--- .claude/ ---");
  console.log(`  Agents: ${agentCount}`);
  console.log(`  Skills: ${skillCount}`);
  console.log(`  Rules:  ${ruleCount}`);
  console.log(`  Hooks:  ${hookCount}`);

  console.log("\n--- .cursor/ ---");
  console.log(`  Agents: ${agentCount}`);
  console.log(`  Skills: ${skillCount}`);
  console.log(`  Rules:  ${ruleCount}`);
  console.log(`  Hooks:  ${cursorHookCount}`);

  console.log("\n--- dist/plugin/ ---");
  console.log(`  Agents:   ${pluginAgentCount}`);
  console.log(`  Skills:   ${pluginSkillCount}`);
  console.log(`  Commands: ${pluginCommandCount}`);
  console.log(`  Hooks:    ${pluginHookCount}`);
  console.log(`  Manifests: plugin.json + marketplace.json`);
  console.log(`  Docs:      README.md`);

  if (failures.length > 0) {
    console.error(`\n✗ Build completed with ${failures.length} failure(s):`);
    for (const f of failures) {
      console.error(`  - ${f.type}/${f.name}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n========================================");
  console.error("  BUILD FAILED: build-all");
  console.error("========================================\n");
  console.error("What failed:", error.message || error);
  console.error("\nTroubleshooting:");
  console.error(
    "  1. Ensure all source classes in src/ compile: bun build ./src/index.ts",
  );
  console.error(
    "  2. Check that CursorCompiler and ClaudeCompiler exist in src/compilers/",
  );
  console.error(
    "  3. Verify the registries export correctly from src/*/index.ts",
  );
  console.error("\nStack trace:");
  console.error(error.stack || error);
  process.exit(1);
});
