/**
 * Mechanical per-phase drift detection (DRIFT-01, DRIFT-05).
 *
 * After a phase completes, compares git diff output against file references
 * in remaining phases to detect invalidation, blocking, or redundancy.
 * This is a zero-LLM check: purely mechanical file path comparison.
 *
 * The checker:
 * 1. Runs `git diff` to get files changed in the completed phase
 * 2. Filters out infrastructure files unless they contain structural changes
 * 3. Compares changed paths against @-references in remaining phase plans
 * 4. Detects deleted/renamed modules that break phase assumptions
 * 5. Returns a typed DriftResult
 *
 * Tier: T0 Foundation -- no cross-domain imports except sibling schemas.
 *
 * @module drift-checker
 */

import {
  INFRASTRUCTURE_IGNORE_LIST,
  STRUCTURAL_CHANGE_PATTERNS,
  type DriftResult,
  type PhaseInfo,
  type AffectedPhase,
  type DriftReason,
} from "../__schemas/drift.schemas";

// ─── Git Helpers ────────────────────────────────────────────────────────────

/**
 * Run a git command and return stdout as trimmed string.
 *
 * Uses Bun.spawnSync for synchronous execution within the drift check.
 *
 * @param args - Git command arguments (without "git" prefix)
 * @param cwd - Working directory (defaults to process.cwd())
 * @returns Trimmed stdout, or empty string on failure
 */
const runGit = (args: string[], cwd?: string): string => {
  const result = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    cwd: cwd ?? process.cwd(),
  });
  return result.stdout.toString().trim();
};

/**
 * Get files changed in the most recent commit (the completed phase commit).
 *
 * Uses `git diff HEAD~1 --name-only` to get the list of changed files.
 * Falls back to `git diff --cached --name-only` if HEAD~1 is unavailable.
 *
 * @param cwd - Working directory
 * @returns Array of changed file paths (relative to repo root)
 */
export const getChangedFiles = (cwd?: string): string[] => {
  const output = runGit(["diff", "HEAD~1", "--name-only"], cwd);
  if (!output) return [];
  return output.split("\n").filter(Boolean);
};

/**
 * Get files that were deleted or renamed in the most recent commit.
 *
 * Uses `git diff HEAD~1 --diff-filter=DR --name-status` to detect
 * deletions (D) and renames (R).
 *
 * @param cwd - Working directory
 * @returns Array of {oldPath, newPath?, status} objects
 */
export const getDeletedOrRenamed = (
  cwd?: string,
): Array<{
  oldPath: string;
  newPath?: string;
  status: "deleted" | "renamed";
}> => {
  const output = runGit(
    ["diff", "HEAD~1", "--diff-filter=DR", "--name-status"],
    cwd,
  );
  if (!output) return [];

  const results: Array<{
    oldPath: string;
    newPath?: string;
    status: "deleted" | "renamed";
  }> = [];

  for (const line of output.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    const statusChar = parts[0]?.charAt(0);
    if (statusChar === "D") {
      results.push({ oldPath: parts[1] ?? "", status: "deleted" });
    } else if (statusChar === "R") {
      results.push({
        oldPath: parts[1] ?? "",
        newPath: parts[2],
        status: "renamed",
      });
    }
  }

  return results;
};

// ─── Infrastructure Filter (DRIFT-05) ──────────────────────────────────────

/**
 * Check if a file is an infrastructure file that should be ignored.
 *
 * Infrastructure files (tsconfig.json, package.json, etc.) are ignored
 * unless they contain structural changes (new path aliases, workspaces).
 *
 * @param filePath - File path to check
 * @returns true if the file should be ignored
 */
const isIgnoredInfraFile = (filePath: string): boolean => {
  const basename = filePath.split("/").pop() ?? "";
  return INFRASTRUCTURE_IGNORE_LIST.some((ignored) => basename === ignored);
};

/**
 * Check if a diff for an infrastructure file contains structural changes.
 *
 * Reads the actual diff content and looks for structural change patterns
 * (path aliases, workspaces, exports, etc.).
 *
 * @param filePath - Infrastructure file path
 * @param cwd - Working directory
 * @returns true if the diff contains structural changes
 */
const hasStructuralChanges = (filePath: string, cwd?: string): boolean => {
  const diffContent = runGit(["diff", "HEAD~1", "--", filePath], cwd);
  if (!diffContent) return false;

  // Only look at added/removed lines (not context)
  const changedLines = diffContent
    .split("\n")
    .filter((line) => line.startsWith("+") || line.startsWith("-"))
    .filter((line) => !line.startsWith("+++") && !line.startsWith("---"))
    .join("\n")
    .toLowerCase();

  return STRUCTURAL_CHANGE_PATTERNS.some((pattern) =>
    changedLines.includes(pattern.toLowerCase()),
  );
};

/**
 * Filter changed files, removing infrastructure files unless they have
 * structural changes.
 *
 * @param changedFiles - All changed files from git diff
 * @param cwd - Working directory
 * @returns Object with filtered files and ignored infra files
 */
export const filterInfrastructureFiles = (
  changedFiles: string[],
  cwd?: string,
): { filtered: string[]; ignored: string[] } => {
  const filtered: string[] = [];
  const ignored: string[] = [];

  for (const file of changedFiles) {
    if (isIgnoredInfraFile(file)) {
      if (hasStructuralChanges(file, cwd)) {
        filtered.push(file);
      } else {
        ignored.push(file);
      }
    } else {
      filtered.push(file);
    }
  }

  return { filtered, ignored };
};

// ─── Phase File Reference Matching ──────────────────────────────────────────

/**
 * Check if a changed file affects a phase by matching against its file references.
 *
 * Performs prefix matching: a phase referencing `src/drift/` is affected by
 * changes to `src/drift/__helpers/drift-checker.ts`.
 *
 * @param changedFile - A file that changed in the completed phase
 * @param phaseFilePaths - File paths referenced by the remaining phase
 * @returns true if the changed file matches any phase reference
 */
const fileMatchesPhase = (
  changedFile: string,
  phaseFilePaths: string[],
): boolean => {
  for (const ref of phaseFilePaths) {
    // Exact match
    if (changedFile === ref) return true;
    // The changed file is inside a referenced directory
    if (ref.endsWith("/") && changedFile.startsWith(ref)) return true;
    // The changed file matches a referenced file (with or without leading ./)
    const normalizedRef = ref.startsWith("./") ? ref.slice(2) : ref;
    const normalizedChanged = changedFile.startsWith("./")
      ? changedFile.slice(2)
      : changedFile;
    if (normalizedChanged === normalizedRef) return true;
    // Directory-level match: if ref is "src/skills/luca/lu.skill.ts"
    // and changed is "src/skills/luca/lu.skill.ts", that's an exact match.
    // If ref is "src/skills/" and changed starts with "src/skills/", match.
    if (normalizedChanged.startsWith(normalizedRef + "/")) return true;
    if (normalizedRef.startsWith(normalizedChanged + "/")) return true;
  }
  return false;
};

// ─── Main Drift Checker ─────────────────────────────────────────────────────

/**
 * Run a mechanical drift check after a phase completes.
 *
 * Compares git diff output from the completed phase against file references
 * in remaining phases. Detects deleted/renamed modules and modified files
 * that may invalidate phase assumptions.
 *
 * This is a zero-LLM check: purely mechanical file path comparison.
 * When drift is detected, the orchestrator spawns a reassessment agent
 * for semantic evaluation.
 *
 * @param completedPhaseDir - Path to the completed phase directory (unused currently, reserved for future)
 * @param remainingPhases - Phases remaining in the execution queue
 * @param cwd - Working directory for git commands
 * @returns DriftResult with drifted flag, affected phases, and details
 *
 * @example
 * ```typescript
 * import { checkDrift } from "~/drift";
 *
 * const result = checkDrift(
 *   ".planning/phases/265-per-phase-drift-detection/",
 *   [
 *     { id: 266, description: "Crash Recovery", filePaths: ["src/state/recovery.ts"] },
 *     { id: 267, description: "State Reset", filePaths: ["src/state/reset.ts"] },
 *   ]
 * );
 *
 * if (result.drifted) {
 *   console.log(`Drift detected: ${result.affectedPhases.length} phases affected`);
 * }
 * ```
 */
export const checkDrift = (
  completedPhaseDir: string,
  remainingPhases: PhaseInfo[],
  cwd?: string,
): DriftResult => {
  // 1. Get changed files from the completed phase commit
  const allChangedFiles = getChangedFiles(cwd);

  // 2. Filter infrastructure files (DRIFT-05)
  const { filtered: changedFiles, ignored: ignoredInfraFiles } =
    filterInfrastructureFiles(allChangedFiles, cwd);

  // 3. Get deleted/renamed files
  const deletedOrRenamed = getDeletedOrRenamed(cwd);

  // 4. Check each remaining phase for affected file references
  const affectedPhases: AffectedPhase[] = [];

  for (const phase of remainingPhases) {
    const reasons: DriftReason[] = [];

    // Check for deleted files that the phase references
    for (const dr of deletedOrRenamed) {
      if (fileMatchesPhase(dr.oldPath, phase.filePaths)) {
        if (dr.status === "deleted") {
          reasons.push({
            kind: "deleted",
            filePath: dr.oldPath,
            detail: `File "${dr.oldPath}" was deleted but is referenced by phase ${phase.id}`,
          });
        } else if (dr.status === "renamed") {
          reasons.push({
            kind: "renamed",
            filePath: dr.oldPath,
            newPath: dr.newPath,
            detail: `File "${dr.oldPath}" was renamed to "${dr.newPath ?? "unknown"}" but is referenced by phase ${phase.id}`,
          });
        }
      }
    }

    // Check for modified files that the phase references
    for (const file of changedFiles) {
      if (fileMatchesPhase(file, phase.filePaths)) {
        // Skip if already captured as deleted/renamed
        const alreadyCaptured = reasons.some((r) => r.filePath === file);
        if (!alreadyCaptured) {
          reasons.push({
            kind: "modified",
            filePath: file,
            detail: `File "${file}" was modified and is referenced by phase ${phase.id}`,
          });
        }
      }
    }

    if (reasons.length > 0) {
      affectedPhases.push({
        phaseId: phase.id,
        description: phase.description,
        reasons,
      });
    }
  }

  return {
    drifted: affectedPhases.length > 0,
    changedFiles,
    deletedOrRenamed,
    affectedPhases,
    totalPhasesChecked: remainingPhases.length,
    ignoredInfraFiles,
  };
};
