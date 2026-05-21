---
id: "98-01"
title: "CheckMiddleware schema and type definitions"
phase: 98
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "98-01-1"
    title: "Define CheckMiddlewareSchema in harness schemas"
    goal: "Add Zod schemas for middleware configuration, middleware context, and middleware result to harness.schemas.ts"
    verify: "bunx --bun tsc --noEmit passes; CheckMiddlewareSchema, MiddlewareContextSchema, MiddlewarePipelineConfigSchema exported from src/harness/index.ts"
  - id: "98-01-2"
    title: "Define CheckMiddleware function type"
    goal: "Create the middleware function signature type as a non-Zod type (functions are not serializable)"
    verify: "CheckMiddleware type exported from src/harness/__schemas/harness.schemas.ts; signature accepts MiddlewareContext + next function"
  - id: "98-01-3"
    title: "Extend HarnessConfigSchema with optional middleware"
    goal: "Add optional middleware pipeline configuration to HarnessConfigSchema without breaking existing consumers"
    verify: "Existing HarnessConfigSchema.parse() calls still work with no middleware field; new field accepted when provided"
  - id: "98-01-4"
    title: "Update harness barrel exports"
    goal: "Export all new schemas and types from src/harness/index.ts"
    verify: "All new types importable via ~/harness; bunx --bun tsc --noEmit passes"
---

# 98-01: CheckMiddleware Schema and Type Definitions

## Goal

Define the Zod schemas, TypeScript types, and configuration structures for the harness middleware pipeline. This is the foundational data layer that all middleware implementations and the runner integration will depend on. Resolves #24.

## Context

@src/harness/**schemas/harness.schemas.ts -- Current harness schemas (CheckConfigSchema, HarnessConfigSchema, CheckResultSchema, HarnessResultSchema)
@src/harness/index.ts -- Harness barrel exports
@src/harness/**helpers/runner.ts -- Current runner (runCheck, runHarness, loadHarnessConfig)
@.planning/todos/pending/24-harness-tool-middleware.md -- Todo #24 spec: middleware pipeline for harness checks
@packages/luca-observer/src/lib/types.ts -- Observer types that will consume middleware data (ObserverEventSchema has harness.result event type)
@packages/luca-observer/src/lib/constants.ts -- Observer constants with "harness.result" event type

**Architecture notes:**

- Harness is Archetype C (Infrastructure), Tier T1
- No classes -- use functional types (function signatures, not class interfaces)
- Function types cannot be Zod schemas (functions are not serializable) -- use TypeScript type aliases
- Middleware follows the "next" pattern: each middleware calls `next(ctx)` to continue the pipeline
- The middleware context wraps a CheckConfig + CheckResult with metadata for timing, workspace-scoping, output-capture

**Observer integration note:**
The observer dashboard at `/harness` will consume `harness.result` events. The middleware data (timing, workspace scope, captured output) enriches these events so the observer verification pages show real, detailed data instead of stubs.

## Tasks

### Task 98-01-1: Define CheckMiddlewareSchema in harness schemas

Add the following Zod schemas to `src/harness/__schemas/harness.schemas.ts`:

**MiddlewareContextSchema** -- The context object passed through the middleware pipeline:

```typescript
/** Context passed through the middleware pipeline for a single check */
export const MiddlewareContextSchema = z.object({
  /** The check configuration being executed */
  check: CheckConfigSchema,
  /** Project directory for workspace-scoping */
  projectDir: z.string(),
  /** Metadata bag for middleware to attach data */
  metadata: z.record(z.unknown()).default({}),
  /** High-resolution start timestamp (set by timing middleware) */
  startedAt: z.string().optional(),
  /** High-resolution end timestamp (set by timing middleware) */
  endedAt: z.string().optional(),
  /** Workspace-scoped file paths (set by workspace-scoping middleware) */
  scopedFiles: z.array(z.string()).optional(),
  /** Captured raw output path (set by output-capture middleware) */
  outputPath: z.string().optional(),
});
export type MiddlewareContext = z.infer<typeof MiddlewareContextSchema>;
```

**CheckMiddlewareConfigSchema** -- Configuration for a single middleware in the pipeline:

```typescript
/** Configuration for a single middleware in the pipeline */
export const CheckMiddlewareConfigSchema = z.object({
  /** Unique middleware name */
  name: z.string(),
  /** Whether this middleware is enabled */
  enabled: z.boolean().default(true),
  /** Middleware-specific options */
  options: z.record(z.unknown()).default({}),
});
export type CheckMiddlewareConfig = z.infer<typeof CheckMiddlewareConfigSchema>;
```

**MiddlewarePipelineConfigSchema** -- Top-level pipeline configuration:

```typescript
/** Pipeline configuration: ordered array of middleware configs */
export const MiddlewarePipelineConfigSchema = z.object({
  /** Whether the middleware pipeline is enabled */
  enabled: z.boolean().default(true),
  /** Ordered middleware configurations (execution order matters) */
  middleware: z.array(CheckMiddlewareConfigSchema).default([]),
});
export type MiddlewarePipelineConfig = z.infer<
  typeof MiddlewarePipelineConfigSchema
>;
```

**MiddlewareResultSchema** -- Result enrichment from middleware pipeline:

```typescript
/** Middleware-enriched result metadata attached to CheckResult */
export const MiddlewareResultSchema = z.object({
  /** Middleware pipeline execution duration in ms */
  pipelineDuration: z.number().nonnegative().default(0),
  /** Per-middleware timing in ms */
  middlewareTiming: z.record(z.number().nonnegative()).default({}),
  /** Metadata accumulated by middleware */
  metadata: z.record(z.unknown()).default({}),
  /** Whether the pipeline completed successfully */
  pipelineStatus: z
    .enum(["completed", "error", "skipped"])
    .default("completed"),
  /** Error message if pipeline failed */
  pipelineError: z.string().optional(),
});
export type MiddlewareResult = z.infer<typeof MiddlewareResultSchema>;
```

**Steps:**

1. Open `src/harness/__schemas/harness.schemas.ts`
2. Add all four schemas after the existing `HarnessResultSchema` definition
3. Ensure proper JSDoc on every schema and field
4. Run `bunx --bun tsc --noEmit` to verify types compile

**Verify:**

- [ ] All four schemas defined with proper JSDoc
- [ ] `z.infer<>` types exported for each schema
- [ ] No type errors: `bunx --bun tsc --noEmit` passes
- [ ] Schemas use proper defaults so `.parse({})` works for optional fields

### Task 98-01-2: Define CheckMiddleware function type

Add the middleware function signature as a TypeScript type (not a Zod schema, since functions are not serializable -- follows the same pattern as `OutputParser`).

Add to `src/harness/__schemas/harness.schemas.ts` after the schema definitions:

```typescript
/**
 * Middleware function signature.
 *
 * Each middleware receives the context and a `next` function.
 * Call `next(ctx)` to continue the pipeline. Middleware can:
 * - Modify ctx before calling next (pre-processing)
 * - Inspect/modify the result after next returns (post-processing)
 * - Skip next entirely (short-circuit)
 *
 * Not a Zod schema (functions are not serializable).
 */
export type CheckMiddleware = (
  ctx: MiddlewareContext,
  next: (ctx: MiddlewareContext) => Promise<CheckResult>,
) => Promise<CheckResult>;
```

**Steps:**

1. Add the type definition after `MiddlewareResultSchema`
2. Include JSDoc explaining the next-function pattern
3. Verify the type references `MiddlewareContext` and `CheckResult` correctly

**Verify:**

- [ ] `CheckMiddleware` type exported from `harness.schemas.ts`
- [ ] Type references `MiddlewareContext` (from Task 98-01-1) and `CheckResult` (existing)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 98-01-3: Extend HarnessConfigSchema with optional middleware

Add an optional `middlewarePipeline` field to `HarnessConfigSchema` so existing configurations continue working while new configs can enable middleware.

**Steps:**

1. Modify `HarnessConfigSchema` to include the new field:

   ```typescript
   export const HarnessConfigSchema = z.object({
     enabled: z.boolean(),
     checks: z.array(CheckConfigSchema),
     maxFixIterations: z.number().int().positive(),
     failFast: z.boolean(),
     /** Optional middleware pipeline configuration */
     middlewarePipeline: MiddlewarePipelineConfigSchema.optional(),
   });
   ```

2. Verify `DEFAULT_HARNESS_CONFIG` still parses correctly (the field is optional, so it should)
3. Run `bunx --bun tsc --noEmit` to verify no breakage

**Important:** The field MUST be optional. Existing configs that lack `middlewarePipeline` must continue to parse without error.

**Verify:**

- [ ] `HarnessConfigSchema.parse(DEFAULT_HARNESS_CONFIG)` still works (no middleware field in default)
- [ ] `HarnessConfigSchema.parse({ ...DEFAULT_HARNESS_CONFIG, middlewarePipeline: { enabled: true, middleware: [] } })` works
- [ ] Existing `loadHarnessConfig` in runner.ts unaffected
- [ ] `bunx --bun tsc --noEmit` passes

### Task 98-01-4: Update harness barrel exports

Add all new schemas and types to `src/harness/index.ts`.

**Steps:**

1. Add to the schema exports block:

   ```typescript
   export {
     // ... existing exports ...
     MiddlewareContextSchema,
     CheckMiddlewareConfigSchema,
     MiddlewarePipelineConfigSchema,
     MiddlewareResultSchema,
   } from "./__schemas/harness.schemas";
   ```

2. Add to the type exports block:

   ```typescript
   export type {
     // ... existing exports ...
     MiddlewareContext,
     CheckMiddlewareConfig,
     MiddlewarePipelineConfig,
     MiddlewareResult,
     CheckMiddleware,
   } from "./__schemas/harness.schemas";
   ```

3. Run `bunx --bun tsc --noEmit` to verify all exports resolve

**Verify:**

- [ ] All 4 new schemas exported from `~/harness`
- [ ] All 5 new types exported from `~/harness` (4 schema types + CheckMiddleware)
- [ ] Existing exports unchanged
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Four new Zod schemas defined: MiddlewareContextSchema, CheckMiddlewareConfigSchema, MiddlewarePipelineConfigSchema, MiddlewareResultSchema
- [ ] One new function type defined: CheckMiddleware
- [ ] HarnessConfigSchema extended with optional middlewarePipeline field
- [ ] All exports updated in harness barrel
- [ ] No breaking changes to existing harness consumers
- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `DEFAULT_HARNESS_CONFIG` still parses correctly
