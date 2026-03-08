import { NextResponse } from "next/server";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

interface TodoResponse {
  filename: string;
  title: string;
  area: string;
  created: string;
  source: string;
  tier: number;
  complexity: string;
  state: "pending" | "done";
}

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

async function readTodosFromDir(
  dirPath: string,
  state: "pending" | "done",
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

export async function GET() {
  const workspaceRoot =
    process.env.WORKSPACE_ROOT || join(process.cwd(), "../..");
  const todosBase = join(workspaceRoot, ".planning", "todos");
  const [pending, done] = await Promise.all([
    readTodosFromDir(join(todosBase, "pending"), "pending"),
    readTodosFromDir(join(todosBase, "done"), "done"),
  ]);
  return NextResponse.json([...pending, ...done]);
}
