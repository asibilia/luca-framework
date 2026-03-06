/**
 * Shared formatting functions for factory functions
 */
import { z } from "zod";
import { formatFrontmatter } from "./utils";

/** Canonical Zod schema for a section within any entity (agent, skill, rule) */
export const SectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  order: z.number().optional(),
});

/** Canonical Section type for all entity sections */
export type Section = z.infer<typeof SectionSchema>;

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
        const openTag = `<${tagName}>`;
        // Skip wrapping if content already starts with the same tag
        if (section.content.trimStart().startsWith(openTag)) {
          return `\n${section.content}\n`;
        }
        return `\n${openTag}\n${section.content}\n</${tagName}>\n`;
      }
      return section.content;
    })
    .join("");

  return `${fm}\n\n${body.trim()}`;
}

/**
 * Converts a config to Pi-compatible format (YAML frontmatter + H2 sections).
 *
 * Pi uses plain markdown with YAML frontmatter (no XML tags). The body
 * uses H2 headings for sections, same as Claude format.
 */
export function toPiFormat(
  frontmatter: Record<string, unknown>,
  heading: string,
  sections: Section[],
): string {
  const fm = formatFrontmatter(frontmatter);
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

  return `${fm}\n\n${heading}\n\n${body}`;
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
