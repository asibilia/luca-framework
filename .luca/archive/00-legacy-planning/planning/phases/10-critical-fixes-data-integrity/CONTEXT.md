# Phase 10 Context

## Scope

Phase 10 covers critical fixes, data integrity reconciliation, and observer memory MuninnDB migration. Plans 1-3 are deterministic bug fixes. PLAN-04 (MuninnDB observer migration) is the only plan with design decisions captured here.

## Decisions

### Engram Display Layout

- **Medium cards**: Each engram shows concept name + first ~100 chars of content inline, with confidence badge and tag pills. Full content revealed on expand/click.
- **Page layout**: Do NOT reuse the old 3-column grid (Brain | Memory | Working). The richer MuninnDB data warrants a new layout. Invoke `/frontend-design` specialist during execution to design the memory dashboard layout.

### Category Mapping Strategy

- **Hybrid grouping**: Primary key is `memory_type` field from MuninnDB. If empty/missing, fall back to concept prefix parsing (split on first `:`). If neither yields a known category, file under "Uncategorized".
- **Known categories**: pattern, decision, pitfall, preference (matching existing color scheme from old MemoryEntries component).
- **Uncategorized engrams**: Hidden by default. Shown via a "Show all" toggle to keep the default view clean.

### Data Refresh & Staleness

- **No polling**: Do not use `setInterval` or background polling. MuninnDB data changes infrequently.
- **Manual refresh**: Add a refresh button to the page header. Clicking it re-fetches all MuninnDB data.
- **Staleness indicator**: Subtle "Last updated: Xs ago" timestamp next to the refresh button. Updates on each successful fetch.
- **Future**: Event streaming (SSE via `client.subscribe()`) is a candidate for live updates but is deferred — not in Phase 10 scope.

### Security

- **API key stays server-side**: `MUNINN_DB_API_KEY` is never exposed to the browser. No `NEXT_PUBLIC_` prefix.
- **Server-side proxy**: Next.js Route Handlers in `app/api/muninn/` proxy all MuninnDB calls. Client components fetch from same-origin `/api/muninn/*` routes.
- **No SDK in client code**: `@muninndb/client` is only imported in `lib/muninn-config.ts` (server-only). Client-side type mirrors are defined locally in the hook file.

## Deferred Ideas

- Event streaming for live memory updates (SSE via MuninnDB `subscribe()`)
- MuninnDB graph visualization (traverse API → node/edge rendering)
- Engram search/filter UI with semantic recall (`activate()` with user queries)

## Plans Affected

- **PLAN-04**: All decisions above apply. Task 2 (use-memory hook) must remove polling in favor of manual refresh. Task 5 (memory page) must include refresh button + timestamp.
- **PLAN-04 Task 5**: Layout design should be informed by `/frontend-design` specialist output before implementation.
