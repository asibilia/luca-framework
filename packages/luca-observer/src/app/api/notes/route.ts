import { NextResponse } from "next/server";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, basename, resolve } from "node:path";
import { z } from "zod";

import { insertEvent } from "~/lib/db";
import { broadcastEvent } from "~/lib/sse";

export const dynamic = "force-dynamic";

/**
 * Resolve project directory with path traversal protection.
 */
function resolveProjectDir(projectDir?: string): string {
  const base = process.cwd();
  if (!projectDir) return base;

  const resolved = resolve(base, projectDir);
  if (!resolved.startsWith(base)) {
    throw new Error("Directory outside project boundary");
  }
  return resolved;
}

/**
 * Parse a note file into structured data.
 *
 * Extracts frontmatter (priority, created, status) and body text.
 */
function parseNoteFile(
  filename: string,
  content: string,
): {
  filename: string;
  priority: string;
  created: string;
  status: string;
  body: string;
} {
  const priority = filename.startsWith("0-") ? "next" : "whenever";
  let created = "";
  let status = "pending";
  let body = content;

  // Extract frontmatter if present
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (frontmatterMatch) {
    const fm = frontmatterMatch[1] ?? "";
    body = (frontmatterMatch[2] ?? "").trim();

    const createdMatch = fm.match(/created:\s*(.+)/);
    if (createdMatch) created = createdMatch[1]!.trim();

    const statusMatch = fm.match(/status:\s*(.+)/);
    if (statusMatch) status = statusMatch[1]!.trim();

    const priorityMatch = fm.match(/priority:\s*(.+)/);
    if (priorityMatch) {
      // Frontmatter priority takes precedence
    }
  }

  // Fallback: extract timestamp from filename
  if (!created) {
    const tsMatch = filename.match(/^\d-(\d+)-/);
    if (tsMatch) {
      created = new Date(parseInt(tsMatch[1]!, 10) * 1000).toISOString();
    }
  }

  return { filename, priority, created, status, body };
}

/**
 * GET /api/notes — Read pending and done developer notes.
 *
 * Returns { pending: [...], done: [...] } with note metadata.
 * Uses snake_case for API compatibility.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectDir = searchParams.get("dir") ?? undefined;

  try {
    const dir = resolveProjectDir(projectDir);
    const notesDir = join(dir, ".planning", "notes");
    const doneDir = join(notesDir, "done");

    const readNotes = async (
      dirPath: string,
    ): Promise<ReturnType<typeof parseNoteFile>[]> => {
      try {
        const files = await readdir(dirPath);
        const mdFiles = files
          .filter((f) => f.endsWith(".md"))
          .sort()
          .slice(0, 50);

        const notes = await Promise.all(
          mdFiles.map(async (f) => {
            const content = await readFile(join(dirPath, f), "utf-8");
            return parseNoteFile(f, content);
          }),
        );
        return notes;
      } catch {
        return [];
      }
    };

    const [pending, done] = await Promise.all([
      readNotes(notesDir),
      readNotes(doneDir),
    ]);

    return NextResponse.json({ pending, done });
  } catch {
    return NextResponse.json(
      { error: "failed_to_read_notes" },
      { status: 500 },
    );
  }
}

/**
 * API Request: Create a developer note.
 *
 * Uses snake_case for API compatibility.
 */
const CreateNoteSchema = z.object({
  text: z.string().min(1),
  priority: z.enum(["next", "whenever"]).default("next"),
});

/**
 * POST /api/notes — Create a new developer note.
 *
 * Creates a note file on disk and emits a note.added event.
 * Uses snake_case for API compatibility.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parseResult = CreateNoteSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "invalid_payload",
          details: parseResult.error.issues,
        },
        { status: 400 },
      );
    }

    const { text, priority } = parseResult.data;
    const prefix = priority === "next" ? "0" : "1";
    const timestamp = Math.floor(Date.now() / 1000);
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join("-")
      .slice(0, 50);

    const filename = `${prefix}-${timestamp}-${slug}.md`;
    const notesDir = join(process.cwd(), ".planning", "notes");

    await mkdir(notesDir, { recursive: true });

    const content = [
      "---",
      `priority: ${priority}`,
      `created: ${new Date().toISOString()}`,
      "status: pending",
      "---",
      "",
      text,
      "",
    ].join("\n");

    await writeFile(join(notesDir, filename), content, "utf-8");

    // Emit observer event
    const stored = insertEvent({
      event_type: "note.added",
      timestamp: new Date().toISOString(),
      payload: { priority, file: filename, text },
    });
    broadcastEvent(stored);

    return NextResponse.json({
      filename,
      received: true,
    });
  } catch {
    return NextResponse.json(
      { error: "failed_to_create_note" },
      { status: 500 },
    );
  }
}
