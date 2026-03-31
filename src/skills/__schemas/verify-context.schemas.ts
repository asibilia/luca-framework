/**
 * Shared context file schema for the verify sub-agent chain.
 *
 * All sub-agents (verify-extract, verify-test, verify-diagnose, verify-review)
 * read/write a single JSON file at `/tmp/verify-context.json`. Each sub-agent
 * reads the full context via `readVerifyContext()`, extends its section, and
 * writes back via `writeVerifyContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-agent treats as terminal failure).
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/224-anti-skip-rollout/02-PLAN.md Task 2
 */
import { z } from "zod";

import { createContextHelpers } from "./context-helpers";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from verify-extract sub-agent (Steps 1-4).
 *
 * Contains summary extraction results: how many summaries and deliverables
 * were found, and the path to the generated UAT template.
 */
export const VerifyExtractOutputSchema = z.object({
  summaries_found: z.number().default(0),
  deliverables_extracted: z.number().default(0),
  uat_template_path: z.string().default(""),
});

export type VerifyExtractOutput = z.infer<typeof VerifyExtractOutputSchema>;

/**
 * Output from verify-test sub-agent (Steps 5-7).
 *
 * Contains UAT test results: how many tests were presented, how many
 * passed/failed, and the critical `issues_found` flag that the orchestrator
 * uses for path decision (SKIP_DIAGNOSE vs DIAGNOSE_COMPLETE).
 */
export const VerifyTestOutputSchema = z.object({
  tests_presented: z.number().default(0),
  tests_passed: z.number().default(0),
  tests_failed: z.number().default(0),
  issues_found: z.boolean().default(false),
});

export type VerifyTestOutput = z.infer<typeof VerifyTestOutputSchema>;

/**
 * Output from verify-diagnose sub-agent (Step 8).
 *
 * Contains diagnosis results: how many debuggers were spawned, how many
 * fix plans were created, and whether the plan checker validated them.
 * This sub-agent only runs if UAT issues were found (Path B).
 */
export const VerifyDiagnoseOutputSchema = z.object({
  debuggers_spawned: z.number().default(0),
  fix_plans_created: z.number().default(0),
  plan_checker_ran: z.boolean().default(false),
});

export type VerifyDiagnoseOutput = z.infer<typeof VerifyDiagnoseOutputSchema>;

/**
 * Output from verify-review sub-agent (Steps 9-12).
 *
 * Contains code review results: how many reviewers were spawned and
 * the aggregated review findings. This sub-agent only runs if UAT passed
 * (Path A, via SKIP_DIAGNOSE).
 */
export const VerifyReviewOutputSchema = z.object({
  reviewers_spawned: z.number().default(0),
  review_findings: z
    .array(
      z.object({
        reviewer: z.string(),
        severity: z.string().default(""),
        finding: z.string().default(""),
      }),
    )
    .default([]),
});

export type VerifyReviewOutput = z.infer<typeof VerifyReviewOutputSchema>;

// ─── Top-Level Context Schema ───────────────────────────────────────────────

/**
 * Top-level schema for the shared verify context file.
 *
 * All sub-agent output sections are optional because they are populated
 * incrementally as each sub-agent completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const VerifyContextSchema = z.object({
  context_version: z.literal(1),
  current_state: z.string().optional(),
  completed_states: z.array(z.string()).default([]),
  verify_extract: VerifyExtractOutputSchema.optional(),
  verify_test: VerifyTestOutputSchema.optional(),
  verify_diagnose: VerifyDiagnoseOutputSchema.optional(),
  verify_review: VerifyReviewOutputSchema.optional(),
});

export type VerifyContext = z.infer<typeof VerifyContextSchema>;

// ─── Context File Path ──────────────────────────────────────────────────────

/** Well-known path for the shared context file (session-ephemeral). */
export const VERIFY_CONTEXT_PATH = "/tmp/verify-context.json";

// ─── Context File Helpers ───────────────────────────────────────────────────

/**
 * Typed read/write helpers for the verify context file.
 *
 * Created via `createContextHelpers` factory. `readVerifyContext()`
 * validates the file via safeParse — callers MUST check `.success` and
 * treat `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * `writeVerifyContext()` deep-merges a typed patch into the existing file.
 */
const { read: readVerifyContext, write: writeVerifyContext } =
  createContextHelpers(VERIFY_CONTEXT_PATH, VerifyContextSchema);
export { readVerifyContext, writeVerifyContext };
