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
import { LuExecutorAgent } from '../src/agents/luca/lu-executor.agent';
import { LuPlannerAgent } from '../src/agents/luca/lu-planner.agent';
import { LuSkill } from '../src/skills/luca/lu.skill';
import { LuWorkflowRule } from '../src/rules/lu-workflow.rule';
import { ClaudeCompiler } from '../src/compilers/claude.compiler';
import { mkdir } from 'fs/promises';
import path from 'path';

// Import all skill classes and registry
import { skillRegistry } from '../src/skills/index';
import type { BaseSkill } from '../src/skills/types/skill.types';

async function main() {
  const compiler = new ClaudeCompiler();

  // Create claude directory structure
  const claudeDir = path.join(process.cwd(), '.claude');
  const agentsDir = path.join(claudeDir, 'agents');
  const claudeSkillsDir = path.join(claudeDir, 'skills');
  const claudeRulesDir = path.join(claudeDir, 'rules');

  await mkdir(agentsDir, { recursive: true });
  await mkdir(claudeSkillsDir, { recursive: true });
  await mkdir(claudeRulesDir, { recursive: true });

  // Compile and write the lu-executor agent
  const luExecutorAgent = new LuExecutorAgent();
  const claudeExecutorContent = compiler.compileAgent(luExecutorAgent, 'CLAUDE');

  const executorOutputPath = path.join(agentsDir, 'lu-executor.md');
  await Bun.write(executorOutputPath, claudeExecutorContent);

  console.log(`✓ Generated .claude/agents/lu-executor.md`);

  // Compile and write the lu-planner agent
  const luPlannerAgent = new LuPlannerAgent();
  const claudePlannerContent = compiler.compileAgent(luPlannerAgent, 'CLAUDE');

  const plannerOutputPath = path.join(agentsDir, 'lu-planner.md');
  await Bun.write(plannerOutputPath, claudePlannerContent);

  console.log(`✓ Generated .claude/agents/lu-planner.md`);

  // Compile and write the lu skill for Claude format
  const luSkill = new LuSkill();
  const claudeLuSkillContent = compiler.compileSkill(luSkill, 'CLAUDE');

  const claudeLuSkillDir = path.join(claudeSkillsDir, 'lu');
  await mkdir(claudeLuSkillDir, { recursive: true });

  const claudeLuSkillOutputPath = path.join(claudeLuSkillDir, 'SKILL.md');
  await Bun.write(claudeLuSkillOutputPath, claudeLuSkillContent);

  console.log(`✓ Generated .claude/skills/lu/SKILL.md`);

  // Compile and write all general skills
  console.log('Generating Claude format for all general skills...');
  let skillCount = 0;

  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    try {
      // Instantiate the skill
      const skillInstance = new (SkillClass as new () => BaseSkill)();

      // Compile to Claude format
      const claudeSkillContent = compiler.compileSkill(skillInstance, 'CLAUDE');

      // Create skill directory
      const skillDir = path.join(claudeSkillsDir, skillName);
      await mkdir(skillDir, { recursive: true });

      // Write skill file
      const skillOutputPath = path.join(skillDir, 'SKILL.md');
      await Bun.write(skillOutputPath, claudeSkillContent);

      console.log(`✓ Generated .claude/skills/${skillName}/SKILL.md`);
      skillCount++;
    } catch (error) {
      console.error(`✗ Failed to generate .claude/skills/${skillName}/SKILL.md:`, error);
    }
  }

  console.log(`✓ Generated Claude format for ${skillCount} general skills`);

  // Compile and write the lu-workflow rule for Claude format
  const luWorkflowRule = new LuWorkflowRule();
  const claudeRuleContent = compiler.compileRule(luWorkflowRule, 'CLAUDE');

  const claudeRuleOutputPath = path.join(claudeRulesDir, 'lu-workflow.md'); // Using .md for Claude format
  await Bun.write(claudeRuleOutputPath, claudeRuleContent);

  console.log(`✓ Generated .claude/rules/lu-workflow.md`);
}

main().catch((error) => {
  console.error('\n========================================');
  console.error('  BUILD FAILED: build-claude');
  console.error('========================================\n');
  console.error('What failed:', error.message || error);
  console.error('\nTroubleshooting:');
  console.error('  1. Ensure all source classes in src/ compile: bun build ./src/index.ts');
  console.error('  2. Check that ClaudeCompiler exists in src/compilers/claude.compiler.ts');
  console.error('  3. Verify the skill registry exports correctly from src/skills/index.ts');
  console.error('\nStack trace:');
  console.error(error.stack || error);
  process.exit(1);
});
