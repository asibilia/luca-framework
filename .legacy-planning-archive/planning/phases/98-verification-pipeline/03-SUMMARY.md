# 98-03 Summary: Middleware Pipeline Executor and Runner Integration

## Completed Tasks

### Task 98-03-1: Middleware Pipeline Executor

- **Created** `src/harness/__helpers/pipeline.ts` with three functions:
  - `composePipeline(middlewares)`: Chains middleware into onion-style execution. First middleware = outermost wrapper. Iterates in reverse to build the chain so execution flows first-to-last.
  - `resolveMiddleware(configs)`: Maps `CheckMiddlewareConfig[]` to `CheckMiddleware[]` via the middleware registry. Skips disabled entries, warns on unknown names (never throws).
  - `buildMiddlewareResult(ctx, startTime, error?)`: Constructs a validated `MiddlewareResult` from context metadata after pipeline execution. Extracts timing data and validates through `MiddlewareResultSchema`.

### Task 98-03-2: Runner Integration

- **Modified** `src/harness/__helpers/runner.ts`:
  - Added imports for pipeline functions, `MiddlewareContext`, `MiddlewarePipelineConfig`, and `MiddlewareContextSchema`
  - Added `runCheckWithMiddleware(check, projectDir, pipelineConfig?)` wrapper:
    - No pipeline or pipeline disabled: calls `runCheck` directly (zero overhead)
    - All middleware disabled/unknown: calls `runCheck` directly
    - Pipeline configured: builds `MiddlewareContext`, resolves middleware, composes pipeline, executes with `runCheck` as core executor
    - On pipeline error: falls back to direct `runCheck` (middleware never breaks harness)
    - Attaches `middlewareResult` to returned `CheckResult`
  - Updated `runHarness` to call `runCheckWithMiddleware` instead of `runCheck`, passing `config.middlewarePipeline`
  - `runCheck` left UNCHANGED as the core execution function

### Task 98-03-3: CheckResult Schema Extension

- **Modified** `src/harness/__schemas/harness.schemas.ts`:
  - Added `middlewareResult: MiddlewareResultSchema.optional()` to `CheckResultSchema`
  - `MiddlewareResultSchema` was already defined before `CheckResultSchema` (from 98-01), so ordering is correct
  - Existing consumers unaffected (field is optional)

### Task 98-03-4: Default Config and Barrel Exports

- **Modified** `src/harness/__schemas/harness.schemas.ts`:
  - Added default middleware pipeline to `DEFAULT_HARNESS_CONFIG`: timing, workspace-scope, output-capture (all enabled)
- **Modified** `src/harness/index.ts`:
  - Added barrel exports for `composePipeline`, `resolveMiddleware`, `buildMiddlewareResult`

## Verification

- `bunx --bun tsc --noEmit` passes with 0 errors
- `runHarness` with middleware config wraps checks in pipeline via `runCheckWithMiddleware`
- `runHarness` without middleware config (or with `enabled: false`) calls `runCheck` directly -- identical behavior to before
- `DEFAULT_HARNESS_CONFIG` includes middleware pipeline with all three middleware enabled
- `CheckResult` includes optional `middlewareResult` field; existing tests unaffected

## Files Changed

| File                                       | Action   | Description                                                              |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------ |
| `src/harness/__helpers/pipeline.ts`        | Created  | Pipeline composition, resolution, and result building                    |
| `src/harness/__helpers/runner.ts`          | Modified | Added `runCheckWithMiddleware`, updated `runHarness`                     |
| `src/harness/__schemas/harness.schemas.ts` | Modified | Added `middlewareResult` to `CheckResultSchema`, default pipeline config |
| `src/harness/index.ts`                     | Modified | Added barrel exports for pipeline functions                              |
