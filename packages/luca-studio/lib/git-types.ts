/**
 * Shared type definitions for git API routes.
 *
 * Centralizes types used across git/history, git/publish, and git/revert
 * routes to avoid inline type duplication.
 */

/**
 * Schema for a single commit entry in the git history response.
 *
 * Returned by GET /api/git/history as an element of the `commits` array.
 *
 * @example
 * ```typescript
 * const commit: HistoryCommit = {
 *   sha: "abc123def456...",
 *   message: "update lu-router agent",
 *   date: "2026-03-27T10:00:00-04:00",
 *   author: "Alec Sibilia",
 *   files: ["src/agents/luca/lu-router.agent.ts"],
 * }
 * ```
 */
export type HistoryCommit = {
    sha: string
    message: string
    date: string
    author: string
    files: string[]
}
