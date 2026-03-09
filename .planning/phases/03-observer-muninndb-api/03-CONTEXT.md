# Phase 03 — Observer MuninnDB API Layer: Context

## Gray Area 1: Route Scope — Which Routes to Build

**Decision:** Build 8 read-only routes that map to MuninnDB MCP tools consumed by Phases 04-07 views. Defer 3 write/management routes. [codebase-analysis]

**Rationale:**

- Phases 04-07 need these data sources: entity lookup, entity timeline, entity clusters, contradictions, traverse, explain, find-by-entity, export-graph
- The 3 write routes (entity state management, merge-entity, similar-entities) are entity management operations not consumed by any Phase 04-07 view
- Building only what's consumed prevents orphaned routes

**Locked:**

- Build these 8 routes:
  - `GET /api/muninn/entity/[name]` — entity aggregate (metadata, engrams, relationships)
  - `GET /api/muninn/entity/[name]/timeline` — chronological entity evolution
  - `POST /api/muninn/find-by-entity` — all engrams mentioning an entity
  - `GET /api/muninn/contradictions` — contradiction pairs in vault
  - `POST /api/muninn/traverse` — graph traversal from a start node
  - `POST /api/muninn/explain` — scoring breakdown for an engram vs query
  - `GET /api/muninn/entity-clusters` — co-occurrence clusters
  - `POST /api/muninn/export-graph` — entity graph export (JSON-LD)
- Defer these routes to Phase 04+ or v3.3.0:
  - `PATCH /api/muninn/entity/[name]/state` (entity lifecycle management)
  - `POST /api/muninn/merge-entity` (entity deduplication)
  - `GET /api/muninn/similar-entities` (duplicate detection)
- Also enhance existing `/api/muninn/engrams` with type/tag filtering per ROADMAP

## Gray Area 2: API Route Design Pattern

**Decision:** Follow the existing proxy pattern exactly — thin Next.js API routes that proxy MuninnDB HTTP API. No transformation layer. [codebase-analysis]

**Rationale:**

- 4 existing routes all follow the same pattern: `muninnProxyHandler()` + `parseQueryParams()` + Zod validation
- The helper infrastructure (`lib/muninn-route-helper.ts`, `lib/muninn-config.ts`, `lib/muninn-schemas.ts`) is well-designed and handles all cross-cutting concerns
- MuninnDB already returns data in the shape the observer needs
- Adding a transformation layer would be premature — views can transform data client-side

**Locked:**

- Each new route follows the existing pattern:
  1. Route file at `app/api/muninn/<endpoint>/route.ts`
  2. Zod request schema in `lib/muninn-schemas.ts` (GET uses query params, POST uses body)
  3. Zod response schema in `lib/muninn-schemas.ts` (lightweight `.passthrough()` shape check)
  4. New method on `MuninnClient` in `lib/muninn-config.ts`
  5. Use `muninnProxyHandler()` wrapper for error handling
  6. Use `parseQueryParams()` for GET route validation
- All response fields use snake_case
- Response schemas use `.passthrough()` to allow MuninnDB evolution
- GET routes use `z.coerce.number()` for numeric URL params with `.default()` for optionals

## Gray Area 3: Enhanced Filtering for Existing Routes

**Decision:** Add type/tag/entity filtering to the existing `/api/muninn/engrams` route via query parameters. [codebase-analysis]

**Rationale:**

- ROADMAP explicitly requires: "Enhance existing `/api/muninn/` routes with type/tag/entity filtering"
- The existing engrams route only supports `vault`, `limit`, `offset` — no filtering
- MuninnDB HTTP API likely supports filtering parameters — the route should forward them
- This is a backward-compatible enhancement (new optional query params)

**Locked:**

- Add optional query params to `/api/muninn/engrams`:
  - `type` (string, optional) — filter by memory_type (e.g., "pattern", "decision", "pitfall")
  - `tag` (string, optional) — filter by tag presence
  - `entity` (string, optional) — filter by entity mention
  - `since` (number, optional) — filter by created_at >= timestamp
- Update `EngramsQuerySchema` in `lib/muninn-schemas.ts` with new optional fields
- Pass filter params through to MuninnDB HTTP API
- If MuninnDB doesn't support server-side filtering: filter client-side in the route handler (fetch all, filter, return subset)

## Gray Area 4: Error Handling and Resilience

**Decision:** Follow the existing error handling pattern exactly. HTTP 400 for validation, HTTP 502 for MuninnDB failures. No retry logic in API routes. [codebase-analysis]

**Rationale:**

- Existing routes use a clean pattern: validation errors → 400, MuninnDB errors → 502
- The observer's `useMemory` hook already handles resilience (Promise.allSettled, configured state, manual refresh)
- The emitter (Phase 01) has its own circuit breaker for write-side resilience
- Adding retry logic in API routes would complicate the thin proxy pattern
- Future hooks for new views will follow the same Promise.allSettled pattern

**Locked:**

- HTTP 400: Invalid request body or query params (Zod validation failure)
- HTTP 502: MuninnDB unreachable, timeout (10s), or error response
- No retry logic in API routes — client hooks handle retry via manual refresh
- Log warnings for response schema validation failures but do not block (existing pattern)
- NotConfiguredError (503) pattern available but not currently used — new routes can use 502 consistently

## Deferred Ideas

- **Server-Sent Events for live updates**: Could add SSE endpoints for real-time entity/engram updates. Defer to Phase 04+ if views need live data.
- **GraphQL layer**: Could wrap MuninnDB in GraphQL for flexible queries. Over-engineering for current needs — REST proxy is sufficient.
- **Caching layer**: Could add in-memory or Redis caching for frequently-accessed entities. Premature — MuninnDB is local and fast.
- **Write routes for entity management**: Entity state management, merge, similarity detection — defer to v3.3.0 when Knowledge Graph Explorer is built.

---

_Context gathered: 2026-03-09 (auto-discuss, Phase 03, codebase-analysis)_
