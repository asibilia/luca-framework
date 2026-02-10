#!/usr/bin/env bun

import fs from 'fs/promises';
import path from 'path';

interface RuleData {
  description: string;
  globs?: string[];
  alwaysApply?: boolean;
  content: string;
}

async function parseRuleMarkdown(filePath: string): Promise<RuleData> {
  const content = await fs.readFile(filePath, 'utf-8');
  
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let parsedFrontmatter: Record<string, any> = {};
  let contentWithoutFrontmatter = content;
  
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const frontmatterLines = frontmatter.split('\n');
    
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
    contentWithoutFrontmatter = content.substring(frontmatterMatch[0].length).trim();
  } else {
    // If no frontmatter, try to extract description from the first line or heading
    const lines = content.split('\n');
    let description = '';
    
    // Look for a markdown heading that might serve as description
    for (const line of lines) {
      if (line.startsWith('# ')) {
        description = line.substring(2).trim(); // Remove '# ' prefix
        break;
      }
    }
    
    if (!description) {
      // Use first 100 characters as description
      description = content.substring(0, 100).replace(/\n/g, ' ').trim();
    }
    
    parsedFrontmatter = { description };
  }
  
  return {
    description: parsedFrontmatter.description || 'Generic rule description',
    globs: parsedFrontmatter.globs ? (Array.isArray(parsedFrontmatter.globs) ? parsedFrontmatter.globs : parsedFrontmatter.globs.split(', ')) : undefined,
    alwaysApply: parsedFrontmatter.alwaysApply,
    content: contentWithoutFrontmatter
  };
}

function generateRuleTsContent(ruleData: RuleData): string {
  // Split content into sections based on headers or markers
  const sections: Array<{title: string, content: string}> = [];
  
  // Simple approach: treat the whole content as one section for now
  // In a more sophisticated implementation, we'd parse for <section> tags or headers
  sections.push({
    title: 'rule',
    content: ruleData.content
  });
  
  const ruleName = ruleData.description.substring(0, 20).replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  const className = `${ruleName.charAt(0).toUpperCase() + ruleName.slice(1).replace(/-/g, '')}Rule`;
  const configName = `${ruleName.replace(/-/g, '')}Config`;

  return `/**
 * ${ruleData.description}
 */
import { BaseRuleImpl } from '../base/base-rule';
import type { RuleConfig } from '../types/rule.types';

// Define the ${ruleName} rule configuration
const ${configName}: RuleConfig = {
  frontmatter: {
    description: \`${ruleData.description}\`,
    ${ruleData.globs ? `globs: [${ruleData.globs.map(g => `'${g}'`).join(', ')}],` : ''}
    ${ruleData.alwaysApply !== undefined ? `alwaysApply: ${ruleData.alwaysApply},` : ''}
  },
  sections: [
    ${sections.map((section, index) => `{
      title: '${section.title}',
      content: \`${section.content.replace(/`/g, '\\`')}\`,
      order: ${index + 1}
    }`).join(',\n    ')}
  ]
};

export class ${className} extends BaseRuleImpl {
  constructor() {
    super(${configName});
  }
}
`;
}

async function generateRulesFromCursor() {
  const cursorRulesDir = path.join(process.cwd(), '.cursor', 'rules');
  const srcRulesDir = path.join(process.cwd(), 'src', 'rules', 'general');
  
  // Create the general rules directory if it doesn't exist
  await fs.mkdir(srcRulesDir, { recursive: true });
  
  // Read all .mdc files from .cursor/rules
  const ruleFiles = await fs.readdir(cursorRulesDir);
  const mdcFiles = ruleFiles.filter(file => file.endsWith('.mdc'));
  
  console.log(`Found ${mdcFiles.length} rule files in .cursor/rules`);
  
  for (const file of mdcFiles) {
    try {
      const filePath = path.join(cursorRulesDir, file);
      console.log(`Processing ${filePath}...`);
      
      const ruleData = await parseRuleMarkdown(filePath);
      const tsFileName = file.replace('.mdc', '.rule.ts');
      const tsFilePath = path.join(srcRulesDir, tsFileName);
      
      const tsContent = generateRuleTsContent(ruleData);
      await fs.writeFile(tsFilePath, tsContent);
      
      console.log(`Generated ${tsFilePath}`);
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }
  
  // Also process any rules in subdirectories (like taskmaster/)
  const allItems = await fs.readdir(cursorRulesDir, { withFileTypes: true });
  const subdirs = allItems.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);

  for (const subdir of subdirs) {
    const subDirPath = path.join(cursorRulesDir, subdir);
    const subFiles = await fs.readdir(subDirPath);
    const subMdcFiles = subFiles.filter(file => file.endsWith('.mdc'));
    
    for (const file of subMdcFiles) {
      try {
        const filePath = path.join(subDirPath, file);
        console.log(`Processing ${filePath}...`);
        
        const ruleData = await parseRuleMarkdown(filePath);
        const tsFileName = `${subdir}-${file.replace('.mdc', '.rule.ts')}`;
        const tsFilePath = path.join(srcRulesDir, tsFileName);
        
        const tsContent = generateRuleTsContent(ruleData);
        await fs.writeFile(tsFilePath, tsContent);
        
        console.log(`Generated ${tsFilePath}`);
      } catch (error) {
        console.error(`Error processing ${subdir}/${file}:`, error);
      }
    }
  }
}

if (require.main === module) {
  generateRulesFromCursor()
    .then(() => console.log('Rule generation completed'))
    .catch(error => console.error('Error:', error));
}

export { generateRulesFromCursor };