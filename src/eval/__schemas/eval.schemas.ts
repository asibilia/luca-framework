import { z } from "zod";

// ─── Grader Types ────────────────────────────────────────────────────────

/**
 * Grader types available for eval case scoring.
 *
 * - code: Deterministic grading (exact match, regex, set membership, etc.)
 * - llm: LLM-as-judge grading with rubric
 * - composite: Weighted combination of code + llm graders
 */
export const GRADER_TYPES = ["code", "llm", "composite"] as const;
export const GraderTypeSchema = z.enum(GRADER_TYPES);
export type GraderType = z.infer<typeof GraderTypeSchema>;

/**
 * Code grader strategy types for deterministic evaluation.
 *
 * - exact_match: Output must exactly equal expected value
 * - contains: Output must contain all expected substrings
 * - regex: Output must match a regex pattern
 * - set_membership: Output must be one of the allowed values
 * - threshold: Numeric output must be within min/max range
 * - custom: A user-provided scoring function
 */
export const CODE_GRADER_STRATEGIES = [
  "exact_match",
  "contains",
  "regex",
  "set_membership",
  "threshold",
  "custom",
] as const;
export const CodeGraderStrategySchema = z.enum(CODE_GRADER_STRATEGIES);
export type CodeGraderStrategy = z.infer<typeof CodeGraderStrategySchema>;

// ─── Grader Result ───────────────────────────────────────────────────────

/**
 * Result returned by any grader (code, llm, or composite).
 *
 * Uses snake_case for all field names.
 */
export const GraderResultSchema = z.object({
  /** Whether the eval case passed */
  passed: z.boolean(),
  /** Score from 0.0 to 1.0 */
  score: z.number().min(0).max(1),
  /** Human-readable reason for the score */
  reason: z.string(),
  /** Grader-specific metadata (e.g., matched pattern, judge model used) */
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type GraderResult = z.infer<typeof GraderResultSchema>;

// ─── Code Grader Config ──────────────────────────────────────────────────

/**
 * Configuration for a code-based (deterministic) grader.
 *
 * The `strategy` field determines which fields are required:
 * - exact_match: `expected_value` required
 * - contains: `expected_substrings` required
 * - regex: `pattern` required
 * - set_membership: `allowed_values` required
 * - threshold: `min` and/or `max` required
 * - custom: handled at runtime via function injection
 */
export const CodeGraderConfigSchema = z.object({
  strategy: CodeGraderStrategySchema,
  /** Expected value for exact_match strategy */
  expected_value: z.unknown().optional(),
  /** Substrings that must all be present for contains strategy */
  expected_substrings: z.array(z.string()).optional(),
  /** Regex pattern string for regex strategy */
  pattern: z.string().optional(),
  /** Allowed values for set_membership strategy */
  allowed_values: z.array(z.unknown()).optional(),
  /** Minimum value for threshold strategy (inclusive) */
  min: z.number().optional(),
  /** Maximum value for threshold strategy (inclusive) */
  max: z.number().optional(),
  /**
   * Path to extract the value to grade from the output object.
   * Uses lodash get() dot notation. When omitted, the entire output is graded.
   *
   * @example "complexity" extracts output.complexity
   * @example "gaps.0.truth" extracts output.gaps[0].truth
   */
  output_path: z.string().optional(),
});
export type CodeGraderConfig = z.infer<typeof CodeGraderConfigSchema>;

// ─── LLM Grader Config ──────────────────────────────────────────────────

/**
 * Configuration for an LLM-as-judge grader.
 */
export const LlmGraderConfigSchema = z.object({
  /** Rubric describing what constitutes good/bad output */
  rubric: z.string(),
  /**
   * Judge model identifier.
   * When omitted, uses the suite-level judge_model config.
   */
  judge_model: z.string().optional(),
  /** Temperature for judge model (default 0.0 for consistency) */
  temperature: z.number().min(0).max(1).default(0),
});
export type LlmGraderConfig = z.infer<typeof LlmGraderConfigSchema>;

// ─── Composite Grader Config ─────────────────────────────────────────────

/**
 * A single entry in a composite grader's grader list.
 */
export const CompositeGraderEntrySchema = z.object({
  /** Grader type for this entry */
  type: GraderTypeSchema,
  /** Weight for this grader's score (0.0 to 1.0) */
  weight: z.number().min(0).max(1),
  /** Config for code grader (required when type is "code") */
  code_config: CodeGraderConfigSchema.optional(),
  /** Config for llm grader (required when type is "llm") */
  llm_config: LlmGraderConfigSchema.optional(),
});
export type CompositeGraderEntry = z.infer<typeof CompositeGraderEntrySchema>;

/**
 * Configuration for a composite grader that combines multiple graders.
 */
export const CompositeGraderConfigSchema = z.object({
  /** Array of grader entries with weights (weights should sum to 1.0) */
  graders: z.array(CompositeGraderEntrySchema).min(1),
  /** Minimum weighted score to pass (default 0.7) */
  pass_threshold: z.number().min(0).max(1).default(0.7),
});
export type CompositeGraderConfig = z.infer<typeof CompositeGraderConfigSchema>;

// ─── Eval Case ───────────────────────────────────────────────────────────

/**
 * A single evaluation case for a Luca component.
 *
 * Defines an input, expected behavior, and grading strategy for one
 * specific scenario that the component should handle correctly.
 */
export const EvalCaseSchema = z.object({
  /** Unique identifier (e.g., "router-trivial-001") */
  id: z.string(),
  /** Which Luca component is being evaluated (e.g., "lu-router") */
  component: z.string(),
  /** Human-readable description of what this case tests */
  description: z.string(),
  /** Input payload to the component */
  input: z.record(z.string(), z.unknown()),
  /** Expected output for deterministic grading (used by code grader) */
  expected: z.record(z.string(), z.unknown()).optional(),
  /** Which grader type to use */
  grader: GraderTypeSchema,
  /** Config for code grader (required when grader is "code") */
  code_grader_config: CodeGraderConfigSchema.optional(),
  /** Config for LLM grader (required when grader is "llm") */
  llm_grader_config: LlmGraderConfigSchema.optional(),
  /** Config for composite grader (required when grader is "composite") */
  composite_grader_config: CompositeGraderConfigSchema.optional(),
  /** Tags for filtering/grouping (e.g., ["smoke", "regression"]) */
  tags: z.array(z.string()).default([]),
  /** Number of independent trials for reliability measurement */
  trials: z.number().int().positive().default(3),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

// ─── Eval Suite ──────────────────────────────────────────────────────────

/**
 * Suite-level configuration overrides.
 */
export const EvalSuiteConfigSchema = z.object({
  /** Model identifier for LLM-as-judge grading */
  judge_model: z.string().default("claude-haiku-4-5-20250514"),
  /** Per-case timeout in milliseconds */
  timeout_ms: z.number().int().positive().default(30_000),
  /** Fraction of cases to run (0.0 to 1.0). 1.0 = run all cases. */
  sampling_rate: z.number().min(0).max(1).default(1.0),
  /** Whether to use Anthropic Batch API for cost savings on non-urgent runs */
  use_batch_api: z.boolean().default(false),
});
export type EvalSuiteConfig = z.infer<typeof EvalSuiteConfigSchema>;

/**
 * A collection of eval cases targeting a single component.
 */
export const EvalSuiteSchema = z.object({
  /** Suite identifier (e.g., "lu-router-classification") */
  id: z.string(),
  /** Target component name */
  component: z.string(),
  /** What this suite measures */
  description: z.string(),
  /** The individual test cases */
  cases: z.array(EvalCaseSchema).min(1),
  /** Suite-level configuration overrides */
  config: EvalSuiteConfigSchema.default({
    judge_model: "claude-haiku-4-5-20250514",
    timeout_ms: 30_000,
    sampling_rate: 1.0,
    use_batch_api: false,
  }),
});
export type EvalSuite = z.infer<typeof EvalSuiteSchema>;

// ─── Eval Result ─────────────────────────────────────────────────────────

/**
 * Token usage for a single trial.
 */
export const TokenUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Result from a single trial of a single eval case.
 */
export const EvalResultSchema = z.object({
  /** ID of the eval case this result belongs to */
  case_id: z.string(),
  /** Trial number (1-based) */
  trial: z.number().int().positive(),
  /** Whether this trial passed */
  passed: z.boolean(),
  /** Score from 0.0 to 1.0 */
  score: z.number().min(0).max(1),
  /** Full grader output */
  grader_output: GraderResultSchema,
  /** Latency of this trial in milliseconds */
  latency_ms: z.number().nonnegative(),
  /** Token usage for the agent call (not the judge) */
  token_usage: TokenUsageSchema,
  /** Estimated cost in USD for this trial */
  cost_usd: z.number().nonnegative(),
  /** ISO 8601 timestamp of when this trial completed */
  timestamp: z.string().datetime(),
  /** Error message if the trial errored (timeout, API failure, etc.) */
  error: z.string().optional(),
});
export type EvalResult = z.infer<typeof EvalResultSchema>;

// ─── Eval Report ─────────────────────────────────────────────────────────

/**
 * Run metadata captured for reproducibility and regression tracking.
 */
export const EvalRunMetadataSchema = z.object({
  /** Model version used for agent calls (e.g., "claude-sonnet-4-20250514") */
  agent_model: z.string(),
  /** Model version used for LLM judge calls */
  judge_model: z.string(),
  /** Git commit hash of the agent definitions at eval time */
  agent_version_hash: z.string(),
  /** Snapshot of suite config used for this run */
  suite_config: EvalSuiteConfigSchema,
});
export type EvalRunMetadata = z.infer<typeof EvalRunMetadataSchema>;

/**
 * Aggregated report for a single suite run.
 *
 * Contains per-trial results and aggregate metrics.
 */
export const EvalReportSchema = z.object({
  /** Unique run identifier (UUID v4) */
  run_id: z.string(),
  /** ISO 8601 timestamp of when the run started */
  timestamp: z.string().datetime(),
  /** Component that was evaluated */
  component: z.string(),
  /** Suite ID that was run */
  suite_id: z.string(),
  /** Total number of cases in the suite (before sampling) */
  total_cases: z.number().int().nonnegative(),
  /** Number of cases actually executed (after sampling) */
  executed_cases: z.number().int().nonnegative(),
  /** Capability: fraction of cases where >= 1 trial passed */
  pass_at_1: z.number().min(0).max(1),
  /** Reliability: fraction of cases where ALL trials passed */
  pass_at_k: z.number().min(0).max(1),
  /** Average score across all trials of all cases */
  avg_score: z.number().min(0).max(1),
  /** Total cost in USD for the entire run */
  total_cost_usd: z.number().nonnegative(),
  /** Total latency in milliseconds for the entire run */
  total_latency_ms: z.number().nonnegative(),
  /** All individual trial results */
  results: z.array(EvalResultSchema),
  /** Run metadata for reproducibility */
  metadata: EvalRunMetadataSchema,
});
export type EvalReport = z.infer<typeof EvalReportSchema>;

// ─── Eval Comparison ─────────────────────────────────────────────────────

/**
 * Verdict from comparing two eval runs.
 *
 * - pass: No regressions beyond threshold
 * - warn: Minor regressions within tolerance
 * - fail: Significant regressions exceeding threshold
 */
export const COMPARISON_VERDICTS = ["pass", "warn", "fail"] as const;
export const ComparisonVerdictSchema = z.enum(COMPARISON_VERDICTS);
export type ComparisonVerdict = z.infer<typeof ComparisonVerdictSchema>;

/**
 * Delta metrics between baseline and current runs.
 */
export const EvalDeltasSchema = z.object({
  /** Change in pass@1 (positive = improvement) */
  pass_at_1_delta: z.number(),
  /** Change in pass@k (positive = improvement) */
  pass_at_k_delta: z.number(),
  /** Change in average score (positive = improvement) */
  avg_score_delta: z.number(),
  /** Change in total cost (positive = more expensive) */
  cost_delta: z.number(),
  /** Change in total latency (positive = slower) */
  latency_delta: z.number(),
});
export type EvalDeltas = z.infer<typeof EvalDeltasSchema>;

/**
 * Comparison result between a baseline and current eval run.
 */
export const EvalComparisonSchema = z.object({
  /** Case IDs that passed in baseline but fail in current */
  regressions: z.array(z.string()),
  /** Case IDs that failed in baseline but pass in current */
  improvements: z.array(z.string()),
  /** Case IDs with stable results */
  unchanged: z.array(z.string()),
  /** Aggregate metric deltas */
  deltas: EvalDeltasSchema,
  /** Overall verdict based on regression threshold */
  verdict: ComparisonVerdictSchema,
  /** Minimum score delta to flag as meaningful regression (default 0.05) */
  significance_threshold: z.number().min(0).max(1),
});
export type EvalComparison = z.infer<typeof EvalComparisonSchema>;

// ─── Interfaces (moved from __helpers/ per audit #14-15) ────────────────

/**
 * Type for user-provided custom grading functions.
 *
 * Receives the extracted output value and the full expected record.
 * Must return a GraderResult synchronously.
 *
 * @param output - The value extracted from the agent output (via output_path or full output)
 * @param expected - The full expected record from the eval case
 * @returns GraderResult with passed, score, reason, and optional metadata
 */
export type CustomGraderFn = (
  output: unknown,
  expected: Record<string, unknown> | undefined,
) => GraderResult;

/**
 * Adapter interface for making LLM calls.
 *
 * Abstracted so the eval runner can inject a mock adapter for testing
 * or a real Anthropic API adapter for production runs.
 */
export interface LlmAdapter {
  /**
   * Send a message to an LLM and get a text response.
   *
   * @param model - Model identifier (e.g., "claude-haiku-4-5-20250514")
   * @param systemPrompt - System prompt for the judge
   * @param userMessage - User message containing the eval context
   * @param temperature - Sampling temperature (0.0 for deterministic)
   * @returns Object with text response and token usage
   */
  call(
    model: string,
    systemPrompt: string,
    userMessage: string,
    temperature: number,
  ): Promise<{
    text: string;
    input_tokens: number;
    output_tokens: number;
  }>;
}

/**
 * Options for running an eval suite.
 */
export interface RunEvalOptions {
  /** LLM adapter for agent calls and LLM-graded cases. Required for llm/composite graders. */
  adapter: LlmAdapter | null;
  /** Map of custom grader functions keyed by eval case ID */
  custom_graders?: Map<string, CustomGraderFn>;
  /** Override trial count for all cases (useful for quick smoke runs) */
  trial_override?: number;
  /** Dry-run mode: validate suite structure without executing any cases */
  dry_run?: boolean;
  /** Agent model to use for agent calls (for metadata tracking) */
  agent_model?: string;
  /** Git commit hash of current agent definitions (for metadata tracking) */
  agent_version_hash?: string;
  /** Callback invoked after each trial completes (for progress reporting) */
  on_trial_complete?: (
    case_id: string,
    trial: number,
    result: EvalResult,
  ) => void;
}
