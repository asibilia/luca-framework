#!/usr/bin/env bun

import fs from 'fs/promises';
import path from 'path';
import { LuExecutorAgent } from './src/agents/luca/lu-executor.agent';
import { LuPlannerAgent } from './src/agents/luca/lu-planner.agent';
import { LuRule } from './src/rules/lu-workflow.rule';

// Dynamically import all agents, skills, and rules
async function getAllModules() {
  const agentsDir = path.join(process.cwd(), 'src', 'agents');
  const skillsDir = path.join(process.cwd(), 'src', 'skills');
  const rulesDir = path.join(process.cwd(), 'src', 'rules');
  
  const modules: any = {
    agents: {},
    skills: {},
    rules: {}
  };
  
  // Load agents
  const agentTypes = ['general', 'luca'];
  for (const type of agentTypes) {
    const typeDir = path.join(agentsDir, type);
    try {
      const files = await fs.readdir(typeDir);
      for (const file of files) {
        if (file.endsWith('.agent.ts') && !file.endsWith('.d.ts')) {
          const moduleName = file.replace('.ts', '');
          const modulePath = `./src/agents/${type}/${moduleName}`;
          // We'll handle dynamic imports differently since we're compiling
        }
      }
    } catch (e) {
      // Directory may not exist
    }
  }
  
  // For now, let's just return the known modules
  return modules;
}

async function compileToCursor() {
  // Create .cursor directories if they don't exist
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'agents'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'skills'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'rules'), { recursive: true });
  
  // Compile known agents
  const luExecutor = new LuExecutorAgent();
  await fs.writeFile(
    path.join(process.cwd(), '.cursor', 'agents', 'lu-executor.md'),
    luExecutor.toCursorFormat()
  );
  
  // Note: We would need to implement a way to dynamically discover and compile all agents, skills, and rules
  // For now, let's create a more comprehensive solution
  
  console.log('Compilation to .cursor format completed');
}

// More comprehensive compilation function
async function compileAllToCursor() {
  // This would need to scan all TypeScript files and compile them
  // For now, let's implement a basic version with the known files
  
  // Create output directories
  await fs.mkdir(path.join(process.cwd(), '.cursor'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'agents'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'skills'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'rules'), { recursive: true });
  
  // For now, we'll just compile the existing agents that have TS implementations
  const luExecutor = new LuExecutorAgent();
  await fs.writeFile(
    path.join(process.cwd(), '.cursor', 'agents', 'generated-lu-executor.md'),
    luExecutor.toCursorFormat()
  );
  
  const luPlanner = new LuPlannerAgent();
  await fs.writeFile(
    path.join(process.cwd(), '.cursor', 'agents', 'generated-lu-planner.md'),
    luPlanner.toCursorFormat()
  );
  
  const luRule = new LuRule();
  await fs.writeFile(
    path.join(process.cwd(), '.cursor', 'rules', 'generated-lu-workflow.mdc'),
    luRule.toCursorFormat()
  );
  
  console.log('Basic compilation to .cursor format completed');
  console.log('Note: Full dynamic compilation requires a more sophisticated module discovery mechanism');
}

if (require.main === module) {
  compileAllToCursor()
    .then(() => console.log('Compilation process completed'))
    .catch(error => console.error('Error:', error));
}

export { compileAllToCursor };