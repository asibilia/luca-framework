/**
 * Shared context file schema for the verify sub-skill chain.
 *
 * All sub-skills (verify-extract, verify-test, verify-diagnose, verify-review)
 * read/write a single JSON file at `/tmp/verify-context.json`. Each sub-skill
 * reads the full context via `readVerifyContext()`, extends its section, and
 * writes back via `writeVerifyContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-skill treats as terminal failure).
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/224-anti-skip-rollout/02-PLAN.md Task 2
 */
import { z } from "zod";
import merge from "lodash/merge";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from verify-extract sub-skill (Steps 1-4).
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
 * Output from verify-test sub-skill (Steps 5-7).
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
 * Output from verify-diagnose sub-skill (Step 8).
 *
 * Contains diagnosis results: how many debuggers were spawned, how many
 * fix plans were created, and whether the plan checker validated them.
 * This sub-skill only runs if UAT issues were found (Path B).
 */
export const VerifyDiagnoseOutputSchema = z.object({
  debuggers_spawned: z.number().default(0),
  fix_plans_created: z.number().default(0),
  plan_checker_ran: z.boolean().default(false),
});

export type VerifyDiagnoseOutput = z.infer<typeof VerifyDiagnoseOutputSchema>;

/**
 * Output from verify-review sub-skill (Steps 9-12).
 *
 * Contains code review results: how many reviewers were spawned and
 * the aggregated review findings. This sub-skill only runs if UAT passed
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
 * All sub-skill output sections are optional because they are populated
 * incrementally as each sub-skill completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const VerifyContextSchema = z.object({
  context_version: z.literal(1),
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
 * Read the verify context file and validate it via safeParse.
 *
 * Returns the safeParse result directly. Callers MUST check `.success`
 * and treat `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * @returns safeParse result with `success: true` and `data`, or `success: false` and `error`
 *
 * @example
 * ```typescript
 * const result = await readVerifyContext();
 * if (!result.success) {
 *   // ABORT: context file missing or malformed
 *   return;
 * }
 * const context = result.data;
 * ```
 */
export async function readVerifyContext(): Promise<
  { success: true; data: VerifyContext } | { success: false; error: z.ZodError }
> {
  try {
    const file = Bun.file(VERIFY_CONTEXT_PATH);
    const exists = await file.exists();
    if (!exists) {
      // File does not exist — return a failed parse
      const result = VerifyContextSchema.safeParse({});
      // This will fail because context_version is missing
      return result as
        | { success: true; data: VerifyContext }
        | { success: false; error: z.ZodError };
    }
    const raw = await file.json();
    const result = VerifyContextSchema.safeParse(raw);
    return result as
      | { success: true; data: VerifyContext }
      | { success: false; error: z.ZodError };
  } catch {
    // JSON parse error or file read error — return failed parse
    const result = VerifyContextSchema.safeParse({});
    return result as
      | { success: true; data: VerifyContext }
      | { success: false; error: z.ZodError };
  }
}

/**
 * Write a partial update to the verify context file.
 *
 * Reads the current file (if it exists), deep-merges the patch via lodash
 * `merge`, and writes back. Creates the file with `context_version: 1`
 * if it does not yet exist.
 *
 * @param patch - Partial context to merge into the existing context
 *
 * @example
 * ```typescript
 * await writeVerifyContext({
 *   verify_extract: {
 *     summaries_found: 3,
 *     deliverables_extracted: 12,
 *     uat_template_path: ".planning/phases/99-feature/99-UAT.md",
 *   },
 * });
 * ```
 */
export async function writeVerifyContext(
  patch: Partial<Omit<VerifyContext, "context_version">>,
): Promise<void> {
  let current: Record<string, unknown> = { context_version: 1 };

  try {
    const file = Bun.file(VERIFY_CONTEXT_PATH);
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

  await Bun.write(VERIFY_CONTEXT_PATH, JSON.stringify(merged, null, 2));
}
