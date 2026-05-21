# SUMMARY: Phase 10 Plan 4 — MuninnDB Observer Infrastructure

## Result: COMPLETE

**Plan:** PLAN-04
**Phase:** 10
**Wave:** 1
**Branch:** 53--v3-data-integrity-agentic-reliability-model-routing

## Tasks Completed

### Task 1: Server-side MuninnDB config and API route handlers

**Commit:** `376a3bcd` — feat(10-04): add MuninnDB server-side config and API route handlers

**Files created:**

- `packages/luca-observer/lib/muninn-config.ts` — Server-only MuninnDB REST client with singleton pattern, timeout handling, and optional Bearer auth
- `packages/luca-observer/app/api/muninn/engrams/route.ts` — GET proxy for engram listing (vault, limit, offset params)
- `packages/luca-observer/app/api/muninn/activate/route.ts` — POST proxy for semantic recall (context array in body)
- `packages/luca-observer/app/api/muninn/stats/route.ts` — GET proxy for vault statistics
- `packages/luca-observer/app/api/muninn/session/route.ts` — GET proxy for session activity

### Task 2: Rewrite useMemory hook for MuninnDB proxy routes

**Commit:** `cc6de5fc` — feat(10-04): rewrite useMemory hook for MuninnDB proxy routes

**Files modified:**

- `packages/luca-observer/hooks/use-memory.ts` — Full rewrite: SpacetimeDB subscription replaced with parallel `Promise.allSettled` fetches to `/api/muninn/*` proxy routes. Returns `MuninnMemoryData` with `refresh()`, `lastUpdated`, `configured`, `error`, and `loading` fields.
- `packages/luca-observer/app/memory/page.tsx` — Updated to consume new hook shape. Added temporary markdown bridge functions (`brainToMarkdown`, `engramsToMarkdown`, `sessionToMarkdown`) so existing components compile until PLAN-05 rewrites them. Added refresh button and staleness display.

## Deviations

### [Rule 3 - Blocking] @muninndb/client SDK not published

The `@muninndb/client` npm package referenced in the plan does not exist on the public npm registry. Created a lightweight server-side REST client wrapper in `lib/muninn-config.ts` that calls the MuninnDB HTTP API directly (`/api/engrams`, `/api/activate`, `/api/stats`, `/api/session`, `/api/health`). This achieves the identical architecture (server-only client, proxy routes, API key isolation) without the unpublished SDK dependency. No `package.json` changes were needed.

### [Rule 2 - Missing Critical] Memory page backward compatibility

The plan specified only rewriting the hook, but the memory page directly destructured `{ data, loading }` from the old hook and passed `data.brain` (string) to components. Updated `app/memory/page.tsx` with temporary markdown bridge functions to maintain compilation. PLAN-05 removes these bridges when it rewrites all memory components.

## Verification

- `bunx --bun tsc --noEmit` — PASSES (zero errors)
- `grep "fetch.*api/muninn" hooks/use-memory.ts` — 3 matches (activate, engrams, session+stats)
- `grep "memoryFiles\|brainMd\|memoryMd" hooks/use-memory.ts` — 0 matches (no SpacetimeDB refs)
- `@muninndb/client` only referenced in JSDoc comment (documenting that it is NOT imported)
- `muninn-config.ts` imported only in 4 route handlers (all server-side)
- No `NEXT_PUBLIC_MUNINN*` env vars in codebase (pre-existing `.env.local` is gitignored)

## Success Criteria Status

| Criterion                                      | Status                                            |
| ---------------------------------------------- | ------------------------------------------------- |
| MUNINN_DB_API_KEY never exposed to browser     | PASS — only used in server-side route handlers    |
| No NEXT_PUBLIC_MUNINN\* env vars in codebase   | PASS — none in committed files                    |
| @muninndb/client never imported in client code | PASS — not installed; REST wrapper is server-only |
| All 4 route handlers proxy MuninnDB calls      | PASS — engrams, activate, stats, session          |
| useMemory fetches from /api/muninn/\* proxy    | PASS — 4 parallel fetches via Promise.allSettled  |
| Hook exposes refresh() and lastUpdated         | PASS — manual refresh, no polling                 |
| configured: false when MuninnDB unavailable    | PASS — NotConfiguredError on 503                  |
| TypeScript compilation passes                  | PASS — zero errors                                |
