/**
 * Shared context file schema for the phase-execute sub-skill chain.
 *
 * All sub-skills (phase-execute-waves, phase-execute-verify, phase-execute-review)
 * read/write a single JSON file at `/tmp/phase-execute-context.json`. Each
 * sub-skill reads the full context via `readPhaseExecuteContext()`, extends its
 * section, and writes back via `writePhaseExecuteContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-skill treats as terminal failure).
 *
 * **Pitfall 6:** phase-execute already uses luca-bridge transition events
 * (VERIFY_PASSED, LEARN_COMPLETE, PROCESS_DATA_COMPLETE, COMMIT_COMPLETE).
 * This context file tracks sub-skill-level granularity while the orchestrator
 * continues to emit bridge events at the phase level.
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/224-anti-skip-rollout/03-PLAN.md Task 2
 */
import { z } from "zod";
import merge from "lodash/merge";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from phase-execute-waves sub-skill (Steps 1-4).
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
 * Output from phase-execute-verify sub-skill (Steps 5-7).
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
 * Output from phase-execute-review sub-skill (Step 8).
 *
 * Contains code review swarm results: which reviewers were spawned,
 * their findings, and an aggregated summary.
 */
export const PhaseExecuteReviewOutputSchema = z.object({
  reviewers_spawned: z.array(z.string()).default([]),
  review_findings: z
    .array(
      z.object({
        reviewer: z.string(),
        severity: z.string().default("info"),
        finding: z.string().default(""),
      }),
    )
    .default([]),
  review_summary: z.string().default(""),
});

export type PhaseExecuteReviewOutput = z.infer<
  typeof PhaseExecuteReviewOutputSchema
>;

// ─── Top-Level Context Schema ───────────────────────────────────────────────

/**
 * Top-level schema for the shared phase-execute context file.
 *
 * All sub-skill output sections are optional because they are populated
 * incrementally as each sub-skill completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const PhaseExecuteContextSchema = z.object({
  context_version: z.literal(1),
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
 * Read the phase-execute context file and validate it via safeParse.
 *
 * Returns the safeParse result directly. Callers MUST check `.success`
 * and treat `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * @returns safeParse result with `success: true` and `data`, or `success: false` and `error`
 *
 * @example
 * ```typescript
 * const result = await readPhaseExecuteContext();
 * if (!result.success) {
 *   // ABORT: context file missing or malformed
 *   return;
 * }
 * const context = result.data;
 * ```
 */
export async function readPhaseExecuteContext(): Promise<
  | { success: true; data: PhaseExecuteContext }
  | { success: false; error: z.ZodError }
> {
  try {
    const file = Bun.file(PHASE_EXECUTE_CONTEXT_PATH);
    const exists = await file.exists();
    if (!exists) {
      // File does not exist — return a failed parse
      const result = PhaseExecuteContextSchema.safeParse({});
      // This will fail because context_version is missing
      return result as
        | { success: true; data: PhaseExecuteContext }
        | { success: false; error: z.ZodError };
    }
    const raw = await file.json();
    const result = PhaseExecuteContextSchema.safeParse(raw);
    return result as
      | { success: true; data: PhaseExecuteContext }
      | { success: false; error: z.ZodError };
  } catch {
    // JSON parse error or file read error — return failed parse
    const result = PhaseExecuteContextSchema.safeParse({});
    return result as
      | { success: true; data: PhaseExecuteContext }
      | { success: false; error: z.ZodError };
  }
}

/**
 * Write a partial update to the phase-execute context file.
 *
 * Reads the current file (if it exists), deep-merges the patch via lodash
 * `merge`, and writes back. Creates the file with `context_version: 1`
 * if it does not yet exist.
 *
 * @param patch - Partial context to merge into the existing context
 *
 * @example
 * ```typescript
 * await writePhaseExecuteContext({
 *   phase_execute_waves: {
 *     plans_discovered: 3,
 *     waves_grouped: 2,
 *     waves_executed: 2,
 *   },
 * });
 * ```
 */
export async function writePhaseExecuteContext(
  patch: Partial<Omit<PhaseExecuteContext, "context_version">>,
): Promise<void> {
  let current: Record<string, unknown> = { context_version: 1 };

  try {
    const file = Bun.file(PHASE_EXECUTE_CONTEXT_PATH);
    const exists = await file.exists();
    if (exists) {
      const raw = await file.json();
      if (raw && typeof raw === "object") {
        current = raw as Record<string, unknown>;
      }
    }
  } catch {
    // File doesn't exist or can't be read — start fresh
  }

  // Ensure context_version is always 1
  current.context_version = 1;

  // Deep merge the patch into current context
  const merged = merge({}, current, patch);

  await Bun.write(PHASE_EXECUTE_CONTEXT_PATH, JSON.stringify(merged, null, 2));
}
