/**
 * Pure data-transform helpers for MuninnDB observation engrams.
 *
 * These functions have no React dependency and are shared between the
 * useObservations hook and any server-side consumers that process
 * session:observation-* engrams.
 */

import type { MuninnEngram } from "~/lib/muninn-types";
import { parseZoneContent } from "~/lib/muninn-helpers";

// ---------------------------------------------------------------------------
// Zone classification
// ---------------------------------------------------------------------------

/**
 * Set of zone names considered "good" for recall quality measurement.
 *
 * Used by deriveHitRateFromObservations and derivePrecisionFromObservations
 * to count positive signal observations.
 */
export const GOOD_ZONES: ReadonlySet<string> = new Set(["peak", "good"]);

// ---------------------------------------------------------------------------
// Observation-derived metric helpers
// ---------------------------------------------------------------------------

/**
 * Derive a recall hit-rate approximation from observation engrams.
 *
 * Counts observations whose zone is "peak" or "good" as successful recall
 * activations, and returns the ratio against total observations.
 *
 * Returns null when there are no observations to derive from.
 *
 * @param observations - Array of session:observation-* engrams
 * @returns Hit rate in [0, 1] range, or null if no observations present
 *
 * @example
 * ```typescript
 * const rate = deriveHitRateFromObservations(observations);
 * // rate === 0.75 when 3 of 4 observations are in GOOD_ZONES
 * ```
 */
export function deriveHitRateFromObservations(
  observations: MuninnEngram[],
): number | null {
  if (observations.length === 0) return null;

  let hits = 0;
  let parseable = 0;
  for (const obs of observations) {
    const zone = parseZoneContent(obs.content).zone ?? null;
    if (zone !== null) {
      parseable++;
      if (GOOD_ZONES.has(zone.toLowerCase())) {
        hits++;
      }
    }
  }

  if (parseable === 0) return null;
  return hits / parseable;
}

/**
 * Derive a recall precision approximation from observation engrams.
 *
 * Computes the ratio of observations in "peak"/"good" zones and scales
 * it into a 0.4–1.0 range. Higher good-zone ratios produce higher
 * precision scores. Only considers observations with parseable zone data.
 *
 * Returns null when there are no observations to derive from.
 *
 * @param observations - Array of session:observation-* engrams
 * @returns Precision score in [0.4, 1.0] range, or null if unparseable
 *
 * @example
 * ```typescript
 * const precision = derivePrecisionFromObservations(observations);
 * // precision ≥ 0.8 when ≥70% of observations are in GOOD_ZONES
 * ```
 */
export function derivePrecisionFromObservations(
  observations: MuninnEngram[],
): number | null {
  if (observations.length === 0) return null;

  let goodCount = 0;
  let totalParseable = 0;

  for (const obs of observations) {
    const zone = parseZoneContent(obs.content).zone ?? null;
    if (zone !== null) {
      totalParseable++;
      if (GOOD_ZONES.has(zone.toLowerCase())) {
        goodCount++;
      }
    }
  }

  if (totalParseable === 0) return null;

  const goodRatio = goodCount / totalParseable;

  // High precision: ≥70% in good zones → scale 0.8–1.0
  // Low precision: <70% → scale 0.4–0.8
  if (goodRatio >= 0.7) {
    return 0.8 + (goodRatio - 0.7) * (0.2 / 0.3);
  }
  return 0.4 + goodRatio * (0.4 / 0.7);
}
