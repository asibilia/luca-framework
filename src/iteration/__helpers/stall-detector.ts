/**
 * Stall detection utilities for verification loops.
 *
 * Provides a focused API for detecting stall conditions during
 * harness and verify iteration loops. Builds on the convergence
 * module's signal computation to provide explicit stall detection
 * with configurable thresholds.
 */
import type {
  ConvergenceSignals,
  ErrorFingerprint,
} from "../__schemas/iteration.schemas";

/**
 * Result of a stall detection check.
 *
 * Uses snake_case for data schema compatibility.
 */
export interface StallDetectionResult {
  /** Whether a stall condition was detected */
  stalled: boolean;
  /** Current consecutive stale count (including this iteration) */
  stale_count: number;
  /** Whether the loop should halt based on threshold */
  should_halt: boolean;
  /** Which individual stall indicators fired */
  indicators: StallIndicators;
  /** Human-readable reason for the stall (empty when not stalled) */
  reason: string;
}

/**
 * Individual stall indicators checked during detection.
 */
export interface StallIndicators {
  /** Same error fingerprints appearing across iterations */
  fingerprints_unchanged: boolean;
  /** No artifact changes (git diff empty) between iterations */
  no_artifact_changes: boolean;
  /** Error count did not decrease */
  no_error_improvement: boolean;
  /** Semantic overlap is high (when available) */
  semantic_unchanged: boolean | null;
}

/**
 * Options for stall detection.
 *
 * Uses snake_case for data schema compatibility.
 */
export interface StallDetectionOptions {
  /** Number of consecutive stale iterations before recommending halt (default 2) */
  stale_threshold?: number;
  /** Fingerprint overlap threshold to consider unchanged (default 0.8) */
  fingerprint_threshold?: number;
  /** Semantic overlap threshold to consider unchanged (default 0.9) */
  semantic_threshold?: number;
}

const DEFAULT_OPTIONS: Required<StallDetectionOptions> = {
  stale_threshold: 2,
  fingerprint_threshold: 0.8,
  semantic_threshold: 0.9,
};

/**
 * Detect whether a verification loop is stalled.
 *
 * A stall is detected when 2 or more of the following indicators fire:
 * - error_count_delta >= 0 (no error improvement)
 * - fingerprint_overlap >= threshold (same errors repeating)
 * - artifact_change_delta === 0 (no file changes)
 * - semantic_overlap >= threshold (when present, error messages unchanged)
 *
 * @param signals - Convergence signals from the current iteration
 * @param previousStaleCount - Number of consecutive stale iterations before this one
 * @param options - Optional detection thresholds
 * @returns StallDetectionResult with stall status and indicators
 *
 * @example
 * ```typescript
 * const result = detectStall(signals, previousStaleCount, { stale_threshold: 3 });
 * if (result.should_halt) {
 *   console.log(`Loop halting: ${result.reason}`);
 * }
 * ```
 */
export function detectStall(
  signals: ConvergenceSignals,
  previousStaleCount: number,
  options?: StallDetectionOptions,
): StallDetectionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const indicators: StallIndicators = {
    fingerprints_unchanged:
      signals.fingerprint_overlap >= opts.fingerprint_threshold,
    no_artifact_changes: signals.artifact_change_delta === 0,
    no_error_improvement: signals.error_count_delta >= 0,
    semantic_unchanged:
      signals.semantic_overlap !== undefined
        ? signals.semantic_overlap >= opts.semantic_threshold
        : null,
  };

  // Count fired indicators (exclude null semantic)
  const fired = [
    indicators.fingerprints_unchanged,
    indicators.no_artifact_changes,
    indicators.no_error_improvement,
    ...(indicators.semantic_unchanged !== null
      ? [indicators.semantic_unchanged]
      : []),
  ].filter(Boolean).length;

  const stalled = fired >= 2;
  const staleCount = stalled ? previousStaleCount + 1 : 0;
  const shouldHalt = staleCount >= opts.stale_threshold;

  const reasons: string[] = [];
  if (indicators.fingerprints_unchanged) {
    reasons.push(
      `fingerprint overlap ${signals.fingerprint_overlap.toFixed(2)} >= ${opts.fingerprint_threshold}`,
    );
  }
  if (indicators.no_artifact_changes) {
    reasons.push("no artifact changes");
  }
  if (indicators.no_error_improvement) {
    reasons.push(`error count delta ${signals.error_count_delta} >= 0`);
  }
  if (indicators.semantic_unchanged === true) {
    reasons.push(
      `semantic overlap ${signals.semantic_overlap?.toFixed(2)} >= ${opts.semantic_threshold}`,
    );
  }

  const reason = stalled
    ? `Stall detected (${staleCount} consecutive): ${reasons.join(", ")}`
    : "";

  return {
    stalled,
    stale_count: staleCount,
    should_halt: shouldHalt,
    indicators,
    reason,
  };
}

/**
 * Check if error fingerprints are identical between two iterations.
 *
 * This is a quick check for the most obvious stall condition:
 * the exact same set of errors appearing with no changes at all.
 *
 * @param current - Fingerprints from current iteration
 * @param previous - Fingerprints from previous iteration
 * @returns true if the fingerprint sets are identical
 */
export function areFingerprintsIdentical(
  current: ErrorFingerprint[],
  previous: ErrorFingerprint[],
): boolean {
  if (current.length !== previous.length) return false;
  const currentSet = new Set(current);
  return previous.every((fp) => currentSet.has(fp));
}
