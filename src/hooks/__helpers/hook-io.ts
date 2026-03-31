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
import { chmodSync, readFileSync } from "node:fs";

import type { ZodSchema } from "zod";

import { sanitizeJsonParse } from "../../shared";

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
    const json = sanitizeJsonParse(raw);
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
    return sanitizeJsonParse(raw) as Record<string, unknown>;
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
 * Writes structured JSON to stdout (Claude Code only).
 *
 * Emits `{ systemMessage }`, `{ followup_message }`, or `{ hookSpecificOutput }` shapes.
 * When both `systemMessage` and `followupMessage` are provided, both keys are emitted
 * independently (no overwrite).
 *
 * @param result - The result payload to emit
 */
export const emitResult = (result: HookResult): void => {
  const output: Record<string, unknown> = {};

  if (result.hookSpecificOutput !== undefined) {
    output.hookSpecificOutput = result.hookSpecificOutput;
  }

  if (result.systemMessage) {
    output.systemMessage = result.systemMessage;
  }

  if (result.followupMessage) {
    output.followup_message = result.followupMessage;
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
  emitResult({
    hookSpecificOutput: {
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  });
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
  const safeHookName = hookName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const projectHash = createHash("sha256")
    .update(projectDir())
    .digest("hex")
    .slice(0, 8);
  const guardFile = `/tmp/.luca-dedup-${safeHookName}-${projectHash}`;

  try {
    const content = readFileSync(guardFile, "utf-8").trim();
    const lastRun = parseInt(content, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - lastRun < ttlSeconds) {
      process.exit(0);
    }
  } catch {
    // File doesn't exist or can't be read — continue
  }

  const now = Math.floor(Date.now() / 1000);
  // Fire-and-forget: guard write is best-effort (timestamp already in memory)
  void Bun.write(guardFile, String(now)).then(() => {
    try {
      chmodSync(guardFile, 0o600);
    } catch {
      // Non-critical: chmod may fail on certain platforms
    }
  });
};

// ─── Pre-Step Dedup Guard ────────────────────────────────────────────────────

/**
 * Millisecond-precision dedup guard for pre-step enforcement hooks.
 *
 * Unlike guardDedup (second precision, 5s TTL), this uses Date.now()
 * directly for sub-second TTL windows. Designed for pre-step hooks
 * where parallel wave execution may fire multiple Skill calls in
 * rapid succession.
 *
 * Guard key format: /tmp/.luca-prestep-{hookName}-{projectHash}-{toolName}-ts
 *
 * TTL: 200ms -- sufficient to collapse duplicate-within-same-event-loop
 * bursts while allowing distinct skill invocations in parallel waves
 * to pass through. (PREMORTEM Constraint #2)
 *
 * @param hookName - Unique hook identifier
 * @param toolName - Tool name from hook stdin (for per-tool scoping)
 * @param ttlMs - Window in milliseconds to deduplicate (default: 200)
 */
export const guardPreStep = (
  hookName: string,
  toolName: string,
  ttlMs = 200, // PREMORTEM Constraint #2: explicitly 200ms, documented here
): void => {
  const safeHookName = hookName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const hash = createHash("sha256")
    .update(projectDir())
    .digest("hex")
    .slice(0, 8);
  const safeTool = toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const guardFile = `/tmp/.luca-prestep-${safeHookName}-${hash}-${safeTool}-ts`;

  try {
    const content = readFileSync(guardFile, "utf-8").trim();
    const lastRun = parseInt(content, 10);
    const now = Date.now();
    if (now - lastRun < ttlMs) {
      process.exit(0);
    }
  } catch {
    // File doesn't exist or can't be read — continue
  }

  const now = Date.now();
  // Fire-and-forget: guard write is best-effort (timestamp already in memory)
  void Bun.write(guardFile, String(now)).then(() => {
    try {
      chmodSync(guardFile, 0o600);
    } catch {
      // Non-critical: chmod may fail on certain platforms
    }
  });
};

// ─── Throttle Helpers ────────────────────────────────────────────────────────

/**
 * Returns true if the throttle key is still within the TTL window.
 *
 * Reads a per-key timestamp file from /tmp. If the file doesn't exist or
 * can't be read, returns false (i.e. "not throttled, proceed").
 *
 * @param key - Unique throttle key (e.g. `.luca-snapshot-sync-${hash}-ts`)
 * @param ttlSeconds - Number of seconds the throttle window lasts
 * @returns true if last recorded time was within ttlSeconds ago
 *
 * @example
 * ```typescript
 * if (checkThrottle(throttleKey, 120)) return exitSuccess();
 * recordThrottle(throttleKey);
 * // ... do work
 * ```
 */
export const checkThrottle = (key: string, ttlSeconds: number): boolean => {
  try {
    const lastRun = parseInt(readFileSync(key, "utf-8").trim(), 10);
    const now = Math.floor(Date.now() / 1000);
    return now - lastRun < ttlSeconds;
  } catch {
    // File doesn't exist or can't be read — not throttled
    return false;
  }
};

/**
 * Records the current time as the last-run timestamp for a throttle key.
 *
 * Writes the current Unix epoch (seconds) to the given file path.
 * Silently ignores write failures (e.g. /tmp not writable).
 *
 * @param key - Unique throttle key (e.g. `.luca-snapshot-sync-${hash}-ts`)
 */
export const recordThrottle = (key: string): void => {
  // Fire-and-forget: throttle write is best-effort
  void Bun.write(key, String(Math.floor(Date.now() / 1000)))
    .then(() => {
      try {
        chmodSync(key, 0o600);
      } catch {
        // Non-critical: chmod may fail on certain platforms
      }
    })
    .catch(() => {
      // /tmp not writable — non-critical
    });
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

/**
 * Extracts `tool_input` from hook stdin JSON as a typed record.
 *
 * Common pattern across PreToolUse/PostToolUse hooks. Centralizes the
 * type cast so hook scripts don't repeat the same assertion.
 *
 * @param data - Parsed stdin JSON object
 * @returns The tool_input record, or undefined if not present
 */
export const extractToolInput = (
  data: Record<string, unknown> | null,
): Record<string, unknown> | undefined => {
  if (!data) return undefined;
  const toolInput = data.tool_input;
  return toolInput && typeof toolInput === "object" && !Array.isArray(toolInput)
    ? (toolInput as Record<string, unknown>)
    : undefined;
};
