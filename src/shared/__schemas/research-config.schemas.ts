/**
 * Research system configuration schemas for v2 workflow.
 *
 * Controls parallel research, review loops, graduation, and per-task recall.
 * All fields have defaults that match v1 behavior (features disabled or
 * conservative). Uses camelCase for all keys per existing config convention
 * (this is internal config, not an API payload -- Decision 9).
 *
 * When `workflow.version` is "v1", this section is ignored entirely.
 * When `workflow.version` is "v2", individual features can be toggled.
 *
 * @example
 * ```typescript
 * import { ResearchConfigSchema } from "~/shared";
 *
 * // Parse with all defaults (matches v1 behavior)
 * const defaults = ResearchConfigSchema.parse({});
 *
 * // Parse with partial overrides
 * const config = ResearchConfigSchema.parse({
 *   parallelResearchers: 4,
 *   reviewLoop: { maxIterations: 3 },
 * });
 * ```
 */
import { z } from "zod";

/**
 * Research system configuration for v2 workflow.
 *
 * Controls parallel research, review loops, graduation, and per-task recall.
 * All fields have defaults that match v1 behavior (features disabled).
 * Uses camelCase for all keys per existing config convention (Decision 9).
 *
 * When `workflow.version` is "v1", this section is ignored entirely.
 * When `workflow.version` is "v2", individual features can be toggled.
 */
export const ResearchConfigSchema = z.object({
  /**
   * Number of parallel researcher agents to spawn.
   * Set to 4 for full v2 multi-agent research.
   * The complexity matrix does NOT override this -- researcher/reviewer
   * counts are always 4/3 at all complexity levels (Decision 13).
   */
  parallelResearchers: z.number().int().positive().default(4),

  /**
   * Research review loop configuration.
   */
  reviewLoop: z
    .object({
      /**
       * Maximum iterations before escalation.
       * Overridden per-complexity by complexity.matrix.*.researchReviewIterations.
       */
      maxIterations: z.number().int().positive().default(3),

      /**
       * Whether to continue looping for IMPORTANT findings (not just CRITICAL).
       * When true, loop continues if iteration < max and IMPORTANT gaps remain.
       */
      continueForImportant: z.boolean().default(true),
    })
    .default(() => ({ maxIterations: 3, continueForImportant: true })),

  /**
   * Plan review loop configuration.
   */
  planReviewLoop: z
    .object({
      /**
       * Maximum iterations before escalation.
       * Overridden per-complexity by complexity.matrix.*.planReviewIterations.
       */
      maxIterations: z.number().int().positive().default(2),
    })
    .default(() => ({ maxIterations: 2 })),

  /**
   * Graduation configuration.
   */
  graduation: z
    .object({
      /**
       * Minimum confidence level for graduation.
       * Only HIGH and MEDIUM confidence findings graduate.
       */
      confidenceThreshold: z.enum(["HIGH", "MEDIUM"]).default("MEDIUM"),

      /**
       * Scoring threshold for the weighted sum formula.
       * score = confidence * 0.40 + actionability * 0.35 + uniqueness * 0.25
       * Findings below this threshold are filtered out.
       */
      scoringThreshold: z.number().min(0).max(1).default(0.55),

      /**
       * Whether to auto-cleanup research:* engrams after milestone completion.
       */
      autoCleanupAfterMilestone: z.boolean().default(false),
    })
    .default(() => ({
      confidenceThreshold: "MEDIUM" as const,
      scoringThreshold: 0.55,
      autoCleanupAfterMilestone: false,
    })),

  /**
   * Per-task recall configuration for executor.
   */
  perTaskRecall: z
    .object({
      /**
       * Whether per-task MuninnDB recall is enabled.
       * When false, executor receives full plan context (v1 behavior).
       * Requires graduation to produce engrams first.
       */
      enabled: z.boolean().default(true),

      /**
       * Maximum engrams to recall per task.
       * Limits context injection size.
       */
      maxEngramsPerTask: z.number().int().positive().default(5),
    })
    .default(() => ({ enabled: true, maxEngramsPerTask: 5 })),
});

/** Inferred TypeScript type for the research config section. */
export type ResearchConfig = z.infer<typeof ResearchConfigSchema>;

/**
 * Refined research config with cross-field validation.
 *
 * Enforces logical constraints:
 * - perTaskRecall requires graduation scoring to be configured sensibly
 *   (nothing to recall without graduated engrams). A scoringThreshold above
 *   0.95 would filter out virtually everything, making per-task recall useless.
 *
 * @example
 * ```typescript
 * import { ResearchConfigRefinedSchema } from "~/shared";
 *
 * const result = ResearchConfigRefinedSchema.safeParse({
 *   perTaskRecall: { enabled: true },
 *   graduation: { scoringThreshold: 0.99 },
 * });
 * // result.success === false -- threshold too high for recall to work
 * ```
 */
export const ResearchConfigRefinedSchema = ResearchConfigSchema.refine(
  (config) => {
    if (
      config.perTaskRecall.enabled &&
      config.graduation.scoringThreshold > 0.95
    ) {
      return false;
    }
    return true;
  },
  {
    message:
      "perTaskRecall requires graduation to produce engrams (scoringThreshold too high would filter everything)",
  },
);
