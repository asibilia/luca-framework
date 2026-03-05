/**
 * Timing middleware for the harness verification pipeline.
 *
 * Records high-resolution timestamps before and after check execution.
 * Attaches startedAt, endedAt, and duration_ms to the middleware context
 * metadata. This data feeds the observer's harness verification pages.
 *
 * @returns CheckMiddleware function
 *
 * @example
 * ```typescript
 * import { createTimingMiddleware } from "~/harness/middleware/timing";
 *
 * const timing = createTimingMiddleware();
 * const result = await timing(ctx, next);
 * // ctx.metadata now contains timing_start_hr, timing_end_hr, timing_duration_ms
 * ```
 */

import type {
  CheckMiddleware,
  MiddlewareContext,
  CheckResult,
} from "~/harness/__schemas/harness.schemas";

/**
 * Create a timing middleware that records high-resolution timestamps.
 *
 * The middleware wraps check execution, capturing start/end times and
 * computing duration in milliseconds using performance.now() for
 * sub-millisecond precision.
 *
 * @returns A CheckMiddleware function that enriches context with timing data
 */
export function createTimingMiddleware(): CheckMiddleware {
  return async (
    ctx: MiddlewareContext,
    next: (ctx: MiddlewareContext) => Promise<CheckResult>,
  ): Promise<CheckResult> => {
    const startedAt = new Date().toISOString();
    const startHrTime = performance.now();

    // Mutate ctx directly so timing data propagates back to the runner's
    // ctxInput reference (used by buildMiddlewareResult)
    ctx.startedAt = startedAt;
    ctx.metadata.timing_start_hr = startHrTime;

    const result = await next(ctx);

    const endHrTime = performance.now();
    const durationMs = endHrTime - startHrTime;

    ctx.endedAt = new Date().toISOString();
    ctx.metadata.timing_end_hr = endHrTime;
    ctx.metadata.timing_duration_ms = durationMs;

    return result;
  };
}
