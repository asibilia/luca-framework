# 98-02 Summary: Middleware Implementations

## Status: COMPLETE

## What Was Done

Implemented three default middleware functions for the harness verification pipeline, following the `CheckMiddleware` function signature defined in 98-01.

### Files Created

| File                                            | Purpose                                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/harness/middleware/timing.ts`              | Timing middleware: records high-resolution timestamps via `performance.now()` |
| `src/harness/middleware/workspace-scope.ts`     | Workspace-scoping middleware: queries `git diff` for changed files            |
| `src/harness/middleware/output-capture.ts`      | Output-capture middleware: saves raw output to `.planning/harness-runs/`      |
| `src/harness/middleware/middleware-registry.ts` | Registry mapping names to factory functions (follows parser-registry pattern) |
| `src/harness/middleware/index.ts`               | Pure barrel re-exporting all middleware                                       |

### Files Modified

| File                   | Change                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| `src/harness/index.ts` | Added middleware re-exports (registry, default order, factory functions) |

## Middleware Details

### timing

- **Factory**: `createTimingMiddleware()`
- **Behavior**: Wraps check execution, recording `startedAt`/`endedAt` ISO timestamps and `timing_duration_ms` in context metadata
- **Pattern**: Pre- and post-processing (outermost wrapper)

### workspace-scope

- **Factory**: `createWorkspaceScopeMiddleware()`
- **Behavior**: Runs `git diff --name-only --diff-filter=ACMR HEAD` via `Bun.spawn`, attaches changed files to `ctx.scopedFiles` and metadata
- **Pattern**: Pre-processing only (enriches context before next)

### output-capture

- **Factory**: `createOutputCaptureMiddleware()`
- **Behavior**: After check execution, writes raw output with metadata header to timestamped file in `.planning/harness-runs/`
- **Pattern**: Post-processing only (captures output after next returns)
- **Error handling**: Best-effort; failures logged in metadata, never block result

### middleware-registry

- **Pattern**: Follows `src/harness/parsers/parser-registry.ts` exactly
- **Entries**: 3 (`timing`, `workspace-scope`, `output-capture`)
- **Default order**: timing (outermost) -> workspace-scope -> output-capture (innermost)

## Verification

- `bunx --bun tsc --noEmit`: 0 errors
- All 3 middleware importable from `~/harness`
- `middlewareRegistry` has 3 entries, each producing valid `CheckMiddleware` functions
- Smoke test: composed all 3 middleware around mock executor -- passed
- No classes used anywhere (functional patterns only)
- Uses `Bun.spawn` for git operations and `Bun.write` for file output per project conventions

## Architecture Notes

- All middleware use the next-function pattern for composability
- Context enrichment is immutable (spread operator, never mutates input ctx)
- `MiddlewareContext` fields (`startedAt`, `endedAt`, `scopedFiles`, `outputPath`) are populated by their respective middleware
- The metadata bag (`ctx.metadata`) uses snake_case keys per API conventions
