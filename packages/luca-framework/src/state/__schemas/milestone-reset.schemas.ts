/**
 * Zod schemas and types for cross-milestone state reset.
 *
 * Defines the result shape for milestone reset operations and
 * the readiness validation result for pre-reset checks.
 *
 * Uses snake_case for all schema fields per API conventions.
 *
 * @module luca-state/milestone-reset-schemas
 */
import { z } from "zod";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Maximum number of milestones allowed per session.
 *
 * Safety limit to prevent runaway sessions. After 3 milestones
 * the session must be manually restarted.
 */
export const MAX_MILESTONES_PER_SESSION = 3;

// ─── Milestone Reset Result ─────────────────────────────────────────────────

/**
 * Result of a successful milestone reset operation.
 *
 * Contains the preserved fields and metadata about what was archived.
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```typescript
 * const result: MilestoneResetResult = {
 *   session_id: "abc-123",
 *   git_workflow_preserved: true,
 *   routing_history_cleared: true,
 *   lock_reacquired: true,
 *   archived_milestone: "v2.0.0",
 *   reset_at: "2026-04-01T12:00:00Z",
 * };
 * ```
 */
export const milestoneResetResultSchema = z.object({
  session_id: z.string(),
  git_workflow_preserved: z.boolean(),
  routing_history_cleared: z.boolean(),
  lock_reacquired: z.boolean(),
  archived_milestone: z.string().optional(),
  reset_at: z.string(),
});

export type MilestoneResetResult = z.infer<typeof milestoneResetResultSchema>;

// ─── Milestone Readiness ────────────────────────────────────────────────────

/**
 * Validation result for milestone readiness checks.
 *
 * Determines whether the pipeline is ready to transition to the
 * next milestone. Checks that all phases passed and the session
 * has not exceeded the milestone count limit.
 *
 * Uses snake_case for API compatibility.
 *
 * @example
 * ```typescript
 * const readiness: MilestoneReadiness = {
 *   ready: false,
 *   reason: "Phase 42 has status 'failed'",
 *   milestone_count: 2,
 *   max_milestones: 3,
 * };
 * ```
 */
export const milestoneReadinessSchema = z.object({
  ready: z.boolean(),
  reason: z.string().optional(),
  milestone_count: z.number().int().nonnegative(),
  max_milestones: z.number().int().positive(),
});

export type MilestoneReadiness = z.infer<typeof milestoneReadinessSchema>;
