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
export const GOOD_ZONES = new Set(["peak", "good"]);

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
  for (const obs of observations) {
    const zone = parseZoneContent(obs.content).zone ?? null;
    if (zone !== null && GOOD_ZONES.has(zone.toLowerCase())) {
      hits++;
    }
  }

  return hits / observations.length;
}

/**
 * Derive a recall precision approximation from observation engrams.
 *
 * Calculates how consistently observations land in the same zone tier.
 * If most observations are in peak/good zones, precision is high (0.8+).
 * Mixed zones indicate lower precision.
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
