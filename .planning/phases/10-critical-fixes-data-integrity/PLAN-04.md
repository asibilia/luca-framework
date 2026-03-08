---
phase: 10
plan: 4
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 10 Plan 4: MuninnDB Observer Infrastructure (Dependency, Config, Routes, Hook)

## Objective

Set up the server-side MuninnDB infrastructure for the observer dashboard: add the `@muninndb/client` dependency, create the server-only client config, implement Next.js Route Handler proxy endpoints, and rewrite the `useMemory` hook to fetch from MuninnDB via those proxy routes. This plan establishes the data layer that PLAN-05 (component rewrites) consumes.

> **Supersedes:** PLAN-01 Tasks 2-3 (Rules of Hooks fixes in `memory-entries.tsx` and `working-sections.tsx`). Those components are fully rewritten in PLAN-05, making the hooks fixes moot.

## Context

@packages/luca-observer/hooks/use-memory.ts
@packages/luca-observer/lib/spacetimedb-config.ts
@packages/luca-observer/package.json

### MuninnDB Client SDK Reference

Package: `@muninndb/client` (https://github.com/scrypster/muninndb/tree/develop/sdk/node)

**Key types:**

```typescript
interface Engram {
  id: string;
  vault: string;
  concept: string;
  content: string;
  tags: string[];
  confidence: number;
  stability: number;
  memory_type: string;
  type_label: string;
  summary: string;
  entities: string[];
  relationships: string[];
  state: string;
  created_at: string;
  updated_at: string;
}

interface ActivationItem {
  id: string;
  concept: string;
  content: string;
  score: number;
  tags: string[];
  memory_type: string;
  why?: string;
}

interface StatsResponse {
  vault: string;
  total_engrams: number;
  coherence?: { score: number; issues: string[] };
}

interface SessionEntry {
  id: string;
  action: string;
  timestamp: string;
}
```

**Key methods:**

- `new MuninnClient({ baseUrl, token, defaultVault })` — constructor
- `client.activate({ context, limit, vault })` — semantic recall → `ActivateResponse`
- `client.listEngrams(vault, limit, offset)` — paginated listing → `ListEngramsResponse`
- `client.stats(vault)` — vault statistics → `StatsResponse`
- `client.session(vault, since, limit)` — session activity → `SessionResponse`
- `client.health()` — connectivity check → `HealthResponse`

### Architecture: Server-Side Proxy

The MuninnDB API key (`MUNINN_DB_API_KEY`) must NOT be exposed to the browser. Next.js Route Handlers act as a server-side proxy:

```
Browser (client components)
  → fetch("/api/muninn/engrams")      (same-origin, no key)
  → Next.js Route Handler             (server-side, has MUNINN_DB_API_KEY)
    → MuninnClient.listEngrams()      (authenticated REST call)
    → JSON response back to browser
```

**Environment (server-only, no NEXT*PUBLIC* prefix):**

- `MUNINN_DB_URL` — MuninnDB server URL (default: `http://127.0.0.1:8476`)
- `MUNINN_DB_API_KEY` — Bearer token (already exists in `.env`)

## Tasks

### 1. Add @muninndb/client dependency, server-side config, and API route handlers

**Type:** auto
**TDD:** false
**Depends on:** none

**Changes:**

1. Add `@muninndb/client` to `packages/luca-observer/package.json` dependencies

2. Create `packages/luca-observer/lib/muninn-config.ts` (server-only — no "use client" directive):

```typescript
import { MuninnClient } from "@muninndb/client";

/** Server-only MuninnDB config. NEVER import this from client components. */

const MUNINN_BASE_URL = process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476";

const MUNINN_API_KEY = process.env.MUNINN_DB_API_KEY ?? "";

/** Singleton MuninnDB client (server-side only). */
let _client: MuninnClient | null = null;

export function getMuninnClient(): MuninnClient | null {
  if (!MUNINN_API_KEY) return null;
  if (!_client) {
    _client = new MuninnClient({
      baseUrl: MUNINN_BASE_URL,
      token: MUNINN_API_KEY,
      defaultVault: "default",
      timeout: 10_000,
    });
  }
  return _client;
}
```

3. Create Next.js Route Handlers that proxy MuninnDB calls (API key stays server-side):
   - `packages/luca-observer/app/api/muninn/engrams/route.ts` — proxies `listEngrams()`
   - `packages/luca-observer/app/api/muninn/activate/route.ts` — proxies `activate()`
   - `packages/luca-observer/app/api/muninn/stats/route.ts` — proxies `stats()`
   - `packages/luca-observer/app/api/muninn/session/route.ts` — proxies `session()`

   Each route handler follows the same pattern:

   ```typescript
   import { NextResponse } from "next/server";
   import { getMuninnClient } from "~/lib/muninn-config";

   export async function GET(request: Request) {
     const client = getMuninnClient();
     if (!client) {
       return NextResponse.json(
         { error: "MuninnDB not configured" },
         { status: 503 },
       );
     }
     try {
       const data = await client.listEngrams("default", 100);
       return NextResponse.json(data);
     } catch (err) {
       return NextResponse.json(
         { error: "MuninnDB request failed" },
         { status: 502 },
       );
     }
   }
   ```

   The `activate` route uses POST to accept context arrays from the client.

**Files to create:**

- `packages/luca-observer/lib/muninn-config.ts`
- `packages/luca-observer/app/api/muninn/engrams/route.ts`
- `packages/luca-observer/app/api/muninn/activate/route.ts`
- `packages/luca-observer/app/api/muninn/stats/route.ts`
- `packages/luca-observer/app/api/muninn/session/route.ts`

**Files to edit:**

- `packages/luca-observer/package.json` (add dependency)

**Verification:**

- `grep "@muninndb/client" packages/luca-observer/package.json` shows the dependency
- `grep "MUNINN_DB_API_KEY" packages/luca-observer/lib/muninn-config.ts` shows server-only key usage
- `grep -r "NEXT_PUBLIC_MUNINN" packages/luca-observer/` returns no results (key is never exposed)
- `bunx --bun tsc --noEmit` passes after `bun install`

### 2. Rewrite use-memory hook for MuninnDB (via server proxy)

**Type:** auto
**TDD:** false
**Depends on:** Task 1

**Problem:** `hooks/use-memory.ts` reads from SpacetimeDB's `memoryFiles` table which stores stale `brainMd`/`memoryMd`/`workingMd` strings.

**Fix:** Rewrite to fetch from MuninnDB through the Route Handler proxy (Task 1). The hook is a "use client" component and must NOT import `@muninndb/client` or `lib/muninn-config.ts` directly — it fetches from `/api/muninn/*` routes instead.

The hook should:

1. Fetch in parallel via `Promise.all`:
   - `fetch("/api/muninn/activate", { method: "POST", body: ... })` → brain engrams
   - `fetch("/api/muninn/engrams")` → all engrams for categorization
   - `fetch("/api/muninn/session")` → recent session activity
   - `fetch("/api/muninn/stats")` → vault statistics
2. Return typed data for each component panel
3. Handle errors gracefully (return null data with error state)
4. Expose a `refresh()` function that re-fetches all data on demand (no polling — manual refresh only, per CONTEXT.md)
5. Track `lastUpdated: Date | null` timestamp for staleness display
6. If any endpoint returns 503 (MuninnDB not configured), set a `configured: false` flag for the UI

**New type (defined locally in the hook file — re-uses SDK type shapes but does NOT import from `@muninndb/client`):**

```typescript
/** Mirrors @muninndb/client ActivationItem for client-side use. */
interface ActivationItem {
  id: string;
  concept: string;
  content: string;
  score: number;
  tags: string[];
  memory_type: string;
  why?: string;
}

/** Mirrors @muninndb/client Engram for client-side use. */
interface Engram {
  id: string;
  concept: string;
  content: string;
  tags: string[];
  confidence: number;
  memory_type: string;
  state: string;
  created_at: string;
  updated_at: string;
}

/** Mirrors @muninndb/client SessionEntry for client-side use. */
interface SessionEntry {
  id: string;
  action: string;
  timestamp: string;
}

/** Mirrors @muninndb/client StatsResponse for client-side use. */
interface StatsResponse {
  vault: string;
  total_engrams: number;
  coherence?: { score: number; issues: string[] };
}

export interface MuninnMemoryData {
  brain: ActivationItem[];
  engrams: Engram[];
  session: SessionEntry[];
  stats: StatsResponse | null;
  configured: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}
```

**Files to edit:**

- `packages/luca-observer/hooks/use-memory.ts` (full rewrite)

**Verification:**

- `grep "fetch.*api/muninn" packages/luca-observer/hooks/use-memory.ts` shows proxy route calls
- `grep "memoryFiles\|brainMd\|memoryMd\|@muninndb" packages/luca-observer/hooks/use-memory.ts` returns no results (no direct SDK import)
- `bunx --bun tsc --noEmit` passes

## Verification

```bash
# TypeScript compilation
bunx --bun tsc --noEmit

# Dependency added
grep "@muninndb/client" packages/luca-observer/package.json

# SECURITY: API key never exposed to client
grep -rn "NEXT_PUBLIC_MUNINN" packages/luca-observer/
# Expected: no output

# No @muninndb/client imports in client components or hooks
grep -rn "@muninndb/client" \
  packages/luca-observer/hooks/ \
  packages/luca-observer/components/ \
  packages/luca-observer/app/memory/
# Expected: no output (only lib/muninn-config.ts and route handlers import it)

# Route handlers exist
test -f packages/luca-observer/app/api/muninn/engrams/route.ts && echo "OK"
test -f packages/luca-observer/app/api/muninn/activate/route.ts && echo "OK"
test -f packages/luca-observer/app/api/muninn/stats/route.ts && echo "OK"
test -f packages/luca-observer/app/api/muninn/session/route.ts && echo "OK"

# Client hook uses proxy routes, not direct SDK
grep "fetch.*api/muninn" packages/luca-observer/hooks/use-memory.ts
# Expected: multiple route calls
```

## Success Criteria

- **SECURITY**: `MUNINN_DB_API_KEY` is never exposed to the browser — only used in server-side Route Handlers
- **SECURITY**: No `NEXT_PUBLIC_MUNINN*` env vars exist anywhere in the observer
- **SECURITY**: `@muninndb/client` is only imported in `lib/muninn-config.ts` (server-only), never in client components or hooks
- All 4 route handlers proxy MuninnDB calls correctly
- `useMemory` hook fetches from `/api/muninn/*` proxy routes and returns `MuninnMemoryData`
- Hook exposes `refresh()` and `lastUpdated` (no polling)
- Graceful degradation: `configured: false` when MuninnDB is unavailable
- TypeScript compilation passes

## Output Specification

- 5 new files: `lib/muninn-config.ts` + 4 Route Handlers in `app/api/muninn/`
- 1 edited hook file
- 1 edited `package.json` (new dependency)
- User must run `bun install` after this plan to install `@muninndb/client`
