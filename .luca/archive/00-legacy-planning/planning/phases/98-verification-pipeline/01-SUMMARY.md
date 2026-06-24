# Plan 98-01: CheckMiddleware Schema and Type Definitions -- Summary

## Outcome: COMPLETED

All 4 tasks executed successfully. The middleware pipeline data layer is defined and exported from the harness module.

## What Was Built

### Middleware Schemas (`src/harness/__schemas/harness.schemas.ts`)

- **MiddlewareContextSchema**: Context passed through the middleware pipeline for a single check. Contains the check config, project directory, metadata bag, and optional fields for timing, workspace-scoping, and output capture.
- **CheckMiddlewareConfigSchema**: Configuration for a single middleware in the pipeline (name, enabled flag, options bag).
- **MiddlewarePipelineConfigSchema**: Top-level pipeline config with enabled flag and ordered array of middleware configs.
- **MiddlewareResultSchema**: Middleware-enriched result metadata (pipeline duration, per-middleware timing, accumulated metadata, pipeline status, error message).

### Function Type (`src/harness/__schemas/harness.schemas.ts`)

- **CheckMiddleware**: `(ctx: MiddlewareContext, next: (ctx: MiddlewareContext) => Promise<CheckResult>) => Promise<CheckResult>` -- follows the "next" pattern for pre-processing, post-processing, and short-circuit.

### Extended HarnessConfigSchema

- Added optional `middlewarePipeline: MiddlewarePipelineConfigSchema.optional()` field. `DEFAULT_HARNESS_CONFIG` continues to parse correctly without it (field is `undefined`).

### Updated Barrel (`src/harness/index.ts`)

- All 4 new schemas and 5 new types exported from the harness public API.

## Schema Ordering

File was reordered to satisfy forward-reference requirements:

1. CheckConfigSchema
2. ParsedErrorSchema
3. **MiddlewareContextSchema** (new)
4. **CheckMiddlewareConfigSchema** (new)
5. **MiddlewarePipelineConfigSchema** (new)
6. **MiddlewareResultSchema** (new)
7. **CheckMiddleware** type (new)
8. HarnessConfigSchema (moved down, now references MiddlewarePipelineConfigSchema)
9. CheckResultSchema
10. HarnessResultSchema
11. OutputParser type
12. DEFAULT_HARNESS_CONFIG

## Deviation: Zod v4 z.record() Signature

The plan specified `z.record(z.unknown())` but Zod v4 (4.3.6) requires two arguments: `z.record(z.string(), z.unknown())`. All `z.record()` calls were adjusted to provide the key schema as the first argument.

## Verification

- `bunx --bun tsc --noEmit` -- 0 errors
- `DEFAULT_HARNESS_CONFIG` parses without middleware field (field is `undefined`)
- All new schemas parse with correct defaults
- Pre-commit gate passed (tests + typecheck)

## Commit

- `ac56886` feat(harness): #44 add CheckMiddleware schema and type definitions
