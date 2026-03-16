/**
 * Commit command pattern matching utilities.
 *
 * Shared helpers for hooks that need to detect commit commands in order
 * to fast-exit on non-commit Bash tool invocations.
 *
 * @module commit-utils
 */

// ─── Commit Patterns ─────────────────────────────────────────────────────────

const COMMIT_PATTERNS = [
  "git commit",
  "git merge",
  "bun run commit",
  "bunx commit",
  "bunx --bun commit",
];

/**
 * Returns true if the given shell command string is a commit-related command.
 *
 * Matches against a fixed set of patterns that trigger pre-commit quality gates.
 * Uses substring matching so partial commands (e.g. `git commit -m "msg"`) match.
 *
 * @param cmd - The shell command string to test
 * @returns true if the command should trigger commit-gate hooks
 *
 * @example
 * ```typescript
 * isCommitCommand('git commit -m "fix bug"') // true
 * isCommitCommand('git status')              // false
 * isCommitCommand('bun run commit')          // true
 * ```
 */
export const isCommitCommand = (cmd: string): boolean =>
  COMMIT_PATTERNS.some((p) => cmd.includes(p));
