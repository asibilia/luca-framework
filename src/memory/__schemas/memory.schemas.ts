import { z } from "zod";

import { qualityZoneSchema } from "~/planner/__schemas/planner.schemas";

// ─── Brain Schema ─────────────────────────────────────────────────────────────

/**
 * Project identity schema for BRAIN.md / brain.json.
 *
 * Captures the project's personality, stack, architecture, and conventions.
 * Loaded at session start by lu-cognition for cognitive pre-flight.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const brainSchema = z.object({
  /** Project display name */
  project_name: z.string().default("Project"),
  /** Project domain (e.g., "developer tooling", "fintech") */
  domain: z.string().default(""),
  /** Project purpose / one-line description */
  purpose: z.string().default(""),
  /** Technology stack */
  stack: z
    .object({
      /** Primary language */
      language: z.string().default("TypeScript"),
      /** Primary framework */
      framework: z.string().default(""),
      /** Build tool */
      build: z.string().default(""),
      /** Test framework */
      testing: z.string().default("bun:test"),
      /** Styling approach (optional) */
      styling: z.string().optional(),
    })
    .default({
      language: "TypeScript",
      framework: "",
      build: "",
      testing: "bun:test",
    }),
  /** High-level architecture patterns */
  architecture_patterns: z.string().default(""),
  /** Code conventions summary */
  code_conventions: z.string().default(""),
  /** Freeform development preferences */
  development_preferences: z.record(z.string(), z.string()).default({}),
  /** ISO 8601 timestamp of last update */
  updated_at: z.string().optional(),
});

/** Project identity from BRAIN.md / brain.json. */
export type Brain = z.infer<typeof brainSchema>;

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
  /** Source project name for cross-project provenance tracking.
   *  Undefined means the entry was created in the current project.
   *  When imported from another project, set to the source project's name.
   */
  source_project: z.string().optional(),
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

// ─── Retention Policy Schema ────────────────────────────────────────────────

/**
 * Per-section retention policy for context pruning.
 *
 * Defines how aggressively a working memory section should be pruned.
 * Sections with lower priority values are pruned first. max_age_ms
 * controls time-based pruning; max_tokens controls size-based pruning.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const retentionPolicySchema = z.object({
  /** Section name this policy applies to */
  section: workingMemorySectionNameSchema,
  /** Maximum age of content in milliseconds before eligible for pruning */
  max_age_ms: z.number().int().positive().default(3600000), // 1 hour
  /** Maximum token count for the section before pruning triggers */
  max_tokens: z.number().int().positive().default(2000),
  /** Retention priority (1-10, higher = more important to keep) */
  priority: z.number().int().min(1).max(10).default(5),
});

/** Per-section retention policy. */
export type RetentionPolicy = z.infer<typeof retentionPolicySchema>;

// ─── Pruning Config Schema ──────────────────────────────────────────────────

/**
 * Global pruning configuration.
 *
 * Specifies per-section retention policies, which sections are critical
 * (never pruned), and the quality zone at which pruning activates.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const pruningConfigSchema = z.object({
  /** Per-section retention policies */
  retention_policies: z.array(retentionPolicySchema).default([]),
  /** Sections that must never be pruned (e.g., active task context) */
  critical_sections: z
    .array(workingMemorySectionNameSchema)
    .default(["session_info", "planning_notes"]),
  /** Quality zone at or above which pruning activates */
  trigger_zone: qualityZoneSchema.default("degrading"),
  /** Maximum age in ms for ResultEnvelope digestion (default: 30 min) */
  envelope_max_age_ms: z.number().int().positive().default(1800000),
});

/** Global pruning configuration. */
export type PruningConfig = z.infer<typeof pruningConfigSchema>;

// ─── Pruning Event Schema ───────────────────────────────────────────────────

/**
 * A single pruning event logged during context pruning.
 *
 * Records what was pruned, from which section, how many tokens
 * were freed, and the reason for pruning. Logged to WORKING.md
 * for audit trail.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const pruningEventSchema = z.object({
  /** ISO 8601 timestamp when the pruning occurred */
  timestamp: z.string(),
  /** Section that was pruned */
  section: workingMemorySectionNameSchema,
  /** Action taken: digest (envelope), truncate (retention), or skip (preserved) */
  action: z.enum(["digest", "truncate", "skip"]),
  /** Tokens freed by this pruning action */
  tokens_freed: z.number().int().nonnegative(),
  /** Human-readable reason for this pruning action */
  reason: z.string(),
});

/** A single logged pruning event. */
export type PruningEvent = z.infer<typeof pruningEventSchema>;

// ─── Pruning Result Schema ──────────────────────────────────────────────────

/**
 * Aggregate result of a pruning pass over working memory.
 *
 * Contains all pruning events, total tokens freed, which sections
 * were pruned vs preserved, and the resulting working memory state.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const pruningResultSchema = z.object({
  /** All pruning events that occurred */
  events: z.array(pruningEventSchema).default([]),
  /** Total tokens freed across all pruning actions */
  total_tokens_freed: z.number().int().nonnegative(),
  /** Section names that were pruned */
  sections_pruned: z.array(z.string()).default([]),
  /** Section names that were preserved (critical) */
  preserved_sections: z.array(z.string()).default([]),
});

/** Aggregate pruning result. */
export type PruningResult = z.infer<typeof pruningResultSchema>;

// ─── Section Score Schema ───────────────────────────────────────────────────

/**
 * Relevance/age score for a working memory section.
 *
 * Used by the auto-compaction engine to rank sections for compaction.
 * Higher scores indicate sections more eligible for compaction
 * (older, less relevant, larger).
 *
 * Uses snake_case for all field names per API conventions.
 */
export const sectionScoreSchema = z.object({
  /** Section name */
  section: workingMemorySectionNameSchema,
  /** Age score (0-1, higher = older relative to session) */
  age_score: z.number().min(0).max(1),
  /** Relevance score (0-1, higher = less relevant, more compactable) */
  relevance_score: z.number().min(0).max(1),
  /** Size score (0-1, higher = larger relative to budget) */
  size_score: z.number().min(0).max(1),
  /** Composite compaction priority (0-1, higher = compact first) */
  composite_score: z.number().min(0).max(1),
  /** Current token count of the section */
  token_count: z.number().int().nonnegative(),
});

/** Section compaction score. */
export type SectionScore = z.infer<typeof sectionScoreSchema>;

// ─── Compaction Config Schema ───────────────────────────────────────────────

/**
 * Configuration for WORKING.md auto-compaction.
 *
 * Defines the quality zone trigger, minimum section age for compaction
 * eligibility, and maximum tokens for compacted summaries.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const compactionConfigSchema = z.object({
  /** Quality zone at or above which compaction triggers */
  trigger_zone: qualityZoneSchema.default("degrading"),
  /** Minimum section age in ms before eligible for compaction (default: 10 min) */
  min_section_age_ms: z.number().int().nonnegative().default(600000),
  /** Maximum tokens for a compacted section summary */
  summary_max_tokens: z.number().int().positive().default(500),
  /** Sections exempt from compaction */
  exempt_sections: z
    .array(workingMemorySectionNameSchema)
    .default(["session_info"]),
  /** Minimum composite score threshold to trigger compaction (0-1) */
  score_threshold: z.number().min(0).max(1).default(0.4),
});

/** Auto-compaction configuration. */
export type CompactionConfig = z.infer<typeof compactionConfigSchema>;

// ─── Compaction Result Schema ───────────────────────────────────────────────

/**
 * Result of a WORKING.md auto-compaction pass.
 *
 * Contains the list of sections compacted, before/after token counts,
 * generated summaries, and whether the session should continue.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const compactionResultSchema = z.object({
  /** Names of sections that were compacted */
  sections_compacted: z.array(z.string()).default([]),
  /** Total tokens before compaction */
  tokens_before: z.number().int().nonnegative(),
  /** Total tokens after compaction */
  tokens_after: z.number().int().nonnegative(),
  /** Per-section compaction summaries */
  summaries: z
    .array(
      z.object({
        /** Section name */
        section: z.string(),
        /** Generated summary text */
        summary: z.string(),
        /** Tokens before compaction */
        tokens_before: z.number().int().nonnegative(),
        /** Tokens after compaction */
        tokens_after: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  /** Whether the session should continue after compaction */
  session_continued: z.boolean().default(true),
  /** Section scores used for compaction decisions */
  scores: z.array(sectionScoreSchema).default([]),
});

/** Auto-compaction result. */
export type CompactionResult = z.infer<typeof compactionResultSchema>;

// ─── Replay Threshold Schema ────────────────────────────────────────────────

/**
 * Configurable threshold for procedure auto-replay.
 *
 * Determines when a procedure is confident enough to auto-replay as a
 * pre-plan during phase execution. The composite score combines
 * success_rate, relevance_score, and execution_count signals.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const replayThresholdSchema = z.object({
  /** Minimum composite score (success_rate + relevance) to qualify for replay (0-1) */
  min_composite_score: z.number().min(0).max(1).default(0.7),
  /** Minimum success rate for replay eligibility (0-1) */
  min_success_rate: z.number().min(0).max(1).default(0.5),
  /** Minimum number of executions before auto-replay is allowed */
  min_executions: z.number().int().nonnegative().default(3),
});

/** Configurable replay threshold. */
export type ReplayThreshold = z.infer<typeof replayThresholdSchema>;

// ─── Pre-Plan Schema ────────────────────────────────────────────────────────

/**
 * A procedure converted to plan format for lu-executor consumption.
 *
 * Represents a high-confidence procedure translated into structured
 * steps that the executor can follow as a suggested approach.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const prePlanSchema = z.object({
  /** ID of the source procedure */
  source_procedure_id: z.string(),
  /** Human-readable title for the pre-plan */
  title: z.string(),
  /** Ordered action items for the executor */
  steps: z.array(
    z.object({
      /** Step number (1-indexed) */
      order: z.number().int().positive(),
      /** Action description */
      action: z.string(),
      /** Expected output or verification criterion */
      expected_output: z.string().optional(),
      /** Suggested tool or agent */
      tool: z.string().optional(),
    }),
  ),
  /** Composite confidence score that qualified this procedure for replay */
  confidence_score: z.number().min(0).max(1),
  /** Whether this pre-plan was auto-generated from a procedure */
  auto_generated: z.boolean().default(true),
});

/** A procedure converted to plan format. */
export type PrePlan = z.infer<typeof prePlanSchema>;

// ─── Replay Result Schema ───────────────────────────────────────────────────

/**
 * Captures the outcome of a replayed procedure.
 *
 * Records whether the pre-plan was applied, whether the harness
 * passed, execution duration, and whether feedback was recorded
 * back to the procedure's stats.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const replayResultSchema = z.object({
  /** ID of the procedure that was replayed */
  procedure_id: z.string(),
  /** Whether the pre-plan was applied during execution */
  pre_plan_applied: z.boolean(),
  /** Whether the harness verification passed after replay */
  harness_passed: z.boolean(),
  /** Execution duration in milliseconds */
  execution_duration_ms: z.number().int().nonnegative(),
  /** Whether feedback was recorded back to procedure stats */
  feedback_recorded: z.boolean().default(false),
});

/** Outcome of a replayed procedure. */
export type ReplayResult = z.infer<typeof replayResultSchema>;
