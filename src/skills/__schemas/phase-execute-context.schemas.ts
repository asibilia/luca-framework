/**
 * Shared context file schema for the phase-execute sub-agent chain.
 *
 * All sub-agents (phase-execute-waves, phase-execute-verify, phase-execute-review)
 * read/write a single JSON file at `/tmp/phase-execute-context.json`. Each
 * sub-agent reads the full context via `readPhaseExecuteContext()`, extends its
 * section, and writes back via `writePhaseExecuteContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-agent treats as terminal failure).
 *
 * **Pitfall 6:** phase-execute already uses luca-bridge transition events
 * (VERIFY_PASSED, LEARN_COMPLETE, PROCESS_DATA_COMPLETE, COMMIT_COMPLETE).
 * This context file tracks sub-agent-level granularity while the orchestrator
 * continues to emit bridge events at the phase level.
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/224-anti-skip-rollout/03-PLAN.md Task 2
 */
import { z } from "zod";

import { createContextHelpers } from "./context-helpers";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from phase-execute-waves sub-agent (Steps 1-4).
 *
 * Contains wave execution results: plan discovery, wave grouping, and
 * per-wave execution summaries.
 */
export const PhaseExecuteWavesOutputSchema = z.object({
  plans_discovered: z.number().default(0),
  waves_grouped: z.number().default(0),
  waves_executed: z.number().default(0),
  execution_summaries: z
    .array(
      z.object({
        wave_number: z.number(),
        plan_count: z.number(),
        status: z.string().default("pending"),
      }),
    )
    .default([]),
});

export type PhaseExecuteWavesOutput = z.infer<
  typeof PhaseExecuteWavesOutputSchema
>;

/**
 * Output from phase-execute-verify sub-agent (Steps 5-7).
 *
 * Contains verification loop results: harness execution, verify execution,
 * and fix iteration counts for both Loop A (harness) and Loop B (verify).
 */
export const PhaseExecuteVerifyOutputSchema = z.object({
  harness_ran: z.boolean().default(false),
  harness_passed: z.boolean().default(false),
  verify_ran: z.boolean().default(false),
  verify_passed: z.boolean().default(false),
  fix_iterations: z.number().default(0),
});

export type PhaseExecuteVerifyOutput = z.infer<
  typeof PhaseExecuteVerifyOutputSchema
>;

/**
 * Output from phase-execute-review sub-agent (Step 8).
 *
 * Contains code review swarm results: which reviewers were spawned,
 * their findings, an aggregated summary, and fix loop tracking fields.
 *
 * `review_fix_iterations` counts how many fix iterations were attempted
 * by the review fix loop. `review_critical_resolved` is true when the
 * final review pass reports CRITICAL_COUNT == 0.
 */
export const PhaseExecuteReviewOutputSchema = z.object({
  reviewers_spawned: z.array(z.string()).default([]),
  review_findings: z
    .array(
      z.object({
        reviewer: z.string(),
        severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("LOW"),
        finding: z.string().default(""),
      }),
    )
    .default([]),
  review_summary: z.string().default(""),
  review_fix_iterations: z.number().default(0),
  review_critical_resolved: z.boolean().default(false),
});

export type PhaseExecuteReviewOutput = z.infer<
  typeof PhaseExecuteReviewOutputSchema
>;

// ─── Top-Level Context Schema ───────────────────────────────────────────────

/**
 * Top-level schema for the shared phase-execute context file.
 *
 * All sub-agent output sections are optional because they are populated
 * incrementally as each sub-agent completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const PhaseExecuteContextSchema = z.object({
  context_version: z.literal(1),
  current_state: z.string().optional(),
  completed_states: z.array(z.string()).default([]),
  phase_execute_waves: PhaseExecuteWavesOutputSchema.optional(),
  phase_execute_verify: PhaseExecuteVerifyOutputSchema.optional(),
  phase_execute_review: PhaseExecuteReviewOutputSchema.optional(),
});

export type PhaseExecuteContext = z.infer<typeof PhaseExecuteContextSchema>;

// ─── Context File Path ──────────────────────────────────────────────────────

/** Well-known path for the shared context file (session-ephemeral). */
export const PHASE_EXECUTE_CONTEXT_PATH = "/tmp/phase-execute-context.json";

// ─── Context File Helpers ───────────────────────────────────────────────────

/**
 * Typed read/write helpers for the phase-execute context file.
 *
 * Created via `createContextHelpers` factory. `readPhaseExecuteContext()`
 * validates the file via safeParse — callers MUST check `.success` and
 * treat `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * `writePhaseExecuteContext()` deep-merges a typed patch into the existing file.
 */
const { read: readPhaseExecuteContext, write: writePhaseExecuteContext } =
  createContextHelpers(PHASE_EXECUTE_CONTEXT_PATH, PhaseExecuteContextSchema);
export { readPhaseExecuteContext, writePhaseExecuteContext };
