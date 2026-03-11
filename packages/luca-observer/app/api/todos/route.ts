import { Glob } from "bun";
import { NextResponse } from "next/server";
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
 * API Response: Single todo item shape.
 *
 * Uses snake_case for all properties per API conventions.
 * Schema-first defaults replace manual || fallbacks in readTodosFromDir.
 */
const TodoResponseSchema = z.object({
  filename: z.string(),
  title: z.string().default("Untitled"),
  area: z.string().default("unknown"),
  created: z.string().default(""),
  source: z.string().default("manual"),
  tier: z.coerce.number().int().default(0),
  complexity: z.string().default("UNKNOWN"),
  priority: z.string().default("P3"),
  milestone: z.string().default(""),
  state: z.enum(["pending", "done", "completed"]),
});

type TodoResponse = z.infer<typeof TodoResponseSchema>;

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
    const todosDir = join(current, ".planning", "todos");
    // Check if the directory exists by attempting to scan it
    const glob = new Glob("*");
    let dirExists = false;
    try {
      // scanSync throws if the directory does not exist
      for (const _ of glob.scanSync({ cwd: todosDir })) {
        dirExists = true;
        break;
      }
      // Even an empty directory means the path is valid
      // If scanSync didn't throw, the directory exists
      dirExists = true;
    } catch {
      /* not found at this level, keep walking up */
    }
    if (dirExists) return current;
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
    const glob = new Glob("*.md");
    const todos: TodoResponse[] = [];
    for await (const file of glob.scan({ cwd: dirPath })) {
      try {
        const content = await Bun.file(join(dirPath, file)).text();
        const fm = parseFrontmatter(content);
        todos.push(
          TodoResponseSchema.parse({
            filename: file,
            title: fm.title || file.replace(/\.md$/, ""),
            area: fm.area || undefined,
            created: fm.created || undefined,
            source: fm.source || undefined,
            tier: fm.tier || undefined,
            complexity: fm.complexity || undefined,
            priority: fm.priority || undefined,
            milestone: fm.milestone || undefined,
            state,
          }),
        );
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
  const rawRoot = process.env.LUCA_PROJECT_DIR || process.env.WORKSPACE_ROOT;
  const explicitRoot = rawRoot ? resolve(rawRoot) : null;
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
