/**
 * Deterministic backlog scanner.
 *
 * Reads pending todo files from `.planning/todos/pending/`, parses
 * YAML frontmatter, and outputs structured JSON. Zero LLM involvement.
 *
 * CLI usage:
 *   bun src/backlog/__helpers/scan-pending.ts --todos=".planning/todos/pending/"
 *
 * Output: JSON array of PendingTodo objects to stdout.
 *
 * @module backlog/scan-pending
 */
import { Glob } from "bun";
import { parseArgs } from "util";

import { pendingTodoSchema } from "../__schemas/backlog.schemas";

import type { PendingTodo } from "../__schemas/backlog.schemas";

/**
 * Parse simple YAML frontmatter from a markdown file.
 *
 * Extracts key-value pairs between `---` delimiters.
 * Does not handle nested YAML — only flat key: value pairs.
 */
const parseFrontmatter = (
  content: string,
): Record<string, string | undefined> => {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string | undefined> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
};

/**
 * Compute age in days from a date string.
 */
const computeAgeDays = (dateStr: string | undefined): number => {
  if (!dateStr) return 0;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Scan a directory of pending todo markdown files and return structured data.
 *
 * @param todosDir - Path to the pending todos directory
 * @returns Array of parsed PendingTodo objects
 */
export const scanPending = async (todosDir: string): Promise<PendingTodo[]> => {
  const glob = new Glob("*.md");
  const results: PendingTodo[] = [];

  for await (const filename of glob.scan(todosDir)) {
    const filePath = `${todosDir}/${filename}`;
    const content = await Bun.file(filePath).text();
    const fm = parseFrontmatter(content);

    const parsed = pendingTodoSchema.safeParse({
      file: filename,
      title: fm.title ?? filename.replace(/\.md$/, ""),
      area: fm.area,
      priority: fm.priority,
      severity: fm.severity,
      created: fm.created,
      age_days: computeAgeDays(fm.created),
    });

    if (parsed.success) {
      results.push(parsed.data);
    }
  }

  return results;
};

// ─── CLI Entry Point ─────────────────────────────────────────────────────
if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      todos: { type: "string", default: ".planning/todos/pending/" },
    },
    strict: false,
  });

  const todosDir = String(values.todos ?? ".planning/todos/pending/");
  const result = await scanPending(todosDir);
  console.log(JSON.stringify(result));
}
