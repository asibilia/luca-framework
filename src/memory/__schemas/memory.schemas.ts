import { z } from "zod";

import { qualityZoneSchema } from "~/planner/__schemas/planner.schemas";

// ─── Memory Entry Schema ───────────────────────────────────────────────────────

/**
 * A single entry from MEMORY.md.
 *
 * Represents a captured learning (pattern, decision, pitfall, or preference)
 * persisted across sessions. Used by the compression engine to evaluate
 * which entries to summarize, archive, merge, or deduplicate.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const memoryEntrySchema = z.object({
  /** Unique identifier derived from title hash */
  id: z.string(),
  /** Entry category */
  category: z.enum(["pattern", "decision", "pitfall", "preference"]),
  /** Entry title/name */
  title: z.string(),
  /** Full content of the entry (markdown) */
  content: z.string(),
  /** Domain tags from TAG-VOCABULARY.md */
  tags: z.array(z.string()).default([]),
  /** Agent that originated this entry */
  agent: z.string().default("general"),
  /** Confidence level */
  confidence: z.enum(["low", "medium", "high"]).default("low"),
  /** Milestone version when this entry was captured (e.g., "v1.5.0") */
  milestone: z.string().optional(),
  /** ISO 8601 date when entry was added */
  added_at: z.string(),
  /** ISO 8601 date when entry was last recalled */
  last_recalled_at: z.string().optional(),
  /** Number of times this entry has been recalled */
  recall_count: z.number().int().nonnegative().default(0),
  /** Estimated token count for this entry */
  token_estimate: z.number().int().nonnegative().default(0),
});

/** A single MEMORY.md entry with category, confidence, and recall metadata. */
export type MemoryEntry = z.infer<typeof memoryEntrySchema>;

// ─── Compression Strategy Schema ───────────────────────────────────────────────

/**
 * Available compression strategies for memory entries.
 *
 * - summarize: Compress content to 1-2 line summary (~70% token savings)
 * - archive: Move to archive section (~100% savings from active context)
 * - merge: Combine related entries (~40% savings)
 * - deduplicate: Remove duplicate entries (~100% savings of duplicate)
 * - keep: No action needed (0 savings)
 */
export const COMPRESSION_STRATEGIES = [
  "summarize",
  "archive",
  "merge",
  "deduplicate",
  "keep",
] as const;

export const compressionStrategySchema = z.enum(COMPRESSION_STRATEGIES);

/** One of the available compression strategies. */
export type CompressionStrategy = z.infer<typeof compressionStrategySchema>;

// ─── Compression Recommendation Schema ─────────────────────────────────────────

/**
 * A per-entry compression recommendation produced by the compression engine.
 *
 * Contains the recommended strategy, human-readable reason, priority score,
 * and estimated token savings if the strategy is applied.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const compressionRecommendationSchema = z.object({
  /** ID of the memory entry this recommendation targets */
  entry_id: z.string(),
  /** Recommended compression strategy */
  strategy: compressionStrategySchema,
  /** Human-readable reason for this recommendation */
  reason: z.string(),
  /** Priority score (0-1, higher = more urgent to compress) */
  priority: z.number().min(0).max(1),
  /** Estimated token savings if this strategy is applied */
  estimated_token_savings: z.number().int().nonnegative(),
  /** If strategy is "merge" or "deduplicate", the target entry to merge into */
  merge_target_id: z.string().optional(),
});

/** A compression recommendation for a single memory entry. */
export type CompressionRecommendation = z.infer<
  typeof compressionRecommendationSchema
>;

// ─── Token Estimate Schema ─────────────────────────────────────────────────────

/**
 * Token estimation result for one or more memory files.
 *
 * Provides a total token count with a per-source breakdown, enabling
 * token-aware compression decisions and budget monitoring.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const tokenEstimateSchema = z.object({
  /** Total estimated tokens across all sources */
  total_tokens: z.number().int().nonnegative(),
  /** Per-source breakdown with token and byte counts */
  breakdown: z.array(
    z.object({
      /** File path or content identifier */
      source: z.string(),
      /** Estimated token count for this source */
      tokens: z.number().int().nonnegative(),
      /** Byte size of the source content */
      bytes: z.number().int().nonnegative(),
    }),
  ),
  /** ISO 8601 timestamp when the estimate was computed */
  timestamp: z.string(),
});

/** Token estimation result with per-source breakdown. */
export type TokenEstimate = z.infer<typeof tokenEstimateSchema>;

// ─── Phase Quality Metrics Schema ──────────────────────────────────────────────

/**
 * Quality scoring output for a completed phase.
 *
 * Combines test results, type checking, verification status, and learning
 * capture into a single composite score mapped to a quality zone.
 *
 * Weighted formula:
 * - tests: 40% weight
 * - types: 20% weight
 * - verification: 25% weight
 * - learnings: 15% weight
 *
 * Uses snake_case for all field names per API conventions.
 */
export const phaseQualityMetricsSchema = z.object({
  /** Phase number this scoring applies to */
  phase_id: z.number().int(),
  /** Weighted composite score (0-1) */
  composite_score: z.number().min(0).max(1),
  /** Quality zone derived from composite score */
  zone: qualityZoneSchema,
  /** Individual component scores (0-1 each) */
  component_scores: z.object({
    /** Test pass rate: passed_checks / total_checks */
    tests: z.number().min(0).max(1),
    /** Type check pass rate: clean / total */
    types: z.number().min(0).max(1),
    /** Verification status score: passed=1.0, partial=0.5, failed=0.0 */
    verification: z.number().min(0).max(1),
    /** Learning capture rate: min(count / expected, 1.0) */
    learnings: z.number().min(0).max(1),
  }),
  /** Weights used for composite score calculation */
  weights: z.object({
    /** Weight for test component */
    tests: z.number().default(0.4),
    /** Weight for type check component */
    types: z.number().default(0.2),
    /** Weight for verification component */
    verification: z.number().default(0.25),
    /** Weight for learning capture component */
    learnings: z.number().default(0.15),
  }),
  /** ISO 8601 timestamp when metrics were computed */
  timestamp: z.string(),
});

/** Quality metrics for a completed phase. */
export type PhaseQualityMetrics = z.infer<typeof phaseQualityMetricsSchema>;

// ─── Quality Trend Schema ──────────────────────────────────────────────────────

/**
 * Cross-phase quality trend tracker.
 *
 * Stores phase quality metrics over time and computes a rolling average
 * to detect quality regressions. Used by the workflow to trigger
 * corrective actions when quality declines.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const qualityTrendSchema = z.object({
  /** Ordered list of phase quality metrics */
  phases: z.array(phaseQualityMetricsSchema),
  /** Rolling average of composite scores over the window */
  rolling_average: z.number().min(0).max(1),
  /** Whether a quality regression has been detected */
  regression_detected: z.boolean(),
  /** Human-readable description of the regression (if detected) */
  regression_details: z.string().optional(),
  /** Number of recent phases to include in the rolling average */
  window_size: z.number().int().positive().default(5),
});

/** Cross-phase quality trend with regression detection. */
export type QualityTrend = z.infer<typeof qualityTrendSchema>;

// ─── Working Memory Section Schema ─────────────────────────────────────────────

/**
 * Valid section names for the structured WORKING.md file.
 *
 * Each section serves a specific purpose during a workflow session:
 * - session_info: Current task context and session metadata
 * - memory_recall: Relevant entries recalled from MEMORY.md
 * - planning_notes: Notes from the planning phase
 * - findings: Discoveries made during execution
 * - hypotheses: Working theories (especially for debugging)
 * - candidate_learnings: Potential entries for MEMORY.md extraction
 */
export const WORKING_MEMORY_SECTIONS = [
  "session_info",
  "memory_recall",
  "planning_notes",
  "findings",
  "hypotheses",
  "candidate_learnings",
] as const;

export const workingMemorySectionNameSchema = z.enum(WORKING_MEMORY_SECTIONS);

/**
 * A structured section within WORKING.md.
 *
 * Each section has a name, markdown content, token estimate, and
 * optional last-updated timestamp. Token estimates enable budget
 * monitoring during long sessions.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const workingMemorySectionSchema = z.object({
  /** Section name from the allowed set */
  name: workingMemorySectionNameSchema,
  /** Markdown content of this section */
  content: z.string().default(""),
  /** Estimated token count for this section's content */
  token_estimate: z.number().int().nonnegative().default(0),
  /** ISO 8601 timestamp when this section was last updated */
  last_updated_at: z.string().optional(),
});

/** A single section within the working memory structure. */
export type WorkingMemorySection = z.infer<typeof workingMemorySectionSchema>;

// ─── Working Memory Schema ─────────────────────────────────────────────────────

/**
 * Full WORKING.md structure representing active session memory.
 *
 * Contains all sections, a total token count, lifecycle status, and
 * the session start timestamp. Status transitions:
 * active -> extracted (learnings moved to MEMORY.md) -> cleared (reset for next session)
 *
 * Uses snake_case for all field names per API conventions.
 */
export const workingMemorySchema = z.object({
  /** All sections in the working memory */
  sections: z.array(workingMemorySectionSchema).default([]),
  /** Total estimated tokens across all sections */
  total_tokens: z.number().int().nonnegative().default(0),
  /** Lifecycle status of the working memory */
  status: z.enum(["active", "extracted", "cleared"]).default("active"),
  /** ISO 8601 timestamp when the session started */
  session_started_at: z.string().optional(),
});

/** Full WORKING.md structure with sections and lifecycle status. */
export type WorkingMemory = z.infer<typeof workingMemorySchema>;

// ─── Context Usage Result Schema ──────────────────────────────────────────────

/**
 * Result of a context usage check across memory files.
 *
 * Provides total token usage, budget, usage percentage, quality zone,
 * and a per-file breakdown. Used by the context monitor module and
 * hooks to assess context health during execution.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const contextUsageResultSchema = z.object({
  /** Total estimated tokens across all context files */
  total_tokens: z.number().int().nonnegative(),
  /** Token budget (maximum usable context) */
  budget_tokens: z.number().int().positive(),
  /** Usage as a percentage of budget (0-100+) */
  usage_percent: z.number().min(0),
  /** Quality zone derived from usage percentage */
  zone: qualityZoneSchema,
  /** Per-file breakdown of token usage */
  breakdown: z.array(
    z.object({
      /** File path relative to project root */
      file: z.string(),
      /** Estimated token count for this file */
      tokens: z.number().int().nonnegative(),
      /** Percentage of total budget consumed by this file */
      percent_of_budget: z.number().min(0),
      /** Whether the file exists on disk */
      exists: z.boolean(),
    }),
  ),
  /** ISO 8601 timestamp when the check was performed */
  timestamp: z.string(),
  /**
   * Method used for token estimation.
   *
   * - "tiktoken": Real cl100k_base tokenizer (accurate)
   * - "heuristic": Chars/4 fallback (approximate)
   */
  estimation_method: z.enum(["tiktoken", "heuristic"]).optional(),
});

/** Result of a context usage check with zone and breakdown. */
export type ContextUsageResult = z.infer<typeof contextUsageResultSchema>;

// ─── Compression Trigger Schema ───────────────────────────────────────────────

/**
 * Compression trigger assessment from the context monitor.
 *
 * Indicates whether compression should be triggered, with an array
 * of trigger reasons and recommended actions. Used by hooks and
 * skills to decide when to invoke memory compression.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const compressionTriggerSchema = z.object({
  /** Whether compression should be triggered */
  should_compress: z.boolean(),
  /** Reasons why compression was triggered */
  triggers: z.array(z.string()),
  /** Actionable suggestions for the user/agent */
  recommended_actions: z.array(z.string()),
});

/** Compression trigger assessment with reasons and actions. */
export type CompressionTrigger = z.infer<typeof compressionTriggerSchema>;

// ─── Procedure Step Schema ─────────────────────────────────────────────────────

/**
 * A single step within a learned procedure.
 *
 * Steps are ordered instructions that form an executable recipe.
 * Each step has an action description and optional metadata about
 * expected output and tooling.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const procedureStepSchema = z.object({
  /** Step number (1-indexed) */
  order: z.number().int().positive(),
  /** What to do in this step */
  action: z.string(),
  /** Expected output or artifact from this step */
  expected_output: z.string().optional(),
  /** Tool or agent to use for this step */
  tool: z.string().optional(),
});

/** A single step within a learned procedure. */
export type ProcedureStep = z.infer<typeof procedureStepSchema>;

// ─── Procedure Entry Schema ────────────────────────────────────────────────────

/**
 * A learned procedure extracted from a successful execution.
 *
 * Procedures are executable step sequences (mini-skill templates) that
 * capture "how to do it" knowledge. Unlike patterns (declarative insights),
 * procedures are ordered, trackable recipes with success rate validation
 * and retirement lifecycle.
 *
 * Stored in .planning/PROCEDURES.md, parsed by procedure-parser.ts.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const procedureEntrySchema = z.object({
  /** Unique identifier (proc-<slug>) */
  id: z.string(),
  /** Procedure title */
  title: z.string(),
  /** When to use this procedure (trigger conditions) */
  trigger: z.string(),
  /** Ordered steps to execute */
  steps: z.array(procedureStepSchema),
  /** Domain tags from TAG-VOCABULARY.md */
  tags: z.array(z.string()).default([]),
  /** Agent that originated this procedure */
  source_agent: z.string().default("general"),
  /** Phase where this procedure was first extracted */
  source_phase: z.number().int().optional(),
  /** Number of times this procedure has been executed */
  execution_count: z.number().int().nonnegative().default(0),
  /** Number of successful executions */
  success_count: z.number().int().nonnegative().default(0),
  /** Computed success rate (success_count / execution_count, 0.0-1.0) */
  success_rate: z.number().min(0).max(1).default(0),
  /** ISO 8601 date when procedure was added */
  added_at: z.string(),
  /** ISO 8601 date when procedure was last executed */
  last_executed_at: z.string().optional(),
  /** Estimated token count */
  token_estimate: z.number().int().nonnegative().default(0),
  /** Whether this procedure is active or retired */
  status: z.enum(["active", "retired"]).default("active"),
  /** Reason for retirement (if retired) */
  retirement_reason: z.string().optional(),
});

/** A learned procedure with ordered steps, success tracking, and lifecycle status. */
export type ProcedureEntry = z.infer<typeof procedureEntrySchema>;
