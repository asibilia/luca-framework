/**
 * Shared helper for converting entity sections to markdown.
 *
 * Extracted from duplicated implementations in cursor-adapter.ts,
 * windsurf-adapter.ts, and vscode-adapter.ts. All three adapters used
 * identical logic: sort by order, map to ## headings, join with \n\n.
 *
 * NOTE: This is intentionally separate from `toClaudeFormat()` in
 * `~/shared/__helpers/format`. That function uses different join semantics
 * (trailing `\n\n` per section vs `\n\n` separator between sections).
 *
 * @module
 */
import orderBy from "lodash/orderBy";

import type { Section } from "~/shared/__helpers/format";

/**
 * Convert an array of sections to a markdown body string.
 *
 * Sections are sorted by their `order` field in ascending order
 * (nulls/undefined treated as 0), then rendered as `## {title}\n\n{content}`
 * blocks. Sections without a title emit their content without a heading.
 * Blocks are joined with a `\n\n` separator and the result is trimmed.
 *
 * @param sections - Array of Section objects to convert. May be readonly.
 * @returns Trimmed markdown string with all sections concatenated
 *
 * @example
 * ```typescript
 * import { sectionsToMarkdown } from "~/adapters/__helpers/format-sections";
 *
 * const body = sectionsToMarkdown([
 *   { title: "Overview", content: "Project overview.", order: 0 },
 *   { title: "Usage", content: "How to use.", order: 1 },
 * ]);
 * // => "## Overview\n\nProject overview.\n\n## Usage\n\nHow to use."
 * ```
 */
export function sectionsToMarkdown(sections: ReadonlyArray<Section>): string {
  return orderBy(sections, [(s) => s.order ?? 0], ["asc"])
    .map((section) => {
      if (section.title) {
        return `## ${section.title}\n\n${section.content}`;
      }
      return section.content;
    })
    .join("\n\n")
    .trim();
}
