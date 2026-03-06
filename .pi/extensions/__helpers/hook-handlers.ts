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
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, extname, resolve } from "node:path";
import { homedir } from "node:os";

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
  const cmd = `${getFormatterCmd(rt)} --write "${filePath}"`;

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

  const result = runShellCommand(`bun run "${driftScript}"`, {
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

  // Fallback: WORKING.md file size
  const workingMd = join(cwd, ".planning", "WORKING.md");
  if (!existsSync(workingMd)) return;

  try {
    const size = statSync(workingMd).size;
    if (size >= 60_000) {
      return `[Context Monitor: CRITICAL] Context usage is very high based on WORKING.md growth (~${size} bytes). Quality may be degrading. Consider running /compact to free context space, or start a new session.`;
    }
    if (size >= 40_000) {
      return `[Context Monitor: HIGH] Context usage is high based on WORKING.md growth (~${size} bytes). Consider running /compact soon to maintain response quality.`;
    }
    if (size >= 20_000) {
      return `[Context Monitor: MODERATE] Context usage is moderate based on WORKING.md growth (~${size} bytes). No action needed yet, but be mindful of context limits.`;
    }
  } catch {
    // stat failed — skip
  }
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
 * Dual check: primary is ctx.getContextUsage() (Pi-native tokens),
 * fallback is file-size heuristics. Higher severity wins.
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
  let piLevel = "NONE";
  let piMsg = "";

  if (ctx?.getContextUsage) {
    const usage = ctx.getContextUsage();
    const total = usage.tokens ?? 0;
    const limit = usage.contextWindow ?? 200_000;

    if (limit > 0 && total > 0) {
      const ratio = total / limit;
      if (ratio >= 0.7) {
        piLevel = "CRITICAL";
        piMsg = `Context usage is very high (${Math.round(ratio * 100)}% of ${limit} tokens). Quality may be degrading. Consider running /compact to free context space, or start a new session.`;
      } else if (ratio >= 0.5) {
        piLevel = "HIGH";
        piMsg = `Context usage is high (${Math.round(ratio * 100)}% of ${limit} tokens). Consider running /compact soon to maintain response quality.`;
      } else if (ratio >= 0.3) {
        piLevel = "MODERATE";
        piMsg = `Context usage is moderate (${Math.round(ratio * 100)}% of ${limit} tokens). No action needed yet, but be mindful of context limits.`;
      }
    }
  }

  // ─── Fallback: WORKING.md file size ───────────────────────────────────
  let wmdLevel = "NONE";
  let wmdMsg = "";
  const workingMd = join(cwd, ".planning", "WORKING.md");

  if (existsSync(workingMd)) {
    try {
      const size = statSync(workingMd).size;
      if (size >= 60_000) {
        wmdLevel = "CRITICAL";
        wmdMsg = `Context usage is very high based on WORKING.md growth (~${size} bytes). Quality may be degrading.`;
      } else if (size >= 40_000) {
        wmdLevel = "HIGH";
        wmdMsg = `Context usage is high based on WORKING.md growth (~${size} bytes). Consider running /compact soon.`;
      } else if (size >= 20_000) {
        wmdLevel = "MODERATE";
        wmdMsg = `Context usage is moderate based on WORKING.md growth (~${size} bytes). No action needed yet.`;
      }
    } catch {
      // stat failed
    }
  }

  // ─── Resolve: take higher severity ────────────────────────────────────
  const rankMap: Record<string, number> = {
    NONE: 0,
    MODERATE: 1,
    HIGH: 2,
    CRITICAL: 3,
  };
  const piRank = rankMap[piLevel] ?? 0;
  const wmdRank = rankMap[wmdLevel] ?? 0;
  const finalLevel = piRank >= wmdRank ? piLevel : wmdLevel;
  const finalMsg = piRank >= wmdRank ? piMsg : wmdMsg;

  if (finalLevel === "NONE") return;

  return `[Context Monitor: ${finalLevel}] ${finalMsg}`;
}

// ─── Handler: session-persist ───────────────────────────────────────────────

/**
 * Save session state on shutdown.
 *
 * Removes session lock, appends session-end timestamp to WORKING.md.
 * Best-effort only — session shutdown hooks cannot block termination.
 *
 * @security SEC-02: Sanitizes reason input to prevent markdown injection.
 *
 * @param cwd - Project root directory
 * @param reason - Session end reason (from Pi event)
 */
export function handleSessionPersist(cwd: string, reason?: string): void {
  // SEC-02: Sanitize reason — only alphanumeric, spaces, hyphens, underscores, periods
  let safeReason = (reason ?? "unknown")
    .replace(/[^a-zA-Z0-9 _.\-]/g, "")
    .slice(0, 100);
  if (!safeReason) safeReason = "unknown";

  // Remove session lock (most important action — do first)
  const lockPath = join(cwd, ".claude", ".session-lock");
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    // best-effort
  }

  const workingMd = join(cwd, ".planning", "WORKING.md");
  if (!existsSync(workingMd)) return;

  try {
    const content = readFileSync(workingMd, "utf-8");
    if (!content.trim()) return;

    const timestamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");

    if (content.includes("Session ended:")) {
      // Update existing marker
      const updated = content.replace(
        /\*Session ended:.*\*/,
        `*Session ended: ${timestamp} (reason: ${safeReason})*`,
      );
      writeFileSync(workingMd, updated, "utf-8");
    } else {
      // Append new marker
      const footer = `\n\n---\n*Session ended: ${timestamp} (reason: ${safeReason})*\n`;
      writeFileSync(workingMd, content + footer, "utf-8");
    }
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
    bridgeCmd = `bun run "${bridgePath}"`;
  }

  if (bridgeCmd) {
    try {
      runShellCommand(`${bridgeCmd} snapshot`, { cwd, timeout: 10 });
    } catch {
      // best-effort
    }
  }
}
