/**
 * Token profile utilities for ceremony depth control.
 *
 * Provides model tier promotion/demotion and loop budget multipliers
 * based on the active token profile (budget, balanced, quality).
 *
 * - `budget`: Demotes non-protected agents one tier, halves loop budgets
 * - `balanced`: Identity — matches current behavior exactly (zero regression)
 * - `quality`: Promotes all agents one tier, doubles loop budgets
 *
 * Protected agents (lu-executor, lu-discuss-researcher, code-architect,
 * dx-advocate, security-auditor, code-simplifier, lu-learner) are never
 * demoted by the budget profile — they retain their base tier.
 *
 * Tier: T0 Foundation — imports only from sibling model-routing and
 * parent __schemas/complexity.schemas.
 */

import type {
  ComplexityLevel,
  ModelTier,
} from "../__schemas/complexity.schemas";

import { resolveModelForAgent } from "./model-routing";

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * The three available token profiles, ordered from most constrained
 * to most generous.
 */
export const TOKEN_PROFILES = ["budget", "balanced", "quality"] as const;

/**
 * A token profile controls ceremony depth:
 * - `budget` — demote non-protected agents, halve loop budgets
 * - `balanced` — default behavior, no modifications
 * - `quality` — promote all agents, double loop budgets
 */
export type TokenProfile = (typeof TOKEN_PROFILES)[number];

/**
 * Frozen set of agent names that the budget profile never demotes.
 *
 * These agents perform critical work where model demotion would
 * unacceptably reduce output quality (execution, deep review, learning).
 */
export const PROTECTED_AGENTS: ReadonlySet<string> = Object.freeze(
  new Set([
    "lu-executor",
    "lu-discuss-researcher",
    "code-architect",
    "dx-advocate",
    "security-auditor",
    "code-simplifier",
    "lu-learner",
  ]),
);

// ─── Tier Modifiers ─────────────────────────────────────────────────────────

/**
 * Demote a model tier by one level (toward fast).
 *
 * - `fast` stays `fast` (already at floor)
 * - `balanced` → `fast`
 * - `capable` → `balanced`
 *
 * @param tier - The current model tier
 * @returns The demoted model tier
 */
export function demoteTier(tier: ModelTier): ModelTier {
  switch (tier) {
    case "capable":
      return "balanced";
    case "balanced":
      return "fast";
    case "fast":
      return "fast";
  }
}

/**
 * Promote a model tier by one level (toward capable).
 *
 * - `capable` stays `capable` (already at ceiling)
 * - `balanced` → `capable`
 * - `fast` → `balanced`
 *
 * @param tier - The current model tier
 * @returns The promoted model tier
 */
export function promoteTier(tier: ModelTier): ModelTier {
  switch (tier) {
    case "fast":
      return "balanced";
    case "balanced":
      return "capable";
    case "capable":
      return "capable";
  }
}

// ─── Profile-Aware Resolution ───────────────────────────────────────────────

/**
 * Resolve the model tier for an agent, adjusted by token profile.
 *
 * Wraps `resolveModelForAgent` from the model routing table and applies
 * profile-based tier modification:
 *
 * - `balanced` — returns the base tier unchanged (zero regression)
 * - `budget` — demotes the base tier by one level, UNLESS the agent is
 *   in the PROTECTED_AGENTS set (protected agents keep their base tier)
 * - `quality` — promotes the base tier by one level (all agents)
 *
 * @param agentName - The agent's name (e.g., "lu-executor", "lu-planner")
 * @param complexity - Current task complexity level
 * @param profile - Active token profile
 * @returns The profile-adjusted model tier
 *
 * @example
 * ```typescript
 * resolveModelWithProfile("lu-cognition", "MODERATE", "budget")   // "fast" (already at floor)
 * resolveModelWithProfile("lu-planner", "MODERATE", "budget")     // "fast" (balanced demoted)
 * resolveModelWithProfile("lu-executor", "MODERATE", "budget")    // "balanced" (protected)
 * resolveModelWithProfile("lu-planner", "MODERATE", "quality")    // "capable" (balanced promoted)
 * resolveModelWithProfile("lu-planner", "MODERATE", "balanced")   // "balanced" (no change)
 * ```
 */
export function resolveModelWithProfile(
  agentName: string,
  complexity: ComplexityLevel,
  profile: TokenProfile,
): ModelTier {
  const baseTier = resolveModelForAgent(agentName, complexity);

  switch (profile) {
    case "balanced":
      return baseTier;

    case "budget":
      if (PROTECTED_AGENTS.has(agentName)) {
        return baseTier;
      }
      return demoteTier(baseTier);

    case "quality":
      return promoteTier(baseTier);
  }
}

// ─── Loop Budget Multiplier ─────────────────────────────────────────────────

/**
 * Apply a token-profile multiplier to a loop budget value.
 *
 * - `budget` — halves the value (floor 1, so at least one iteration runs)
 * - `balanced` — identity (returns the value unchanged)
 * - `quality` — doubles the value
 *
 * @param baseValue - The base loop budget (e.g., harness fix iterations)
 * @param profile - Active token profile
 * @returns The adjusted loop budget
 *
 * @example
 * ```typescript
 * applyLoopBudgetMultiplier(2, "budget")   // 1
 * applyLoopBudgetMultiplier(1, "budget")   // 1 (floor)
 * applyLoopBudgetMultiplier(2, "balanced") // 2
 * applyLoopBudgetMultiplier(2, "quality")  // 4
 * ```
 */
export function applyLoopBudgetMultiplier(
  baseValue: number,
  profile: TokenProfile,
): number {
  switch (profile) {
    case "budget":
      return Math.max(1, Math.floor(baseValue * 0.5));
    case "balanced":
      return baseValue;
    case "quality":
      return baseValue * 2;
  }
}
