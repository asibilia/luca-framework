/**
 * Persistent TODO backlog stored as markdown files in .planning/todos/.
 *
 * Directory structure:
 *   .planning/todos/pending/   — open items awaiting work
 *   .planning/todos/backlog/   — deferred / future items
 *   .planning/todos/done/      — completed items
 *
 * Each file is a markdown document with optional YAML frontmatter
 * (title, area, created, priority, source). The file basename (minus .md)
 * serves as the todo's slug/ID.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { join, basename } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status directories that map to todo states */
export type TodoStatus = "pending" | "backlog" | "done";

export interface Todo {
  /** Numeric index (assigned at list time for user-friendly referencing) */
  index: number;
  /** File slug (basename without .md) */
  slug: string;
  /** Status derived from parent directory */
  status: TodoStatus;
  /** Title from frontmatter, or derived from filename */
  title: string;
  /** Optional area tag from frontmatter */
  area?: string;
  /** Optional priority from frontmatter */
  priority?: string;
  /** ISO date string from frontmatter */
  created?: string;
  /** Source tag from frontmatter */
  source?: string;
  /** Full file path */
  path: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_DIRS: TodoStatus[] = ["pending", "backlog", "done"];

function todosRoot(): string {
  return join(process.cwd(), ".planning", "todos");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns the frontmatter key-value pairs (if any) and the body content.
 */
function parseFrontmatter(content: string): {
  meta: Record<string, string>;
  body: string;
} {
  const meta: Record<string, string> = {};
  if (!content.startsWith("---")) {
    return { meta, body: content };
  }

  const endIdx = content.indexOf("\n---", 3);
  if (endIdx === -1) {
    return { meta, body: content };
  }

  const frontmatter = content.slice(4, endIdx);
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) meta[key] = value;
  }

  const body = content.slice(endIdx + 4).trimStart();
  return { meta, body };
}

/**
 * Derive a human-readable title from a slug.
 * E.g. "joes-book-convex-schema" → "Joes Book Convex Schema"
 */
function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read all todos from the directory structure.
 * Assigns a stable numeric index (1-based) for user-friendly referencing.
 * Order: pending first, then backlog, then done.
 */
export function listTodos({
  status,
}: { status?: TodoStatus } = {}): Todo[] {
  const root = todosRoot();
  if (!existsSync(root)) return [];

  const dirs = status ? [status] : STATUS_DIRS;
  const todos: Todo[] = [];
  let index = 1;

  for (const dir of dirs) {
    const dirPath = join(root, dir);
    if (!existsSync(dirPath)) continue;

    const files = readdirSync(dirPath)
      .filter((f) => f.endsWith(".md"))
      .sort();

    for (const file of files) {
      const filePath = join(dirPath, file);
      const slug = basename(file, ".md");
      const content = readFileSync(filePath, "utf-8");
      const { meta } = parseFrontmatter(content);

      todos.push({
        index,
        slug,
        status: dir as TodoStatus,
        title: meta.title || slugToTitle(slug),
        area: meta.area,
        priority: meta.priority,
        created: meta.created,
        source: meta.source,
        path: filePath,
      });
      index++;
    }
  }

  return todos;
}

/**
 * Add a new todo as a markdown file in the pending directory.
 */
export function addTodo({
  title,
  area,
  priority = "medium",
  source = "luca-cli",
  body,
}: {
  title: string;
  area?: string;
  priority?: string;
  /** Source tag (e.g. 'luca-cli', 'research', 'triage') */
  source?: string;
  /** Optional markdown body appended after the task title */
  body?: string;
}): Todo {
  const root = todosRoot();
  const pendingDir = join(root, "pending");
  ensureDir(pendingDir);

  // Generate slug from title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const created = new Date().toISOString().split("T")[0];

  // Build frontmatter
  const lines = ["---"];
  lines.push(`title: "${title}"`);
  if (area) lines.push(`area: ${area}`);
  lines.push(`created: ${created}`);
  lines.push(`priority: ${priority}`);
  lines.push(`source: ${source}`);
  lines.push("---");
  lines.push("");
  lines.push("## Task");
  lines.push("");
  lines.push(`${title}`);
  lines.push("");
  if (body) {
    lines.push(body);
    lines.push("");
  }

  const filePath = join(pendingDir, `${slug}.md`);
  writeFileSync(filePath, lines.join("\n"), "utf-8");

  return {
    index: -1, // Not assigned until listed
    slug,
    status: "pending",
    title,
    area,
    priority,
    created,
    source,
    path: filePath,
  };
}

/**
 * Move a todo between status directories.
 * Accepts either a numeric index (from listTodos output) or a slug.
 */
export function moveTodo({
  identifier,
  targetStatus,
}: {
  identifier: number | string;
  targetStatus: TodoStatus;
}): Todo | undefined {
  const todos = listTodos();
  const todo =
    typeof identifier === "number"
      ? todos.find((t) => t.index === identifier)
      : todos.find((t) => t.slug === identifier);

  if (!todo) return undefined;
  if (todo.status === targetStatus) return todo;

  const root = todosRoot();
  const targetDir = join(root, targetStatus);
  ensureDir(targetDir);

  const newPath = join(targetDir, `${todo.slug}.md`);
  renameSync(todo.path, newPath);

  return { ...todo, status: targetStatus, path: newPath };
}

/**
 * Remove a todo file entirely.
 */
export function removeTodo({
  identifier,
}: {
  identifier: number | string;
}): boolean {
  const todos = listTodos();
  const todo =
    typeof identifier === "number"
      ? todos.find((t) => t.index === identifier)
      : todos.find((t) => t.slug === identifier);

  if (!todo) return false;
  unlinkSync(todo.path);
  return true;
}

/**
 * Move a batch of todos (by index) to pending status ("assign" them).
 */
export function assignBatch({ indices }: { indices: number[] }): Todo[] {
  const assigned: Todo[] = [];
  for (const idx of indices) {
    const result = moveTodo({ identifier: idx, targetStatus: "pending" });
    if (result) assigned.push(result);
  }
  return assigned;
}

/**
 * Read the full content of a specific todo file.
 */
export function readTodoContent({
  identifier,
}: {
  identifier: number | string;
}): { todo: Todo; content: string } | undefined {
  const todos = listTodos();
  const todo =
    typeof identifier === "number"
      ? todos.find((t) => t.index === identifier)
      : todos.find((t) => t.slug === identifier);

  if (!todo) return undefined;
  const content = readFileSync(todo.path, "utf-8");
  return { todo, content };
}
