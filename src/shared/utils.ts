/**
 * Shared utilities for Luca Framework
 */
export function formatFrontmatter(frontmatter: Record<string, unknown>): string {
  const yamlLines: string[] = ['---'];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      value.forEach(item => yamlLines.push(`  - ${item}`));
    } else if (typeof value === 'object' && value !== null) {
      yamlLines.push(`${key}:`);
      for (const [subKey, subValue] of Object.entries(value as Record<string, unknown>)) {
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