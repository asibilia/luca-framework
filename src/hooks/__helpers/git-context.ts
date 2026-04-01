/**
 * Git context collection utilities.
 *
 * Provides a single function to collect git branch, diff summary, and state
 * phase context in a best-effort manner. Used by context observation hooks to
 * populate MuninnDB session engrams.
 *
 * @module git-context
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Git context collected for a session observation. */
export interface GitContext {
  /** Current git branch, or empty string if unavailable. */
  gitBranch: string;
  /** Comma-joined list of changed file names (max 10), or empty string. */
  gitDiffSummary: string;
  /** KEY: Value lines from state Phase/Plan/Status fields (max 3), or empty string. */
  phaseContext: string;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Collects git branch, diff summary, and phase context from state.json.
 *
 * All operations are best-effort — failures are silently swallowed so
 * hook execution is never interrupted by git errors.
 *
 * @param pd - Absolute path to the project directory
 * @returns GitContext object with available context fields
 *
 * @example
 * ```typescript
 * const ctx = collectGitContext(projectDir());
 * console.log(ctx.gitBranch);       // "main"
 * console.log(ctx.gitDiffSummary);  // "src/foo.ts, src/bar.ts"
 * console.log(ctx.phaseContext);    // "Phase: 169 | Status: active"
 * ```
 */
export const collectGitContext = (pd: string): GitContext => {
  // Read git branch (best-effort)
  let gitBranch = "";
  try {
    const branchResult = Bun.spawnSync(["git", "branch", "--show-current"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: pd,
    });
    if (branchResult.exitCode === 0) {
      gitBranch = branchResult.stdout.toString().trim();
    }
  } catch {
    // git not available
  }

  // Read git diff summary (best-effort, first 10 lines)
  let gitDiffSummary = "";
  try {
    const diffResult = Bun.spawnSync(["git", "diff", "--name-only", "HEAD"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: pd,
    });
    if (diffResult.exitCode === 0) {
      gitDiffSummary = diffResult.stdout
        .toString()
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(0, 10)
        .join(", ");
    }
  } catch {
    // git not available
  }

  // Read phase context from state.json (best-effort)
  let phaseContext = "";
  const stateJsonPath = join(pd, ".planning", "state.json");
  if (existsSync(stateJsonPath)) {
    try {
      const stateContent = readFileSync(stateJsonPath, "utf-8");
      const stateData = JSON.parse(stateContent);
      const ctx = stateData?.context ?? {};
      const parts: string[] = [];
      if (ctx.current_phase != null) parts.push(`Phase: ${ctx.current_phase}`);
      if (ctx.complexity) parts.push(`Complexity: ${ctx.complexity}`);
      if (stateData?.value) {
        const stateVal =
          typeof stateData.value === "string"
            ? stateData.value
            : typeof stateData.value === "object"
              ? (Object.keys(stateData.value)[0] ?? "unknown")
              : "unknown";
        parts.push(`Status: ${stateVal}`);
      }
      phaseContext = parts.slice(0, 3).join(" | ");
    } catch {
      // state.json unreadable
    }
  }

  return { gitBranch, gitDiffSummary, phaseContext };
};
