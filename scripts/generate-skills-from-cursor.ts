#!/usr/bin/env bun

import { mkdir, readdir, stat, access } from 'fs/promises';
import path from 'path';

interface SkillData {
  name: string;
  description: string;
  disableModelInvocation?: boolean;
  content: string;
}

async function parseSkillMarkdown(filePath: string): Promise<SkillData> {
  const content = await Bun.file(filePath).text();
  
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    throw new Error(`No frontmatter found in ${filePath}`);
  }
  
  const frontmatter = frontmatterMatch[1];
  const frontmatterLines = frontmatter.split('\n');
  
  const parsedFrontmatter: Record<string, any> = {};
  for (const line of frontmatterLines) {
    if (line.trim()) {
      const colonIndex = line.indexOf(':');
      if (colonIndex !== -1) {
        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();
        
        // Handle arrays
        if (value.startsWith('[') && value.endsWith(']')) {
          value = value.slice(1, -1).split(',').map(v => v.trim().replace(/"/g, '').replace(/'/g, ''));
        } else if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value === 'true') {
          value = true;
        } else if (value === 'false') {
          value = false;
        } else if (!isNaN(Number(value))) {
          value = Number(value);
        }
        
        parsedFrontmatter[key] = value;
      }
    }
  }
  
  // Extract content after frontmatter
  const contentWithoutFrontmatter = content.substring(frontmatterMatch[0].length).trim();
  
  return {
    name: parsedFrontmatter.name,
    description: parsedFrontmatter.description,
    disableModelInvocation: parsedFrontmatter['disable-model-invocation'],
    content: contentWithoutFrontmatter
  };
}

function generateSkillTsContent(skillData: SkillData): string {
  // Split content into sections based on headers or markers
  const sections: Array<{title: string, content: string}> = [];
  
  // Simple approach: treat the whole content as one section for now
  // In a more sophisticated implementation, we'd parse for <section> tags or headers
  sections.push({
    title: 'main',
    content: skillData.content
  });
  
  const className = `${skillData.name.charAt(0).toUpperCase() + skillData.name.slice(1).replace(/-/g, '')}Skill`;
  const configName = `${skillData.name.replace(/-/g, '')}Config`;

  return `/**
 * ${skillData.name} Skill - ${skillData.description}
 */
import { BaseSkillImpl } from '../base/base-skill';
import { SkillConfig } from '../types/skill.types';

// Define the ${skillData.name} skill configuration
const ${configName}: SkillConfig = {
  frontmatter: {
    name: '${skillData.name}',
    description: \`${skillData.description}\`,
    ${skillData.disableModelInvocation !== undefined ? `'disable-model-invocation': ${skillData.disableModelInvocation},` : ''}
  },
  sections: [
    ${sections.map((section, index) => `{
      title: '${section.title}',
      content: \`${section.content.replace(/`/g, '\\`')}\`,
      order: ${index + 1}
    }`).join(',\n    ')}
  ]
};

export class ${className} extends BaseSkillImpl {
  constructor() {
    super(${configName});
  }
}
`;
}

async function generateSkillsFromCursor() {
  const cursorSkillsDir = path.join(process.cwd(), '.cursor', 'skills');
  const srcSkillsDir = path.join(process.cwd(), 'src', 'skills', 'general');
  
  // Create the general skills directory if it doesn't exist
  await mkdir(srcSkillsDir, { recursive: true });

  // Read all skill directories from .cursor/skills
  const skillDirs = await readdir(cursorSkillsDir);
  
  // Filter only directories (each skill has its own directory with SKILL.md)
  const validSkillDirs = [];
  for (const dir of skillDirs) {
    const dirPath = path.join(cursorSkillsDir, dir);
    const dirStat = await stat(dirPath);
    if (dirStat.isDirectory()) {
      validSkillDirs.push(dir);
    }
  }
  
  console.log(`Found ${validSkillDirs.length} skill directories in .cursor/skills`);
  
  for (const dir of validSkillDirs) {
    try {
      const skillMdPath = path.join(cursorSkillsDir, dir, 'SKILL.md');
      
      // Check if SKILL.md exists in the directory
      try {
        await access(skillMdPath);
      } catch {
        console.log(`SKILL.md not found in ${dir}, skipping...`);
        continue;
      }
      
      console.log(`Processing ${skillMdPath}...`);
      
      const skillData = await parseSkillMarkdown(skillMdPath);
      const tsFileName = dir + '.skill.ts';
      const tsFilePath = path.join(srcSkillsDir, tsFileName);
      
      const tsContent = generateSkillTsContent(skillData);
      await Bun.write(tsFilePath, tsContent);
      
      console.log(`Generated ${tsFilePath}`);
    } catch (error) {
      console.error(`Error processing skill ${dir}:`, error);
    }
  }
}

if (import.meta.main) {
  generateSkillsFromCursor()
    .then(() => console.log('Skill generation completed'))
    .catch(error => console.error('Error:', error));
}

export { generateSkillsFromCursor };