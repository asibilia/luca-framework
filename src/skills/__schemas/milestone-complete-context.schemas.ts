/**
 * Shared context file schema for the milestone-complete sub-skill chain.
 *
 * All sub-skills (milestone-learn, milestone-prune, milestone-shadow-gate,
 * milestone-archive, milestone-finalize) read/write a single JSON file at
 * `/tmp/milestone-complete-context.json`. Each sub-skill reads the full
 * context via `readMilestoneCompleteContext()`, extends its section, and
 * writes back via `writeMilestoneCompleteContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-skill treats as terminal failure).
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/224-anti-skip-rollout/01-PLAN.md Task 2
 */
import { z } from "zod";
import merge from "lodash/merge";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from milestone-learn sub-skill (Step 0).
 *
 * Contains learning extraction results: whether learnings were extracted
 * and how many engrams were captured in MuninnDB.
 */
export const MilestoneLearnOutputSchema = z.object({
  learnings_extracted: z.boolean().default(false),
  engrams_captured: z.number().default(0),
  patterns_validated: z.number().default(0),
  decisions_established: z.number().default(0),
  pitfalls_validated: z.number().default(0),
});

export type MilestoneLearnOutput = z.infer<typeof MilestoneLearnOutputSchema>;

/**
 * Output from milestone-prune sub-skill (Step 0.5).
 *
 * Contains stale memory detection and pruning results.
 */
export const MilestonePruneOutputSchema = z.object({
  stale_memories_found: z.number().default(0),
  pruned_count: z.number().default(0),
  consolidated_count: z.number().default(0),
  total_analyzed: z.number().default(0),
});

export type MilestonePruneOutput = z.infer<typeof MilestonePruneOutputSchema>;

/**
 * Output from milestone-shadow-gate sub-skill (Step 0.7).
 *
 * Contains shadow debt scan results. This sub-skill is optional
 * (orchestrator sends SKIP_SCAN if shadow scanning is disabled).
 */
export const MilestoneShadowGateOutputSchema = z.object({
  shadow_scan_ran: z.boolean().default(false),
  violations_found: z.number().default(0),
  critical_count: z.number().default(0),
  high_count: z.number().default(0),
  gate_result: z.string().default("skipped"),
});

export type MilestoneShadowGateOutput = z.infer<
  typeof MilestoneShadowGateOutputSchema
>;

/**
 * Output from milestone-archive sub-skill (Steps 1-7.5).
 *
 * Contains archive, stats, and retrospective results. This is the largest
 * sub-skill, covering milestone memory archival, session cleanup, stats
 * gathering, accomplishment extraction, file archival, PROJECT.md update,
 * GitHub milestone creation, and process retrospective.
 */
export const MilestoneArchiveOutputSchema = z.object({
  archived: z.boolean().default(false),
  stats_generated: z.boolean().default(false),
  retro_written: z.boolean().default(false),
  roadmap_archived: z.string().default(""),
  requirements_archived: z.string().default(""),
  github_milestone_created: z.boolean().default(false),
  phase_count: z.number().default(0),
  plan_count: z.number().default(0),
  commit_count: z.number().default(0),
});

export type MilestoneArchiveOutput = z.infer<
  typeof MilestoneArchiveOutputSchema
>;

/**
 * Output from milestone-finalize sub-skill (Steps 8-9).
 *
 * Contains commit, tag, and divergent mode advisory results.
 */
export const MilestoneFinalizeOutputSchema = z.object({
  committed: z.boolean().default(false),
  tagged: z.boolean().default(false),
  tag_name: z.string().default(""),
  divergent_mode_entered: z.boolean().default(false),
});

export type MilestoneFinalizeOutput = z.infer<
  typeof MilestoneFinalizeOutputSchema
>;

// ─── Top-Level Context Schema ───────────────────────────────────────────────

/**
 * Top-level schema for the shared milestone-complete context file.
 *
 * All sub-skill output sections are optional because they are populated
 * incrementally as each sub-skill completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const MilestoneCompleteContextSchema = z.object({
  context_version: z.literal(1),
  milestone_learn: MilestoneLearnOutputSchema.optional(),
  milestone_prune: MilestonePruneOutputSchema.optional(),
  milestone_shadow_gate: MilestoneShadowGateOutputSchema.optional(),
  milestone_archive: MilestoneArchiveOutputSchema.optional(),
  milestone_finalize: MilestoneFinalizeOutputSchema.optional(),
});

export type MilestoneCompleteContext = z.infer<
  typeof MilestoneCompleteContextSchema
>;

// ─── Context File Path ──────────────────────────────────────────────────────

/** Well-known path for the shared context file (session-ephemeral). */
export const MILESTONE_COMPLETE_CONTEXT_PATH =
  "/tmp/milestone-complete-context.json";

// ─── Context File Helpers ───────────────────────────────────────────────────

/**
 * Read the milestone-complete context file and validate it via safeParse.
 *
 * Returns the safeParse result directly. Callers MUST check `.success`
 * and treat `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * @returns safeParse result with `success: true` and `data`, or `success: false` and `error`
 *
 * @example
 * ```typescript
 * const result = await readMilestoneCompleteContext();
 * if (!result.success) {
 *   // ABORT: context file missing or malformed
 *   return;
 * }
 * const context = result.data;
 * ```
 */
export async function readMilestoneCompleteContext(): Promise<
  | { success: true; data: MilestoneCompleteContext }
  | { success: false; error: z.ZodError }
> {
  try {
    const file = Bun.file(MILESTONE_COMPLETE_CONTEXT_PATH);
    const exists = await file.exists();
    if (!exists) {
      // File does not exist — return a failed parse
      const result = MilestoneCompleteContextSchema.safeParse({});
      // This will fail because context_version is missing
      return result as
        | { success: true; data: MilestoneCompleteContext }
        | { success: false; error: z.ZodError };
    }
    const raw = await file.json();
    const result = MilestoneCompleteContextSchema.safeParse(raw);
    return result as
      | { success: true; data: MilestoneCompleteContext }
      | { success: false; error: z.ZodError };
  } catch {
    // JSON parse error or file read error — return failed parse
    const result = MilestoneCompleteContextSchema.safeParse({});
    return result as
      | { success: true; data: MilestoneCompleteContext }
      | { success: false; error: z.ZodError };
  }
}

/**
 * Write a partial update to the milestone-complete context file.
 *
 * Reads the current file (if it exists), deep-merges the patch via lodash
 * `merge`, and writes back. Creates the file with `context_version: 1`
 * if it does not yet exist.
 *
 * @param patch - Partial context to merge into the existing context
 *
 * @example
 * ```typescript
 * await writeMilestoneCompleteContext({
 *   milestone_learn: {
 *     learnings_extracted: true,
 *     engrams_captured: 3,
 *   },
 * });
 * ```
 */
export async function writeMilestoneCompleteContext(
  patch: Partial<Omit<MilestoneCompleteContext, "context_version">>,
): Promise<void> {
  let current: Record<string, unknown> = { context_version: 1 };

  try {
    const file = Bun.file(MILESTONE_COMPLETE_CONTEXT_PATH);
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

  await Bun.write(
    MILESTONE_COMPLETE_CONTEXT_PATH,
    JSON.stringify(merged, null, 2),
  );
}
