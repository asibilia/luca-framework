---
id: "98-03"
title: "Middleware pipeline executor and harness runner integration"
phase: 98
wave: 3
complexity: MODERATE
depends_on: ["98-01", "98-02"]
tasks:
  - id: "98-03-1"
    title: "Implement middleware pipeline executor"
    goal: "Create composePipeline function that chains middleware in order using the next-function pattern"
    verify: "composePipeline exported from ~/harness; accepts array of CheckMiddleware, returns single CheckMiddleware"
  - id: "98-03-2"
    title: "Integrate middleware pipeline into runCheck"
    goal: "Wrap check execution in the middleware pipeline when middlewarePipeline is configured"
    verify: "runHarness with middleware config runs checks through pipeline; without middleware config behaves identically to current implementation"
  - id: "98-03-3"
    title: "Attach MiddlewareResult to CheckResult"
    goal: "Extend CheckResultSchema with optional middlewareResult field so middleware metadata flows to consumers"
    verify: "CheckResult.middlewareResult contains pipeline timing and metadata when middleware is enabled"
  - id: "98-03-4"
    title: "Update DEFAULT_HARNESS_CONFIG with default middleware pipeline"
    goal: "Add default middleware pipeline configuration to DEFAULT_HARNESS_CONFIG"
    verify: "DEFAULT_HARNESS_CONFIG.middlewarePipeline has all 3 default middleware enabled"
---

# 98-03: Middleware Pipeline Executor and Runner Integration

## Goal

Build the pipeline composition engine that chains middleware functions together, then integrate it into the existing harness runner (`runCheck` / `runHarness`). After this plan, running the harness with middleware configured will automatically wrap check execution in the middleware pipeline.

## Context

@src/harness/**schemas/harness.schemas.ts -- CheckMiddleware type, MiddlewareContext, CheckResult, HarnessConfig (from 98-01)
@src/harness/**helpers/runner.ts -- runCheck and runHarness functions to integrate with
@src/harness/middleware/middleware-registry.ts -- middlewareRegistry, DEFAULT_MIDDLEWARE_ORDER (from 98-02)
@src/harness/middleware/timing.ts -- createTimingMiddleware (from 98-02)
@src/harness/middleware/workspace-scope.ts -- createWorkspaceScopeMiddleware (from 98-02)
@src/harness/middleware/output-capture.ts -- createOutputCaptureMiddleware (from 98-02)

**Integration strategy:**

- The pipeline executor is a pure function (`composePipeline`) that composes middleware
- The runner calls `composePipeline` only when `config.middlewarePipeline` exists and is enabled
- Without middleware config, the runner behaves identically to the current implementation (zero regression risk)
- The composed pipeline wraps `runCheck` as the innermost "next" function

## Tasks

### Task 98-03-1: Implement middleware pipeline executor

Create a `composePipeline` function in `src/harness/__helpers/pipeline.ts` that chains an array of `CheckMiddleware` functions using the next-function pattern.

**File:** `src/harness/__helpers/pipeline.ts`

````typescript
/**
 * Middleware pipeline executor for the harness verification system.
 *
 * Composes an ordered array of CheckMiddleware functions into a single
 * wrapped execution function. Uses the "onion" pattern: the first
 * middleware in the array is the outermost wrapper.
 *
 * Pipeline order: [timing, workspace-scope, output-capture]
 * Execution:  timing -> workspace-scope -> output-capture -> runCheck
 *
 * @module
 */

import type {
  CheckMiddleware,
  CheckMiddlewareConfig,
  MiddlewareContext,
  CheckResult,
  MiddlewareResult,
} from "~/harness/__schemas/harness.schemas";
import { MiddlewareResultSchema } from "~/harness/__schemas/harness.schemas";
import { middlewareRegistry } from "~/harness/middleware/middleware-registry";

/**
 * Compose an array of middleware into a single execution function.
 *
 * The resulting function wraps a "core" execution function (typically runCheck)
 * with the middleware chain. Middleware executes in array order (first = outermost).
 *
 * @param middlewares - Ordered array of CheckMiddleware functions
 * @returns A function that runs the core function wrapped by all middleware
 *
 * @example
 * ```typescript
 * const pipeline = composePipeline([timingMw, scopeMw, captureMw]);
 * const result = await pipeline(ctx, runCheck);
 * ```
 */
export function composePipeline(
  middlewares: CheckMiddleware[],
): CheckMiddleware {
  return async (
    ctx: MiddlewareContext,
    next: (ctx: MiddlewareContext) => Promise<CheckResult>,
  ): Promise<CheckResult> => {
    // Build the chain from right to left (rightmost middleware calls next directly)
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
 * Resolve middleware configurations to actual middleware functions.
 *
 * Looks up each config.name in the middleware registry. Skips disabled
 * middleware and logs warnings for unknown middleware names.
 *
 * @param configs - Array of middleware configurations
 * @returns Array of resolved CheckMiddleware functions (enabled only)
 */
export function resolveMiddleware(
  configs: CheckMiddlewareConfig[],
): CheckMiddleware[] {
  const resolved: CheckMiddleware[] = [];

  for (const config of configs) {
    if (!config.enabled) continue;

    const factory = middlewareRegistry[config.name];
    if (!factory) {
      // Unknown middleware -- skip with warning metadata
      console.warn(`[harness] Unknown middleware: ${config.name} -- skipping`);
      continue;
    }

    resolved.push(factory());
  }

  return resolved;
}

/**
 * Build a MiddlewareResult from the pipeline execution context.
 *
 * Extracts timing and metadata from the context after pipeline execution.
 *
 * @param ctx - The middleware context after pipeline execution
 * @param pipelineStartTime - When the pipeline started (performance.now())
 * @param error - Optional pipeline error
 * @returns Parsed MiddlewareResult
 */
export function buildMiddlewareResult(
  ctx: MiddlewareContext,
  pipelineStartTime: number,
  error?: string,
): MiddlewareResult {
  const pipelineDuration = performance.now() - pipelineStartTime;

  return MiddlewareResultSchema.parse({
    pipelineDuration,
    middlewareTiming: ctx.metadata?.timing_duration_ms
      ? { timing: ctx.metadata.timing_duration_ms as number }
      : {},
    metadata: ctx.metadata ?? {},
    pipelineStatus: error ? "error" : "completed",
    pipelineError: error,
  });
}
````

**Verify:**

- [ ] File exists at `src/harness/__helpers/pipeline.ts`
- [ ] Exports `composePipeline`, `resolveMiddleware`, `buildMiddlewareResult`
- [ ] `composePipeline` chains middleware in correct order (first = outermost)
- [ ] `resolveMiddleware` skips disabled middleware and warns on unknown names
- [ ] `buildMiddlewareResult` produces a valid `MiddlewareResult`
- [ ] No classes used
- [ ] `bunx --bun tsc --noEmit` passes

### Task 98-03-2: Integrate middleware pipeline into runCheck

Modify `src/harness/__helpers/runner.ts` to optionally wrap check execution in the middleware pipeline.

**Changes to runner.ts:**

1. Add imports for pipeline functions and middleware types
2. Modify `runHarness` to accept and pass middleware config
3. Create a new `runCheckWithMiddleware` wrapper function
4. Keep `runCheck` unchanged (it remains the "core" execution function)

**Implementation approach:**

```typescript
// In runner.ts, add:
import {
  composePipeline,
  resolveMiddleware,
  buildMiddlewareResult,
} from "./pipeline";
import type { MiddlewareContext } from "../__schemas/harness.schemas";
import { MiddlewareContextSchema } from "../__schemas/harness.schemas";

/**
 * Run a single check wrapped in the middleware pipeline.
 *
 * If no middleware is configured or the pipeline is disabled,
 * falls back to direct runCheck execution.
 */
async function runCheckWithMiddleware(
  check: CheckConfig,
  projectDir: string,
  config: HarnessConfig,
): Promise<CheckResult> {
  const pipeline = config.middlewarePipeline;

  // No middleware configured or disabled -- run directly
  if (!pipeline || !pipeline.enabled || pipeline.middleware.length === 0) {
    return runCheck(check, projectDir);
  }

  const pipelineStart = performance.now();

  // Build initial middleware context
  const ctx = MiddlewareContextSchema.parse({
    check,
    projectDir,
    metadata: {},
  });

  // Resolve configured middleware to functions
  const middlewares = resolveMiddleware(pipeline.middleware);

  if (middlewares.length === 0) {
    // All middleware disabled or unknown -- run directly
    return runCheck(check, projectDir);
  }

  // Compose and execute pipeline
  const composed = composePipeline(middlewares);

  try {
    const result = await composed(ctx, async (innerCtx) => {
      return runCheck(innerCtx.check, innerCtx.projectDir);
    });

    // Attach middleware result to check result
    const middlewareResult = buildMiddlewareResult(ctx, pipelineStart);
    return {
      ...result,
      middlewareResult,
    };
  } catch (error) {
    // Pipeline error -- fall back to direct execution
    const result = await runCheck(check, projectDir);
    const middlewareResult = buildMiddlewareResult(
      ctx,
      pipelineStart,
      (error as Error).message,
    );
    return {
      ...result,
      middlewareResult,
    };
  }
}
```

Then update `runHarness` to call `runCheckWithMiddleware` instead of `runCheck`:

```typescript
// Change in runHarness:
// Before:
//   const result = await runCheck(check, projectDir);
// After:
const result = await runCheckWithMiddleware(check, projectDir, config);
```

**Important constraints:**

- `runCheck` MUST remain unchanged (it is the core execution function)
- When no middleware is configured, behavior is identical to current implementation
- Pipeline errors fall back to direct execution (never breaks the harness)

**Verify:**

- [ ] `runCheck` function unchanged
- [ ] New `runCheckWithMiddleware` function added
- [ ] `runHarness` calls `runCheckWithMiddleware` instead of `runCheck`
- [ ] Without middleware config, behavior is identical to before
- [ ] Pipeline errors fall back to direct `runCheck` execution
- [ ] `bunx --bun tsc --noEmit` passes

### Task 98-03-3: Attach MiddlewareResult to CheckResult

Extend `CheckResultSchema` with an optional `middlewareResult` field so middleware metadata flows through to consumers (including the observer dashboard).

**Steps:**

1. In `src/harness/__schemas/harness.schemas.ts`, modify `CheckResultSchema`:

   ```typescript
   export const CheckResultSchema = z.object({
     name: z.string(),
     status: z.enum(["passed", "failed", "skipped", "timeout"]),
     exitCode: z.number().int(),
     errors: z.array(ParsedErrorSchema),
     warnings: z.array(ParsedErrorSchema),
     rawOutput: z.string(),
     duration: z.number().nonnegative(),
     /** Middleware pipeline result metadata (present when middleware is enabled) */
     middlewareResult: MiddlewareResultSchema.optional(),
   });
   ```

   **Note:** `MiddlewareResultSchema` must be defined BEFORE `CheckResultSchema` in the file, since `CheckResultSchema` now references it. This may require reordering the schema definitions.

2. Verify existing CheckResult consumers handle the optional field correctly

**Important:** This is a schema ordering change. The new middleware schemas from 98-01 must appear before `CheckResultSchema` in the file. Reorder if necessary:

- ParsedErrorSchema (existing)
- MiddlewareContextSchema (new, from 98-01)
- CheckMiddlewareConfigSchema (new, from 98-01)
- MiddlewarePipelineConfigSchema (new, from 98-01)
- MiddlewareResultSchema (new, from 98-01)
- CheckResultSchema (existing, now references MiddlewareResultSchema)
- HarnessResultSchema (existing)

**Verify:**

- [ ] `CheckResultSchema` includes optional `middlewareResult` field
- [ ] Schema ordering in file is correct (MiddlewareResultSchema before CheckResultSchema)
- [ ] Existing `CheckResult` values without `middlewareResult` still parse correctly
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Existing tests pass: `bun test __tests__/packages/luca-framework/`

### Task 98-03-4: Update DEFAULT_HARNESS_CONFIG with default middleware pipeline

Add the default middleware pipeline configuration to `DEFAULT_HARNESS_CONFIG` so middleware runs out of the box.

**Steps:**

1. In `src/harness/__schemas/harness.schemas.ts`, update `DEFAULT_HARNESS_CONFIG`:

   ```typescript
   export const DEFAULT_HARNESS_CONFIG: HarnessConfig =
     HarnessConfigSchema.parse({
       enabled: true,
       maxFixIterations: 3,
       failFast: false,
       middlewarePipeline: {
         enabled: true,
         middleware: [
           { name: "timing", enabled: true },
           { name: "workspace-scope", enabled: true },
           { name: "output-capture", enabled: true },
         ],
       },
       checks: [
         // ... existing checks unchanged ...
       ],
     });
   ```

2. Verify the default config still parses correctly

**Verify:**

- [ ] `DEFAULT_HARNESS_CONFIG.middlewarePipeline` has all 3 middleware enabled
- [ ] Middleware order matches `DEFAULT_MIDDLEWARE_ORDER` from registry
- [ ] `HarnessConfigSchema.parse(DEFAULT_HARNESS_CONFIG)` succeeds
- [ ] Existing harness runner works with updated default config
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] `composePipeline` correctly chains middleware in onion pattern
- [ ] `resolveMiddleware` maps config names to middleware functions
- [ ] Runner integration wraps checks in middleware pipeline when configured
- [ ] Without middleware config, runner behavior is identical to before
- [ ] Pipeline errors fall back to direct execution
- [ ] `CheckResult` carries optional `middlewareResult` metadata
- [ ] Default config includes all 3 middleware enabled
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Existing tests still pass
