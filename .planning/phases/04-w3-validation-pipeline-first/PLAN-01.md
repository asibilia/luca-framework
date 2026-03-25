---
phase: 4
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 4 Plan 1: Validation Pipeline (Schema + Semantic + Atomic Write)

## Objective

Build a reusable, composable validation pipeline that all future write routes will consume. The pipeline enforces three steps -- Zod schema parse, domain-specific semantic validation, and crash-safe atomic write -- so that no write route can bypass structural or semantic integrity checks.

> Appetite: Large (200000 tokens remaining of 200000 ceiling)

## Context

@packages/luca-studio/lib/safe-json-parse.ts
@packages/luca-studio/lib/muninn-route-helper.ts
@packages/luca-studio/app/api/todos/route.ts
@docs/brainstorm/observer-studio-rework/4.technical-architecture.md
@.planning/todos/pending/studio-w3-validation-pipeline.md
@src/shared/\_\_schemas/lu-config.schemas.ts

## Tasks

### 1. Create atomic-write utility

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/lib/atomic-write.ts` -- a small utility that writes data to a `.tmp` sibling file and then renames it into place using `node:fs/promises`. This prevents partial writes on crash.

The function should:

- Accept a target file path and content string
- Write to `<target>.tmp` first
- Call `rename()` to atomically move `.tmp` into the target path
- Propagate errors (let callers handle them)

**Files to create/edit:**

- `packages/luca-studio/lib/atomic-write.ts`

**Verification:**

- Function signature is `atomicWrite(filePath: string, content: string): Promise<void>`
- Uses `writeFile` then `rename` from `node:fs/promises`
- JSDoc documents the crash-safety rationale
- `bunx --bun tsc --noEmit` passes

### 2. Create semantic validators library

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/lib/semantic-validators.ts` -- a library of domain-specific validation functions that check invariants Zod cannot express. Each validator is a pure function that accepts parsed data and returns a result indicating pass or an array of structured error objects.

Implement these semantic validators:

1. **detectCycles** -- Given a list of workflow steps with dependencies, detect DAG cycles. Uses depth-first search with visited/in-stack tracking.
2. **checkAgentRefs** -- Given a config referencing agent names, verify all referenced agents exist in a provided registry/list.
3. **checkHarnessEnabled** -- Given harness config, verify at least one check type (test, typecheck, lint, build) remains enabled.
4. **checkRequiredGates** -- Given gates config, verify that required gates (listed by name) are not removed/disabled.
5. **checkRoutingCoverage** -- Given a model routing table, verify every agent row covers all 5 complexity levels (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL).

Design:

- Each validator returns `{ valid: true } | { valid: false; errors: SemanticError[] }`
- `SemanticError` type: `{ code: string; message: string; path?: string }`
- Export a `SemanticValidator` type alias for the function signature so the pipeline can compose them generically

**Files to create/edit:**

- `packages/luca-studio/lib/semantic-validators.ts`

**Verification:**

- All 5 validators are exported with consistent signatures
- `SemanticValidator` type is exported for generic composition
- `SemanticError` type is exported for structured error reporting
- Cycle detection correctly identifies back-edges in a directed graph
- `bunx --bun tsc --noEmit` passes

### 3. Create composable validation pipeline

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Create `packages/luca-studio/lib/validation-pipeline.ts` -- the composable middleware that each write route configures with its specific Zod schema and semantic validators.

The pipeline exposes a factory function `createValidationPipeline(options)` that returns an async handler. Options:

- `schema: z.ZodType` -- Zod schema for step 1 (schema parse)
- `semanticValidators?: SemanticValidator[]` -- Array of semantic check functions for step 2
- `filePath: string | ((data: unknown) => string)` -- Target file path (static or derived from parsed data)
- `serialize?: (data: unknown) => string` -- Custom serializer (defaults to `JSON.stringify(data, null, 2)`)

The returned handler:

1. **Schema parse:** Runs `schema.safeParse(body)`. On failure, returns `{ success: false, status: 422, errors: zodError.issues }`.
2. **Semantic validation:** Runs all semantic validators against parsed data. On any failure, returns `{ success: false, status: 422, errors: SemanticError[] }`.
3. **Atomic write:** Serializes and writes via the `atomicWrite` utility. On failure, returns `{ success: false, status: 500, errors: [{ code: 'WRITE_FAILED', message }] }`.
4. On success, returns `{ success: true, data: parsedData }`.

Also export a `createApiHandler` convenience wrapper that takes a `Request`, extracts JSON body, runs the pipeline, and returns the appropriate `NextResponse` (200 on success, 422/500 on failure with structured error body).

**Files to create/edit:**

- `packages/luca-studio/lib/validation-pipeline.ts`

**Verification:**

- `createValidationPipeline` accepts schema, validators, filePath, serialize options
- Pipeline runs 3 steps in order: schema parse, semantic validation, atomic write
- Failure at any step short-circuits with the appropriate status code and structured errors
- `createApiHandler` wraps the pipeline into a NextResponse-returning function
- Routes can configure the pipeline with a single call (composable, not duplicated)
- `bunx --bun tsc --noEmit` passes

### 4. Create ETag utility

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/lib/etag.ts` -- a small utility to compute ETag values from file contents. This will be consumed by both the read routes (Phase 4 Plan 2) and future write routes for optimistic locking.

The function should:

- Accept a content string
- Return `sha256(content).substring(0, 16)`
- Use the built-in `Bun.CryptoHasher` or `crypto.createHash` for hashing

**Files to create/edit:**

- `packages/luca-studio/lib/etag.ts`

**Verification:**

- Function signature is `computeETag(content: string): string`
- Returns a 16-character hex string
- Uses sha256 hashing
- Deterministic (same input always produces same output)
- JSDoc documents the ETag format decision
- `bunx --bun tsc --noEmit` passes

## Verification

1. All 4 library files exist and export the documented APIs
2. `bunx --bun tsc --noEmit` passes with zero errors across the new files
3. The validation pipeline is composable -- a write route can configure it by passing schema + validators + file path
4. Atomic write uses `.tmp` + `rename` pattern for crash safety
5. Semantic validators cover: cycle detection, agent refs, harness enabled, required gates, routing coverage
6. ETag utility produces deterministic 16-char hex hashes

## Success Criteria

- `packages/luca-studio/lib/validation-pipeline.ts` exports `createValidationPipeline` and `createApiHandler`
- `packages/luca-studio/lib/semantic-validators.ts` exports 5 named validators + `SemanticValidator` type
- `packages/luca-studio/lib/atomic-write.ts` exports `atomicWrite`
- `packages/luca-studio/lib/etag.ts` exports `computeETag`
- All files follow project conventions (kebab-case, functional patterns, Zod safeParse, JSDoc)
- Phase 5 write routes can consume the pipeline without duplicating validation logic

## Output Specification

- `packages/luca-studio/lib/atomic-write.ts` -- Crash-safe file write utility
- `packages/luca-studio/lib/semantic-validators.ts` -- 5 domain-specific validators + types
- `packages/luca-studio/lib/validation-pipeline.ts` -- Composable 3-step pipeline + API handler wrapper
- `packages/luca-studio/lib/etag.ts` -- ETag computation utility
