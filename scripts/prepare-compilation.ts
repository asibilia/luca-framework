#!/usr/bin/env bun

import fs from 'fs/promises';
import path from 'path';

// Function to compile TypeScript to JavaScript temporarily to import modules
async function compileAndRun() {
  // First, let's build the TypeScript files to JavaScript
  try {
    const result = Bun.spawnSync(['bun', 'run', 'build'], {
      cwd: process.cwd(),
      stdout: 'inherit',
      stderr: 'inherit',
    });
    if (result.exitCode !== 0) {
      console.log('Build failed or not defined, proceeding with direct compilation...');
    }
  } catch (error) {
    console.log('Build failed or not defined, proceeding with direct compilation...');
  }
  
  // Create .cursor directories if they don't exist
  await fs.mkdir(path.join(process.cwd(), '.cursor'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'agents'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'skills'), { recursive: true });
  await fs.mkdir(path.join(process.cwd(), '.cursor', 'rules'), { recursive: true });
  
  // For now, let's create a registry of all available agents, skills, and rules
  // This would normally be done by scanning compiled JS files or using a plugin system
  
  console.log('Dynamic compilation to .cursor format...');
  
  // Since we can't dynamically import TypeScript files directly,
  // let's create a build script that compiles all TypeScript to JS first
  const buildScript = `#!/usr/bin/env bun

// Build TypeScript files to JavaScript for dynamic import
const result = Bun.spawnSync(['bunx', 'tsc', '--outDir', 'dist', '--module', 'commonjs', '--target', 'es2020', '--esModuleInterop', '--skipLibCheck'], {
  cwd: process.cwd(),
  stdout: 'inherit',
  stderr: 'inherit',
});

if (result.exitCode !== 0) {
  console.error('TypeScript compilation failed with exit code:', result.exitCode);
  process.exit(1);
}

console.log('TypeScript compilation completed.');
`;

  await fs.writeFile(path.join(process.cwd(), 'scripts', 'build-for-compilation.ts'), buildScript);
  await fs.chmod(path.join(process.cwd(), 'scripts', 'build-for-compilation.ts'), 0o755);

  console.log('Created build script for compilation. Run it to compile TypeScript to JavaScript.');
  console.log('Then run the dynamic compilation script to generate .cursor files from TypeScript definitions.');
}

// Alternative approach: Generate a manifest file that lists all available modules
async function generateManifest() {
  const manifest = {
    agents: [] as string[],
    skills: [] as string[],
    rules: [] as string[]
  };
  
  // Scan src directory for agent files
  const agentsDir = path.join(process.cwd(), 'src', 'agents');
  const skillsDir = path.join(process.cwd(), 'src', 'skills');
  const rulesDir = path.join(process.cwd(), 'src', 'rules');
  
  async function scanDirectory(dir: string, prefix: string) {
    const files = await fs.readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    
    for (const file of files) {
      if (file.isDirectory()) {
        const subResults = await scanDirectory(path.join(dir, file.name), prefix);
        results.push(...subResults);
      } else if (file.name.endsWith('.ts') && !file.name.endsWith('.d.ts')) {
        results.push(path.join(prefix, file.name));
      }
    }
    
    return results;
  }
  
  manifest.agents = await scanDirectory(agentsDir, 'src/agents');
  manifest.skills = await scanDirectory(skillsDir, 'src/skills');
  manifest.rules = await scanDirectory(rulesDir, 'src/rules');
  
  await fs.writeFile(
    path.join(process.cwd(), '.cursor', 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  console.log('Generated manifest file with all available modules');
}

async function main() {
  await generateManifest();
  await compileAndRun();
}

if (require.main === module) {
  main()
    .then(() => console.log('Compilation preparation completed'))
    .catch(error => console.error('Error:', error));
}

export { main };