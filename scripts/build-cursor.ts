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
import { LuExecutorAgent } from '../src/agents/luca/lu-executor.agent';
import { LuPlannerAgent } from '../src/agents/luca/lu-planner.agent';
import { LuSkill } from '../src/skills/luca/lu.skill';
import { LuWorkflowRule } from '../src/rules/lu-workflow.rule';
import { CursorCompiler } from '../src/compilers/cursor.compiler';
import { skillRegistry } from '../src/skills/index';
import type { BaseSkill } from '../src/skills/types/skill.types';
import { mkdir } from 'fs/promises';
import path from 'path';

async function main() {
  const compiler = new CursorCompiler();

  // Create .cursor directory structure
  const cursorDir = path.join(process.cwd(), '.cursor');
  const agentsDir = path.join(cursorDir, 'agents');

  await mkdir(agentsDir, { recursive: true });

  // Compile and write the lu-executor agent
  const luExecutorAgent = new LuExecutorAgent();
  const cursorExecutorContent = compiler.compileAgent(luExecutorAgent, 'CURSOR');

  const executorOutputPath = path.join(agentsDir, 'lu-executor.md');
  await Bun.write(executorOutputPath, cursorExecutorContent);

  console.log(`✓ Generated .cursor/agents/lu-executor.md`);

  // Compile and write the lu-planner agent
  const luPlannerAgent = new LuPlannerAgent();
  const cursorPlannerContent = compiler.compileAgent(luPlannerAgent, 'CURSOR');

  const plannerOutputPath = path.join(agentsDir, 'lu-planner.md');
  await Bun.write(plannerOutputPath, cursorPlannerContent);

  console.log(`✓ Generated .cursor/agents/lu-planner.md`);

  // Compile and write the lu skill
  const luSkill = new LuSkill();
  const cursorSkillContent = compiler.compileSkill(luSkill, 'CURSOR');

  const skillDir = path.join(cursorDir, 'skills', 'lu');
  await mkdir(skillDir, { recursive: true });

  const skillOutputPath = path.join(skillDir, 'SKILL.md');
  await Bun.write(skillOutputPath, cursorSkillContent);

  console.log(`✓ Generated .cursor/skills/lu/SKILL.md`);

  // Compile and write all general skills from the registry
  console.log('Generating Cursor format for all general skills...');
  let skillCount = 0;

  for (const [skillName, SkillClass] of Object.entries(skillRegistry)) {
    try {
      const skillInstance = new (SkillClass as new () => BaseSkill)();
      const cursorGeneralSkillContent = compiler.compileSkill(skillInstance, 'CURSOR');

      const generalSkillDir = path.join(cursorDir, 'skills', skillName);
      await mkdir(generalSkillDir, { recursive: true });

      const generalSkillOutputPath = path.join(generalSkillDir, 'SKILL.md');
      await Bun.write(generalSkillOutputPath, cursorGeneralSkillContent);

      console.log(`✓ Generated .cursor/skills/${skillName}/SKILL.md`);
      skillCount++;
    } catch (error) {
      console.error(`✗ Failed to generate .cursor/skills/${skillName}/SKILL.md:`, error);
    }
  }

  console.log(`✓ Generated Cursor format for ${skillCount} general skills`);

  // Compile and write the lu-workflow rule
  const luWorkflowRule = new LuWorkflowRule();
  const cursorRuleContent = compiler.compileRule(luWorkflowRule, 'CURSOR');

  const rulesDir = path.join(cursorDir, 'rules');
  await mkdir(rulesDir, { recursive: true });

  const ruleOutputPath = path.join(rulesDir, 'lu-workflow.mdc');
  await Bun.write(ruleOutputPath, cursorRuleContent);

  console.log(`✓ Generated .cursor/rules/lu-workflow.mdc`);
}

main().catch((error) => {
  console.error('\n========================================');
  console.error('  BUILD FAILED: build-cursor');
  console.error('========================================\n');
  console.error('What failed:', error.message || error);
  console.error('\nTroubleshooting:');
  console.error('  1. Ensure all source classes in src/ compile: bun build ./src/index.ts');
  console.error('  2. Check that CursorCompiler exists in src/compilers/cursor.compiler.ts');
  console.error('  3. Verify the skill registry exports correctly from src/skills/index.ts');
  console.error('\nStack trace:');
  console.error(error.stack || error);
  process.exit(1);
});
