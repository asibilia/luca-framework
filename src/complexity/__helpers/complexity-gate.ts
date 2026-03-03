/**
 * Complexity gating helpers for debate/tribunal activation.
 *
 * Provides a single source of truth for determining whether a given
 * complexity level qualifies for debate-style workflows (tribunals,
 * consensus challenges, etc.). This eliminates duplicated
 * `qualifyingComplexities` arrays across tribunal detectors.
 *
 * Tier: T0 Foundation — imports nothing from src/.
 */

/**
 * Complexity levels that qualify for debate/tribunal workflows.
 *
 * Only COMPLEX and CRITICAL tasks warrant the additional token cost
 * of multi-agent debate. See `.claude/rules/complexity-gating.md`
 * for the full complexity matrix.
 */
export const DEBATE_QUALIFYING_COMPLEXITIES = ["COMPLEX", "CRITICAL"] as const;

/**
 * Determine whether a complexity level qualifies for debate workflows.
 *
 * Returns true when the given complexity is COMPLEX or CRITICAL
 * (case-insensitive). All other levels (TRIVIAL, SIMPLE, MODERATE)
 * return false, as do empty or unknown strings.
 *
 * @param complexity - The task complexity level to evaluate
 * @returns true if the complexity qualifies for debate/tribunal activation
 *
 * @example
 * ```typescript
 * isDebateComplexity("COMPLEX");   // true
 * isDebateComplexity("CRITICAL");  // true
 * isDebateComplexity("complex");   // true  (case-insensitive)
 * isDebateComplexity("Critical");  // true  (case-insensitive)
 * isDebateComplexity("MODERATE");  // false
 * isDebateComplexity("SIMPLE");    // false
 * isDebateComplexity("TRIVIAL");   // false
 * isDebateComplexity("");          // false
 * isDebateComplexity("unknown");   // false
 * ```
 */
export function isDebateComplexity(complexity: string): boolean {
  const normalized = complexity.toUpperCase();
  return (DEBATE_QUALIFYING_COMPLEXITIES as readonly string[]).includes(
    normalized,
  );
}
