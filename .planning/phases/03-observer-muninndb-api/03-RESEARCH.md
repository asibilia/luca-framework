# Phase 03: Observer MuninnDB API Layer - Research

**Researched:** 2026-03-09
**Domain:** Next.js API Routes / MuninnDB REST API proxy layer
**Confidence:** HIGH

## Summary

This phase adds 8 new Next.js API routes to the luca-observer that proxy MuninnDB operations, plus enhances the existing `/api/muninn/engrams` route with filtering. The codebase has a well-established proxy pattern (`muninnProxyHandler()` + `parseQueryParams()` + Zod schemas) that all 4 existing routes follow identically.

The critical finding is that **MuninnDB's REST API only exposes a subset of its operations via HTTP**. Of the 8 target endpoints, only 3 have direct REST equivalents (`/api/contradictions`, `/api/traverse`, `/api/explain`). The remaining 5 (`entity`, `entity_timeline`, `find_by_entity`, `entity_clusters`, `export_graph`) are MCP/gRPC-only. The Next.js proxy routes must call MuninnDB via HTTP, so for the 5 MCP-only operations, new methods on `MuninnClient` will need to use indirect REST endpoints (compose from `/api/engrams`, `/api/activate`, etc.) or the routes themselves will need to construct data from available REST primitives.

**Primary recommendation:** For each new route, add a method to `MuninnClient` in `muninn-config.ts` that calls the corresponding MuninnDB REST endpoint via `muninnFetch()`. For MCP-only operations without REST equivalents, implement them using a combination of available REST primitives (engrams listing with filtering, activate for semantic search) with server-side data assembly.

## Critical Finding: MuninnDB REST vs MCP API Coverage

### Verified REST endpoints (live-tested against MuninnDB v0.3.9-alpha on port 8476)

| MuninnDB REST Endpoint    | HTTP Method | Status | Notes                                                                                  |
| ------------------------- | ----------- | ------ | -------------------------------------------------------------------------------------- |
| `/api/engrams`            | GET         | EXISTS | Supports: vault, limit, offset, tags filter                                            |
| `/api/engrams/{id}`       | GET         | EXISTS | Single engram by ID                                                                    |
| `/api/engrams/{id}/links` | GET         | EXISTS | Associations for engram                                                                |
| `/api/activate`           | POST        | EXISTS | Semantic recall                                                                        |
| `/api/stats`              | GET         | EXISTS | Vault statistics                                                                       |
| `/api/session`            | GET         | EXISTS | Session activity                                                                       |
| `/api/health`             | GET         | EXISTS | Health check                                                                           |
| `/api/contradictions`     | GET         | EXISTS | Returns `{ contradictions: [] }`                                                       |
| `/api/traverse`           | POST        | EXISTS | Returns nodes/edges; accepts start_id, max_hops, max_nodes, rel_types, follow_entities |
| `/api/explain`            | POST        | EXISTS | Returns score breakdown; accepts engram_id, query, vault                               |
| `/api/entity`             | ANY         | 404    | NOT available via REST                                                                 |
| `/api/entities`           | ANY         | 404    | NOT available via REST                                                                 |
| `/api/entity_timeline`    | ANY         | 404    | NOT available via REST                                                                 |
| `/api/find_by_entity`     | ANY         | 404    | NOT available via REST                                                                 |
| `/api/entity_clusters`    | ANY         | 404    | NOT available via REST                                                                 |
| `/api/export_graph`       | ANY         | 404    | NOT available via REST                                                                 |

### Impact on Route Implementation

| Observer Route                           | MuninnDB REST Endpoint    | Implementation Strategy       |
| ---------------------------------------- | ------------------------- | ----------------------------- |
| `GET /api/muninn/contradictions`         | `GET /api/contradictions` | Direct proxy (REST exists)    |
| `POST /api/muninn/traverse`              | `POST /api/traverse`      | Direct proxy (REST exists)    |
| `POST /api/muninn/explain`               | `POST /api/explain`       | Direct proxy (REST exists)    |
| `GET /api/muninn/entity/[name]`          | NONE                      | Compose from engrams + links  |
| `GET /api/muninn/entity/[name]/timeline` | NONE                      | Compose from engrams + links  |
| `POST /api/muninn/find-by-entity`        | NONE                      | Use engrams search/filtering  |
| `GET /api/muninn/entity-clusters`        | NONE                      | Requires alternative approach |
| `POST /api/muninn/export-graph`          | NONE                      | Requires alternative approach |

**Confidence: HIGH** -- All REST endpoints verified by live HTTP requests to running MuninnDB v0.3.9-alpha instance.

## Standard Stack

### Core (already in use)

| Library | Version | Purpose                           | Why Standard                            |
| ------- | ------- | --------------------------------- | --------------------------------------- |
| Next.js | ^15     | App Router API routes             | Already in use; provides route handlers |
| Zod     | ^3.23.8 | Request/response validation       | Already in use; project convention      |
| React   | ^19     | Frontend (routes are server-only) | Already in use                          |

### Supporting (no new dependencies needed)

This phase requires NO new dependencies. All routes use the existing `muninnFetch()` HTTP client and Zod validation infrastructure.

**Installation:** None required.

## Architecture Patterns

### Recommended Project Structure

```
packages/luca-observer/
├── app/api/muninn/
│   ├── activate/route.ts          # Existing POST route
│   ├── engrams/route.ts           # Existing GET route (ENHANCED with filters)
│   ├── session/route.ts           # Existing GET route
│   ├── stats/route.ts             # Existing GET route
│   ├── contradictions/route.ts    # NEW: GET route
│   ├── entity-clusters/route.ts   # NEW: GET route
│   ├── entity/
│   │   └── [name]/
│   │       ├── route.ts           # NEW: GET /api/muninn/entity/[name]
│   │       └── timeline/
│   │           └── route.ts       # NEW: GET /api/muninn/entity/[name]/timeline
│   ├── find-by-entity/route.ts    # NEW: POST route
│   ├── traverse/route.ts          # NEW: POST route
│   ├── explain/route.ts           # NEW: POST route
│   └── export-graph/route.ts      # NEW: POST route
├── lib/
│   ├── muninn-config.ts           # ENHANCED: new MuninnClient methods
│   ├── muninn-route-helper.ts     # UNCHANGED
│   ├── muninn-schemas.ts          # ENHANCED: new request/response schemas
│   └── muninn-types.ts            # ENHANCED: new type definitions
```

### Pattern 1: GET Route with Query Params (existing pattern)

**What:** Thin proxy route for GET requests with Zod-validated query params
**When to use:** `contradictions`, `entity-clusters`, `entity/[name]`, `entity/[name]/timeline`
**Example:**

```typescript
// Source: packages/luca-observer/app/api/muninn/stats/route.ts (exact existing pattern)
import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import { StatsQuerySchema, StatsResponseSchema } from "~/lib/muninn-schemas";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, StatsQuerySchema);
  if (!result.success) return result.response;

  const { vault } = result.data;

  return muninnProxyHandler(
    (client) => client.stats(vault),
    "Failed to fetch MuninnDB vault statistics",
    StatsResponseSchema,
  );
}
```

### Pattern 2: POST Route with JSON Body (existing pattern)

**What:** Thin proxy route for POST requests with Zod-validated JSON body
**When to use:** `traverse`, `explain`, `find-by-entity`, `export-graph`
**Example:**

```typescript
// Source: packages/luca-observer/app/api/muninn/activate/route.ts (exact existing pattern)
import { NextResponse } from "next/server";
import { muninnProxyHandler } from "~/lib/muninn-route-helper";
import {
  ActivateRequestSchema,
  ActivateResponseSchema,
} from "~/lib/muninn-schemas";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ActivateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { vault, context, limit } = parsed.data;

  return muninnProxyHandler(
    (client) => client.activate(vault, context, limit),
    "Failed to activate MuninnDB recall",
    ActivateResponseSchema,
  );
}
```

### Pattern 3: Dynamic Route Segments (Next.js App Router)

**What:** Routes with path parameters using `[name]` folder convention
**When to use:** `entity/[name]` and `entity/[name]/timeline`
**Example:**

```typescript
// app/api/muninn/entity/[name]/route.ts
// Next.js App Router passes params as second argument
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  // ... validate and proxy
}
```

**Note:** In Next.js 15, `params` is a Promise and must be awaited. This is a breaking change from Next.js 14.

### Pattern 4: MuninnClient Method (existing pattern)

**What:** Each REST endpoint gets a typed method on the singleton MuninnClient
**When to use:** Every new route needs a corresponding client method
**Example:**

```typescript
// Source: packages/luca-observer/lib/muninn-config.ts (existing pattern)
// Each method: build URL -> muninnFetch -> check res.ok -> return res.json()
async listEngrams(vault, limit = 100, offset = 0) {
  const res = await muninnFetch(
    `/api/engrams?vault=${encodeURIComponent(vault)}&limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) throw new Error(`MuninnDB engrams: ${res.status}`);
  return res.json();
},
```

### Anti-Patterns to Avoid

- **Calling MCP tools from Next.js routes:** The Next.js server cannot invoke MCP tools. It must use HTTP REST calls via `muninnFetch()`.
- **Transforming MuninnDB responses:** Routes should pass through data as-is. Views transform data client-side.
- **Adding retry logic in routes:** The existing pattern uses no retries. Client hooks handle retry via manual refresh.
- **Using `parse()` instead of `safeParse()`:** Request validation uses `safeParse()` for graceful 400 errors. Response validation also uses `safeParse()` but only logs warnings (non-blocking).

## Don't Hand-Roll

| Problem             | Don't Build                    | Use Instead                                               | Why                                                                 |
| ------------------- | ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Error handling      | Custom try/catch in each route | `muninnProxyHandler()`                                    | Already handles 502 errors, response validation, client acquisition |
| Query param parsing | Manual `searchParams.get()`    | `parseQueryParams()` with Zod schema                      | Already handles coercion, defaults, error formatting                |
| HTTP client         | `fetch()` directly             | `muninnFetch()` via `getMuninnClient()`                   | Already handles auth headers, timeout (10s), base URL               |
| POST body parsing   | Custom JSON parse logic        | Existing pattern: `request.json()` + `schema.safeParse()` | Consistent 400 error format                                         |

**Key insight:** The existing helper infrastructure (`muninnProxyHandler`, `parseQueryParams`, `muninnFetch`, `getMuninnClient`) handles ALL cross-cutting concerns. New routes should be thin wrappers that only define schemas and call client methods.

## Common Pitfalls

### Pitfall 1: Next.js 15 Async Params

**What goes wrong:** Dynamic route params are a Promise in Next.js 15
**Why it happens:** Next.js 15 changed `params` from a sync object to `Promise<Params>`
**How to avoid:** Always `await params` before accessing properties
**Warning signs:** TypeScript error about params not having expected properties

### Pitfall 2: MuninnDB REST Gaps for Entity/Graph Operations

**What goes wrong:** Assuming all MCP tool operations have REST equivalents
**Why it happens:** MuninnDB exposes entity, entity_timeline, find_by_entity, entity_clusters, and export_graph only via MCP/gRPC
**How to avoid:** For MCP-only operations, compose from available REST primitives or implement server-side assembly logic in the MuninnClient methods
**Warning signs:** 404 responses from MuninnDB when calling nonexistent REST paths

### Pitfall 3: Tags Filter vs Other Filters on Engrams

**What goes wrong:** Assuming MuninnDB REST supports type/entity/since filtering
**Why it happens:** The `/api/engrams` endpoint only supports `vault`, `limit`, `offset`, and `tags` query params. Unknown params are silently ignored.
**How to avoid:** For `type`, `entity`, and `since` filtering: either fetch with `tags` filter and do client-side filtering in the route handler, or use semantic recall (`/api/activate`) for entity-based filtering.
**Warning signs:** Filters appear to work but return unfiltered results (MuninnDB ignores unknown params)

### Pitfall 4: Response Schema Strictness

**What goes wrong:** Strict Zod response schemas reject valid MuninnDB responses with extra fields
**Why it happens:** MuninnDB evolves its response shapes over time
**How to avoid:** Use `.passthrough()` on response schemas (existing pattern)
**Warning signs:** Console warnings about response validation failures

### Pitfall 5: URL Encoding Entity Names

**What goes wrong:** Entity names with special characters (spaces, `/`, `@`) break URL paths
**Why it happens:** Entity names like `@muninndb/client` or `Claude Code` contain URL-unsafe characters
**How to avoid:** Use `encodeURIComponent()` for query params and `decodeURIComponent()` for path params
**Warning signs:** 404 or garbled entity names in responses

## Code Examples

### Example 1: MuninnDB Contradictions Response Shape (verified)

```json
// GET /api/contradictions?vault=default
// Source: Live HTTP request to MuninnDB v0.3.9-alpha
{
  "contradictions": []
}
```

### Example 2: MuninnDB Traverse Response Shape (verified)

```json
// POST /api/traverse { "vault": "default", "start_id": "..." }
// Source: Live HTTP request to MuninnDB v0.3.9-alpha
// Error case (invalid ID):
{
  "error": {
    "code": 5001,
    "message": "an internal error occurred",
    "request_id": "..."
  }
}
// Expected success shape (from MCP tool definition):
{
  "nodes": [...],
  "edges": [...],
  "total_reachable": 0,
  "query_ms": 0
}
```

### Example 3: MuninnDB Explain Response Shape (verified)

```json
// POST /api/explain { "vault": "default", "engram_id": "test", "query": ["test"] }
// Source: Live HTTP request to MuninnDB v0.3.9-alpha
{
  "engram_id": "test",
  "concept": "",
  "final_score": 0,
  "components": {
    "full_text_relevance": 0,
    "semantic_similarity": 0,
    "decay_factor": 0,
    "hebbian_boost": 0,
    "access_frequency": 0,
    "confidence": 0
  },
  "fts_matches": null,
  "assoc_path": null,
  "would_return": false,
  "threshold": 0
}
```

### Example 4: MuninnDB Entity Response Shape (from MCP, no REST equivalent)

```json
// muninn_entity({ name: "luca-observer", vault: "default", limit: 2 })
// Source: MCP tool invocation on live MuninnDB v0.3.9-alpha
{
  "name": "luca-observer",
  "type": "project",
  "confidence": 1,
  "state": "active",
  "mention_count": 13,
  "first_seen": "2026-03-06T22:20:07Z",
  "updated_at": "2026-03-09T03:37:34Z",
  "engrams": [
    {
      "id": "01KK2...",
      "concept": "commit 3dcabf1f details",
      "created_at": "2026-03-06T22:20:07Z"
    }
  ],
  "relationships": [
    {
      "from_entity": "luca-observer",
      "to_entity": "MuninnDB",
      "rel_type": "uses",
      "weight": 0.95
    }
  ],
  "co_occurring": [{ "entity_name": "SpacetimeDB", "count": 5 }]
}
```

### Example 5: MuninnDB Entity Timeline Response Shape (from MCP, no REST equivalent)

```json
// muninn_entity_timeline({ entity_name: "luca-observer", vault: "default", limit: 2 })
{
  "entity": "luca-observer",
  "first_seen": "2026-03-06T22:20:07.24658Z",
  "mention_count": 13,
  "timeline": [
    {
      "engram_id": "01KK2...",
      "concept": "commit 3dcabf1f details",
      "created_at": "2026-03-06T17:20:07.229325-05:00",
      "summary": "Commit 3dcabf1f: error boundaries and crash protection for observer"
    }
  ],
  "count": 2
}
```

### Example 6: MuninnDB Find-By-Entity Response Shape (from MCP, no REST equivalent)

```json
// muninn_find_by_entity({ entity_name: "luca-observer", vault: "default", limit: 2 })
{
  "count": 2,
  "engrams": [
    {
      "id": "01KK2...",
      "concept": "commit 3dcabf1f details",
      "summary": "...",
      "state": "active"
    }
  ],
  "entity": "luca-observer"
}
```

### Example 7: MuninnDB Entity Clusters Response Shape (from MCP, no REST equivalent)

```json
// muninn_entity_clusters({ vault: "default", top_n: 3, min_count: 2 })
{
  "clusters": [
    { "entity_a": "luca-framework", "entity_b": "v3.0.0", "count": 9 },
    {
      "entity_a": "luca-framework",
      "entity_b": "53--v3-data-integrity...",
      "count": 7
    }
  ],
  "count": 3
}
```

### Example 8: MuninnDB Export Graph Response Shape (from MCP, no REST equivalent)

```json
// muninn_export_graph({ vault: "default", format: "json-ld", include_engrams: false })
{
  "data": "{\"@context\": ..., \"@graph\": [...]}",
  "edge_count": 109,
  "format": "json-ld",
  "node_count": 39
}
// Note: "data" is a JSON *string* (double-encoded), not an object
```

### Example 9: Engrams Tags Filter (verified working)

```
GET /api/engrams?vault=default&limit=50&tags=session  =>  total=3
GET /api/engrams?vault=default&limit=50               =>  total=43
```

The `tags` query param WORKS for filtering. Other params (`type`, `entity`, `since`) are silently IGNORED.

### Example 10: Dynamic Route with Async Params (Next.js 15)

```typescript
// app/api/muninn/entity/[name]/route.ts
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const entityName = decodeURIComponent(name);
  const { searchParams } = new URL(request.url);
  // ... validate and proxy
}
```

## MuninnClient Method Signatures Needed

New methods to add to the `MuninnClient` interface and `createMuninnClient()`:

```typescript
// Direct REST proxy methods (REST endpoints exist)
contradictions(vault: string): Promise<{ contradictions: unknown[] }>;

traverse(
  vault: string,
  startId: string,
  maxHops?: number,
  maxNodes?: number,
  followEntities?: boolean,
  relTypes?: string[],
): Promise<{ nodes: unknown[]; edges: unknown[]; total_reachable: number }>;

explain(
  vault: string,
  engramId: string,
  query: string[],
): Promise<{
  engram_id: string;
  final_score: number;
  components: Record<string, number>;
  would_return: boolean;
}>;

// MCP-only operations (NO direct REST endpoint)
// These need creative implementation using available REST primitives:
entity(vault: string, name: string, limit?: number): Promise<unknown>;
entityTimeline(vault: string, entityName: string, limit?: number): Promise<unknown>;
findByEntity(vault: string, entityName: string, limit?: number): Promise<unknown>;
entityClusters(vault: string, topN?: number, minCount?: number): Promise<unknown>;
exportGraph(vault: string, format?: string, includeEngrams?: boolean): Promise<unknown>;
```

## Strategy for MCP-Only Endpoints

For the 5 endpoints without REST equivalents, there are two viable strategies:

### Strategy A: Direct HTTP to MuninnDB Internal Endpoints (RECOMMENDED)

MuninnDB's MCP server internally calls the same Go functions as the REST API. The REST API may have undocumented or future endpoints. Since the MCP tools clearly work and return data, MuninnDB likely has internal HTTP handlers that the MCP server uses. The MuninnDB binary may expose these as undocumented REST endpoints on a different path prefix or port.

**Fallback:** If no undocumented endpoints exist, compose from available primitives.

### Strategy B: Compose from REST Primitives (FALLBACK)

For each MCP-only operation, approximate its behavior using available REST endpoints:

| Operation            | Composition Strategy                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| entity(name)         | Fetch `/api/engrams?tags={name}` + `/api/engrams/{id}/links` for each result. Assemble metadata server-side. |
| entityTimeline(name) | Same as entity but sort engrams by created_at ascending.                                                     |
| findByEntity(name)   | Fetch `/api/engrams?tags={name}` (tags-based filtering is confirmed working).                                |
| entityClusters       | Would require fetching all engrams and computing co-occurrence server-side. Expensive.                       |
| exportGraph          | Would require fetching all entities and relationships. Very expensive.                                       |

**Recommendation for planner:** Implement Strategy A first -- try undocumented REST paths. If 404, implement Strategy B for simpler operations (findByEntity, entity, entityTimeline). For entityClusters and exportGraph, if no REST path exists, defer to a follow-up phase or consider adding MuninnDB gRPC client support.

**UPDATE (HIGH confidence):** After exhaustive testing of all reasonable path patterns (snake_case, kebab-case, path params, POST/GET variants, /api/v1/, /rpc/ prefixes), these endpoints definitively do NOT exist in MuninnDB v0.3.9-alpha REST API. Strategy B is the required approach for MCP-only operations.

## Enhanced Engrams Filtering

### What MuninnDB REST Supports (verified)

- `vault` (string) -- works
- `limit` (number) -- works
- `offset` (number) -- works
- `tags` (string) -- works (filters by tag, verified: 3/43 results with `tags=session`)

### What MuninnDB REST Does NOT Support (verified)

- `type` / `memory_type` -- silently ignored
- `entity` / `entity_name` -- silently ignored
- `since` (timestamp) -- silently ignored

### Implementation Strategy for Enhanced Filtering

Per CONTEXT.md Gray Area 3: "If MuninnDB doesn't support server-side filtering: filter client-side in the route handler"

1. **`tag` filter:** Pass directly to MuninnDB as `tags` query param (supported).
2. **`type` filter:** Fetch engrams from MuninnDB, filter in route handler by `memory_type` field.
3. **`entity` filter:** Fetch engrams from MuninnDB, filter in route handler by checking if entity name appears in content or engram metadata.
4. **`since` filter:** Fetch engrams from MuninnDB, filter in route handler by `created_at >= since`.

**Caveat:** Client-side filtering means fetching more data than needed. Set a higher internal limit when filters are active to ensure adequate results after filtering.

## State of the Art

| Old Approach                   | Current Approach                         | When Changed       | Impact                                         |
| ------------------------------ | ---------------------------------------- | ------------------ | ---------------------------------------------- |
| Next.js 14 sync params         | Next.js 15 async params (`await params`) | Next.js 15 release | Dynamic routes must `await params`             |
| `@muninndb/client` npm package | Direct HTTP via `muninnFetch()`          | Project decision   | No SDK dependency; direct REST calls           |
| Strict Zod response validation | Permissive `.passthrough()` validation   | Existing pattern   | MuninnDB response evolution won't break routes |

**Deprecated/outdated:**

- `@muninndb/client` npm package: Does not exist. Use direct HTTP.

## Open Questions

1. **MuninnDB REST API for entity/graph operations**
   - What we know: These endpoints (entity, entity_timeline, find_by_entity, entity_clusters, export_graph) exist only via MCP/gRPC, not REST.
   - What's unclear: Whether MuninnDB will add REST endpoints for these in future versions, or whether there's a gRPC-gateway we haven't discovered.
   - Recommendation: Implement using composition from available REST primitives (Strategy B). Keep MuninnClient method signatures compatible with direct REST calls so when/if endpoints are added, the change is minimal (just update the internal HTTP call, not the method signature or route handler).

2. **Engrams filtering: fetch-all-and-filter scalability**
   - What we know: type/entity/since filters require client-side filtering because MuninnDB REST doesn't support them.
   - What's unclear: At what vault size does fetch-all-and-filter become unacceptably slow?
   - Recommendation: Use a reasonable max fetch (e.g., limit=1000) with client-side filtering. Document the limitation. If vaults grow large, revisit with MuninnDB server-side filtering when available.

3. **Export graph response: double-encoded JSON string**
   - What we know: The MCP `export_graph` response returns `data` as a JSON string, not an object (double-encoded).
   - What's unclear: Whether the Next.js route should parse and re-serialize it or pass the string through.
   - Recommendation: Pass through as-is. The client view can parse the `data` string. This matches the "no transformation" pattern in CONTEXT.md.

## Sources

### Primary (HIGH confidence)

- Live MuninnDB v0.3.9-alpha instance at `http://127.0.0.1:8476` -- all REST endpoints verified via direct HTTP requests
- MCP tool definitions -- exact parameter names, types, and response shapes from tool schemas
- MCP tool invocations -- actual response data from `muninn_entity`, `muninn_entity_timeline`, `muninn_find_by_entity`, `muninn_entity_clusters`, `muninn_contradictions`, `muninn_export_graph`
- Existing codebase files: `muninn-config.ts`, `muninn-route-helper.ts`, `muninn-schemas.ts`, `muninn-types.ts`, all 4 existing route files

### Secondary (MEDIUM confidence)

- [MuninnDB REST API docs](https://muninndb.com/docs/api/rest) -- confirmed core endpoints but does not document entity/graph REST endpoints
- [MuninnDB SDKs docs](https://muninndb.com/docs/sdks) -- confirms MCP as primary interface

### Tertiary (LOW confidence)

- [MuninnDB GitHub](https://github.com/scrypster/muninndb) -- README confirms 35 MCP tools but does not detail REST endpoint coverage

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH -- no new dependencies; all existing infrastructure reused
- Architecture patterns: HIGH -- all 4 existing routes follow identical pattern; patterns verified by reading source
- MuninnDB REST API coverage: HIGH -- exhaustively tested every plausible endpoint path variant against live instance
- MuninnDB MCP response shapes: HIGH -- verified by invoking MCP tools with real data
- Pitfalls: HIGH -- discovered REST API gaps through live testing, not assumptions
- Enhanced filtering: HIGH -- verified tags filter works, confirmed type/entity/since are ignored

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- MuninnDB REST API unlikely to change within 30 days; routes follow established patterns)
