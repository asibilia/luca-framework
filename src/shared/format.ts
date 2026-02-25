/**
 * Shared formatting functions for factory functions
 */
import { formatFrontmatter } from "./utils";

interface Section {
  title: string;
  content: string;
  order?: number;
}

/**
 * Sanitize a string for use as an XML tag name.
 * Allows only [a-z0-9_-], replaces other characters with hyphens,
 * collapses consecutive hyphens, and ensures the result starts with a letter.
 */
function sanitizeTagName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!sanitized || /^[0-9]/.test(sanitized)) {
    return `section-${sanitized || "unknown"}`;
  }
  return sanitized;
}

/**
 * Converts a config to Cursor-compatible format (Markdown with YAML frontmatter + XML-tagged sections)
 */
export function toCursorFormat(
  frontmatter: Record<string, unknown>,
  sections: Section[],
): string {
  const fm = formatFrontmatter(frontmatter);
  const body = [...sections]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((section) => {
      if (section.title) {
        const tagName = sanitizeTagName(section.title);
        return `\n<${tagName}>\n${section.content}\n</${tagName}>\n`;
      }
      return section.content;
    })
    .join("");

  return `${fm}\n\n${body.trim()}`;
}

/**
 * Converts a config to Claude-compatible format (H1 heading + H2 sections)
 */
export function toClaudeFormat(heading: string, sections: Section[]): string {
  const body = [...sections]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((section) => {
      if (section.title) {
        return `## ${section.title}\n\n${section.content}\n\n`;
      }
      return `${section.content}\n\n`;
    })
    .join("")
    .trim();

  return `${heading}\n\n${body}`;
}
