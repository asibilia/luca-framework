/**
 * Closure-based circuit breaker for MuninnDB HTTP calls.
 *
 * Implements the standard circuit breaker pattern using closures (no classes
 * per project rules). Wraps async functions with failure tracking and
 * automatic circuit opening/closing.
 *
 * State machine:
 *   closed -> open (after max_failures consecutive failures)
 *   open -> half-open (after reset_timeout_ms elapsed since last failure)
 *   half-open -> closed (on successful probe)
 *   half-open -> open (on failed probe)
 *
 * @module emitter/circuit-breaker
 */
import type { CircuitBreakerConfig } from "../__schemas/emitter.schemas";

/** Circuit breaker state enum. */
export type CircuitState = "closed" | "open" | "half-open";

/**
 * Circuit breaker introspection result.
 *
 * Returned by `getState()` for observability and debugging.
 */
export interface CircuitBreakerState {
  /** Current circuit state. */
  state: CircuitState;
  /** Current consecutive failure count. */
  failures: number;
}

/**
 * Circuit breaker instance returned by the factory function.
 *
 * Provides `execute()` to wrap async functions, `getState()` for introspection,
 * and `reset()` for manual recovery.
 */
export interface CircuitBreakerInstance {
  /** Wrap an async function with circuit breaker logic. Returns null if circuit is open. */
  execute: <T>(fn: () => Promise<T>) => Promise<T | null>;
  /** Get the current circuit breaker state for introspection. */
  getState: () => CircuitBreakerState;
  /** Manually reset the circuit breaker to closed state with zero failures. */
  reset: () => void;
}

/**
 * Create a closure-based circuit breaker.
 *
 * Factory function that returns an object with `execute()`, `getState()`, and
 * `reset()` methods. All state is maintained in closures (no classes).
 *
 * @param config - Circuit breaker thresholds (max_failures, reset_timeout_ms, half_open_max)
 * @returns Circuit breaker instance
 *
 * @example
 * ```typescript
 * const breaker = createCircuitBreaker({
 *   max_failures: 5,
 *   reset_timeout_ms: 30_000,
 *   half_open_max: 1,
 * });
 *
 * const result = await breaker.execute(() => fetch(url));
 * // result: Response | null (null if circuit is open)
 *
 * const state = breaker.getState();
 * // { state: "closed", failures: 0 }
 * ```
 */
export function createCircuitBreaker(
  config: CircuitBreakerConfig,
): CircuitBreakerInstance {
  let failures = 0;
  let state: CircuitState = "closed";
  let lastFailureTime = 0;
  let halfOpenAttempts = 0;

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T | null> {
      if (state === "open") {
        // Check if enough time has elapsed to transition to half-open
        if (Date.now() - lastFailureTime >= config.reset_timeout_ms) {
          state = "half-open";
          halfOpenAttempts = 0;
        } else {
          return null;
        }
      }

      if (state === "half-open" && halfOpenAttempts >= config.half_open_max) {
        // Already at max probe attempts, stay open
        return null;
      }

      if (state === "half-open") {
        halfOpenAttempts++;
      }

      try {
        const result = await fn();
        // Success: reset to closed
        failures = 0;
        state = "closed";
        halfOpenAttempts = 0;
        return result;
      } catch {
        failures++;
        lastFailureTime = Date.now();

        if (state === "half-open") {
          // Probe failed: go back to open
          state = "open";
        } else if (failures >= config.max_failures) {
          state = "open";
        }

        return null;
      }
    },

    getState: (): CircuitBreakerState => ({ state, failures }),

    reset: (): void => {
      failures = 0;
      state = "closed";
      halfOpenAttempts = 0;
      lastFailureTime = 0;
    },
  };
}
