# Phase 5 Plan 3: Compile Proxy Routes -- Execution Summary

## Status: COMPLETE

## Commit

- `4fece644` feat(studio): add compile proxy routes for sidecar compilation

## What Was Done

### Task 1: Create compile proxy route and status route

Created two Next.js App Router API routes that proxy compilation requests to the Bun sidecar on localhost:3457:

**POST /api/compile** (`packages/luca-studio/app/api/compile/route.ts`):
- Zod schema validation with `safeParse()` on incoming `{ domain, name, format }` body
- `format` defaults to `"CLAUDE"` matching the sidecar's `CompileRequestSchema`
- Forwards validated payload to `http://localhost:3457/compile` via `fetch()`
- AbortController with 30-second timeout
- Status code mapping: 503 (unreachable), 502 (sidecar 500), 504 (timeout), 404/422 (forwarded)
- Connection-refused detection covers Bun and Node error signatures

**GET /api/compile/status** (`packages/luca-studio/app/api/compile/status/route.ts`):
- Calls sidecar `/health` endpoint with 5-second timeout
- Returns `{ status: "idle", uptime_ms }` when sidecar is running
- Returns `{ status: "unavailable", error: "Sidecar not running" }` with 200 when sidecar is down
- Status check returns data (200), not error status codes

## Verification

- TypeScript compiles: 0 errors in new files (2 pre-existing errors in `lib/shared-constant-registry.ts` unrelated to this plan)
- Zod validation prevents malformed requests from reaching sidecar
- All sidecar error statuses mapped to appropriate proxy status codes
- Status route returns structured JSON in both up and down states
- No imports from `src/` -- routes are thin proxies only

## Deviations

None.

## Files Created

- `packages/luca-studio/app/api/compile/route.ts`
- `packages/luca-studio/app/api/compile/status/route.ts`
