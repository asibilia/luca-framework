/**
 * Zod schemas for multi-lens review gate and risk-weighted review lenses.
 *
 * Extends the code review step (phase-execute Step 8) with additional
 * focused review lenses (Architecture, Data) that activate when the
 * pre-mortem signal rate gate is met. Also provides a risk multiplier
 * for complexity classification based on changed file domains.
 *
 * Uses snake_case for all properties per API conventions.
 *
 * @module multi-lens-review.schemas
 */
import { z } from "zod";

// ─── Review Lens ────────────────────────────────────────────────────────────

/**
 * A focused review lens defining a specialized reviewer's scope and routing.
 *
 * Each lens provides a name, focus areas for the reviewer to evaluate,
 * a model routing preset (from the complexity gating system), and a
 * prompt template that structures the review request.
 *
 * Uses snake_case for data schema compatibility.
 *
 * @example
 * ```typescript
 * const lens = ReviewLensSchema.parse({
 *   name: "architecture-lens",
 *   focus_areas: ["module boundaries", "tier compliance"],
 *   model_routing_preset: "DEEP_ANALYSIS",
 *   prompt_template: "Review the following files for architecture issues...",
 * });
 * ```
 */
export const ReviewLensSchema = z.object({
  /** Unique identifier for this lens (kebab-case) */
  name: z.string(),
  /** Specific areas this lens evaluates */
  focus_areas: z.array(z.string()),
  /** Model routing preset from complexity gating (e.g., ORCHESTRATOR, DEEP_ANALYSIS) */
  model_routing_preset: z.string().default("ORCHESTRATOR"),
  /** Prompt template for the review agent, with {CHANGED_FILES} and {CLAUDE_CONTENT} placeholders */
  prompt_template: z.string(),
});

export type ReviewLens = z.infer<typeof ReviewLensSchema>;

// ─── Multi-Lens Gate ────────────────────────────────────────────────────────

/**
 * Configuration for the multi-lens review gate.
 *
 * Controls whether additional review lenses are activated based on
 * the pre-mortem signal rate from MuninnDB metric engrams. The gate
 * requires a minimum number of samples before activating.
 *
 * Uses snake_case for data schema compatibility.
 *
 * @example
 * ```typescript
 * const config = MultiLensGateSchema.parse({
 *   enabled: true,
 *   gate_metric: "metric:signal-rate-aggregate",
 *   gate_threshold: 0.10,
 *   min_samples: 20,
 * });
 * ```
 */
export const MultiLensGateSchema = z.object({
  /** Whether the multi-lens gate is active */
  enabled: z.boolean().default(true),
  /** MuninnDB metric engram key to query for signal rate */
  gate_metric: z.string().default("metric:signal-rate-aggregate"),
  /** Signal rate threshold above which the gate activates (0.0 - 1.0) */
  gate_threshold: z.number().min(0).max(1).default(0.1),
  /** Minimum number of pre-mortem samples required before gate can activate */
  min_samples: z.number().int().positive().default(20),
});

export type MultiLensGateConfig = z.infer<typeof MultiLensGateSchema>;

// ─── Multi-Lens Gate Result ─────────────────────────────────────────────────

/**
 * Structured result from evaluating the multi-lens gate condition.
 *
 * Reports whether the gate was met, the observed signal rate, the
 * number of samples evaluated, and a human-readable reason.
 *
 * Uses snake_case for data schema compatibility.
 *
 * @example
 * ```typescript
 * const result = MultiLensGateResultSchema.parse({
 *   gate_met: false,
 *   signal_rate: 0.0,
 *   sample_count: 3,
 *   reason: "Insufficient samples: 3 of 20 required",
 * });
 * ```
 */
export const MultiLensGateResultSchema = z.object({
  /** Whether the gate condition was met (signal rate > threshold with sufficient samples) */
  gate_met: z.boolean(),
  /** Observed pre-mortem signal rate (0.0 - 1.0) */
  signal_rate: z.number().min(0).max(1),
  /** Number of pre-mortem samples evaluated */
  sample_count: z.number().int().nonnegative(),
  /** Human-readable explanation of the gate decision */
  reason: z.string(),
});

export type MultiLensGateResult = z.infer<typeof MultiLensGateResultSchema>;

// ─── Risk Multiplier ────────────────────────────────────────────────────────

/**
 * Configuration for the risk multiplier that adjusts complexity weight
 * based on which domains the changed files belong to.
 *
 * High-risk domains (state management, shared schemas, context assembly,
 * harness, hooks) receive higher weight, pushing the effective complexity
 * upward for reviewer model selection.
 *
 * Uses snake_case for data schema compatibility.
 *
 * @example
 * ```typescript
 * const config = RiskMultiplierConfigSchema.parse({
 *   domain_patterns: {
 *     "state/": 1.8,
 *     "shared/__schemas/": 1.6,
 *   },
 *   base_weight: 1.0,
 *   max_multiplier: 2.0,
 * });
 * ```
 */
export const RiskMultiplierConfigSchema = z.object({
  /** Map of file path patterns to risk weight multipliers */
  domain_patterns: z.record(z.string(), z.number().positive()).default({
    "state/": 1.8,
    "shared/__schemas/": 1.6,
    "context/": 1.5,
    "harness/": 1.5,
    "hooks/": 1.4,
    "complexity/": 1.4,
    "compilers/": 1.3,
    "iteration/": 1.3,
  }),
  /** Base weight applied when no high-risk domains match */
  base_weight: z.number().positive().default(1.0),
  /** Maximum allowed multiplier to prevent runaway escalation */
  max_multiplier: z.number().positive().default(2.0),
});

export type RiskMultiplierConfig = z.infer<typeof RiskMultiplierConfigSchema>;
