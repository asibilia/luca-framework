#!/usr/bin/env bun

/**
 * test-helpers.ts -- Shared test utilities for plugin spec-conformance
 * and drift detection test suites.
 *
 * Extracted from plugin-spec-e2e.test.ts and plugin-spec-hooks-format.test.ts
 * to eliminate duplication (Phase 25, TEST-01).
 */
import path from "path";

/**
 * Complete set of valid Claude Code hook event types.
 *
 * Used by plugin spec tests to validate that hooks.json only contains
 * recognized event types.
 *
 * @see https://docs.anthropic.com/en/docs/claude-code/hooks
 */
export const VALID_CLAUDE_CODE_EVENTS: ReadonlySet<string> = new Set([
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SubagentTool",
  "SessionStart",
  "SessionEnd",
]);

/**
 * Root path for the dist/plugin/ output directory.
 *
 * Resolved relative to this file's location in scripts/.
 */
export const PLUGIN_ROOT = path.resolve(
  import.meta.dir,
  "..",
  "dist",
  "plugin",
);

/**
 * Extracts simple YAML frontmatter key-value pairs from markdown content.
 *
 * Handles the `---` delimited frontmatter block at the start of a file.
 * Only parses single-line `key: value` pairs (sufficient for SKILL.md
 * description fields).
 *
 * @param content - Raw markdown file content
 * @returns Parsed key-value pairs, or null if no frontmatter found
 *
 * @example
 * ```typescript
 * const fm = extractFrontmatter("---\ndescription: My skill\n---\n# Content");
 * // fm = { description: "My skill" }
 * ```
 */
export function extractFrontmatter(
  content: string,
): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      fields[key] = value;
    }
  }
  return fields;
}
