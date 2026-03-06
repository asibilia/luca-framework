/**
 * Lightweight circuit breaker for fire-and-forget SpacetimeDB connections.
 *
 * Tracks a single failure timestamp and skips operations during a cooldown
 * window after failure. Resets on success. This is intentionally minimal --
 * no open/half-open/closed states, no counters, no events.
 *
 * Used by both observer-emitter.ts (reducer calls) and spacetimedb-client.ts
 * (SQL queries) to avoid hammering an unreachable SpacetimeDB instance.
 *
 * @module luca-state/circuit-breaker
 */

/**
 * Circuit breaker instance returned by createCircuitBreaker().
 */
export interface CircuitBreaker {
  /** Returns true if the circuit is open (should skip operations). */
  isOpen: () => boolean;
  /** Record a failure -- opens the circuit for the cooldown period. */
  trip: () => void;
  /** Record a success -- closes the circuit. */
  reset: () => void;
}

/**
 * Create a lightweight circuit breaker with timestamp-based cooldown.
 *
 * After a failure (trip), subsequent isOpen() calls return true until
 * the cooldown period expires, at which point the next attempt is allowed
 * through (and will either reset or re-trip the breaker).
 *
 * @param cooldownMs - Cooldown period in milliseconds (default: 30000)
 * @returns CircuitBreaker instance with isOpen, trip, and reset methods
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreaker(30_000);
 *
 * if (breaker.isOpen()) return; // skip during cooldown
 *
 * try {
 *   await doWork();
 *   breaker.reset();
 * } catch {
 *   breaker.trip();
 * }
 * ```
 */
export function createCircuitBreaker(
  cooldownMs: number = 30_000,
): CircuitBreaker {
  let lastFailureAt = 0;

  return {
    isOpen(): boolean {
      if (lastFailureAt === 0) return false;
      return Date.now() - lastFailureAt < cooldownMs;
    },
    trip(): void {
      lastFailureAt = Date.now();
    },
    reset(): void {
      lastFailureAt = 0;
    },
  };
}
