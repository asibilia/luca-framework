// Exception: readdir and mkdir kept from node:fs/promises — Bun has no
// standalone mkdir equivalent and readdir is simpler than Bun.Glob for
// listing + slicing a bounded set of files.
import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiKey } from "~/lib/auth";
import { insertEvent } from "~/lib/db";
import { resolveProjectDir } from "~/lib/resolve-project-dir";
import { sanitizeZodIssues } from "~/lib/sanitize-zod";
import { broadcastEvent } from "~/lib/sse";

export const dynamic = "force-dynamic";

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
 * GET /api/notes -- Read pending and done developer notes.
 *
 * Reads markdown files from .planning/notes/ (pending) and
 * .planning/notes/done/ (consumed). Each note file is parsed for
 * frontmatter (priority, created, status) and body text. Returns
 * up to 50 notes per category, sorted alphabetically by filename.
 *
 * Query parameters:
 *   - dir (string, optional): Project directory path (defaults to LUCA_PROJECT_DIR or cwd)
 *
 * Response (200):
 *   { pending: Note[], done: Note[] }
 *
 *   Where each Note contains:
 *   { filename: string, priority: "next"|"whenever",
 *     created: string, status: string, body: string }
 *
 * Response (500):
 *   { error: "failed_to_read_notes" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl http://localhost:3456/api/notes
 * ```
 */
export async function GET(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

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
            const content = await Bun.file(join(dirPath, f)).text();
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
 * POST /api/notes -- Create a new developer note.
 *
 * Creates a markdown note file in .planning/notes/ with frontmatter
 * (priority, created timestamp, status) and the note body. The filename
 * is generated from the priority prefix, Unix timestamp, and a slugified
 * excerpt of the text. Also emits a "note.added" event into the
 * in-memory event store and broadcasts it to SSE clients.
 *
 * Request body (JSON):
 *   - text (string, required): Note body text (min 1 character)
 *   - priority ("next"|"whenever", optional): Priority level (default: "next")
 *
 * Response (200):
 *   { filename: string, received: true }
 *
 * Response (400):
 *   { error: "invalid_payload", details: [...] }
 *
 * Response (500):
 *   { error: "failed_to_create_note" }
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```bash
 * curl -X POST http://localhost:3456/api/notes \
 *   -H "Content-Type: application/json" \
 *   -d '{"text":"Review error handling in planner","priority":"next"}'
 * ```
 */
export async function POST(request: Request) {
  const authError = requireApiKey(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const parseResult = CreateNoteSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "invalid_payload",
          details: sanitizeZodIssues(parseResult.error.issues),
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
    const notesDir = join(resolveProjectDir(), ".planning", "notes");

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

    await Bun.write(join(notesDir, filename), content);

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
