/**
 * Pi-native hook handler functions.
 *
 * One exported function per hook, replacing the shell script bridge
 * pattern. Each handler implements its hook behavior directly in
 * TypeScript using runShellCommand() from exec.ts.
 *
 * Uses node:fs exclusively — Pi runs on Node.js, not Bun.
 *
 * Source: src/hooks/pi-extensions/__helpers/hook-handlers.ts
 * Deployed to: .pi/extensions/__helpers/hook-handlers.ts
 */
import { existsSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";

import { runShellCommand } from "./exec";
import {
  detectRuntime,
  getFormatterCmd,
  getTscCmd,
  getTestCmd,
} from "./runtime-detect";
import { shouldRunThrottled } from "./throttle";
import { runSessionInit } from "./session-init";
import type { PiExtensionContext } from "../__types/pi-context";

/**
 * Escape a string for safe interpolation into a shell command.
 *
 * Wraps the value in single quotes and escapes any embedded single
 * quotes using the standard sh idiom: ' -> '\''
 * This prevents shell injection when file paths or other untrusted
 * strings are embedded in command strings passed to runShellCommand().
 *
 * @param value - The string to escape
 * @returns A shell-safe single-quoted string
 */
function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

/** Extensions that prettier can format. */
const FORMATTABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".json",
  ".md",
  ".yaml",
  ".yml",
  ".html",
]);

/** Extensions that need type-checking. */
const TYPECHECKABLE_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Truncate output to the first N lines, with overflow indicator.
 */
function truncateHead(output: string, maxLines: number): string {
  const lines = output.split("\n");
  if (lines.length <= maxLines) return output;
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n... (${lines.length} total lines, showing first ${maxLines})`
  );
}

/**
 * Truncate output to the last N lines, with overflow indicator.
 */
function truncateTail(output: string, maxLines: number): string {
  const lines = output.split("\n");
  if (lines.length <= maxLines) return output;
  return (
    `... (${lines.length} total lines, showing last ${maxLines})\n` +
    lines.slice(-maxLines).join("\n")
  );
}

// ─── Handler: post-edit-format ──────────────────────────────────────────────

/**
 * Format a file after edit/write operations.
 *
 * Checks file extension against FORMATTABLE_EXTENSIONS. Runs prettier
 * if applicable. Non-blocking — always returns void.
 *
 * @param filePath - Path to the edited file
 * @param cwd - Project root directory
 */
export function handlePostEditFormat(filePath: string, cwd: string): void {
  if (!filePath) return;

  const ext = extname(filePath).toLowerCase();
  if (!FORMATTABLE_EXTENSIONS.has(ext)) return;

  const rt = detectRuntime(cwd);
  const cmd = `${getFormatterCmd(rt)} --write ${shellEscape(filePath)}`;

  try {
    runShellCommand(cmd, { cwd, timeout: 10 });
  } catch {
    // Non-blocking — formatting failures are silent
  }
}

// ─── Handler: post-edit-typecheck ───────────────────────────────────────────

/**
 * Type-check after TypeScript file edits.
 *
 * Skips non-TypeScript files. Runs project-wide tsc --noEmit. Returns
 * error output for async systemMessage, or void if clean.
 *
 * @param filePath - Path to the edited file
 * @param cwd - Project root directory
 * @returns Error message string if type errors found, void otherwise
 */
export function handlePostEditTypecheck(
  filePath: string,
  cwd: string,
): string | void {
  if (!filePath) return;

  const ext = extname(filePath).toLowerCase();
  if (!TYPECHECKABLE_EXTENSIONS.has(ext)) return;

  // Check for tsconfig.json
  if (!existsSync(join(cwd, "tsconfig.json"))) return;

  const rt = detectRuntime(cwd);
  const result = runShellCommand(getTscCmd(rt), { cwd, timeout: 30 });

  if (!result.passed && result.output) {
    const truncated = truncateHead(result.output.trim(), 20);
    return `TypeScript type errors found after editing ${filePath}:\n\n${truncated}`;
  }
}

// ─── Handler: pre-commit-gate ───────────────────────────────────────────────

/**
 * Run pre-commit quality checks (tests + typecheck).
 *
 * Only activates for git commit / bun run commit commands. Returns a
 * block response on failure, void on success.
 *
 * @param cmd - The shell command being executed
 * @param cwd - Project root directory
 * @returns Block response if checks fail, void if all pass
 */
export function handlePreCommitGate(
  cmd: string,
  cwd: string,
): { block: boolean; reason: string } | void {
  if (!cmd) return;
  if (!/\bgit\s+commit\b|bun\s+run\s+commit/.test(cmd)) return;

  // Sync STATE.md from state machine before commit
  syncStateSnapshot(cwd);

  const rt = detectRuntime(cwd);
  const errors: string[] = [];

  // Step 1: Run tests
  const testResult = runShellCommand(getTestCmd(rt), { cwd, timeout: 120 });
  if (!testResult.passed) {
    errors.push(`Tests failed:\n${truncateTail(testResult.output.trim(), 30)}`);
  }

  // Step 2: Type-check (if tsconfig.json exists)
  if (existsSync(join(cwd, "tsconfig.json"))) {
    const tscResult = runShellCommand(getTscCmd(rt), { cwd, timeout: 60 });
    if (!tscResult.passed) {
      errors.push(
        `Type check failed:\n${truncateHead(tscResult.output.trim(), 20)}`,
      );
    }
  }

  if (errors.length > 0) {
    return {
      block: true,
      reason: `pre-commit-gate: checks failed\n\n${errors.join("\n\n")}`,
    };
  }
}

// ─── Handler: pre-commit-drift-check ────────────────────────────────────────

/**
 * Check for output drift before commits.
 *
 * Only activates for git commit commands. Checks if staged files
 * include relevant directories, then runs check-drift.ts.
 *
 * @param cmd - The shell command being executed
 * @param cwd - Project root directory
 * @returns Block response if drift detected, void otherwise
 */
export function handlePreCommitDriftCheck(
  cmd: string,
  cwd: string,
): { block: boolean; reason: string } | void {
  if (!cmd) return;
  if (!/\bgit\s+commit\b|bun\s+run\s+commit/.test(cmd)) return;

  const driftScript = join(cwd, "scripts", "check-drift.ts");
  if (!existsSync(driftScript)) return;

  const result = runShellCommand(`bun run ${shellEscape(driftScript)}`, {
    cwd,
    timeout: 60,
  });

  if (!result.passed) {
    return {
      block: true,
      reason: `pre-commit-drift-check: output drift detected\n\n${truncateTail(result.output.trim(), 20)}`,
    };
  }
}

// ─── Handler: context-check-throttled ───────────────────────────────────────

/**
 * Async context usage check (throttled to once per 60 seconds).
 *
 * Uses ctx.getContextUsage() when available (Pi provides actual token
 * counts). Falls back to file-size heuristics for older Pi versions.
 *
 * @param cwd - Project root directory
 * @param ctx - Pi extension context (optional)
 * @returns Warning message if context usage is concerning, void otherwise
 */
export function handleContextCheckThrottled(
  cwd: string,
  ctx?: PiExtensionContext,
): string | void {
  if (!shouldRunThrottled("context-check", 60_000)) return;

  // Try Pi-native context usage first
  if (ctx?.getContextUsage) {
    const usage = ctx.getContextUsage();
    const total = usage.tokens ?? 0;
    const limit = usage.contextWindow ?? 200_000;

    if (limit > 0 && total > 0) {
      const ratio = total / limit;
      if (ratio >= 0.7) {
        return `[Context Monitor: CRITICAL] Context usage is very high (${Math.round(ratio * 100)}%). Quality may be degrading. Consider running /compact to free context space, or start a new session.`;
      }
      if (ratio >= 0.5) {
        return `[Context Monitor: HIGH] Context usage is high (${Math.round(ratio * 100)}%). Consider running /compact soon to maintain response quality.`;
      }
      if (ratio >= 0.3) {
        return `[Context Monitor: MODERATE] Context usage is moderate (${Math.round(ratio * 100)}%). No action needed yet, but be mindful of context limits.`;
      }
      return;
    }
  }

  // NOTE: WORKING.md fallback removed. Memory is handled by MuninnDB MCP.
  // Only Pi-native context usage (ctx.getContextUsage()) is checked.
}

// ─── Handler: snapshot-sync ─────────────────────────────────────────────────

/**
 * Sync STATE.md from state machine (throttled to once per 120 seconds).
 *
 * @param cwd - Project root directory
 */
export function handleSnapshotSync(cwd: string): void {
  if (!shouldRunThrottled("snapshot-sync", 120_000)) return;
  syncStateSnapshot(cwd);
}

// ─── Handler: context-monitor ───────────────────────────────────────────────

/**
 * Context usage monitor on session shutdown.
 *
 * Uses ctx.getContextUsage() (Pi-native tokens) as the sole signal.
 * NOTE: WORKING.md fallback removed. Memory is handled by MuninnDB MCP.
 *
 * @param cwd - Project root directory
 * @param ctx - Pi extension context
 * @returns Warning message if context usage exceeds thresholds, void otherwise
 */
export function handleContextMonitor(
  cwd: string,
  ctx?: PiExtensionContext,
): string | void {
  // ─── Primary: Pi-native context usage ─────────────────────────────────
  if (ctx?.getContextUsage) {
    const usage = ctx.getContextUsage();
    const total = usage.tokens ?? 0;
    const limit = usage.contextWindow ?? 200_000;

    if (limit > 0 && total > 0) {
      const ratio = total / limit;
      if (ratio >= 0.7) {
        return `[Context Monitor: CRITICAL] Context usage is very high (${Math.round(ratio * 100)}% of ${limit} tokens). Quality may be degrading. Consider running /compact to free context space, or start a new session.`;
      }
      if (ratio >= 0.5) {
        return `[Context Monitor: HIGH] Context usage is high (${Math.round(ratio * 100)}% of ${limit} tokens). Consider running /compact soon to maintain response quality.`;
      }
      if (ratio >= 0.3) {
        return `[Context Monitor: MODERATE] Context usage is moderate (${Math.round(ratio * 100)}% of ${limit} tokens). No action needed yet, but be mindful of context limits.`;
      }
    }
  }
}

// ─── Handler: session-persist ───────────────────────────────────────────────

/**
 * Save session state on shutdown.
 *
 * Removes session lock. Best-effort only — session shutdown hooks
 * cannot block termination.
 *
 * NOTE: WORKING.md session-end timestamp operations have been removed.
 * Session memory persistence is now handled by MuninnDB MCP
 * (muninn_session tracks session lifecycle natively).
 *
 * @param cwd - Project root directory
 * @param _reason - Session end reason (preserved for API compatibility)
 */
export function handleSessionPersist(cwd: string, _reason?: string): void {
  // Remove session lock (most important action)
  const lockPath = join(cwd, ".claude", ".session-lock");
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    // best-effort
  }
}

// ─── Handler: session-start ─────────────────────────────────────────────────

/**
 * Initialize Luca session on session start.
 *
 * Delegates to session-init.ts for the full init sequence.
 *
 * @param cwd - Project root directory
 * @returns Summary message if files were created, void otherwise
 */
export function handleSessionStart(cwd: string): string | void {
  const result = runSessionInit(cwd);
  const messages: string[] = [];

  if (result.warnings.length > 0) {
    messages.push(...result.warnings);
  }

  if (result.created.length > 0) {
    messages.push(
      `[Luca] Initialized .planning/ directory. Created: ${result.created.join(", ")}`,
    );
  }

  if (messages.length > 0) {
    return messages.join("\n");
  }
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Run state machine bridge snapshot command.
 * Cascading lookup: installed binary → monorepo source.
 */
function syncStateSnapshot(cwd: string): void {
  const stateJson = join(cwd, ".planning", "state.json");
  if (!existsSync(stateJson)) return;

  const bridgePath = join(
    cwd,
    "packages",
    "luca-framework",
    "src",
    "state",
    "bridge.ts",
  );

  let bridgeCmd: string | null = null;
  try {
    const whichResult = runShellCommand("command -v luca-bridge", {
      cwd,
      timeout: 5,
    });
    if (whichResult.passed) {
      bridgeCmd = "luca-bridge";
    }
  } catch {
    // not found
  }

  if (!bridgeCmd && existsSync(bridgePath)) {
    bridgeCmd = `bun run ${shellEscape(bridgePath)}`;
  }

  if (bridgeCmd) {
    try {
      runShellCommand(`${bridgeCmd} snapshot`, { cwd, timeout: 10 });
    } catch {
      // best-effort
    }
  }
}
