/**
 * Timer-based batch queue for accumulating MuninnDB engrams.
 *
 * Accumulates engrams in a memory queue and flushes them either on a timer
 * interval or when the queue reaches a size threshold. Since the MuninnDB REST
 * API has no batch endpoint, flush sends each engram individually using
 * `Promise.allSettled()`.
 *
 * The `send` callback is injected at creation time (dependency injection),
 * allowing the circuit breaker to wrap the HTTP client before passing to the queue.
 *
 * @module emitter/batch-queue
 */
import type { EmissionEngram } from "../__schemas/emitter.schemas";

/**
 * Batch queue configuration with injected send callback.
 *
 * Uses snake_case for config fields per API conventions.
 */
export interface BatchQueueConfig {
  /** Milliseconds between automatic timer-based flushes. */
  flush_interval_ms: number;
  /** Number of queued engrams that triggers an immediate flush. */
  threshold: number;
  /** Injected callback for sending a single engram (routed through circuit breaker). */
  send: (engram: EmissionEngram) => Promise<unknown>;
}

/**
 * Batch queue instance returned by the factory function.
 *
 * Provides `enqueue()` to add engrams, `flush()` to force-flush,
 * and `size()` for introspection.
 */
export interface BatchQueueInstance {
  /** Add an engram to the queue. Triggers immediate flush if threshold is reached. */
  enqueue: (engram: EmissionEngram) => void;
  /** Force-flush all queued engrams. Returns when all sends have settled. */
  flush: () => Promise<void>;
  /** Get the current number of queued engrams. */
  size: () => number;
}

/**
 * Create a timer-based batch queue for engram accumulation.
 *
 * Factory function returning an object with `enqueue()`, `flush()`, and `size()`.
 * The queue flushes automatically on a timer or when the threshold is reached.
 *
 * @param config - Queue configuration with flush_interval_ms, threshold, and send callback
 * @returns Batch queue instance
 *
 * @example
 * ```typescript
 * const queue = createBatchQueue({
 *   flush_interval_ms: 2_000,
 *   threshold: 10,
 *   send: (engram) => httpClient.writeEngram(engram),
 * });
 *
 * queue.enqueue(engram);         // Adds to queue, schedules timer flush
 * await queue.flush();           // Force-flush (used on session end)
 * const count = queue.size();    // Current queue length
 * ```
 */
export function createBatchQueue(config: BatchQueueConfig): BatchQueueInstance {
  const queue: EmissionEngram[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Flush all queued engrams by sending each individually.
   *
   * Uses `Promise.allSettled()` so a single failure does not block others.
   * Idempotent: no-op if queue is empty.
   */
  const flush = async (): Promise<void> => {
    if (queue.length === 0) return;

    // Drain the queue atomically
    const batch = queue.splice(0);

    // Send each engram individually (no batch REST endpoint)
    await Promise.allSettled(batch.map((engram) => config.send(engram)));
  };

  /**
   * Schedule a timer-based flush if one is not already pending.
   */
  const scheduleFlush = (): void => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, config.flush_interval_ms);
  };

  return {
    enqueue(engram: EmissionEngram): void {
      queue.push(engram);

      if (queue.length >= config.threshold) {
        // Threshold reached: cancel pending timer and flush immediately
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        void flush();
      } else {
        scheduleFlush();
      }
    },

    flush,

    size: (): number => queue.length,
  };
}
