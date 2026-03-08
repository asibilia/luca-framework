# Phase 14 Plan 02 Summary: Zod Validation on MuninnDB Routes + Route Handler DRY

## Result: COMPLETE

**Duration:** ~5 minutes
**Complexity:** TRIVIAL
**Deviations:** 1 (see below)

## Tasks Completed

### Task 1: Create Zod schemas for MuninnDB route inputs and responses

**Commit:** `73750200`
**Files:** `packages/luca-observer/lib/muninn-schemas.ts` (new)

Created 4 request/query schemas (`ActivateRequestSchema`, `EngramsQuerySchema`, `SessionQuerySchema`, `StatsQuerySchema`) and 4 response schemas (`EngramsResponseSchema`, `ActivateResponseSchema`, `SessionResponseSchema`, `StatsResponseSchema`). Query schemas use `z.coerce.number()` for URL parameter string-to-number conversion.

### Task 2: Create shared route handler helper

**Commit:** `ea0f5156`
**Files:** `packages/luca-observer/lib/muninn-route-helper.ts` (new)

Extracted `muninnProxyHandler` (client acquisition + 502 error handling + optional response validation logging) and `parseQueryParams` (Zod-based query parsing with 400 error responses).

### Task 3: Refactor all 4 route handlers

**Commit:** `05c4ef3b`
**Files:** 4 route files + helper fix

Rewrote all 4 MuninnDB proxy routes to use the shared helper and Zod schemas. Net result: -8 lines across the route files (73 added, 81 removed), with each route handler reduced to 10-20 lines.

## Deviations

### [Rule 1 - Bug] TypeScript generic inference fix

The initial `muninnProxyHandler<T>` and `parseQueryParams<T>` generics used `z.ZodSchema<T>` which caused TypeScript to infer input types (where `.default()` fields are optional) rather than output types. Fixed by:

- `muninnProxyHandler`: Changed response schema parameter to `z.ZodType` (untyped, since response validation is logging-only)
- `parseQueryParams`: Changed to `<T extends z.ZodType>` with `z.output<T>` return type to properly resolve output types including defaults

The `StatsResponseSchema.passthrough()` also created an index signature type incompatible with the `MuninnStatsResponse` interface. Resolved by removing the generic constraint on `muninnProxyHandler`.

## Verification

- `bunx --bun tsc --noEmit`: exits 0
- All 4 routes use `muninnProxyHandler`
- `activate` route uses `ActivateRequestSchema.safeParse()`
- All 3 GET routes use `parseQueryParams` with respective schemas
- Zero manual `searchParams.get()`, `Math.min`, `Math.max`, or `Array.isArray` in route handlers

## Findings (Gaps Closed)

- **M4 (Zod validation):** All routes now use Zod schema-first validation
- **M9 (Response validation):** All routes pass response schemas to `muninnProxyHandler` for shape-checking
- **M11 (DRY):** Shared boilerplate extracted; routes are minimal delegators

## Manual Step Required

Run `bun run build:all` after this session to regenerate output directories.
