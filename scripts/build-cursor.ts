#!/usr/bin/env bun

/**
 * build-cursor.ts — Build script for generating Cursor-compatible files
 *
 * Compiles every agent, skill, and rule definition in src/ into
 * Cursor-specific markdown files under .cursor/.
 *
 * Usage:
 *   bun run build:cursor          # via package.json script
 *   bun ./scripts/build-cursor.ts # direct invocation
 *
 * Prerequisites:
 *   - All agent/skill/rule source classes must compile without errors
 *   - CursorCompiler must be available in src/compilers/
 *
 * Output paths:
 *   .cursor/agents/*.md
 *   .cursor/skills/<name>/SKILL.md
 *   .cursor/rules/*.mdc
 */
import { agentRegistry } from '../src/agents/index';
import { ruleRegistry } from '../src/rules/index';
import { skillRegistry } from '../src/skills/index';
import { hookRegistry, generateCursorHooksConfig } from '../src/hooks/index';
import type { BaseAgent } from '../src/agents/types/agent.types';
import type { BaseSkill } from '../src/skills/types/skill.types';
import type { BaseRule } from '../src/rules/types/rule.types';
import { LuExecutorAgent } from '../src/agents/luca/lu-executor.agent';
import { LuPlannerAgent } from '../src/agents/luca/lu-planner.agent';
import { LuSkill } from '../src/skills/luca/lu.skill';
import { LuWorkflowRule } from '../src/rules/lu-workflow.rule';
import { CursorCompiler } from '../src/compilers/cursor.compiler';
import { cleanDirectory, cleanSkillsDirectory, ensureDir } from './build-utils';
import path from 'path';

async function main() {
  const compiler = new CursorCompiler();

  // Define output directories
  const cursorDir = path.join(process.cwd(), '.cursor');
  const agentsDir = path.join(cursorDir, 'agents');
  const skillsDir = path.join(cursorDir, 'skills');
  const rulesDir = path.join(cursorDir, 'rules');

  // Ensure output directories exist
  await ensureDir(agentsDir);
  await ensureDir(skillsDir);
  await ensureDir(rulesDir);

  // Clean stale files before writing
  const removedAgents = await cleanDirectory(agentsDir, ['.md']);
  const removedSkills = await cleanSkillsDirectory(skillsDir);
  const removedRules = await cleanDirectory(rulesDir, ['.mdc']);

  if (removedAgents.length) console.log(`Cleaned ${removedAgents.length} stale agent files`);
  if (removedSkills.length) console.log(`Cleaned ${removedSkills.length} stale skill directories`);
  if (removedRules.length) console.log(`Cleaned ${removedRules.length} stale rule files`);

  let agentCount = 0;
  let skillCount = 0;
  let ruleCount = 0;

  // --- Agents ---

  // General agents from registry
  for (const [agentName, AgentClass] of Object.entries(agentRegistry)) {
    try {
      const instance = new (AgentClass as new () => BaseAgent)();
      const content = compiler.compileAgent(instance, 'CURSOR');
      const outputPath = path.join(agentsDir, `${agentName}.md`);
      await Bun.write(outputPath, content);
      console.log(`✓ Generated .cursor/agents/${agentName}.md`);
      agentCount++;
    } catch (error) {
      console.error(`✗ Failed to generate .cursor/agents/${agentName}.md:`, error);
    }
  }

  // Luca-specific agents
  const luExecutor = new LuExecutorAgent();
  await Bun.write(path.join(agentsDir, 'lu-executor.md'), compiler.compileAgent(luExecutor, 'CURSOR'));
  console.log('✓ Generated .cursor/agents/lu-executor.md');
  agentCount++;

  const luPlanner = new LuPlannerAgent();
  await Bun.write(path.join(agentsDir, 'lu-planner.md'), compiler.compileAgent(luPlanner, 'CURSOR'));
  console.log('✓ Generated .cursor/agents/lu-planner.md');
  agentCount++;

  // --- Skills ---

  // General skills from registry
  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    try {
      const instance = new (SkillClass as new () => BaseSkill)();
      const content = compiler.compileSkill(instance, 'CURSOR');
      const skillDir = path.join(skillsDir, skillName);
      await ensureDir(skillDir);
      await Bun.write(path.join(skillDir, 'SKILL.md'), content);
      console.log(`✓ Generated .cursor/skills/${skillName}/SKILL.md`);
      skillCount++;
    } catch (error) {
      console.error(`✗ Failed to generate .cursor/skills/${skillName}/SKILL.md:`, error);
    }
  }

  // Luca-specific skill
  const luSkill = new LuSkill();
  const luSkillDir = path.join(skillsDir, 'lu');
  await ensureDir(luSkillDir);
  await Bun.write(path.join(luSkillDir, 'SKILL.md'), compiler.compileSkill(luSkill, 'CURSOR'));
  console.log('✓ Generated .cursor/skills/lu/SKILL.md');
  skillCount++;

  // --- Rules ---

  // General rules from registry
  for (const [ruleName, RuleClass] of Object.entries(ruleRegistry)) {
    try {
      const instance = new (RuleClass as new () => BaseRule)();
      const content = compiler.compileRule(instance, 'CURSOR');
      const outputPath = path.join(rulesDir, `${ruleName}.mdc`);
      await Bun.write(outputPath, content);
      console.log(`✓ Generated .cursor/rules/${ruleName}.mdc`);
      ruleCount++;
    } catch (error) {
      console.error(`✗ Failed to generate .cursor/rules/${ruleName}.mdc:`, error);
    }
  }

  // Luca-specific rule
  const luWorkflowRule = new LuWorkflowRule();
  await Bun.write(path.join(rulesDir, 'lu-workflow.mdc'), compiler.compileRule(luWorkflowRule, 'CURSOR'));
  console.log('✓ Generated .cursor/rules/lu-workflow.mdc');
  ruleCount++;

  // --- Hooks ---

  const cursorHooksDir = path.join(cursorDir, 'hooks');
  await ensureDir(cursorHooksDir);

  const removedHooks = await cleanDirectory(cursorHooksDir, ['.sh']);
  if (removedHooks.length) console.log(`Cleaned ${removedHooks.length} stale hook scripts`);

  let hookCount = 0;

  // Copy hook scripts from src/hooks/scripts/ to .cursor/hooks/
  const hookScriptsDir = path.join(process.cwd(), 'src', 'hooks', 'scripts');
  for (const [_hookName, hookDef] of Object.entries(hookRegistry)) {
    try {
      const srcPath = path.join(hookScriptsDir, hookDef.script);
      const destPath = path.join(cursorHooksDir, hookDef.script);

      const srcFile = Bun.file(srcPath);
      if (!(await srcFile.exists())) {
        console.error(`✗ Hook script not found: src/hooks/scripts/${hookDef.script}`);
        continue;
      }

      await Bun.write(destPath, srcFile);

      const { exitCode } = Bun.spawnSync(['chmod', '+x', destPath]);
      if (exitCode !== 0) {
        console.error(`✗ Failed to chmod +x ${destPath}`);
      }

      console.log(`✓ Generated .cursor/hooks/${hookDef.script}`);
      hookCount++;
    } catch (error) {
      console.error(`✗ Failed to generate .cursor/hooks/${hookDef.script}:`, error);
    }
  }

  // Generate .cursor/hooks.json
  const cursorHooksConfig = generateCursorHooksConfig(hookRegistry);
  const cursorHooksJsonPath = path.join(cursorDir, 'hooks.json');
  await Bun.write(cursorHooksJsonPath, JSON.stringify(cursorHooksConfig, null, 2) + '\n');
  console.log(`✓ Generated .cursor/hooks.json with ${hookCount} hook(s)`);

  // Summary
  console.log(`\n=== Cursor Build Summary ===`);
  console.log(`Agents: ${agentCount}`);
  console.log(`Skills: ${skillCount}`);
  console.log(`Rules:  ${ruleCount}`);
  console.log(`Hooks:  ${hookCount}`);
}

main().catch((error) => {
  console.error('\n========================================');
  console.error('  BUILD FAILED: build-cursor');
  console.error('========================================\n');
  console.error('What failed:', error.message || error);
  console.error('\nTroubleshooting:');
  console.error('  1. Ensure all source classes in src/ compile: bun build ./src/index.ts');
  console.error('  2. Check that CursorCompiler exists in src/compilers/cursor.compiler.ts');
  console.error('  3. Verify the registries export correctly from src/*/index.ts');
  console.error('\nStack trace:');
  console.error(error.stack || error);
  process.exit(1);
});
