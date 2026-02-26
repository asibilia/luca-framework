/**
 * Context tier resolution for sub-agent invocations.
 *
 * Resolves the effective context tier for an agent given its default
 * tier, its promotion ceiling, and the current task complexity level.
 * Complexity-driven promotions upgrade an agent's context tier so that
 * harder tasks receive more contextual information.
 *
 * This parallels the cognition tier resolution in
 * `src/agents/__helpers/resolve-tier.ts` but operates on context tiers
 * (document assembly) rather than cognition tiers (reasoning depth).
 */
import type { ComplexityLevel } from "~/complexity/complexity.schemas";
import { DEFAULT_COMPLEXITY_MATRIX } from "~/complexity/defaults";

import type { ContextTier } from "./context.schemas";
import { CONTEXT_TIER_ORDER } from "./context.schemas";

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

// ---------------------------------------------------------------------------
// Matrix-driven resolver
// ---------------------------------------------------------------------------

/**
 * Resolves the effective context tier for a sub-agent using the complexity matrix.
 *
 * This is a convenience entry point that reads `contextPromotions` directly
 * from the `DEFAULT_COMPLEXITY_MATRIX` gate for the given complexity level,
 * then applies the same promotion-and-cap logic as `resolveEffectiveContextTier`.
 *
 * Use this when you have a complexity level and want to resolve a context tier
 * without manually extracting the promotions map from the matrix.
 *
 * @param defaultTier - Agent's default context tier from profile
 * @param promotableTo - Maximum context tier this agent can reach
 * @param complexityLevel - Current task complexity level
 * @returns The effective context tier for this invocation
 *
 * @example
 * ```typescript
 * // lu-executor: default T1, promotable to T3, at COMPLEX complexity
 * resolveContextTierFromMatrix("T1", "T3", "COMPLEX")
 * // Returns "T2" (T1 promoted to T2 at COMPLEX, within ceiling T3)
 *
 * // code-architect: default T0, promotable to T1, at MODERATE complexity
 * resolveContextTierFromMatrix("T0", "T1", "MODERATE")
 * // Returns "T1" (T0 promoted to T1 at MODERATE, within ceiling T1)
 *
 * // dx-advocate: default T0, promotable to T0, at CRITICAL complexity
 * resolveContextTierFromMatrix("T0", "T0", "CRITICAL")
 * // Returns "T0" (promotion to T1 blocked by ceiling T0)
 * ```
 */
export function resolveContextTierFromMatrix(
  defaultTier: ContextTier,
  promotableTo: ContextTier,
  complexityLevel: ComplexityLevel,
): ContextTier {
  const gate = DEFAULT_COMPLEXITY_MATRIX[complexityLevel];
  const promotions = gate.contextPromotions;

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
