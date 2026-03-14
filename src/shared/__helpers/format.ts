/**
 * Shared formatting functions for Claude Code output.
 */
import orderBy from "lodash/orderBy";
import { z } from "zod";

/** Canonical Zod schema for a section within any entity (agent, skill, rule) */
export const SectionSchema = z.object({
  title: z.string(),
  content: z.string(),
  order: z.number().optional(),
});

/** Canonical Section type for all entity sections */
export type Section = z.infer<typeof SectionSchema>;

/**
 * Converts a config to Claude-compatible format (H1 heading + H2 sections)
 */
export function toClaudeFormat(heading: string, sections: Section[]): string {
  const body = orderBy(sections, [(s) => s.order ?? 0], ["asc"])
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
