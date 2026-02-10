#!/usr/bin/env bun

/**
 * build-all.ts — Unified build script for Cursor + Claude output
 *
 * Compiles every agent, skill, and rule definition in src/ into
 * platform-specific markdown files under both .cursor/ and .claude/.
 *
 * Usage:
 *   bun run build:all          # via package.json script
 *   bun ./scripts/build-all.ts # direct invocation
 *
 * Prerequisites:
 *   - All agent/skill/rule source classes must compile without errors
 *   - CursorCompiler and ClaudeCompiler must be available
 *
 * Output paths:
 *   .cursor/agents/*.md
 *   .cursor/skills/<name>/SKILL.md
 *   .cursor/rules/*.mdc
 *   .claude/agents/*.md
 *   .claude/skills/<name>/SKILL.md
 *   .claude/rules/*.md
 */
import { LuExecutorAgent } from '../src/agents/luca/lu-executor.agent';
import { LuPlannerAgent } from '../src/agents/luca/lu-planner.agent';
import { LuSkill } from '../src/skills/luca/lu.skill';
import { LuWorkflowRule } from '../src/rules/lu-workflow.rule';
import { CursorCompiler } from '../src/compilers/cursor.compiler';
import { ClaudeCompiler } from '../src/compilers/claude.compiler';
import { mkdir } from 'fs/promises';
import path from 'path';

// Import all skill classes and registry
import { skillRegistry } from '../src/skills/index';
import type { BaseSkill } from '../src/skills/types/skill.types';

async function main() {
  const cursorCompiler = new CursorCompiler();
  const claudeCompiler = new ClaudeCompiler();

  // Create .cursor directory structure
  const cursorDir = path.join(process.cwd(), '.cursor');
  const cursorAgentsDir = path.join(cursorDir, 'agents');
  const cursorSkillsDir = path.join(cursorDir, 'skills');
  const cursorRulesDir = path.join(cursorDir, 'rules');

  await mkdir(cursorAgentsDir, { recursive: true });
  await mkdir(cursorSkillsDir, { recursive: true });
  await mkdir(cursorRulesDir, { recursive: true });

  // Create .claude directory structure
  const claudeDir = path.join(process.cwd(), '.claude');
  const claudeAgentsDir = path.join(claudeDir, 'agents');
  const claudeSkillsDir = path.join(claudeDir, 'skills');
  const claudeRulesDir = path.join(claudeDir, 'rules');

  await mkdir(claudeAgentsDir, { recursive: true });
  await mkdir(claudeSkillsDir, { recursive: true });
  await mkdir(claudeRulesDir, { recursive: true });

  // Instantiate all components
  const luExecutorAgent = new LuExecutorAgent();
  const luPlannerAgent = new LuPlannerAgent();
  const luSkill = new LuSkill();
  const luWorkflowRule = new LuWorkflowRule();

  // Process lu-executor
  const cursorExecutorContent = cursorCompiler.compileAgent(luExecutorAgent, 'CURSOR');
  const claudeExecutorContent = claudeCompiler.compileAgent(luExecutorAgent, 'CLAUDE');

  const cursorExecutorOutputPath = path.join(cursorAgentsDir, 'lu-executor.md');
  const claudeExecutorOutputPath = path.join(claudeAgentsDir, 'lu-executor.md');

  await Bun.write(cursorExecutorOutputPath, cursorExecutorContent);
  await Bun.write(claudeExecutorOutputPath, claudeExecutorContent);

  console.log(`✓ Generated .cursor/agents/lu-executor.md`);
  console.log(`✓ Generated .claude/agents/lu-executor.md`);

  // Process lu-planner
  const cursorPlannerContent = cursorCompiler.compileAgent(luPlannerAgent, 'CURSOR');
  const claudePlannerContent = claudeCompiler.compileAgent(luPlannerAgent, 'CLAUDE');

  const cursorPlannerOutputPath = path.join(cursorAgentsDir, 'lu-planner.md');
  const claudePlannerOutputPath = path.join(claudeAgentsDir, 'lu-planner.md');

  await Bun.write(cursorPlannerOutputPath, cursorPlannerContent);
  await Bun.write(claudePlannerOutputPath, claudePlannerContent);

  console.log(`✓ Generated .cursor/agents/lu-planner.md`);
  console.log(`✓ Generated .claude/agents/lu-planner.md`);

  // Process lu skill
  const cursorSkillContent = cursorCompiler.compileSkill(luSkill, 'CURSOR');
  const claudeSkillContent = claudeCompiler.compileSkill(luSkill, 'CLAUDE');

  const cursorLuDir = path.join(cursorSkillsDir, 'lu');
  const claudeLuDir = path.join(claudeSkillsDir, 'lu');

  await mkdir(cursorLuDir, { recursive: true });
  await mkdir(claudeLuDir, { recursive: true });

  const cursorSkillOutputPath = path.join(cursorLuDir, 'SKILL.md');
  const claudeSkillOutputPath = path.join(claudeLuDir, 'SKILL.md');

  await Bun.write(cursorSkillOutputPath, cursorSkillContent);
  await Bun.write(claudeSkillOutputPath, claudeSkillContent);

  console.log(`✓ Generated .cursor/skills/lu/SKILL.md`);
  console.log(`✓ Generated .claude/skills/lu/SKILL.md`);

  // Process all general skills
  console.log('Generating Cursor and Claude format for all general skills...');
  let skillCount = 0;

  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    try {
      // Instantiate the skill
      const skillInstance = new (SkillClass as new () => BaseSkill)();

      // Compile to both Cursor and Claude formats
      const cursorSkillContent = cursorCompiler.compileSkill(skillInstance, 'CURSOR');
      const claudeSkillContent = claudeCompiler.compileSkill(skillInstance, 'CLAUDE');

      // Create skill directories
      const cursorSkillDir = path.join(cursorSkillsDir, skillName);
      const claudeSkillDir = path.join(claudeSkillsDir, skillName);

      await mkdir(cursorSkillDir, { recursive: true });
      await mkdir(claudeSkillDir, { recursive: true });

      // Write skill files
      const cursorSkillOutputPath = path.join(cursorSkillDir, 'SKILL.md');
      const claudeSkillOutputPath = path.join(claudeSkillDir, 'SKILL.md');

      await Bun.write(cursorSkillOutputPath, cursorSkillContent);
      await Bun.write(claudeSkillOutputPath, claudeSkillContent);

      console.log(`✓ Generated .cursor/skills/${skillName}/SKILL.md`);
      console.log(`✓ Generated .claude/skills/${skillName}/SKILL.md`);
      skillCount++;
    } catch (error) {
      console.error(`✗ Failed to generate files for ${skillName}:`, error);
    }
  }

  console.log(`✓ Generated Cursor and Claude format for ${skillCount} general skills`);

  // Process lu-workflow rule
  const cursorRuleContent = cursorCompiler.compileRule(luWorkflowRule, 'CURSOR');
  const claudeRuleContent = claudeCompiler.compileRule(luWorkflowRule, 'CLAUDE');

  const cursorRuleOutputPath = path.join(cursorRulesDir, 'lu-workflow.mdc');
  const claudeRuleOutputPath = path.join(claudeRulesDir, 'lu-workflow.md');

  await Bun.write(cursorRuleOutputPath, cursorRuleContent);
  await Bun.write(claudeRuleOutputPath, claudeRuleContent);

  console.log(`✓ Generated .cursor/rules/lu-workflow.mdc`);
  console.log(`✓ Generated .claude/rules/lu-workflow.md`);
}

main().catch((error) => {
  console.error('\n========================================');
  console.error('  BUILD FAILED: build-all');
  console.error('========================================\n');
  console.error('What failed:', error.message || error);
  console.error('\nTroubleshooting:');
  console.error('  1. Ensure all source classes in src/ compile: bun build ./src/index.ts');
  console.error('  2. Check that CursorCompiler and ClaudeCompiler exist in src/compilers/');
  console.error('  3. Verify the skill registry exports correctly from src/skills/index.ts');
  console.error('\nStack trace:');
  console.error(error.stack || error);
  process.exit(1);
});
