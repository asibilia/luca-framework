/**
 * Todo file parser for the Luca usage-aware sprint planning system.
 *
 * Reads todo markdown files from the pending directory, extracts
 * YAML frontmatter metadata (title, area, created, source), and
 * validates each against the todoMetadataSchema.
 *
 * Functions:
 * - parseYamlFrontmatter: Extract key-value pairs from YAML frontmatter
 * - extractBody: Return body content after closing --- delimiter
 * - parseSingleTodo: Parse one todo file into validated TodoMetadata
 * - parseTodos: Read and parse all pending todo files from a directory
 *
 * @module planner/todo-parser
 */

import type { TodoMetadata } from "./types";
import { todoMetadataSchema } from "./types";

/**
 * Parse YAML frontmatter from markdown content.
 *
 * Expects frontmatter delimited by --- on its own line at the start
 * and a closing --- line. Parses single-line `key: value` pairs only.
 * Values containing colons (e.g., URLs) are supported because the
 * split only happens on the first colon.
 *
 * Returns an empty object if no valid frontmatter is found (missing
 * opening/closing delimiters).
 *
 * @param content - Raw markdown file content
 * @returns Record of key-value pairs from frontmatter
 *
 * @example
 * ```typescript
 * const fm = parseYamlFrontmatter(`---
 * title: My Todo
 * area: workflow
 * created: 2026-01-15
 * source: conversation
 * ---
 *
 * Body content here.
 * `);
 * // fm === { title: "My Todo", area: "workflow", created: "2026-01-15", source: "conversation" }
 * ```
 */
export function parseYamlFrontmatter(content: string): Record<string, string> {
  const lines = content.split("\n");

  // Must start with ---
  if (lines[0]?.trim() !== "---") {
    return {};
  }

  // Find closing ---
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return {};
  }

  const result: Record<string, string> = {};

  for (let i = 1; i < closingIndex; i++) {
    const line = lines[i]!;
    const colonIndex = line.indexOf(":");

    if (colonIndex === -1) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (key.length > 0) {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract body content after the closing frontmatter delimiter.
 *
 * Returns the full content trimmed if no frontmatter is present.
 * Returns an empty string if the file contains only frontmatter
 * with no body content after it.
 *
 * @param content - Raw markdown file content
 * @returns Body content after frontmatter, trimmed
 *
 * @example
 * ```typescript
 * const body = extractBody(`---
 * title: Test
 * ---
 *
 * This is the body.
 * `);
 * // body === "This is the body."
 * ```
 */
export function extractBody(content: string): string {
  const lines = content.split("\n");

  // Must start with ---
  if (lines[0]?.trim() !== "---") {
    return content.trim();
  }

  // Find closing ---
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    return content.trim();
  }

  const bodyLines = lines.slice(closingIndex + 1);
  return bodyLines.join("\n").trim();
}

/**
 * Parse a single todo markdown file into validated TodoMetadata.
 *
 * Extracts YAML frontmatter (title, area, created, source) and body
 * content, combines with the file path, and validates against
 * todoMetadataSchema using safeParse. Returns null if validation fails
 * (e.g., missing required fields).
 *
 * @param filePath - Path to the todo markdown file
 * @param content - Raw file content
 * @returns Validated TodoMetadata or null if validation fails
 *
 * @example
 * ```typescript
 * const todo = parseSingleTodo(
 *   ".planning/todos/pending/my-todo.md",
 *   `---
 * title: My Todo
 * area: workflow
 * created: 2026-01-15
 * source: conversation
 * ---
 *
 * Body content.
 * `,
 * );
 * // todo.title === "My Todo"
 * // todo.file_path === ".planning/todos/pending/my-todo.md"
 * ```
 */
export function parseSingleTodo(
  filePath: string,
  content: string,
): TodoMetadata | null {
  const frontmatter = parseYamlFrontmatter(content);
  const body = extractBody(content);

  const raw = {
    title: frontmatter["title"],
    area: frontmatter["area"],
    created: frontmatter["created"],
    source: frontmatter["source"],
    file_path: filePath,
    body: body || undefined,
  };

  const result = todoMetadataSchema.safeParse(raw);

  if (!result.success) {
    return null;
  }

  return result.data;
}

/**
 * Read and parse all pending todo markdown files from a directory.
 *
 * Reads the specified directory (defaulting to ".planning/todos/pending"),
 * filters for *.md files, reads each with Bun.file(), and parses them.
 * Invalid files are silently skipped. Returns an empty array if the
 * directory does not exist or contains no valid todo files.
 *
 * @param pendingDir - Path to the pending todos directory
 * @returns Array of validated TodoMetadata objects
 *
 * @example
 * ```typescript
 * const todos = await parseTodos();
 * console.log(todos.length); // number of valid pending todos
 * ```
 */
export async function parseTodos(
  pendingDir: string = ".planning/todos/pending",
): Promise<TodoMetadata[]> {
  const { readdir } = await import("node:fs/promises");

  let entries: string[];
  try {
    entries = await readdir(pendingDir);
  } catch {
    return [];
  }

  const mdFiles = entries.filter((entry) => entry.endsWith(".md"));
  const todos: TodoMetadata[] = [];

  for (const fileName of mdFiles) {
    const filePath = `${pendingDir}/${fileName}`;
    try {
      const content = await Bun.file(filePath).text();
      const parsed = parseSingleTodo(filePath, content);
      if (parsed !== null) {
        todos.push(parsed);
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  return todos;
}

/* ------------------------------------------------------------------ */
/*  CLI entry point                                                    */
/* ------------------------------------------------------------------ */

if (import.meta.main) {
  const getArg = (name: string): string | undefined => {
    const prefix = `--${name}=`;
    const arg = Bun.argv.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  };

  const dir = getArg("dir") ?? ".planning/todos/pending";
  const todos = await parseTodos(dir);
  console.log(JSON.stringify(todos, null, 2));
}
