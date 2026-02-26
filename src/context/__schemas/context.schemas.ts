/**
 * Core type definitions for the Luca context module.
 *
 * Context tiers (T0-T3) parallel cognition tiers and control how much
 * contextual information is assembled for each sub-agent invocation.
 * Higher tiers include more documents (BRAIN, MEMORY, STATE, WORKING)
 * at the cost of token budget. Isolation modes restrict document sets
 * for security-sensitive or cold-start agents.
 *
 * All types are derived from Zod schemas via `z.infer`. No standalone
 * interface definitions. This module is standalone at type level --
 * it does NOT import from agent.schemas or complexity/.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Context tier constants
// ---------------------------------------------------------------------------

/** The four context tiers, from minimal to fully-loaded */
export const CONTEXT_TIERS = ["T0", "T1", "T2", "T3"] as const;

/** Zod enum for context tiers */
export const contextTierSchema = z.enum(CONTEXT_TIERS);

/** Context tier type derived from schema */
export type ContextTier = z.infer<typeof contextTierSchema>;

/** Numeric index for tier comparison (T0=0, T3=3) */
export const CONTEXT_TIER_ORDER: Record<ContextTier, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
};

// ---------------------------------------------------------------------------
// Isolation modes
// ---------------------------------------------------------------------------

/** Isolation modes control document filtering for sensitive agents */
export const ISOLATION_MODES = ["none", "cold", "warm"] as const;

/** Zod enum for isolation modes */
export const isolationModeSchema = z.enum(ISOLATION_MODES);

/** Isolation mode type derived from schema */
export type IsolationMode = z.infer<typeof isolationModeSchema>;

// ---------------------------------------------------------------------------
// Configuration schemas
// ---------------------------------------------------------------------------

/**
 * Per-agent context configuration.
 *
 * Defines the default context tier, the maximum tier the agent can be
 * promoted to by complexity gating, and the isolation mode.
 *
 * Uses snake_case for API compatibility.
 */
export const contextConfigSchema = z.object({
  /** Default context tier for this agent */
  default_tier: contextTierSchema.default("T0"),
  /** Maximum tier this agent can be promoted to */
  promotable_to: contextTierSchema.default("T0"),
  /** Isolation mode: none (full access), cold (minimal), warm (partial) */
  isolation: isolationModeSchema.default("none"),
});

/** Context configuration type derived from schema */
export type ContextConfig = z.infer<typeof contextConfigSchema>;

/**
 * Token budget allocation for a sub-agent invocation.
 *
 * Controls how the total token budget is split between context documents
 * and output reservation. The advisory flag indicates whether the budget
 * is a hard limit or a soft guideline.
 *
 * Uses snake_case for API compatibility.
 */
export const budgetAllocationSchema = z.object({
  /** Total token budget for the invocation */
  total_tokens: z.number().int().positive(),
  /** Fraction of budget reserved for output (0.25 to 0.5) */
  output_reservation_pct: z.number().min(0.25).max(0.5).default(0.3),
  /** Whether the budget is advisory (soft) or enforced (hard) */
  advisory: z.boolean().default(false),
});

/** Budget allocation type derived from schema */
export type BudgetAllocation = z.infer<typeof budgetAllocationSchema>;

/**
 * The complete set of context documents that can be assembled for an agent.
 *
 * Each field is optional -- which fields are populated depends on the
 * resolved context tier and isolation mode. Higher tiers include more
 * documents. Some fields are mutually exclusive (e.g., brain_summary vs
 * brain_full).
 *
 * Uses snake_case for API compatibility.
 */
export const contextDocumentSetSchema = z.object({
  /** The plan content (PLAN.md or current phase plan) */
  plan_content: z.string().optional(),
  /** Condensed BRAIN.md summary */
  brain_summary: z.string().optional(),
  /** STATE.md content */
  state_content: z.string().optional(),
  /** Selectively recalled MEMORY.md entries */
  memory_entries: z.string().optional(),
  /** WORKING.md session memory */
  working_content: z.string().optional(),
  /** Full BRAIN.md content (replaces brain_summary at T3) */
  brain_full: z.string().optional(),
  /** Full MEMORY.md content (replaces memory_entries at T3) */
  memory_full: z.string().optional(),
  /** Summaries of other agents in the workflow */
  agent_summaries: z.string().optional(),
  /** Git diff for cold-start context */
  git_diff: z.string().optional(),
  /** Summaries of related plans */
  plan_summaries: z.string().optional(),
});

/** Context document set type derived from schema */
export type ContextDocumentSet = z.infer<typeof contextDocumentSetSchema>;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Check if a context tier meets or exceeds a threshold tier.
 *
 * @param tier - The tier to check
 * @param threshold - The minimum required tier
 * @returns true if tier >= threshold
 *
 * @example
 * ```typescript
 * meetsContextThreshold("T2", "T1") // true
 * meetsContextThreshold("T0", "T1") // false
 * meetsContextThreshold("T3", "T3") // true
 * ```
 */
export function meetsContextThreshold(
  tier: ContextTier,
  threshold: ContextTier,
): boolean {
  return CONTEXT_TIER_ORDER[tier] >= CONTEXT_TIER_ORDER[threshold];
}

/**
 * Return the higher of two context tiers.
 *
 * @param a - First tier
 * @param b - Second tier
 * @returns The tier with the higher numeric order
 *
 * @example
 * ```typescript
 * maxContextTier("T1", "T2") // "T2"
 * maxContextTier("T3", "T0") // "T3"
 * ```
 */
export function maxContextTier(a: ContextTier, b: ContextTier): ContextTier {
  return CONTEXT_TIER_ORDER[a] >= CONTEXT_TIER_ORDER[b] ? a : b;
}
