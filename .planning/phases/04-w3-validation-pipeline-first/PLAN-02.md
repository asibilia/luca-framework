---
phase: 4
plan: 2
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 4 Plan 2: Read-Only API Routes (Config, State, Ledger)

## Objective

Implement three foundational read-only Next.js API routes that serve config, state, and ledger data to the Studio frontend. These routes feed the Layer 1 server state atoms and are required by the Home page, state inspector, and session views. Missing files return sensible defaults rather than 500 errors.

> Appetite: Large (200000 tokens remaining of 200000 ceiling)

## Context

@packages/luca-studio/app/api/todos/route.ts
@packages/luca-studio/lib/muninn-route-helper.ts
@packages/luca-studio/lib/safe-json-parse.ts
@docs/brainstorm/observer-studio-rework/4.technical-architecture.md
@.planning/todos/pending/studio-w3-read-api-routes.md
@.planning/config.json
@src/shared/\_\_schemas/lu-config.schemas.ts

## Tasks

### 1. Create shared project-root resolver

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/lib/project-root.ts` -- a shared utility that resolves the project root directory for all API routes that read from `.planning/`. This extracts the duplicate project-root-finding logic already present in the todos route into a reusable function.

The function should:

- Check `LUCA_PROJECT_DIR` env var first, then `WORKSPACE_ROOT`
- Fall back to walking up from `process.cwd()` looking for `.planning/` directory
- Cache the result for the process lifetime (module-level variable)
- Return an absolute path string

**Files to create/edit:**

- `packages/luca-studio/lib/project-root.ts`

**Verification:**

- Exported function `resolveProjectRoot(): Promise<string>`
- Uses same priority as the todos route: `LUCA_PROJECT_DIR` > `WORKSPACE_ROOT` > auto-detect
- Result is cached after first resolution
- JSDoc documents the resolution strategy
- `bunx --bun tsc --noEmit` passes

### 2. Create GET /api/config route

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-studio/app/api/config/route.ts` -- reads `.planning/config.json`, parses it, and returns with an ETag header.

Behavior:

- Read `.planning/config.json` from the resolved project root
- If file is missing, return `{}` with 200 (not 500)
- Parse file contents as JSON
- Compute ETag: `sha256(rawContents).substring(0, 16)` -- use `crypto.createHash('sha256')` from `node:crypto`
- Return parsed JSON with `ETag` response header set
- Return `Content-Type: application/json`

Note: The ETag utility from Plan 1 may not be available yet since plans run in parallel. Inline the sha256 computation or import it if available. If inlining, keep it small (3-4 lines) so it can be trivially refactored to use the shared utility later.

**Files to create/edit:**

- `packages/luca-studio/app/api/config/route.ts`

**Verification:**

- `curl http://localhost:3000/api/config` returns parsed config JSON
- Response includes `ETag` header (16-char hex string)
- Missing config file returns `{}` with 200 status
- `bunx --bun tsc --noEmit` passes

### 3. Create GET /api/state and GET /api/ledger routes

**Type:** auto
**TDD:** false
**Depends on:** 1

Create two more read-only API routes:

**GET /api/state** (`packages/luca-studio/app/api/state/route.ts`):

- Read `.planning/state.json` from the resolved project root
- If file is missing, return `{}` with 200
- Parse as JSON and return

**GET /api/ledger** (`packages/luca-studio/app/api/ledger/route.ts`):

- Read `.planning/session-ledger.jsonl` from the resolved project root
- If file is missing, return `[]` with 200
- Parse JSONL: split by newlines, filter empty lines, JSON.parse each line
- Support `?limit=N` query parameter (default 50, max 500)
- Return the **last N** entries (most recent first) -- read all lines, take the tail, reverse for recency-first order
- Use `parseQueryParams` from `muninn-route-helper.ts` for query param validation

Both routes follow the same patterns as the todos route: functional, Zod safeParse for query params, graceful error handling.

**Files to create/edit:**

- `packages/luca-studio/app/api/state/route.ts`
- `packages/luca-studio/app/api/ledger/route.ts`

**Verification:**

- `curl http://localhost:3000/api/state` returns parsed state JSON
- `curl http://localhost:3000/api/ledger` returns last 50 ledger entries as JSON array
- `curl http://localhost:3000/api/ledger?limit=10` returns last 10 entries
- Missing files return empty defaults (`{}` / `[]`), not 500
- Invalid limit param returns 400 with structured error message
- `bunx --bun tsc --noEmit` passes

## Verification

1. All 4 new files exist and export the documented route handlers
2. `bunx --bun tsc --noEmit` passes with zero errors across all new files
3. Each route handles missing source files gracefully with sensible defaults
4. Config route includes ETag header
5. Ledger route supports limit query parameter
6. Project root resolution is shared (not duplicated per route)

## Success Criteria

- `GET /api/config` returns parsed config.json with ETag header
- `GET /api/state` returns parsed state.json
- `GET /api/ledger?limit=N` returns last N ledger entries (default 50)
- All three routes return sensible defaults for missing files (no 500s)
- Shared `resolveProjectRoot()` eliminates duplicated root-finding logic
- All files follow project conventions (kebab-case, functional patterns, Zod safeParse, JSDoc)

## Output Specification

- `packages/luca-studio/lib/project-root.ts` -- Shared project root resolver
- `packages/luca-studio/app/api/config/route.ts` -- GET /api/config with ETag
- `packages/luca-studio/app/api/state/route.ts` -- GET /api/state
- `packages/luca-studio/app/api/ledger/route.ts` -- GET /api/ledger with ?limit=
