#!/usr/bin/env node

/**
 * Build script for generating Cursor-compatible files
 */
import { LuExecutorAgent } from '../src/agents/luca/lu-executor.agent';
import { LuPlannerAgent } from '../src/agents/luca/lu-planner.agent';
import { LuSkill } from '../src/skills/luca/lu.skill';
import { LuWorkflowRule } from '../src/rules/lu-workflow.rule';
import { CursorCompiler } from '../src/compilers/cursor.compiler';
import fs from 'fs';
import path from 'path';

const compiler = new CursorCompiler();

// Create .cursor directory structure if it doesn't exist
const cursorDir = path.join(process.cwd(), '.cursor');
const agentsDir = path.join(cursorDir, 'agents');

if (!fs.existsSync(agentsDir)) {
  fs.mkdirSync(agentsDir, { recursive: true });
}

// Compile and write the lu-executor agent
const luExecutorAgent = new LuExecutorAgent();
const cursorExecutorContent = compiler.compileAgent(luExecutorAgent, 'CURSOR');

const executorOutputPath = path.join(agentsDir, 'lu-executor.md');
fs.writeFileSync(executorOutputPath, cursorExecutorContent);

console.log(`✓ Generated .cursor/agents/lu-executor.md`);

// Compile and write the lu-planner agent
const luPlannerAgent = new LuPlannerAgent();
const cursorPlannerContent = compiler.compileAgent(luPlannerAgent, 'CURSOR');

const plannerOutputPath = path.join(agentsDir, 'lu-planner.md');
fs.writeFileSync(plannerOutputPath, cursorPlannerContent);

console.log(`✓ Generated .cursor/agents/lu-planner.md`);

// Compile and write the lu skill
const luSkill = new LuSkill();
const cursorSkillContent = compiler.compileSkill(luSkill, 'CURSOR');

const skillDir = path.join(cursorDir, 'skills', 'lu');
if (!fs.existsSync(skillDir)) {
  fs.mkdirSync(skillDir, { recursive: true });
}

const skillOutputPath = path.join(skillDir, 'SKILL.md');
fs.writeFileSync(skillOutputPath, cursorSkillContent);

console.log(`✓ Generated .cursor/skills/lu/SKILL.md`);

// Compile and write the lu-workflow rule
const luWorkflowRule = new LuWorkflowRule();
const cursorRuleContent = compiler.compileRule(luWorkflowRule, 'CURSOR');

const rulesDir = path.join(cursorDir, 'rules');
if (!fs.existsSync(rulesDir)) {
  fs.mkdirSync(rulesDir, { recursive: true });
}

const ruleOutputPath = path.join(rulesDir, 'lu-workflow.mdc');
fs.writeFileSync(ruleOutputPath, cursorRuleContent);

console.log(`✓ Generated .cursor/rules/lu-workflow.mdc`);