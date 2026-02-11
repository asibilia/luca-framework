/**
 * Context tier resolution for sub-agent invocations.
 *
 * Resolves the effective context tier for an agent given its default
 * tier, its promotion ceiling, and the current task complexity level.
 * Complexity-driven promotions upgrade an agent's context tier so that
 * harder tasks receive more contextual information.
 *
 * This parallels the cognition tier resolution in
 * `src/agents/cognition/resolve-tier.ts` but operates on context tiers
 * (document assembly) rather than cognition tiers (reasoning depth).
 */
import type { ComplexityLevel } from "../complexity/types";

import type { ContextTier } from "./types";
import { CONTEXT_TIER_ORDER } from "./types";

// ---------------------------------------------------------------------------
// Default context promotions by complexity level
// ---------------------------------------------------------------------------

/**
 * Maps each complexity level to context tier promotions.
 *
 * - TRIVIAL / SIMPLE: no promotions (undefined)
 * - MODERATE: T0 -> T1, T1 -> T2
 * - COMPLEX / CRITICAL: T0 -> T1, T1 -> T2, T2 -> T3
 *
 * These mirror cognition promotions from the complexity matrix but
 * are specific to context document assembly.
 */
export const DEFAULT_CONTEXT_PROMOTIONS: Record<
  ComplexityLevel,
  Partial<Record<ContextTier, ContextTier>> | undefined
> = {
  TRIVIAL: undefined,
  SIMPLE: undefined,
  MODERATE: { T0: "T1", T1: "T2" },
  COMPLEX: { T0: "T1", T1: "T2", T2: "T3" },
  CRITICAL: { T0: "T1", T1: "T2", T2: "T3" },
};

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the effective context tier for an agent invocation.
 *
 * Takes the agent's default context tier, its promotion ceiling, and
 * the current task complexity. Optionally accepts a custom promotions
 * map (falls back to DEFAULT_CONTEXT_PROMOTIONS if not provided).
 *
 * Logic:
 * 1. Look up the promotions map for the given complexity level
 * 2. If the default tier has a promotion, apply it
 * 3. Cap the result at the promotable_to ceiling
 *
 * @param defaultTier - Agent's default context tier from profile
 * @param promotableTo - Maximum context tier this agent can reach
 * @param complexityLevel - Current task complexity level
 * @param contextPromotions - Optional custom promotions map (overrides defaults)
 * @returns The effective context tier for this invocation
 *
 * @example
 * ```typescript
 * // lu-executor: default T2, promotable to T3, at COMPLEX complexity
 * resolveEffectiveContextTier("T2", "T3", "COMPLEX")
 * // Returns "T3" (T2 promoted to T3 at COMPLEX, within ceiling)
 *
 * // code-architect: default T0, promotable to T1, at CRITICAL complexity
 * resolveEffectiveContextTier("T0", "T1", "CRITICAL")
 * // Returns "T1" (T0 promoted to T1, capped at ceiling T1)
 *
 * // dx-advocate: default T0, promotable to T0, at CRITICAL complexity
 * resolveEffectiveContextTier("T0", "T0", "CRITICAL")
 * // Returns "T0" (promotion to T1 blocked by ceiling T0)
 *
 * // Custom promotions override
 * resolveEffectiveContextTier("T0", "T3", "MODERATE", {
 *   TRIVIAL: undefined,
 *   SIMPLE: undefined,
 *   MODERATE: { T0: "T2" },
 *   COMPLEX: { T0: "T3" },
 *   CRITICAL: { T0: "T3" },
 * })
 * // Returns "T2" (custom promotion T0 -> T2 at MODERATE)
 * ```
 */
export function resolveEffectiveContextTier(
  defaultTier: ContextTier,
  promotableTo: ContextTier,
  complexityLevel: ComplexityLevel,
  contextPromotions?: Record<
    ComplexityLevel,
    Partial<Record<ContextTier, ContextTier>> | undefined
  >,
): ContextTier {
  const promotionsMap = contextPromotions ?? DEFAULT_CONTEXT_PROMOTIONS;
  const promotions = promotionsMap[complexityLevel];

  // No promotions at this complexity level
  if (!promotions) return defaultTier;

  // Apply promotion if one exists for the default tier
  const promoted = promotions[defaultTier] ?? defaultTier;

  // Cap at promotable_to ceiling
  if (CONTEXT_TIER_ORDER[promoted] > CONTEXT_TIER_ORDER[promotableTo]) {
    return promotableTo;
  }

  return promoted;
}
