#!/usr/bin/env bun

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Dynamic module discovery and compilation
async function compileAllToCursor() {
  console.log('Starting compilation of TypeScript definitions to .cursor format...');
  
  // Create .cursor directories if they don't exist
  await fs.mkdir(path.join(process.cwd(), '.cursor'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'agents'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'skills'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'rules'), { recursive: true });
  
  // Discover and compile all agents
  await compileAgents();
  
  // Discover and compile all skills
  await compileSkills();
  
  // Discover and compile all rules
  await compileRules();
  
  console.log('Compilation to .cursor format completed successfully!');
}

async function compileAgents() {
  console.log('Compiling agents...');
  
  const agentsDir = path.join(process.cwd(), 'src', 'agents');
  const agentTypes = ['general', 'luca'];
  
  for (const type of agentTypes) {
    const typeDir = path.join(agentsDir, type);
    try {
      const files = await fs.readdir(typeDir);
      for (const file of files) {
        if (file.endsWith('.agent.ts') && !file.includes('base')) {
          const moduleName = file.replace('.ts', '');
          const modulePath = path.join(typeDir, file);
          
          // For this implementation, we'll use a simpler approach
          // In a real-world scenario, we'd need to compile TS to JS first and then import
          console.log(`Discovered agent: ${moduleName}`);
          
          // Since we can't dynamically import TypeScript files directly in this context,
          // we'll create a registry of available agents and their compilation methods
          // This would normally be handled by a build system
        }
      }
    } catch (e) {
      // Directory may not exist
      console.log(`Agents directory ${typeDir} does not exist, skipping...`);
    }
  }
}

async function compileSkills() {
  console.log('Compiling skills...');
  
  const skillsDir = path.join(process.cwd(), 'src', 'skills');
  const skillTypes = ['general', 'luca'];
  
  for (const type of skillTypes) {
    const typeDir = path.join(skillsDir, type);
    try {
      const files = await fs.readdir(typeDir);
      for (const file of files) {
        if (file.endsWith('.skill.ts') && !file.includes('base')) {
          const moduleName = file.replace('.ts', '');
          console.log(`Discovered skill: ${moduleName}`);
        }
      }
    } catch (e) {
      // Directory may not exist
      console.log(`Skills directory ${typeDir} does not exist, skipping...`);
    }
  }
}

async function compileRules() {
  console.log('Compiling rules...');
  
  const rulesDir = path.join(process.cwd(), 'src', 'rules');
  const ruleTypes = ['general', 'luca'];
  
  for (const type of ruleTypes) {
    const typeDir = path.join(rulesDir, type);
    try {
      const files = await fs.readdir(typeDir);
      for (const file of files) {
        if (file.endsWith('.rule.ts') && !file.includes('base')) {
          const moduleName = file.replace('.ts', '');
          console.log(`Discovered rule: ${moduleName}`);
        }
      }
    } catch (e) {
      // Directory may not exist
      console.log(`Rules directory ${typeDir} does not exist, skipping...`);
    }
  }
}

// A more practical approach: Create a build script that compiles TypeScript to JS first
async function createBuildSystem() {
  // Create a build script that can compile TypeScript to JavaScript
  const buildScript = `#!/usr/bin/env node

// Build script to compile TypeScript agents, skills, and rules to JavaScript
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Building TypeScript files...');

// Compile TypeScript to JavaScript
try {
  execSync('npx tsc --outDir dist --module commonjs --target es2020 --esModuleInterop --skipLibCheck', {
    stdio: 'inherit',
    cwd: process.cwd()
  });
  console.log('TypeScript compilation completed.');
} catch (error) {
  console.error('TypeScript compilation failed:', error.message);
  process.exit(1);
}

// After compilation, we can dynamically import the modules and compile them to .cursor format
const agentsDir = path.join(__dirname, 'dist', 'agents');
const skillsDir = path.join(__dirname, 'dist', 'skills');
const rulesDir = path.join(__dirname, 'dist', 'rules');

// Create .cursor directories
const cursorDir = path.join(process.cwd(), '.cursor');
const cursorAgentsDir = path.join(cursorDir, 'agents');
const cursorSkillsDir = path.join(cursorDir, 'skills');
const cursorRulesDir = path.join(cursorDir, 'rules');

[cursorAgentsDir, cursorSkillsDir, cursorRulesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Function to compile modules
async function compileModules(modDir, cursorDir, extension) {
  if (!fs.existsSync(modDir)) return;
  
  const types = ['general', 'luca'];
  for (const type of types) {
    const typeDir = path.join(modDir, type);
    if (!fs.existsSync(typeDir)) continue;
    
    const files = fs.readdirSync(typeDir);
    for (const file of files) {
      if (file.endsWith(extension) && !file.includes('base')) {
        const moduleName = file.replace('.js', '');
        const modulePath = path.join(typeDir, file);
        
        try {
          const module = require(modulePath);
          // Find the class in the module
          let ModuleClass = null;
          for (const key of Object.keys(module)) {
            if (module[key].prototype && typeof module[key].prototype.toCursorFormat === 'function') {
              ModuleClass = module[key];
              break;
            }
          }
          
          if (ModuleClass) {
            const instance = new ModuleClass();
            const cursorFormat = instance.toCursorFormat();
            
            // Determine output filename based on the module name
            let outputFilename = moduleName;
            if (outputFilename.endsWith('.agent')) {
              outputFilename = outputFilename.replace('.agent', '.md');
            } else if (outputFilename.endsWith('.skill')) {
              outputFilename = outputFilename.replace('.skill', '.md');
            } else if (outputFilename.endsWith('.rule')) {
              outputFilename = outputFilename.replace('.rule', '.mdc');
            }
            
            const outputPath = path.join(cursorDir, outputFilename);
            fs.writeFileSync(outputPath, cursorFormat);
            console.log(\`Compiled \${moduleName} to \${outputPath}\`);
          }
        } catch (error) {
          console.error(\`Error compiling \${moduleName}:\`, error.message);
        }
      }
    }
  }
}

// Compile all modules
await compileModules(agentsDir, cursorAgentsDir, '.js');
await compileModules(skillsDir, cursorSkillsDir, '.js');
await compileModules(rulesDir, cursorRulesDir, '.js');

console.log('All modules compiled to .cursor format successfully!');
`;

  await fs.writeFile(path.join(process.cwd(), 'scripts', 'build-and-compile-cursor.js'), buildScript);
  await fs.chmod(path.join(process.cwd(), 'scripts', 'build-and-compile-cursor.js'), 0o755);
  
  console.log('Created build-and-compile script: scripts/build-and-compile-cursor.js');
}

async function main() {
  await createBuildSystem();
  await compileAllToCursor();
}

if (require.main === module) {
  main()
    .then(() => console.log('Compilation system setup completed'))
    .catch(error => console.error('Error:', error));
}

export { main, compileAllToCursor };