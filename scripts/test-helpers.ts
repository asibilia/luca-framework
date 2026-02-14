#!/usr/bin/env bun

/**
 * test-helpers.ts -- Shared test utilities for plugin spec-conformance
 * and drift detection test suites.
 *
 * Extracted from plugin-spec-e2e.test.ts and plugin-spec-hooks-format.test.ts
 * to eliminate duplication (Phase 25, TEST-01).
 */
import path from "path";
import { readdir, lstat } from "node:fs/promises";

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

// ---------------------------------------------------------------------------
// Async Bun file helpers — replacements for sync node:fs in tests
// ---------------------------------------------------------------------------

/**
 * Reads a file's text content using Bun.file().
 */
export async function readText(filePath: string): Promise<string> {
  return Bun.file(filePath).text();
}

/**
 * Checks if a file or directory exists using Bun.file().exists().
 */
export async function fileExists(filePath: string): Promise<boolean> {
  return Bun.file(filePath).exists();
}

/**
 * Checks if a path is a directory using lstat from fs/promises.
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await lstat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Lists entries in a directory using readdir from fs/promises.
 */
export async function listDir(dirPath: string): Promise<string[]> {
  return readdir(dirPath);
}

/**
 * Lists subdirectory names in a directory.
 */
export async function listSubdirs(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.filter((d) => d.isDirectory()).map((d) => d.name);
}

/**
 * Reads and parses a JSON file.
 */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
  const text = await Bun.file(filePath).text();
  return JSON.parse(text) as T;
}
