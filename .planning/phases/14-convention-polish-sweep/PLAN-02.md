---
phase: 14
plan: 2
type: improvement
autonomous: true
wave: 1
depends_on: []
gap_closure: true
findings: [M4, M9, M11]
---

# Phase 14 Plan 2: Zod Validation on MuninnDB Routes + Route Handler DRY

## Objective

Add Zod schema-first validation to all 4 MuninnDB proxy routes (M4, M9) and extract shared boilerplate into a reusable helper (M11). Currently, the `activate` route uses manual body validation, and none of the 4 routes validate MuninnDB API responses with Zod. All 4 routes share identical patterns for getting the client, defaulting vault, and handling 502 errors.

## Context

@packages/luca-observer/app/api/muninn/activate/route.ts
@packages/luca-observer/app/api/muninn/engrams/route.ts
@packages/luca-observer/app/api/muninn/session/route.ts
@packages/luca-observer/app/api/muninn/stats/route.ts
@packages/luca-observer/lib/muninn-config.ts
@.claude/rules/schema-first-parsing.md

## Tasks

### 1. Create Zod schemas for MuninnDB route inputs and responses

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-observer/lib/muninn-schemas.ts` with Zod schemas for:

**Request validation schemas:**

- `ActivateRequestSchema` -- validates POST body for `/api/muninn/activate`
  - `context`: `z.array(z.string()).min(1)` (required, non-empty string array)
  - `vault`: `z.string().min(1).max(100).default("default")`
  - `limit`: `z.number().int().min(1).max(100).default(20)`

**Query parameter schemas:**

- `EngramsQuerySchema` -- validates query params for `/api/muninn/engrams`
  - `vault`: `z.string().min(1).max(100).default("default")`
  - `limit`: `z.coerce.number().int().min(1).max(1000).default(100)`
  - `offset`: `z.coerce.number().int().min(0).default(0)`

- `SessionQuerySchema` -- validates query params for `/api/muninn/session`
  - `vault`: `z.string().min(1).max(100).default("default")`
  - `limit`: `z.coerce.number().int().min(1).max(500).default(50)`

- `StatsQuerySchema` -- validates query params for `/api/muninn/stats`
  - `vault`: `z.string().min(1).max(100).default("default")`

**Response validation schemas (lightweight, for runtime safety):**

- `EngramsResponseSchema` -- `z.object({ engrams: z.array(z.any()), total: z.number() })`
- `ActivateResponseSchema` -- `z.object({ activations: z.array(z.any()), total_found: z.number() })`
- `SessionResponseSchema` -- `z.object({ entries: z.array(z.any()), total: z.number() })`
- `StatsResponseSchema` -- `z.object({ engram_count: z.number(), vault_count: z.number(), ... }).passthrough()`

Response schemas use `z.any()` for array items to avoid over-constraining MuninnDB's evolving API. The goal is structural validation (correct shape), not deep field validation.

**Files to create:**

- `packages/luca-observer/lib/muninn-schemas.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All schemas export correctly
- Schemas define defaults in the schema (not in destructuring per schema-first-parsing rule)

### 2. Create shared route handler helper

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-observer/lib/muninn-route-helper.ts` that extracts the common boilerplate shared across all 4 route handlers:

**Current boilerplate in every route:**

```typescript
const client = getMuninnClient();
// ... parse params/body ...
try {
  const data = await client.someMethod(...);
  return NextResponse.json(data);
} catch {
  return NextResponse.json(
    { error: "Failed to ..." },
    { status: 502 },
  );
}
```

**Target helper:**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { getMuninnClient } from "./muninn-config";
import type { MuninnClient } from "./muninn-config";

/**
 * Execute a MuninnDB proxy request with standardized error handling.
 *
 * Handles: client acquisition, try/catch with 502 fallback,
 * JSON response wrapping, and optional response schema validation.
 */
export async function muninnProxyHandler<T>(
  handler: (client: MuninnClient) => Promise<T>,
  errorMessage: string,
  responseSchema?: z.ZodSchema<T>,
): Promise<NextResponse> {
  const client = getMuninnClient();
  try {
    const data = await handler(client);
    if (responseSchema) {
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) {
        console.error(
          "[muninn-proxy] Response validation failed:",
          parsed.error.message,
        );
        // Return raw data anyway -- validation failure is logged but not blocking
      }
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }
}

/**
 * Parse URL search params against a Zod schema with safeParse.
 * Returns parsed data or a 400 NextResponse.
 */
export function parseQueryParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>,
): { success: true; data: T } | { success: false; response: NextResponse } {
  const raw = Object.fromEntries(searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: result.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}
```

**Files to create:**

- `packages/luca-observer/lib/muninn-route-helper.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Helper exports `muninnProxyHandler` and `parseQueryParams`
- No classes used (functional patterns only)

### 3. Refactor all 4 route handlers to use shared helper + Zod schemas

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Update all 4 MuninnDB route handlers to use the shared helper and Zod schemas.

**`activate/route.ts` (POST):**

- Replace manual body validation with `ActivateRequestSchema.safeParse(body)`
- Use `muninnProxyHandler` for the client call + error handling
- Remove manual `getMuninnClient()`, manual `try/catch`, manual vault default

**`engrams/route.ts` (GET):**

- Replace manual `searchParams.get()` + `Math.min/max` with `parseQueryParams(searchParams, EngramsQuerySchema)`
- Use `muninnProxyHandler` for the client call
- Remove manual `getMuninnClient()`, manual `try/catch`

**`session/route.ts` (GET):**

- Same pattern as engrams -- use `parseQueryParams` + `muninnProxyHandler`

**`stats/route.ts` (GET):**

- Same pattern -- use `parseQueryParams` + `muninnProxyHandler`

**Files to edit:**

- `packages/luca-observer/app/api/muninn/activate/route.ts`
- `packages/luca-observer/app/api/muninn/engrams/route.ts`
- `packages/luca-observer/app/api/muninn/session/route.ts`
- `packages/luca-observer/app/api/muninn/stats/route.ts`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- No manual `getMuninnClient()` calls in any route handler
- No manual `try/catch` with 502 in any route handler
- No manual `Math.min/Math.max` parameter clamping (Zod handles bounds)
- No manual `Array.isArray` / `typeof` validation in activate route (Zod handles)
- Each route handler is ~5-15 lines (down from ~25-45)
- JSDoc comments preserved on each route handler

## Verification

1. `bunx --bun tsc --noEmit` exits 0
2. `grep -r "getMuninnClient" packages/luca-observer/app/api/muninn/` returns empty (only in helper)
3. All 4 routes use `muninnProxyHandler` for error handling
4. `activate` route uses `ActivateRequestSchema.safeParse()` instead of manual validation
5. All GET routes use `parseQueryParams` with their respective schemas
6. Response schemas optionally validate MuninnDB responses (logged, non-blocking)

## Success Criteria

- Zero manual body/query validation in route handlers (Zod schemas handle all validation)
- Shared boilerplate extracted to reusable helper (getMuninnClient, try/catch 502, response wrapping)
- Route handlers reduced to minimal, readable code
- TypeScript compilation clean

## Output Specification

- Created: `packages/luca-observer/lib/muninn-schemas.ts`
- Created: `packages/luca-observer/lib/muninn-route-helper.ts`
- Modified: `packages/luca-observer/app/api/muninn/activate/route.ts`
- Modified: `packages/luca-observer/app/api/muninn/engrams/route.ts`
- Modified: `packages/luca-observer/app/api/muninn/session/route.ts`
- Modified: `packages/luca-observer/app/api/muninn/stats/route.ts`
