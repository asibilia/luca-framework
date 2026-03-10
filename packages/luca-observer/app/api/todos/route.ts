import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { z } from "zod";

import { parseQueryParams } from "~/lib/muninn-route-helper";

/**
 * GET /api/todos -- query parameters.
 *
 * Uses z.coerce for URLSearchParams string coercion.
 * Uses snake_case for API-facing fields per project convention.
 */
const TodosQuerySchema = z.object({
  status: z.enum(["pending", "done", "completed", "all"]).default("all"),
  milestone: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/**
 * Shape of a single todo item in the API response.
 *
 * Uses snake_case for all properties per API conventions.
 */
interface TodoResponse {
  filename: string;
  title: string;
  area: string;
  created: string;
  source: string;
  tier: number;
  complexity: string;
  priority: string;
  milestone: string;
  state: "pending" | "done" | "completed";
}

/**
 * Parse YAML-like frontmatter from a markdown file.
 *
 * Extracts key-value pairs from the `---` delimited header block.
 * Handles quoted values by stripping leading/trailing quotes.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match?.[1]) return {};
  const pairs: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIndex = line.indexOf(":");
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line
        .slice(colonIndex + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      pairs[key] = value;
    }
  }
  return pairs;
}

/**
 * Find the project root by walking up from a starting directory
 * looking for a `.planning/todos` directory.
 */
async function findProjectRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  const root = resolve("/");
  while (current !== root) {
    try {
      const todosDir = join(current, ".planning", "todos");
      const s = await stat(todosDir);
      if (s.isDirectory()) return current;
    } catch {
      /* not found at this level, keep walking up */
    }
    current = resolve(current, "..");
  }
  return null;
}

/**
 * Read all markdown todo files from a directory and parse their frontmatter.
 *
 * Each file is expected to have YAML frontmatter with fields like title, area,
 * priority, complexity, milestone, etc.
 *
 * @param dirPath - Absolute path to the todos subdirectory
 * @param state - The todo state to assign (pending, done, or completed)
 * @returns Array of parsed todo items
 */
async function readTodosFromDir(
  dirPath: string,
  state: "pending" | "done" | "completed",
): Promise<TodoResponse[]> {
  try {
    const files = await readdir(dirPath);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    const todos: TodoResponse[] = [];
    for (const file of mdFiles) {
      try {
        const content = await Bun.file(join(dirPath, file)).text();
        const fm = parseFrontmatter(content);
        todos.push({
          filename: file,
          title: fm.title || file.replace(/\.md$/, ""),
          area: fm.area || "unknown",
          created: fm.created || "",
          source: fm.source || "manual",
          tier: parseInt(fm.tier || "0", 10),
          complexity: fm.complexity || "UNKNOWN",
          priority: fm.priority || "P3",
          milestone: fm.milestone || "",
          state,
        });
      } catch {
        /* Skip unreadable files */
      }
    }
    return todos;
  } catch {
    return [];
  }
}

/**
 * GET /api/todos
 *
 * Reads todo files from `.planning/todos/{pending,done,completed}/` directories.
 * Parses YAML frontmatter for metadata including title, area, priority,
 * complexity, and milestone.
 *
 * Supports query params:
 * - status: Filter by state ("pending", "done", "completed", "all"). Default: "all"
 * - milestone: Filter by milestone string (exact match)
 * - limit: Max items to return (1-500). Default: 200
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, TodosQuerySchema);
  if (!result.success) return result.response;

  const { status, milestone, limit } = result.data;

  // Priority: LUCA_PROJECT_DIR > WORKSPACE_ROOT > auto-detect from cwd
  const explicitRoot =
    process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
  const workspaceRoot =
    explicitRoot || (await findProjectRoot(process.cwd())) || process.cwd();
  const todosBase = join(workspaceRoot, ".planning", "todos");

  // Read all directories in parallel
  const [pending, done, completed] = await Promise.all([
    readTodosFromDir(join(todosBase, "pending"), "pending"),
    readTodosFromDir(join(todosBase, "done"), "done"),
    readTodosFromDir(join(todosBase, "completed"), "completed"),
  ]);

  // Merge and filter
  let allTodos = [...pending, ...done, ...completed];

  if (status !== "all") {
    allTodos = allTodos.filter((t) => t.state === status);
  }

  if (milestone) {
    allTodos = allTodos.filter((t) => t.milestone === milestone);
  }

  // Apply limit
  allTodos = allTodos.slice(0, limit);

  return NextResponse.json(allTodos);
}
