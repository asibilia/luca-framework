/**
 * Shared utilities for Luca Framework
 */
import { AgentFrontmatter, SkillFrontmatter, RuleFrontmatter } from '../types/agent.types';

export function formatFrontmatter(frontmatter: Record<string, any>): string {
  const yamlLines: string[] = ['---'];
  
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      value.forEach(item => yamlLines.push(`  - ${item}`));
    } else if (typeof value === 'object' && value !== null) {
      yamlLines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value)) {
        yamlLines.push(`  ${subKey}: ${subValue}`);
      }
    } else if (typeof value === 'boolean') {
      yamlLines.push(`${key}: ${value}`);
    } else {
      yamlLines.push(`${key}: "${value}"`);
    }
  }
  
  yamlLines.push('---');
  return yamlLines.join('\n');
}

export function escapeMarkdown(content: string): string {
  // Escape special markdown characters if needed
  return content;
}

export function generateFileName(name: string, extension: string): string {
  return `${name}.${extension}`;
}