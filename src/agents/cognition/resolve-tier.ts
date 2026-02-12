/**
 * Tier resolution for per-agent cognition.
 *
 * Resolves the effective cognition tier for an agent given its default
 * tier, its promotion ceiling, and the current task complexity level.
 * The complexity matrix defines tier-to-tier promotions; the agent's
 * promotable_to ceiling caps the result.
 */
import type { CognitionTier } from "../types/agent.types";
import type { ComplexityLevel } from "../../complexity/types";
import { DEFAULT_COMPLEXITY_MATRIX } from "../../complexity/defaults";

/** Numeric order for tier comparison */
export const TIER_ORDER: Record<CognitionTier, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
};

/**
 * Resolves the effective cognition tier for an agent.
 *
 * Takes the agent's default tier, its promotion ceiling, and the
 * current task complexity level. Returns the effective tier after
 * applying complexity-driven promotions, capped at the ceiling.
 *
 * @param defaultTier - Agent's default cognition tier from frontmatter
 * @param promotableTo - Maximum tier this agent can reach
 * @param complexityLevel - Current task complexity level
 * @returns The effective cognition tier for this invocation
 *
 * @example
 * ```typescript
 * // lu-executor: default T2, promotable to T3, at COMPLEX complexity
 * resolveEffectiveTier('T2', 'T3', 'COMPLEX') // Returns 'T3'
 *
 * // code-architect: default T0, promotable to T1, at CRITICAL complexity
 * resolveEffectiveTier('T0', 'T1', 'CRITICAL') // Returns 'T1'
 *
 * // code-simplifier: default T0, promotable to T0, at CRITICAL complexity
 * resolveEffectiveTier('T0', 'T0', 'CRITICAL') // Returns 'T0' (ceiling blocks promotion)
 * ```
 */
export function resolveEffectiveTier(
  defaultTier: CognitionTier,
  promotableTo: CognitionTier,
  complexityLevel: ComplexityLevel,
): CognitionTier {
  const gate = DEFAULT_COMPLEXITY_MATRIX[complexityLevel];
  const promotions = gate.cognitionPromotions;

  if (!promotions) return defaultTier;

  const promoted = promotions[defaultTier] ?? defaultTier;

  // Cap at promotable_to ceiling
  if (TIER_ORDER[promoted] > TIER_ORDER[promotableTo]) {
    return promotableTo;
  }

  return promoted;
}
