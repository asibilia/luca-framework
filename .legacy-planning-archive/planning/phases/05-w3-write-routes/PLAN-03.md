---
phase: 05
plan: 03
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 5 Plan 3: Compile Proxy Routes

## Objective

Implement two Next.js API routes that proxy compilation requests to the Bun sidecar process running on localhost:3457. The POST route triggers per-entity incremental compilation, and the GET status route reports the current compilation state. Both routes handle sidecar unavailability gracefully.

## Context

@packages/luca-studio/sidecar/compiler.ts (sidecar on port 3457, POST /compile, GET /health)
@packages/luca-studio/lib/validation-pipeline.ts (reference pattern for API handler structure)
@docs/brainstorm/observer-studio-rework/4.technical-architecture.md (Sidecar API section)

## Tasks

### 1. Create compile proxy route and status route

**Type:** auto
**TDD:** false
**Depends on:** none

Create two Next.js App Router route files that proxy to the compilation sidecar:

**POST /api/compile:**

1. Accept JSON body: `{ domain: "agents" | "skills" | "rules", name: string }`
2. Validate with a Zod schema using `safeParse()` (reject 422 on invalid input)
3. Forward the request to `http://localhost:3457/compile` via `fetch()`
4. Return the sidecar response: `{ status: "compiled", output_path, duration_ms }` on success
5. Handle sidecar errors:
   - Sidecar unreachable (connection refused): return 503 with `{ error: "Compilation sidecar is not running. Start it with: bun run sidecar" }`
   - Sidecar returns 404 (entity not found): forward as 404
   - Sidecar returns 400/422 (validation error): forward as 422
   - Sidecar returns 500 (compilation error): forward as 502
   - Sidecar timeout (>30s): return 504

**GET /api/compile/status:**

1. Call `http://localhost:3457/health` on the sidecar
2. If sidecar responds, return `{ status: "idle", uptime_ms }` (the sidecar is stateless -- "idle" means ready)
3. If sidecar is unreachable, return `{ status: "unavailable", error: "Sidecar not running" }` with 200 (not 503, since this is a status check)

Key design decisions:

- The compile route is a thin proxy -- it does not import from `src/` or perform compilation itself
- Sidecar URL is a constant (`http://localhost:3457`) matching the sidecar's `SIDECAR_PORT`
- The compile route should include a `format` field with a default of `"CLAUDE"` to match the sidecar's `CompileRequestSchema`
- Use `AbortController` with a 30-second timeout on the fetch to the sidecar

**Files to create:**

- `packages/luca-studio/app/api/compile/route.ts` (POST)
- `packages/luca-studio/app/api/compile/status/route.ts` (GET)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- POST route validates input with Zod before proxying
- Sidecar connection errors return 503 with descriptive message
- Sidecar error responses are forwarded with appropriate HTTP status mapping
- Status route returns structured JSON whether sidecar is up or down

## Verification

- `bunx --bun tsc --noEmit` passes with both new route files
- POST /api/compile with valid domain/name proxies to sidecar and returns result
- POST /api/compile with invalid body returns 422 with Zod errors
- POST /api/compile when sidecar is down returns 503 with helpful error message
- GET /api/compile/status returns sidecar health when available
- GET /api/compile/status returns "unavailable" status (not error) when sidecar is down
- All sidecar error statuses are properly mapped to appropriate proxy status codes

## Success Criteria

- Two new API routes registered in the Next.js App Router
- Compile requests are proxied to sidecar without importing from `src/`
- Sidecar unavailability is handled gracefully with descriptive error messages
- Status endpoint provides clear sidecar health information
- Input validation prevents malformed requests from reaching the sidecar

## Output Specification

- `packages/luca-studio/app/api/compile/route.ts`
- `packages/luca-studio/app/api/compile/status/route.ts`
