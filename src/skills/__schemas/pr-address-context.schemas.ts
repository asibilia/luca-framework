/**
 * Shared context file schema for the pr-address sub-skill chain.
 *
 * All sub-skills (pr-fetch, pr-validate, pr-debate, pr-fix, pr-learn,
 * pr-respond) read/write a single JSON file at `/tmp/pr-address-context.json`.
 * Each sub-skill reads the full context via `readPrContext()`, extends its
 * section, and writes back via `writePrContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-skill treats as terminal failure).
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/223-anti-skip-pilot/01-CONTEXT.md Decision #1
 */
import { z } from "zod";
import merge from "lodash/merge";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from pr-fetch sub-skill (Steps 0-1).
 *
 * Contains raw PR data fetched from GitHub: comments, reviews, and diff.
 */
export const PrFetchOutputSchema = z.object({
  pr_number: z.number(),
  repo: z.string(),
  review_comments: z.array(z.record(z.string(), z.unknown())).default([]),
  issue_comments: z.array(z.record(z.string(), z.unknown())).default([]),
  reviews: z.array(z.record(z.string(), z.unknown())).default([]),
  diff: z.string().default(""),
  actionable_comments: z.array(z.record(z.string(), z.unknown())).default([]),
});

export type PrFetchOutput = z.infer<typeof PrFetchOutputSchema>;

/**
 * Output from pr-validate sub-skill (Steps 2-3-4).
 *
 * Contains categorized and validated concerns from reviewer agents.
 */
export const PrValidateOutputSchema = z.object({
  valid_concerns: z
    .array(
      z.object({
        comment_id: z.string(),
        category: z.string(),
        severity: z.string(),
        reasoning: z.string(),
        suggested_fix: z.string().default(""),
        comment_text: z.string().default(""),
        file_path: z.string().default(""),
      }),
    )
    .default([]),
  disputed_concerns: z
    .array(
      z.object({
        comment_id: z.string(),
        category: z.string(),
        reasoning: z.string(),
        disagree_response: z.string().default(""),
        comment_text: z.string().default(""),
      }),
    )
    .default([]),
  informational: z
    .array(
      z.object({
        comment_id: z.string(),
        category: z.string(),
        note: z.string().default(""),
        comment_text: z.string().default(""),
      }),
    )
    .default([]),
  split_verdicts: z
    .array(
      z.object({
        comment_id: z.string(),
        split_ratio: z.string(),
        majority_position: z.string(),
        dissent_position: z.string(),
        validators: z.array(z.record(z.string(), z.unknown())).default([]),
      }),
    )
    .default([]),
});

export type PrValidateOutput = z.infer<typeof PrValidateOutputSchema>;

/**
 * Output from pr-debate sub-skill (Step 4.5).
 *
 * Contains debate results for split verdicts. This sub-skill is optional.
 */
export const PrDebateOutputSchema = z.object({
  debate_results: z
    .array(
      z.object({
        comment_id: z.string(),
        split_ratio: z.string(),
        dissenter_argument: z.string().default(""),
        majority_response: z.string().default(""),
        recommendation: z.string().default(""),
        confidence: z.string().default(""),
        deferred_to_human: z.boolean().default(false),
      }),
    )
    .default([]),
});

export type PrDebateOutput = z.infer<typeof PrDebateOutputSchema>;

/**
 * Output from pr-fix sub-skill (Steps 5-6-7).
 *
 * Contains fix tracking: which comments were addressed, commit hashes,
 * files modified, and verification status.
 */
export const PrFixOutputSchema = z.object({
  fix_tracking: z
    .array(
      z.object({
        comment_id: z.string(),
        commit_hash: z.string().default(""),
        files_modified: z.array(z.string()).default([]),
        verified: z.boolean().default(false),
        fix_description: z.string().default(""),
      }),
    )
    .default([]),
});

export type PrFixOutput = z.infer<typeof PrFixOutputSchema>;

/**
 * Output from pr-learn sub-skill (Step 7.5).
 *
 * Contains learnings captured in MuninnDB. This sub-skill is optional.
 */
export const PrLearnOutputSchema = z.object({
  learnings_captured: z
    .array(
      z.object({
        concept: z.string(),
        vault: z.string().default("default"),
        summary: z.string().default(""),
      }),
    )
    .default([]),
});

export type PrLearnOutput = z.infer<typeof PrLearnOutputSchema>;

/**
 * Output from pr-respond sub-skill (Steps 8-9).
 *
 * Contains response tracking: which comments received replies,
 * whether the summary was posted, and whether changes were pushed.
 */
export const PrRespondOutputSchema = z.object({
  responses_posted: z
    .array(
      z.object({
        comment_id: z.string(),
        response_type: z.string().default(""),
        posted: z.boolean().default(false),
      }),
    )
    .default([]),
  summary_posted: z.boolean().default(false),
  pushed: z.boolean().default(false),
});

export type PrRespondOutput = z.infer<typeof PrRespondOutputSchema>;

// ─── Top-Level Context Schema ───────────────────────────────────────────────

/**
 * Top-level schema for the shared pr-address context file.
 *
 * All sub-skill output sections are optional because they are populated
 * incrementally as each sub-skill completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const PrAddressContextSchema = z.object({
  context_version: z.literal(1),
  pr_fetch: PrFetchOutputSchema.optional(),
  pr_validate: PrValidateOutputSchema.optional(),
  pr_debate: PrDebateOutputSchema.optional(),
  pr_fix: PrFixOutputSchema.optional(),
  pr_learn: PrLearnOutputSchema.optional(),
  pr_respond: PrRespondOutputSchema.optional(),
});

export type PrAddressContext = z.infer<typeof PrAddressContextSchema>;

// ─── Context File Path ──────────────────────────────────────────────────────

/** Well-known path for the shared context file (session-ephemeral). */
export const PR_ADDRESS_CONTEXT_PATH = "/tmp/pr-address-context.json";

// ─── Context File Helpers ───────────────────────────────────────────────────

/**
 * Read the pr-address context file and validate it via safeParse.
 *
 * Returns the safeParse result directly. Callers MUST check `.success`
 * and treat `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * @returns safeParse result with `success: true` and `data`, or `success: false` and `error`
 *
 * @example
 * ```typescript
 * const result = await readPrContext();
 * if (!result.success) {
 *   // ABORT: context file missing or malformed
 *   return;
 * }
 * const context = result.data;
 * ```
 */
export async function readPrContext(): Promise<
  | { success: true; data: PrAddressContext }
  | { success: false; error: z.ZodError }
> {
  try {
    const file = Bun.file(PR_ADDRESS_CONTEXT_PATH);
    const exists = await file.exists();
    if (!exists) {
      // File does not exist — return a failed parse
      const result = PrAddressContextSchema.safeParse({});
      // This will fail because context_version is missing
      return result as
        | { success: true; data: PrAddressContext }
        | { success: false; error: z.ZodError };
    }
    const raw = await file.json();
    const result = PrAddressContextSchema.safeParse(raw);
    return result as
      | { success: true; data: PrAddressContext }
      | { success: false; error: z.ZodError };
  } catch {
    // JSON parse error or file read error — return failed parse
    const result = PrAddressContextSchema.safeParse({});
    return result as
      | { success: true; data: PrAddressContext }
      | { success: false; error: z.ZodError };
  }
}

/**
 * Write a partial update to the pr-address context file.
 *
 * Reads the current file (if it exists), deep-merges the patch via lodash
 * `merge`, and writes back. Creates the file with `context_version: 1`
 * if it does not yet exist.
 *
 * @param patch - Partial context to merge into the existing context
 *
 * @example
 * ```typescript
 * await writePrContext({
 *   pr_fetch: {
 *     pr_number: 123,
 *     repo: "owner/repo",
 *     review_comments: [...],
 *   },
 * });
 * ```
 */
export async function writePrContext(
  patch: Partial<Omit<PrAddressContext, "context_version">>,
): Promise<void> {
  let current: Record<string, unknown> = { context_version: 1 };

  try {
    const file = Bun.file(PR_ADDRESS_CONTEXT_PATH);
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

  await Bun.write(PR_ADDRESS_CONTEXT_PATH, JSON.stringify(merged, null, 2));
}
