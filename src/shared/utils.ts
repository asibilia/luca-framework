/**
 * Shared utilities for Luca Framework
 */
import yaml from 'js-yaml'

export function formatFrontmatter(frontmatter: Record<string, unknown>): string {
  if (Object.keys(frontmatter).length === 0) {
    return '---\n---'
  }
  const yamlContent = yaml.dump(frontmatter, {
    indent: 2,
    lineWidth: -1,
    quotingType: '"',
    forceQuotes: false,
    sortKeys: false,
  })
  return `---\n${yamlContent.trimEnd()}\n---`
}