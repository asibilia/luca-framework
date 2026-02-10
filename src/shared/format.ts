/**
 * Shared formatting functions for base classes
 */
import { formatFrontmatter } from './utils';

interface Section {
  title: string;
  content: string;
  order?: number;
}

/**
 * Converts a config to Cursor-compatible format (Markdown with YAML frontmatter + XML-tagged sections)
 */
export function toCursorFormat(frontmatter: Record<string, unknown>, sections: Section[]): string {
  const fm = formatFrontmatter(frontmatter);
  const body = sections
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(section => {
      if (section.title) {
        return `\n<${section.title.toLowerCase()}>\n${section.content}\n</${section.title.toLowerCase()}>\n`;
      }
      return section.content;
    })
    .join('');

  return `${fm}\n\n${body.trim()}`;
}

/**
 * Converts a config to Claude-compatible format (H1 heading + H2 sections)
 */
export function toClaudeFormat(heading: string, sections: Section[]): string {
  const body = sections
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(section => {
      if (section.title) {
        return `## ${section.title}\n\n${section.content}\n\n`;
      }
      return `${section.content}\n\n`;
    })
    .join('')
    .trim();

  return `${heading}\n\n${body}`;
}
