/**
 * Git context collection utilities.
 *
 * Provides a single function to collect git branch, diff summary, and STATE.md
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
  /** KEY: Value lines from STATE.md Phase/Plan/Status fields (max 3), or empty string. */
  phaseContext: string;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Collects git branch, diff summary, and phase context from STATE.md.
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

  // Read phase context from STATE.md (best-effort)
  let phaseContext = "";
  const stateMdPath = join(pd, ".planning", "STATE.md");
  if (existsSync(stateMdPath)) {
    try {
      const stateContent = readFileSync(stateMdPath, "utf-8");
      const phaseFields: string[] = [];
      for (const line of stateContent.split("\n")) {
        if (
          line.includes("Phase:") ||
          line.includes("Plan:") ||
          line.includes("Status:")
        ) {
          const trimmed = line.replace(/^[-*\s]+/, "").trim();
          if (trimmed) phaseFields.push(trimmed);
        }
      }
      phaseContext = phaseFields.slice(0, 3).join(" | ");
    } catch {
      // STATE.md unreadable
    }
  }

  return { gitBranch, gitDiffSummary, phaseContext };
};
