/**
 * Middleware pipeline composition and execution for the harness.
 *
 * Provides three functions:
 * - composePipeline: chains an array of middleware into a single onion-style
 *   execution function (first middleware = outermost wrapper)
 * - resolveMiddleware: maps CheckMiddlewareConfig[] to CheckMiddleware[] via
 *   the middleware registry, skipping disabled/unknown entries
 * - buildMiddlewareResult: constructs a MiddlewareResult from pipeline context
 *
 * @example
 * ```typescript
 * import { composePipeline, resolveMiddleware, buildMiddlewareResult } from "./pipeline";
 *
 * const configs = [{ name: "timing", enabled: true, options: {} }];
 * const middlewares = resolveMiddleware(configs);
 * const pipeline = composePipeline(middlewares);
 * const result = await pipeline(ctx, coreExecutor);
 * const mwResult = buildMiddlewareResult(ctx, startTime);
 * ```
 */

import type {
  CheckMiddleware,
  CheckMiddlewareConfig,
  MiddlewareContext,
  MiddlewareResult,
} from "~/harness/__schemas/harness.schemas";
import { MiddlewareResultSchema } from "~/harness/__schemas/harness.schemas";
import { middlewareRegistry } from "~/harness/middleware";

/**
 * Chain an array of middleware into a single execution function using the
 * onion pattern. The first middleware in the array wraps everything
 * (outermost), the last is closest to the core executor.
 *
 * @param middlewares - Ordered array of middleware functions
 * @returns A single CheckMiddleware that runs the full chain
 */
export function composePipeline(
  middlewares: CheckMiddleware[],
): CheckMiddleware {
  return async (ctx, next) => {
    let chain = next;
    for (let i = middlewares.length - 1; i >= 0; i--) {
      const middleware = middlewares[i]!;
      const currentNext = chain;
      chain = (innerCtx: MiddlewareContext) =>
        middleware(innerCtx, currentNext);
    }
    return chain(ctx);
  };
}

/**
 * Resolve an array of middleware configurations into executable middleware
 * functions by looking each up in the middleware registry.
 *
 * Disabled middleware entries are skipped. Unknown middleware names produce
 * a warning and are skipped (never throws).
 *
 * @param configs - Ordered middleware configuration objects
 * @returns Resolved CheckMiddleware functions in the same order
 */
export function resolveMiddleware(
  configs: CheckMiddlewareConfig[],
): CheckMiddleware[] {
  const resolved: CheckMiddleware[] = [];
  for (const config of configs) {
    if (!config.enabled) continue;
    const factory = middlewareRegistry[config.name];
    if (!factory) {
      console.warn(`[harness] Unknown middleware: ${config.name} -- skipping`);
      continue;
    }
    resolved.push(factory());
  }
  return resolved;
}

/**
 * Build a MiddlewareResult from pipeline context after execution completes.
 *
 * Extracts timing data from context metadata and validates the result
 * through the MiddlewareResultSchema for type safety.
 *
 * @param ctx - The middleware context after pipeline execution
 * @param pipelineStartTime - High-resolution start time from performance.now()
 * @param error - Optional error message if the pipeline failed
 * @returns A validated MiddlewareResult
 */
export function buildMiddlewareResult(
  ctx: MiddlewareContext,
  pipelineStartTime: number,
  error?: string,
): MiddlewareResult {
  const pipelineDuration = performance.now() - pipelineStartTime;
  return MiddlewareResultSchema.parse({
    pipelineDuration,
    middlewareTiming:
      ctx.metadata?.timing_duration_ms != null
        ? { timing: ctx.metadata.timing_duration_ms as number }
        : {},
    metadata: ctx.metadata ?? {},
    pipelineStatus: error ? "error" : "completed",
    pipelineError: error,
  });
}
