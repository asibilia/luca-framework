/**
 * Hook I/O contract — shared stdin/stdout JSON handling for all hooks.
 *
 * Replaces the `bun -e` inline JSON patterns scattered across every shell hook.
 * Provides typed stdin parsing, structured stdout emission, exit code helpers,
 * and dedup guard functionality.
 *
 * @module hook-io
 */

import { createHash } from "crypto";

import type { ZodSchema } from "zod";

// ─── Platform Detection ─────────────────────────────────────────────────────

/**
 * Returns true if running inside Claude Code (CLAUDE_PROJECT_DIR is set).
 */
export const isClaude = (): boolean => !!process.env.CLAUDE_PROJECT_DIR;

/**
 * Returns the project directory from CLAUDE_PROJECT_DIR, defaulting to ".".
 */
export const projectDir = (): string => process.env.CLAUDE_PROJECT_DIR || ".";

// ─── Stdin Parsing ───────────────────────────────────────────────────────────

/**
 * Reads stdin JSON, parses it with a Zod schema via safeParse.
 *
 * Returns the typed object on success, or null on empty/malformed stdin.
 * Never throws — malformed input is silently treated as "no input".
 *
 * @param schema - Zod schema to validate and parse the stdin JSON
 * @returns Parsed and validated object, or null
 */
export const parseHookInput = async <T>(
  schema: ZodSchema<T>,
): Promise<T | null> => {
  try {
    const raw = await Bun.stdin.text();
    if (!raw.trim()) return null;
    const json = JSON.parse(raw);
    const result = schema.safeParse(json);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

/**
 * Reads stdin as raw JSON (no schema validation).
 *
 * Returns the parsed object, or null on empty/malformed stdin.
 * Use this when you don't need Zod validation.
 */
export const readStdinJson = async (): Promise<Record<
  string,
  unknown
> | null> => {
  try {
    const raw = await Bun.stdin.text();
    if (!raw.trim()) return null;
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Drains stdin without parsing. Use for hooks that consume but don't inspect stdin.
 */
export const drainStdin = async (): Promise<void> => {
  try {
    await Bun.stdin.text();
  } catch {
    // stdin may already be closed
  }
};

// ─── Stdout Emission ─────────────────────────────────────────────────────────

/** Result shape for hook stdout JSON emission. */
export interface HookResult {
  systemMessage?: string;
  followupMessage?: string;
  hookSpecificOutput?: unknown;
}

/**
 * Writes structured JSON to stdout.
 *
 * Uses platform detection to emit the correct shape:
 * - Claude Code: `{ systemMessage }` or `{ hookSpecificOutput }`
 * - Cursor: `{ followup_message }` or `{ permission, user_message }`
 *
 * @param result - The result payload to emit
 */
export const emitResult = (result: HookResult): void => {
  const output: Record<string, unknown> = {};

  if (result.hookSpecificOutput !== undefined) {
    output.hookSpecificOutput = result.hookSpecificOutput;
  }

  if (result.systemMessage) {
    if (isClaude()) {
      output.systemMessage = result.systemMessage;
    } else {
      output.followup_message = result.systemMessage;
    }
  }

  if (result.followupMessage) {
    if (isClaude()) {
      output.systemMessage = result.followupMessage;
    } else {
      output.followup_message = result.followupMessage;
    }
  }

  if (Object.keys(output).length > 0) {
    process.stdout.write(JSON.stringify(output));
  }
};

// ─── Exit Code Helpers ───────────────────────────────────────────────────────

/**
 * Emits a deny/block payload and exits with code 2 (blocks PreToolUse hooks).
 *
 * @param reason - Human-readable reason for blocking
 */
export const exitBlock = (reason: string): never => {
  if (isClaude()) {
    emitResult({
      hookSpecificOutput: {
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    });
  } else {
    process.stdout.write(
      JSON.stringify({ permission: "deny", user_message: reason }),
    );
  }
  process.exit(2);
};

/**
 * Exits with code 0 (success / allow).
 */
export const exitSuccess = (): never => {
  process.exit(0);
};

// ─── Dedup Guard ─────────────────────────────────────────────────────────────

/**
 * Prevents double-firing when the same hook is registered at both global
 * and project levels. Uses a per-project, per-hook timestamp file in /tmp.
 *
 * If a previous invocation for the same hook+project ran within TTL seconds,
 * exits 0 immediately. Otherwise records timestamp and returns.
 *
 * Port of `guard_dedup()` from common.sh.
 *
 * @param hookName - Unique hook identifier
 * @param ttlSeconds - Window in seconds to deduplicate (default: 5)
 */
export const guardDedup = (hookName: string, ttlSeconds = 5): void => {
  const projectHash = createHash("sha256")
    .update(projectDir())
    .digest("hex")
    .slice(0, 8);
  const guardFile = `/tmp/.luca-dedup-${hookName}-${projectHash}`;

  try {
    const content = require("fs").readFileSync(guardFile, "utf-8").trim();
    const lastRun = parseInt(content, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - lastRun < ttlSeconds) {
      process.exit(0);
    }
  } catch {
    // File doesn't exist or can't be read — continue
  }

  const now = Math.floor(Date.now() / 1000);
  require("fs").writeFileSync(guardFile, String(now));
};

// ─── Utility: Project Hash ──────────────────────────────────────────────────

/**
 * Returns an 8-char SHA-256 hash of the project directory.
 * Used for creating project-scoped temp files.
 */
export const projectHash = (): string =>
  createHash("sha256").update(projectDir()).digest("hex").slice(0, 8);

// ─── Utility: Extract file path from hook stdin ─────────────────────────────

/**
 * Extracts `file_path` from hook stdin JSON.
 *
 * Handles both Claude Code (`tool_input.file_path`) and Cursor (`file_path`) shapes.
 *
 * @param data - Parsed stdin JSON object
 * @returns The file path string, or null if not found
 */
export const extractFilePath = (
  data: Record<string, unknown> | null,
): string | null => {
  if (!data) return null;
  const toolInput = data.tool_input as Record<string, unknown> | undefined;
  const filePath = toolInput?.file_path ?? data.file_path;
  return typeof filePath === "string" && filePath.length > 0 ? filePath : null;
};

/**
 * Extracts `command` from hook stdin JSON.
 *
 * Handles both Claude Code (`tool_input.command`) and Cursor (`command`) shapes.
 *
 * @param data - Parsed stdin JSON object
 * @returns The command string, or empty string if not found
 */
export const extractCommand = (
  data: Record<string, unknown> | null,
): string => {
  if (!data) return "";
  const toolInput = data.tool_input as Record<string, unknown> | undefined;
  const cmd = toolInput?.command ?? data.command;
  return typeof cmd === "string" ? cmd : "";
};
