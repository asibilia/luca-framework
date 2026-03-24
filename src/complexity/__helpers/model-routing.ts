/**
 * Model routing table for complexity-aware agent model selection.
 *
 * Provides a centralized mapping from (agent role, complexity level)
 * to model tier. This table is the **single source of truth** for
 * model routing decisions. Agent frontmatter model_routing fields
 * are deprecated and no longer consulted by resolveModel().
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

// ---------------------------------------------------------------------------
// Named routing presets — shared patterns across agent categories.
//
// Each preset captures a distinct complexity-to-tier ramp. Agents in the
// MODEL_ROUTING_TABLE reference a preset instead of spelling out all five
// levels, keeping the table DRY and scannable.
// ---------------------------------------------------------------------------

/** Always fast — classifiers whose work is lightweight at every complexity. */
const ALWAYS_FAST: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "fast",
  MODERATE: "fast",
  COMPLEX: "fast",
  CRITICAL: "fast",
};

/** Fast everywhere, promoted to balanced only at CRITICAL. */
const FAST_PROMOTED: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "fast",
  MODERATE: "fast",
  COMPLEX: "fast",
  CRITICAL: "balanced",
};

/** Router pattern — balanced from MODERATE upward. */
const ROUTER: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "fast",
  MODERATE: "balanced",
  COMPLEX: "balanced",
  CRITICAL: "balanced",
};

/** Orchestrator pattern — balanced at SIMPLE/MODERATE, capable at COMPLEX+. */
const ORCHESTRATOR: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "balanced",
  MODERATE: "balanced",
  COMPLEX: "capable",
  CRITICAL: "capable",
};

/** Deep analysis — capable from MODERATE upward. */
const DEEP_ANALYSIS: ModelRoutingRow = {
  TRIVIAL: "fast",
  SIMPLE: "balanced",
  MODERATE: "capable",
  COMPLEX: "capable",
  CRITICAL: "capable",
};

/** Debugger — starts at balanced (TRIVIAL/SIMPLE), capable from MODERATE+. */
const DEBUGGER_PRESET: ModelRoutingRow = {
  TRIVIAL: "balanced",
  SIMPLE: "balanced",
  MODERATE: "capable",
  COMPLEX: "capable",
  CRITICAL: "capable",
};

/** Always capable — high-fidelity execution regardless of complexity. */
const ALWAYS_CAPABLE: ModelRoutingRow = {
  TRIVIAL: "capable",
  SIMPLE: "capable",
  MODERATE: "capable",
  COMPLEX: "capable",
  CRITICAL: "capable",
};

/**
 * Exported preset registry for observability and tooling.
 *
 * Maps a human-readable preset name to its routing row so dashboards and
 * debug output can display which preset an agent uses.
 */
export const ROUTING_PRESETS: Record<string, ModelRoutingRow> = {
  ALWAYS_FAST,
  FAST_PROMOTED,
  ROUTER,
  ORCHESTRATOR,
  DEEP_ANALYSIS,
  DEBUGGER_PRESET,
  ALWAYS_CAPABLE,
};

/**
 * The system model routing table.
 *
 * Per-agent overrides for complexity -> model tier mapping. Agents not
 * listed here fall through to DEFAULT_COMPLEXITY_TIERS.
 *
 * Each entry references a named preset (see ROUTING_PRESETS above).
 * This is a pure DRY consolidation — every agent resolves to the exact
 * same tiers as before the refactor.
 */
export const MODEL_ROUTING_TABLE: ModelRoutingTable = {
  // --- Classifier (always fast) ---
  "lu-cognition": ALWAYS_FAST,

  // --- Fast-promoted (fast everywhere, balanced at CRITICAL) ---
  "lu-learner": FAST_PROMOTED,
  "lu-process-data": FAST_PROMOTED,
  "lu-router-fast": FAST_PROMOTED,
  "lu-shadow-scanner": FAST_PROMOTED,
  "lu-verifier-fast": FAST_PROMOTED,

  // --- Router (balanced from MODERATE+) ---
  "lu-router": ROUTER,

  // --- v2 researcher agents (ROUTER preset, Decision 10) ---
  "lu-architecture-researcher": ROUTER,
  "lu-implementation-researcher": ROUTER,
  "lu-ecosystem-researcher": ROUTER,
  "lu-risk-researcher": ROUTER,

  // --- Orchestrators (balanced → capable ramp) ---
  "lu-executor": ORCHESTRATOR,
  "lu-planner": ORCHESTRATOR,
  "lu-pm-planner": ORCHESTRATOR,
  "lu-plan-checker": ORCHESTRATOR,
  "lu-test-writer": ORCHESTRATOR,
  "lu-pr-reviewer": ORCHESTRATOR,
  "lu-discuss-researcher": ORCHESTRATOR,
  "lu-research-synthesizer": ORCHESTRATOR,
  "lu-codebase-mapper": ORCHESTRATOR,
  "lu-phase-researcher": ORCHESTRATOR,
  "lu-project-researcher": ORCHESTRATOR,
  "lu-repo-architect": ORCHESTRATOR,
  "lu-roadmapper": ORCHESTRATOR,
  "lu-roadmap-architect": ORCHESTRATOR,
  "lu-roadmap-prioritizer": ORCHESTRATOR,
  "lu-roadmap-qa": ORCHESTRATOR,
  "lu-roadmap-synthesizer": ORCHESTRATOR,
  product: ORCHESTRATOR,
  "qa-plan-generator": ORCHESTRATOR,

  // --- v2 graduator agent (ORCHESTRATOR preset, Decision 10) ---
  "lu-research-graduator": ORCHESTRATOR,

  // --- v2 research reviewer agents (DEEP_ANALYSIS preset, Decision 10) ---
  "lu-completeness-reviewer": DEEP_ANALYSIS,
  "lu-accuracy-reviewer": DEEP_ANALYSIS,
  "lu-actionability-reviewer": DEEP_ANALYSIS,

  // --- Deep analysis (capable from MODERATE+) ---
  "lu-verifier": DEEP_ANALYSIS,
  "lu-integration-checker": DEEP_ANALYSIS,
  "lu-premortem": DEEP_ANALYSIS,
  "code-architect": DEEP_ANALYSIS,
  "dx-advocate": DEEP_ANALYSIS,
  "code-simplifier": DEEP_ANALYSIS,
  "security-auditor": DEEP_ANALYSIS,
  "performance-auditor": DEEP_ANALYSIS,
  "code-developer": DEEP_ANALYSIS,
  ui: DEEP_ANALYSIS,
  ux: DEEP_ANALYSIS,

  // --- Debugger (balanced at TRIVIAL, capable from MODERATE+) ---
  "lu-debugger": DEBUGGER_PRESET,

  // --- Always capable (high-fidelity) ---
  "lu-executor-capable": ALWAYS_CAPABLE,
};

/**
 * Resolve the model tier for an agent at a given complexity level.
 *
 * This is the **primary** model routing function. The MODEL_ROUTING_TABLE
 * is the single source of truth for agent model selection.
 *
 * Lookup order:
 * 1. Agent-specific entry in MODEL_ROUTING_TABLE
 * 2. DEFAULT_COMPLEXITY_TIERS fallback
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
