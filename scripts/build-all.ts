#!/usr/bin/env node

/**
 * Build script for generating both Cursor and Claude-compatible files
 */
import { LuExecutorAgent } from '../src/agents/luca/lu-executor.agent';
import { LuPlannerAgent } from '../src/agents/luca/lu-planner.agent';
import { LuSkill } from '../src/skills/luca/lu.skill';
import { LuWorkflowRule } from '../src/rules/lu-workflow.rule';
import { CursorCompiler } from '../src/compilers/cursor.compiler';
import { ClaudeCompiler } from '../src/compilers/claude.compiler';
import fs from 'fs';
import path from 'path';

// Import all skill classes and registry
import { skillRegistry } from '../src/skills/index';
import type { BaseSkill } from '../src/skills/types/skill.types';

const cursorCompiler = new CursorCompiler();
const claudeCompiler = new ClaudeCompiler();

// Create .cursor directory structure if it doesn't exist
const cursorDir = path.join(process.cwd(), '.cursor');
const cursorAgentsDir = path.join(cursorDir, 'agents');
const cursorSkillsDir = path.join(cursorDir, 'skills');
const cursorRulesDir = path.join(cursorDir, 'rules');

if (!fs.existsSync(cursorAgentsDir)) {
  fs.mkdirSync(cursorAgentsDir, { recursive: true });
}
if (!fs.existsSync(cursorSkillsDir)) {
  fs.mkdirSync(cursorSkillsDir, { recursive: true });
}
if (!fs.existsSync(cursorRulesDir)) {
  fs.mkdirSync(cursorRulesDir, { recursive: true });
}

// Create .claude directory structure if it doesn't exist
const claudeDir = path.join(process.cwd(), '.claude');
const claudeAgentsDir = path.join(claudeDir, 'agents');
const claudeSkillsDir = path.join(claudeDir, 'skills');
const claudeRulesDir = path.join(claudeDir, 'rules');

if (!fs.existsSync(claudeAgentsDir)) {
  fs.mkdirSync(claudeAgentsDir, { recursive: true });
}
if (!fs.existsSync(claudeSkillsDir)) {
  fs.mkdirSync(claudeSkillsDir, { recursive: true });
}
if (!fs.existsSync(claudeRulesDir)) {
  fs.mkdirSync(claudeRulesDir, { recursive: true });
}

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

fs.writeFileSync(cursorExecutorOutputPath, cursorExecutorContent);
fs.writeFileSync(claudeExecutorOutputPath, claudeExecutorContent);

console.log(`✓ Generated .cursor/agents/lu-executor.md`);
console.log(`✓ Generated .claude/agents/lu-executor.md`);

// Process lu-planner
const cursorPlannerContent = cursorCompiler.compileAgent(luPlannerAgent, 'CURSOR');
const claudePlannerContent = claudeCompiler.compileAgent(luPlannerAgent, 'CLAUDE');

const cursorPlannerOutputPath = path.join(cursorAgentsDir, 'lu-planner.md');
const claudePlannerOutputPath = path.join(claudeAgentsDir, 'lu-planner.md');

fs.writeFileSync(cursorPlannerOutputPath, cursorPlannerContent);
fs.writeFileSync(claudePlannerOutputPath, claudePlannerContent);

console.log(`✓ Generated .cursor/agents/lu-planner.md`);
console.log(`✓ Generated .claude/agents/lu-planner.md`);

// Process lu skill
const cursorSkillContent = cursorCompiler.compileSkill(luSkill, 'CURSOR');
const claudeSkillContent = claudeCompiler.compileSkill(luSkill, 'CLAUDE');

const cursorLuDir = path.join(cursorSkillsDir, 'lu');
const claudeLuDir = path.join(claudeSkillsDir, 'lu');

if (!fs.existsSync(cursorLuDir)) {
  fs.mkdirSync(cursorLuDir, { recursive: true });
}
if (!fs.existsSync(claudeLuDir)) {
  fs.mkdirSync(claudeLuDir, { recursive: true });
}

const cursorSkillOutputPath = path.join(cursorLuDir, 'SKILL.md');
const claudeSkillOutputPath = path.join(claudeLuDir, 'SKILL.md');

fs.writeFileSync(cursorSkillOutputPath, cursorSkillContent);
fs.writeFileSync(claudeSkillOutputPath, claudeSkillContent);

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
    
    if (!fs.existsSync(cursorSkillDir)) {
      fs.mkdirSync(cursorSkillDir, { recursive: true });
    }
    if (!fs.existsSync(claudeSkillDir)) {
      fs.mkdirSync(claudeSkillDir, { recursive: true });
    }
    
    // Write skill files
    const cursorSkillOutputPath = path.join(cursorSkillDir, 'SKILL.md');
    const claudeSkillOutputPath = path.join(claudeSkillDir, 'SKILL.md');
    
    fs.writeFileSync(cursorSkillOutputPath, cursorSkillContent);
    fs.writeFileSync(claudeSkillOutputPath, claudeSkillContent);
    
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

fs.writeFileSync(cursorRuleOutputPath, cursorRuleContent);
fs.writeFileSync(claudeRuleOutputPath, claudeRuleContent);

console.log(`✓ Generated .cursor/rules/lu-workflow.mdc`);
console.log(`✓ Generated .claude/rules/lu-workflow.md`);