/**
 * Model routing table for complexity-aware agent model selection.
 *
 * Provides a centralized mapping from (agent role, complexity level)
 * to model tier. This table serves as the system-level default for
 * model routing decisions. Per-agent overrides in agent frontmatter
 * (model_routing.complexity_overrides) take precedence.
 *
 * Tier: T0 Foundation -- imports nothing from src/ except sibling schemas.
 */
import { z } from "zod";

import {
  COMPLEXITY_LEVELS,
  ModelTierSchema,
  type ComplexityLevel,
  type ModelTier,
} from "../__schemas/complexity.schemas";

/**
 * Schema for a single row in the model routing table.
 *
 * Maps a named agent role to a model tier per complexity level.
 * All five complexity levels must be specified.
 */
export const ModelRoutingRowSchema = z.object({
  TRIVIAL: ModelTierSchema,
  SIMPLE: ModelTierSchema,
  MODERATE: ModelTierSchema,
  COMPLEX: ModelTierSchema,
  CRITICAL: ModelTierSchema,
});

export type ModelRoutingRow = z.infer<typeof ModelRoutingRowSchema>;

/**
 * Schema for the complete model routing table.
 *
 * Keys are agent names (e.g., "lu-executor", "code-architect").
 * Values are per-complexity model tier mappings.
 */
export const ModelRoutingTableSchema = z.record(
  z.string(),
  ModelRoutingRowSchema,
);

export type ModelRoutingTable = z.infer<typeof ModelRoutingTableSchema>;

/**
 * Default model tier for each complexity level when no agent-specific
 * entry exists in the routing table.
 *
 * - TRIVIAL/SIMPLE: fast (lightweight, low-cost)
 * - MODERATE: balanced (standard throughput)
 * - COMPLEX/CRITICAL: capable (deep analysis)
 */
export const DEFAULT_COMPLEXITY_TIERS: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "fast",
  MODERATE: "balanced",
  COMPLEX: "capable",
  CRITICAL: "capable",
};

/**
 * The system model routing table.
 *
 * Per-agent overrides for complexity -> model tier mapping. Agents not
 * listed here fall through to DEFAULT_COMPLEXITY_TIERS.
 *
 * Rationale for overrides:
 * - Classifiers/routers (lu-cognition, lu-learner): Always fast,
 *   even at high complexity -- their work is lightweight.
 * - Executors/planners: Balanced by default, promoted to capable at
 *   COMPLEX+ to handle cross-cutting changes.
 * - Deep-analysis agents (verifiers, debuggers, auditors): Capable
 *   at MODERATE+, balanced at SIMPLE, fast at TRIVIAL.
 */
export const MODEL_ROUTING_TABLE: ModelRoutingTable = {
  // --- Fast-tier agents (classifiers, memory) ---
  "lu-cognition": {
    TRIVIAL: "fast",
    SIMPLE: "fast",
    MODERATE: "fast",
    COMPLEX: "fast",
    CRITICAL: "fast",
  },
  "lu-learner": {
    TRIVIAL: "fast",
    SIMPLE: "fast",
    MODERATE: "fast",
    COMPLEX: "fast",
    CRITICAL: "balanced",
  },

  // --- Balanced-tier agents (executors, planners, routers) ---
  "lu-router": {
    TRIVIAL: "fast",
    SIMPLE: "fast",
    MODERATE: "balanced",
    COMPLEX: "balanced",
    CRITICAL: "balanced",
  },
  "lu-executor": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-planner": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-pm-planner": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },

  // --- Capable-tier agents (verifiers, debuggers, auditors) ---
  "lu-verifier": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-debugger": {
    TRIVIAL: "balanced",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-integration-checker": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "code-architect": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "dx-advocate": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "code-simplifier": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "security-auditor": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "performance-auditor": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "code-developer": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  ui: {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  ux: {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },

  // --- Fast-tier agents (classifiers, lightweight) ---
  "lu-router-fast": {
    TRIVIAL: "fast",
    SIMPLE: "fast",
    MODERATE: "fast",
    COMPLEX: "fast",
    CRITICAL: "balanced",
  },
  "lu-verifier-fast": {
    TRIVIAL: "fast",
    SIMPLE: "fast",
    MODERATE: "fast",
    COMPLEX: "fast",
    CRITICAL: "balanced",
  },

  // --- Capable-tier variant (always capable) ---
  "lu-executor-capable": {
    TRIVIAL: "capable",
    SIMPLE: "capable",
    MODERATE: "capable",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },

  // --- Standard orchestrators (fast → balanced → capable ramp) ---
  "lu-plan-checker": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-test-writer": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-pr-reviewer": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-discuss-researcher": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-research-synthesizer": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-codebase-mapper": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-phase-researcher": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-project-researcher": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-repo-architect": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-roadmapper": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-roadmap-architect": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-roadmap-prioritizer": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-roadmap-qa": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "lu-roadmap-synthesizer": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  product: {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
  "qa-plan-generator": {
    TRIVIAL: "fast",
    SIMPLE: "balanced",
    MODERATE: "balanced",
    COMPLEX: "capable",
    CRITICAL: "capable",
  },
};

/**
 * Resolve the model tier for an agent at a given complexity level.
 *
 * Lookup order:
 * 1. Agent-specific entry in MODEL_ROUTING_TABLE
 * 2. DEFAULT_COMPLEXITY_TIERS fallback
 *
 * This function does NOT apply per-agent frontmatter overrides
 * (model_routing.complexity_overrides). Those are handled by
 * resolveModel() in agents/__helpers/resolve-model.ts, which
 * sits at a higher priority level.
 *
 * @param agentName - The agent's name (e.g., "lu-executor")
 * @param complexity - Current task complexity level
 * @returns The recommended model tier for this agent at this complexity
 *
 * @example
 * ```typescript
 * resolveModelForAgent("lu-executor", "CRITICAL")  // "capable"
 * resolveModelForAgent("lu-cognition", "CRITICAL")  // "fast"
 * resolveModelForAgent("unknown-agent", "MODERATE")  // "balanced" (default)
 * ```
 */
export function resolveModelForAgent(
  agentName: string,
  complexity: ComplexityLevel,
): ModelTier {
  const agentRow = MODEL_ROUTING_TABLE[agentName];

  if (agentRow) {
    return agentRow[complexity];
  }

  return DEFAULT_COMPLEXITY_TIERS[complexity];
}

/**
 * Get the full routing row for an agent, falling back to defaults.
 *
 * Useful for displaying the complete routing matrix for an agent
 * in observability dashboards or debug output.
 *
 * @param agentName - The agent's name
 * @returns The complete model tier mapping for all complexity levels
 */
export function getRoutingRow(agentName: string): ModelRoutingRow {
  return MODEL_ROUTING_TABLE[agentName] ?? DEFAULT_COMPLEXITY_TIERS;
}
