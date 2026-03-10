/**
 * Appetite declaration types and utilities for luca-state.
 *
 * Provides the "fixed appetite, variable scope" constraint that gives
 * developers control over investment ceilings. Appetite levels map to
 * token budgets and context usage thresholds.
 *
 * Self-contained copy of appetite types used by guards, defaults, and
 * the bridge. No external dependencies beyond TypeScript and local types.
 *
 * @module luca-state/utils/appetite-utils
 */

import type { ComplexityLevel } from "./complexity-utils";

/** The five appetite levels, from smallest to largest investment */
export const APPETITE_LEVELS = [
  "Micro",
  "Small",
  "Medium",
  "Large",
  "XL",
] as const;
export type AppetiteLevel = (typeof APPETITE_LEVELS)[number];

/** Token ceiling per appetite level */
const APPETITE_TOKEN_CEILINGS: Record<AppetiteLevel, number> = {
  Micro: 25_000,
  Small: 50_000,
  Medium: 100_000,
  Large: 200_000,
  XL: 400_000,
};

/** Maximum context window usage percentage per appetite level */
const APPETITE_CONTEXT_PERCENTS: Record<AppetiteLevel, number> = {
  Micro: 30,
  Small: 40,
  Medium: 50,
  Large: 60,
  XL: 70,
};

/**
 * Infer an appetite level from complexity for low-complexity tasks.
 *
 * TRIVIAL and SIMPLE tasks have predictable scope, so appetite can
 * be auto-inferred without developer input. MODERATE and above require
 * explicit developer declaration because the investment decision is
 * non-trivial.
 *
 * @param complexity - The current complexity level
 * @returns AppetiteLevel for TRIVIAL/SIMPLE, null for MODERATE+
 *
 * @example
 * ```typescript
 * inferAppetiteFromComplexity("TRIVIAL");  // "Micro"
 * inferAppetiteFromComplexity("SIMPLE");   // "Small"
 * inferAppetiteFromComplexity("MODERATE"); // null
 * inferAppetiteFromComplexity("COMPLEX");  // null
 * ```
 */
export function inferAppetiteFromComplexity(
  complexity: ComplexityLevel,
): AppetiteLevel | null {
  if (complexity === "TRIVIAL") return "Micro";
  if (complexity === "SIMPLE") return "Small";
  return null;
}

/**
 * Get the token ceiling for an appetite level.
 *
 * The token ceiling is the maximum number of tokens that should be
 * consumed during execution at this appetite level. Exceeding this
 * ceiling triggers a pause for developer decision.
 *
 * @param level - The appetite level
 * @returns Token ceiling as a number
 *
 * @example
 * ```typescript
 * getAppetiteTokenCeiling("Micro");  // 25000
 * getAppetiteTokenCeiling("Medium"); // 100000
 * getAppetiteTokenCeiling("XL");     // 400000
 * ```
 */
export function getAppetiteTokenCeiling(level: AppetiteLevel): number {
  return APPETITE_TOKEN_CEILINGS[level];
}

/**
 * Get the maximum context window usage percentage for an appetite level.
 *
 * The context percent is the maximum percentage of the context window
 * that should be consumed at this appetite level. This maps to the
 * quality degradation curve — higher appetite allows more context usage
 * before quality degrades.
 *
 * @param level - The appetite level
 * @returns Context usage ceiling as a percentage (0-100)
 *
 * @example
 * ```typescript
 * getAppetiteContextPercent("Micro");  // 30
 * getAppetiteContextPercent("Medium"); // 50
 * getAppetiteContextPercent("XL");     // 70
 * ```
 */
export function getAppetiteContextPercent(level: AppetiteLevel): number {
  return APPETITE_CONTEXT_PERCENTS[level];
}
