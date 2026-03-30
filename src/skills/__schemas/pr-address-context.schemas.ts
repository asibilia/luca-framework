/**
 * Shared context file schema for the pr-address sub-agent chain.
 *
 * All sub-agents (pr-fetch, pr-validate, pr-debate, pr-fix, pr-learn,
 * pr-respond) read/write a single JSON file at `/tmp/pr-address-context.json`.
 * Each sub-agent reads the full context via `readPrContext()`, extends its
 * section, and writes back via `writePrContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-agent treats as terminal failure).
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/223-anti-skip-pilot/01-CONTEXT.md Decision #1
 */
import { z } from "zod";

import { createContextHelpers } from "./context-helpers";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from pr-fetch sub-agent (Steps 0-1).
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
 * Output from pr-validate sub-agent (Steps 2-3-4).
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
 * Output from pr-debate sub-agent (Step 4.5).
 *
 * Contains debate results for split verdicts. This sub-agent is optional.
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
 * Output from pr-fix sub-agent (Steps 5-6-7).
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
 * Output from pr-learn sub-agent (Step 7.5).
 *
 * Contains learnings captured in MuninnDB. This sub-agent is optional.
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
 * Output from pr-respond sub-agent (Steps 8-9).
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
 * All sub-agent output sections are optional because they are populated
 * incrementally as each sub-agent completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const PrAddressContextSchema = z.object({
  context_version: z.literal(1),
  current_state: z.string().optional(),
  completed_states: z.array(z.string()).default([]),
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
 * Typed read/write helpers for the pr-address context file.
 *
 * Created via `createContextHelpers` factory. `readPrContext()`
 * validates the file via safeParse — callers MUST check `.success` and
 * treat `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * `writePrContext()` deep-merges a typed patch into the existing file.
 */
const { read: readPrContext, write: writePrContext } = createContextHelpers(
  PR_ADDRESS_CONTEXT_PATH,
  PrAddressContextSchema,
);
export { readPrContext, writePrContext };
