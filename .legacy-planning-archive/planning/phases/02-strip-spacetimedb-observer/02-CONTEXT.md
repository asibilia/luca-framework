# Phase 02 — Strip SpacetimeDB from Observer: Context

## Gray Area 1: What Replaces Deleted Page Components

**Decision:** Keep routes with minimal placeholder pages. [codebase-analysis]

**Rationale:**

- The observer has 10 page routes (dashboard, agents, cost, decisions, harness, iterations, memory, notes, planning, tribunal, workflow)
- 8 of these depend on SpacetimeDB hooks (all except memory and notes/todos)
- New MuninnDB-native views ship in Phases 04-07
- Deleting routes entirely would break navigation and require re-creating them later
- Minimal placeholder pages ("Coming soon — rebuilding with MuninnDB") preserve the route structure

**Locked:**

- Delete full page component implementations that import SpacetimeDB hooks
- Replace with minimal placeholder components (no data fetching, just static text)
- Keep: memory/page.tsx (already MuninnDB-native), notes/page.tsx (uses /api/todos)

## Gray Area 2: Dashboard Handling

**Decision:** Gut the dashboard to non-SpacetimeDB components only. [codebase-analysis]

**Rationale:**

- Dashboard (app/page.tsx) imports useEventStream and useLedger — both SpacetimeDB hooks
- OverviewCards and RecentEvents components take SpacetimeDB event types as props
- TodoTracker component uses /api/todos (no SpacetimeDB dependency)
- The memory page is already a functional MuninnDB dashboard

**Locked:**

- Remove SpacetimeDB hook imports from dashboard
- Keep TodoTracker (clean, uses /api/todos route)
- Remove OverviewCards, RecentEvents, RecentTransitions from dashboard
- Add link to Memory page as primary data view
- Delete dashboard components that take SpacetimeDB types as props (recent-events.tsx, overview-cards.tsx, recent-transitions.tsx)

## Gray Area 3: Provider Replacement Strategy

**Decision:** Remove SpacetimeDBProvider, keep JotaiProvider + ThemeSync only. [codebase-analysis]

**Rationale:**

- app/providers.tsx currently wraps children in JotaiProvider > SpacetimeDBProvider > ThemeSync
- SpacetimeDBProvider connects to a SpacetimeDB instance via WebSocket
- MuninnDB data is fetched via /api/muninn/\* REST routes — no client-side provider needed
- Jotai is still used for theme state management

**Locked:**

- Remove SpacetimeDBProvider and all SpacetimeDB imports from providers.tsx
- Keep JotaiProvider and ThemeSync
- No MuninnDB provider needed (data is fetched via API routes, not subscriptions)
- Remove ErrorContext type import from module_bindings

## Gray Area 4: Hook Triage — What to Delete vs Keep

**Decision:** Delete all 15 SpacetimeDB hooks, keep 3 clean hooks. [codebase-analysis]

**Hook audit:**

| Hook                  | Dependency                | Action |
| --------------------- | ------------------------- | ------ |
| use-agent-activity    | module_bindings           | DELETE |
| use-context-health    | module_bindings           | DELETE |
| use-cost-tracking     | module_bindings           | DELETE |
| use-decision-trail    | module_bindings           | DELETE |
| use-event-stream      | module_bindings           | DELETE |
| use-filtered-table    | module_bindings           | DELETE |
| use-harness-result    | module_bindings           | DELETE |
| use-iteration-history | module_bindings           | DELETE |
| use-ledger            | module_bindings           | DELETE |
| use-metrics           | module_bindings           | DELETE |
| use-planning          | module_bindings           | DELETE |
| use-token-usage       | module_bindings           | DELETE |
| use-tool-calls        | module_bindings           | DELETE |
| use-tribunal          | module_bindings           | DELETE |
| use-workflow-state    | module_bindings           | DELETE |
| use-memory            | /api/muninn/\* (MuninnDB) | KEEP   |
| use-todos             | /api/todos (filesystem)   | KEEP   |
| use-media-query       | Pure DOM                  | KEEP   |

**Locked:** Delete 15, keep 3. New hooks will be created in Phases 04-07 using /api/muninn/\* routes.

## Deferred Ideas

- **Realtime data via WebSocket/SSE**: Could add Server-Sent Events for live updates. Defer to Phase 04+ if needed.
- **MuninnDB client-side SDK**: Could create a React context for MuninnDB. Not needed — API route pattern works fine.

---

_Context gathered: 2026-03-09 (auto-discuss, Phase 02)_
