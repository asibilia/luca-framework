# Phase 6 Context: Entity Deep Dive

## Decisions

### 1. Page routing pattern [researched]

**Decision:** Use a dynamic route segment `/entities/[name]/page.tsx` for the entity detail page.

- No existing observer pages use dynamic `[param]` segments yet, but the API layer already does (`/api/muninn/entity/[name]/route.ts` and `/api/muninn/entity/[name]/timeline/route.ts`), establishing the convention.
- A dedicated `/entities/[name]` route is cleaner than a query-param approach (`/entities?name=foo`) because entity deep dive is a full-page view, not a filter state.
- Next.js App Router naturally supports this pattern; the entity name will be URL-encoded in the path segment.
- The entities list page at `/entities` (no param) can serve as an entity browser/search landing page if desired later; for now, it can redirect or show a simple entity list.
- Add `/entities` to NAV_ITEMS in `lib/constants.ts` with icon "Fingerprint" (lucide icon for entity identity).

### 2. Tab navigation pattern [researched]

**Decision:** Use local React state (useState) for tab selection, not URL search params.

- No existing observer page uses `useSearchParams` or URL-based tab state. The codebase avoids Next.js navigation hooks beyond `usePathname` in the sidebar.
- Tabs are a view-level concern within a single entity. There is no need to deep-link to a specific tab (unlike the entity name itself, which needs a URL).
- Four tabs: **Timeline**, **Relationships**, **Engrams**, **Co-occurrences**. Default to "Timeline" as the most chronologically useful view.
- Implementation: A simple `activeTab` state variable in the page component, with a tab bar component that renders four buttons. Each tab body is conditionally rendered (not routed).

### 3. Entity selection UX and entry points [researched]

**Decision:** Users reach the entity deep dive page via links from existing views, plus a future entity search.

- The knowledge-graph sidebar already links to `/memory?entity=<name>` (see `graph-sidebar.tsx` line 225). This will be updated to link to `/entities/<name>` instead.
- The semantic search result cards link to both `/knowledge-graph?entity=<name>` and `/memory?entity=<name>` (see `search-result-card.tsx` lines 107, 114). Add a third link to `/entities/<name>`.
- The contradictions cards link to `/memory?entity=<concept>` (see `contradiction-card.tsx` lines 47, 78). Add links to `/entities/<name>`.
- The entity page itself will NOT include an entity search bar in Phase 6 -- that is deferred. Entry is via cross-view links from existing pages.
- NAV_ITEMS entry for "Entities" links to `/entities`, which will show a minimal placeholder or redirect to the knowledge graph until a dedicated entity browser is built.

### 4. Data fetching pattern [researched]

**Decision:** Create a dedicated `use-entity-deep-dive.ts` hook that fetches all entity data in parallel via `Promise.allSettled`.

- Follows the canonical hook pattern established by `use-memory.ts`, `use-knowledge-graph.ts`, `use-decision-trail.ts`: fetchingRef guard, Promise.allSettled for resilient parallel fetching, NotConfiguredError detection, manual refresh with no polling.
- The hook accepts an entity name parameter and fetches:
  1. `GET /api/muninn/entity/[name]` -- entity aggregate (name, type, state, confidence, mention_count, first_seen, updated_at, engrams, relationships, co_occurring)
  2. `GET /api/muninn/entity/[name]/timeline` -- chronological engram timeline
- Both API routes already exist and are validated via `EntityQuerySchema`/`EntityTimelineQuerySchema` and `EntityResponseSchema`/`EntityTimelineResponseSchema`.
- No new API routes are needed for Phase 6.

### 5. Relationships visualization [researched]

**Decision:** Use a list-based display, not a graph, for the Relationships tab.

- The entity aggregate's `relationships` field is typed as `unknown[]` and populated from the MuninnDB links endpoint (see `muninn-config.ts` line 297-315). The data shape varies and is best-effort (wrapped in try/catch).
- A force-directed graph would duplicate the Knowledge Graph page functionality and add heavy dependencies (ForceGraph2D is already used there). The entity deep dive should complement, not duplicate.
- The Relationships tab will render relationships as a simple list/table showing: linked engram concept, relationship type (if available), and a link to view that engram.
- If relationships data is empty (common when entity has no links), show an empty state with a link to the Knowledge Graph for the visual relationship view.

### 6. Co-occurrences display [researched]

**Decision:** Display co-occurring entities as a sorted list with occurrence counts and links to their entity pages.

- The `MuninnEntity.co_occurring` field is `Array<{ entity_name: string; count: number }>`. However, the current `muninn-config.ts` `entity()` method returns `co_occurring: []` (hardcoded empty, line 337). This needs to be populated.
- To populate co-occurrences, the `entity()` method in `muninn-config.ts` should fetch entity clusters and filter for the target entity. Alternatively, the hook can make a separate call to `/api/muninn/entity-clusters` and filter client-side.
- **Chosen approach:** Fetch entity clusters from the existing `/api/muninn/entity-clusters` endpoint in the hook, then filter client-side for pairs containing the target entity name. This avoids modifying the server-side `entity()` method and reuses the existing API route.
- Each co-occurring entity row will link to `/entities/<entity_name>` for further exploration.

### 7. Page structure and header [researched]

**Decision:** Single page with PageContainer + header card + tab bar + tab content.

- Follows the established observer page pattern: `PageContainer` wrapper with title, subtitle, and actions (refresh + last updated timestamp).
- Header section (above tabs) displays: entity name (large), type badge (colored per `TYPE_COLORS`), state badge (active/deprecated/merged/resolved), first seen date, mention count, confidence score.
- Reuse the `TypeBadge` pattern from `graph-sidebar.tsx` for the entity type display.
- Reuse `relativeTime` from `lib/format.ts` for timestamps.
- Reuse `ErrorBoundary`, `LoadingSkeleton`, `EmptyState` from `components/shared/`.

### 8. Entity state display [researched]

**Decision:** Show entity state from the `MuninnEntity.state` field with color-coded badges.

- The `MuninnEntity.state` field is a string (see `muninn-types.ts` line 86). The composed `entity()` method in `muninn-config.ts` currently hardcodes `state: "active"` (line 323).
- MuninnDB entities can have states: active, deprecated, merged, resolved. These correspond to MuninnDB entity lifecycle states.
- Since the composed method hardcodes "active", the actual state will always show "active" until MuninnDB provides richer entity metadata. This is acceptable for Phase 6 -- the UI will be ready to display other states when the data becomes available.
- State badge colors: active=green, deprecated=orange, merged=blue, resolved=gray.

### 9. Component file organization [researched]

**Decision:** Create a `components/entities/` directory with tab-specific components.

- Following the pattern of `components/knowledge-graph/`, `components/decisions/`, `components/vault/`, `components/semantic-search/`, `components/contradictions/`.
- Files:
  - `entity-header.tsx` -- name, type badge, state badge, metadata
  - `entity-tab-bar.tsx` -- tab navigation buttons
  - `entity-timeline.tsx` -- Timeline tab content
  - `entity-relationships.tsx` -- Relationships tab content
  - `entity-engrams.tsx` -- Engrams tab content
  - `entity-co-occurrences.tsx` -- Co-occurrences tab content
- All file names follow kebab-case convention per project rules.

## Data Sources

| View                      | API Route                                | Method                                | Already Exists?                 |
| ------------------------- | ---------------------------------------- | ------------------------------------- | ------------------------------- |
| Entity aggregate (header) | `GET /api/muninn/entity/[name]`          | `client.entity(vault, name)`          | Yes                             |
| Timeline tab              | `GET /api/muninn/entity/[name]/timeline` | `client.entityTimeline(vault, name)`  | Yes                             |
| Relationships tab         | Included in entity aggregate             | `relationships` field from `entity()` | Yes (best-effort)               |
| Engrams tab               | Included in entity aggregate             | `engrams` field from `entity()`       | Yes                             |
| Co-occurrences tab        | `GET /api/muninn/entity-clusters`        | `client.entityClusters(vault)`        | Yes (client-side filter needed) |

## Key Files

| File                                                                    | Purpose                                                                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `packages/luca-observer/lib/muninn-types.ts`                            | MuninnEntity, MuninnEntityTimeline, MuninnTimelineEntry types                                                               |
| `packages/luca-observer/lib/muninn-config.ts`                           | MuninnClient with entity(), entityTimeline(), entityClusters()                                                              |
| `packages/luca-observer/lib/muninn-schemas.ts`                          | EntityQuerySchema, EntityResponseSchema, EntityTimelineQuerySchema, EntityTimelineResponseSchema, EntityClustersQuerySchema |
| `packages/luca-observer/lib/muninn-route-helper.ts`                     | muninnProxyHandler(), parseQueryParams() for API routes                                                                     |
| `packages/luca-observer/app/api/muninn/entity/[name]/route.ts`          | Existing entity aggregate API route                                                                                         |
| `packages/luca-observer/app/api/muninn/entity/[name]/timeline/route.ts` | Existing entity timeline API route                                                                                          |
| `packages/luca-observer/app/api/muninn/entity-clusters/route.ts`        | Existing entity clusters API route                                                                                          |
| `packages/luca-observer/lib/graph-types.ts`                             | TYPE_COLORS, EntityType, resolveEntityType() -- reuse for type badges                                                       |
| `packages/luca-observer/lib/format.ts`                                  | relativeTime(), formatDateTime() -- reuse for timestamps                                                                    |
| `packages/luca-observer/lib/constants.ts`                               | NAV_ITEMS -- add Entities entry                                                                                             |
| `packages/luca-observer/components/layout/page-container.tsx`           | PageContainer wrapper                                                                                                       |
| `packages/luca-observer/components/shared/error-boundary.tsx`           | ErrorBoundary wrapper                                                                                                       |
| `packages/luca-observer/components/shared/loading-skeleton.tsx`         | LoadingSkeleton component                                                                                                   |
| `packages/luca-observer/components/shared/empty-state.tsx`              | EmptyState component                                                                                                        |
| `packages/luca-observer/components/knowledge-graph/graph-sidebar.tsx`   | TypeBadge pattern to reuse, existing link to update                                                                         |
| `packages/luca-observer/hooks/use-decision-trail.ts`                    | Canonical hook pattern to follow                                                                                            |

## Scope Boundary

### In scope (Phase 6)

- Dynamic route page at `/entities/[name]/page.tsx`
- `use-entity-deep-dive.ts` hook fetching entity + timeline + co-occurrences
- Entity header component with name, type badge, state badge, first seen, mention count
- Four tabbed views: Timeline, Relationships, Engrams, Co-occurrences
- Timeline tab: chronological engram list with timestamps and summaries
- Relationships tab: list of linked engrams from the entity aggregate
- Engrams tab: list of engrams with concept, id, created_at
- Co-occurrences tab: list of co-occurring entities with counts, linking to their entity pages
- Add "Entities" to NAV_ITEMS
- Import Fingerprint icon in sidebar.tsx

### Deferred

- Entity search/browser page at `/entities` (placeholder or redirect for now)
- Graph visualization in Relationships tab (use Knowledge Graph page for that)
- Updating existing cross-view links (graph-sidebar, search-result-card, contradiction-card) to point to `/entities/[name]` -- this is a follow-up polish task
- Enriching the `entity()` composed method to return real state/type from MuninnDB entity metadata
- Entity comparison view (side-by-side two entities)
- Entity merge/deprecation actions from the UI
- Engram inline expansion (click to see full content) -- keep it simple with truncated summaries
