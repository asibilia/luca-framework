/**
 * In-memory throttle utility for Pi extensions.
 *
 * Replaces /tmp file timestamp-based throttling used in shell scripts.
 * Uses a Map<string, number> that resets naturally when Pi restarts
 * (same behavioral contract as /tmp files across sessions).
 *
 * Source: src/hooks/pi-extensions/__helpers/throttle.ts
 * Deployed to: .pi/extensions/__helpers/throttle.ts
 */

/** In-memory timestamp store keyed by throttle identifier. */
const timestamps = new Map<string, number>();

/**
 * Check whether an action should run based on a time-based throttle.
 *
 * Returns true if the action should run (first call, or interval has
 * elapsed since last run). Returns false if the action should be
 * suppressed (within the throttle interval).
 *
 * Automatically updates the timestamp when returning true.
 *
 * @param key - Unique identifier for the throttled action
 * @param intervalMs - Minimum interval between runs in milliseconds
 * @returns true if the action should run, false to suppress
 *
 * @example
 * ```typescript
 * // Run at most once every 60 seconds
 * if (shouldRunThrottled("context-check", 60_000)) {
 *   runContextCheck();
 * }
 * ```
 */
export function shouldRunThrottled(key: string, intervalMs: number): boolean {
  const now = Date.now();
  const lastRun = timestamps.get(key);

  if (lastRun !== undefined && now - lastRun < intervalMs) {
    return false;
  }

  timestamps.set(key, now);
  return true;
}

/**
 * Reset a specific throttle key (for testing).
 *
 * @param key - Throttle key to reset
 */
export function resetThrottle(key: string): void {
  timestamps.delete(key);
}

/**
 * Reset all throttle keys (for testing).
 */
export function resetAllThrottles(): void {
  timestamps.clear();
}
