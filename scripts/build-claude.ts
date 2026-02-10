#!/usr/bin/env node

/**
 * Build script for generating Claude-compatible files
 */
import { LuExecutorAgent } from '../src/agents/luca/lu-executor.agent';
import { LuPlannerAgent } from '../src/agents/luca/lu-planner.agent';
import { LuSkill } from '../src/skills/luca/lu.skill';
import { LuWorkflowRule } from '../src/rules/lu-workflow.rule';
import { ClaudeCompiler } from '../src/compilers/claude.compiler';
import fs from 'fs';
import path from 'path';

// Import all skill classes and registry
import { skillRegistry } from '../src/skills/index';
import type { BaseSkill } from '../src/skills/types/skill.types';

const compiler = new ClaudeCompiler();

// Create claude directory structure if it doesn't exist
const claudeDir = path.join(process.cwd(), '.claude');
const agentsDir = path.join(claudeDir, 'agents');
const claudeSkillsDir = path.join(claudeDir, 'skills');
const claudeRulesDir = path.join(claudeDir, 'rules');

if (!fs.existsSync(agentsDir)) {
  fs.mkdirSync(agentsDir, { recursive: true });
}
if (!fs.existsSync(claudeSkillsDir)) {
  fs.mkdirSync(claudeSkillsDir, { recursive: true });
}
if (!fs.existsSync(claudeRulesDir)) {
  fs.mkdirSync(claudeRulesDir, { recursive: true });
}

// Compile and write the lu-executor agent
const luExecutorAgent = new LuExecutorAgent();
const claudeExecutorContent = compiler.compileAgent(luExecutorAgent, 'CLAUDE');

const executorOutputPath = path.join(agentsDir, 'lu-executor.md');
fs.writeFileSync(executorOutputPath, claudeExecutorContent);

console.log(`✓ Generated .claude/agents/lu-executor.md`);

// Compile and write the lu-planner agent
const luPlannerAgent = new LuPlannerAgent();
const claudePlannerContent = compiler.compileAgent(luPlannerAgent, 'CLAUDE');

const plannerOutputPath = path.join(agentsDir, 'lu-planner.md');
fs.writeFileSync(plannerOutputPath, claudePlannerContent);

console.log(`✓ Generated .claude/agents/lu-planner.md`);

// Compile and write the lu skill for Claude format
const luSkill = new LuSkill();
const claudeLuSkillContent = compiler.compileSkill(luSkill, 'CLAUDE');

const claudeLuSkillDir = path.join(claudeSkillsDir, 'lu');
if (!fs.existsSync(claudeLuSkillDir)) {
  fs.mkdirSync(claudeLuSkillDir, { recursive: true });
}

const claudeLuSkillOutputPath = path.join(claudeLuSkillDir, 'SKILL.md');
fs.writeFileSync(claudeLuSkillOutputPath, claudeLuSkillContent);

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
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true });
    }
    
    // Write skill file
    const skillOutputPath = path.join(skillDir, 'SKILL.md');
    fs.writeFileSync(skillOutputPath, claudeSkillContent);
    
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
fs.writeFileSync(claudeRuleOutputPath, claudeRuleContent);

console.log(`✓ Generated .claude/rules/lu-workflow.md`);