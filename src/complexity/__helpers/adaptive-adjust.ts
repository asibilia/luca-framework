/**
 * Adaptive complexity adjustment module.
 *
 * Adjusts classifier output based on historical routing accuracy.
 * If the classifier consistently under-predicts or over-predicts
 * complexity, this module bumps the level by 1 in the appropriate
 * direction. User overrides always win (D10).
 *
 * Constraints:
 * - Maximum adjustment: 1 level in either direction
 * - Minimum history: 3 entries required for adjustment
 * - Window size: last 20 entries
 * - Threshold: > 60% under/over-prediction triggers adjustment
 *
 * @example
 * ```typescript
 * const result = adjustComplexity({
 *   raw_complexity: "MODERATE",
 *   history: routingEntries,
 * });
 * // { adjusted: "COMPLEX", reason: "under-prediction detected (75% of recent entries)" }
 * ```
 */
import {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
} from "../__schemas/complexity.schemas";

import type { ComplexityLevel } from "../__schemas/complexity.schemas";
import type { RoutingHistoryEntry } from "../__schemas/classify.schemas";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Number of history entries to consider for adjustment */
const WINDOW_SIZE = 20;

/** Minimum number of entries required before adjusting */
const MIN_ENTRIES = 3;

/** Threshold ratio for triggering adjustment (> 60%) */
const ADJUSTMENT_THRESHOLD = 0.6;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Adjust complexity based on routing history accuracy.
 *
 * @param options - Configuration for the adjustment
 * @param options.raw_complexity - Complexity level from the classifier
 * @param options.history - Routing history entries for analysis
 * @param options.override - User-provided complexity override (always wins)
 * @returns Adjusted complexity level and reason string
 *
 * @example
 * ```typescript
 * // User override always wins
 * adjustComplexity({
 *   raw_complexity: "MODERATE",
 *   history: [],
 *   override: "COMPLEX",
 * });
 * // { adjusted: "COMPLEX", reason: "user override" }
 * ```
 */
export function adjustComplexity(options: {
  raw_complexity: ComplexityLevel;
  history: RoutingHistoryEntry[];
  override?: ComplexityLevel;
}): { adjusted: ComplexityLevel; reason: string } {
  const { raw_complexity, history, override } = options;

  // D10: --complexity always wins
  if (override !== undefined) {
    return { adjusted: override, reason: "user override" };
  }

  // Insufficient history -- return raw
  if (history.length < MIN_ENTRIES) {
    return { adjusted: raw_complexity, reason: "insufficient history" };
  }

  // Take last WINDOW_SIZE entries
  const window = history.slice(-WINDOW_SIZE);

  // Count under-predictions and over-predictions
  let underCount = 0;
  let overCount = 0;

  for (const entry of window) {
    const initial = COMPLEXITY_ORDER[entry.initial_complexity];
    const final = COMPLEXITY_ORDER[entry.final_complexity];

    if (final > initial) {
      underCount++;
    } else if (final < initial) {
      overCount++;
    }
  }

  const total = window.length;
  const underRatio = underCount / total;
  const overRatio = overCount / total;

  // Under-prediction: bump up 1 level (capped at CRITICAL)
  if (underRatio > ADJUSTMENT_THRESHOLD) {
    const currentIndex = COMPLEXITY_ORDER[raw_complexity];
    const newIndex = Math.min(currentIndex + 1, COMPLEXITY_LEVELS.length - 1);
    const adjusted = COMPLEXITY_LEVELS[newIndex] ?? raw_complexity;
    const pct = Math.round(underRatio * 100);
    return {
      adjusted,
      reason: `under-prediction detected (${pct}% of recent ${total} entries)`,
    };
  }

  // Over-prediction: bump down 1 level (capped at TRIVIAL)
  if (overRatio > ADJUSTMENT_THRESHOLD) {
    const currentIndex = COMPLEXITY_ORDER[raw_complexity];
    const newIndex = Math.max(currentIndex - 1, 0);
    const adjusted = COMPLEXITY_LEVELS[newIndex] ?? raw_complexity;
    const pct = Math.round(overRatio * 100);
    return {
      adjusted,
      reason: `over-prediction detected (${pct}% of recent ${total} entries)`,
    };
  }

  // No significant bias detected
  return { adjusted: raw_complexity, reason: "no adjustment needed" };
}
