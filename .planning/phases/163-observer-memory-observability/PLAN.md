---
phase: 163
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 163 Plan 1: Observer Memory Observability Upgrade

## Objective

Redesign the `/memory` page in `packages/luca-observer/` to surface the full breadth of available MuninnDB data. The current page uses only 4 of the 15+ available MuninnDB API routes and shows a flat, single-dimension view. This plan delivers a 6-section dashboard covering session status, memory health, recall effectiveness, memory timeline, brain tree drill-down, and a knowledge graph mini — plus an enhanced header bar with memory health and checkpoint indicators.

All work is isolated to `packages/luca-observer/`. No changes to `src/`.

## Context

- @packages/luca-observer/app/memory/page.tsx — current page (to be redesigned)
- @packages/luca-observer/app/api/muninn/stats/route.ts — pattern for new API routes
- @packages/luca-observer/app/api/muninn/session/route.ts — pattern for GET query param routes
- @packages/luca-observer/lib/muninn-route-helper.ts — muninnProxyHandler + parseQueryParams
- @packages/luca-observer/lib/muninn-schemas.ts — Zod schemas for all existing routes
- @packages/luca-observer/lib/muninn-config.ts — MuninnClient interface (health, recall methods)
- @packages/luca-observer/hooks/use-memory.ts — fetchJson, NotConfiguredError, Promise.allSettled pattern
- @packages/luca-observer/hooks/use-vault-health.ts — polling hook pattern with derived metrics
- @packages/luca-observer/hooks/use-context-metrics.ts — polling interval pattern with Zod safeParse
- @packages/luca-observer/components/layout/context-window-bar.tsx — header bar component pattern
- @packages/luca-observer/components/layout/header.tsx — where header enhancements slot in
- @packages/luca-observer/components/memory/brain-panel.tsx — collapsible card pattern
- @packages/luca-observer/components/memory/context-usage-bar.tsx — stats card with CSS color tokens
- @packages/luca-observer/components/shared/empty-state.tsx — empty state pattern

---

## Wave 1: API Routes and React Hooks (Data Layer)

### Task 1.1: Add Zod schemas for 5 new routes to muninn-schemas.ts
**Type:** auto
**TDD:** false
**Depends on:** none

Extend `packages/luca-observer/lib/muninn-schemas.ts` with query/response Zod schemas for all 5 new routes. Follow the existing patterns (snake_case fields, `.passthrough()` on response schemas, `z.coerce.number()` for query params).

Schemas to add:

- `HealthQuerySchema` — no params (health is vault-agnostic)
- `HealthResponseSchema` — `{ status, version, uptime_seconds, db_writable }` with passthrough
- `ObservationsQuerySchema` — `{ vault, limit }` (recalls `session:observation-*` engrams)
- `ObservationsResponseSchema` — `{ observations: z.array(z.any()), total: z.number() }` with passthrough
- `MetricsQuerySchema` — `{ vault, limit }` (recalls `metric:*` engrams)
- `MetricsResponseSchema` — `{ metrics: z.array(z.any()), total: z.number() }` with passthrough
- `CheckpointQuerySchema` — no params (reads local file, no vault)
- `CheckpointResponseSchema` — `{ zone, usage_percent, checked_at, observation_count, checkpoint_age_seconds }` all optional/passthrough
- `ZoneHistoryQuerySchema` — no params (reads local file)
- `ZoneHistoryResponseSchema` — `{ entries: z.array(z.any()), total: z.number() }` with passthrough

**Files to create/edit:**
- `packages/luca-observer/lib/muninn-schemas.ts` (edit, append new schemas)

**Verification:**
- `bunx --bun tsc --noEmit` from `packages/luca-observer/` passes

---

### Task 1.2: Add GET /api/muninn/health route
**Type:** auto
**TDD:** false
**Depends on:** 1.1

Create `packages/luca-observer/app/api/muninn/health/route.ts`. This route calls `client.health()` (already implemented in `getMuninnClient()`). No vault param needed — health is a global endpoint.

Pattern to follow: `stats/route.ts` but without `parseQueryParams` since there are no query params.

```typescript
export async function GET() {
  return muninnProxyHandler(
    (client) => client.health(),
    "Failed to fetch MuninnDB health",
    HealthResponseSchema,
  );
}
```

**Files to create/edit:**
- `packages/luca-observer/app/api/muninn/health/route.ts` (create)

**Verification:**
- TypeScript compiles clean
- Manual: `curl http://localhost:3000/api/muninn/health` returns JSON with `status` field

---

### Task 1.3: Add GET /api/muninn/observations route
**Type:** auto
**TDD:** false
**Depends on:** 1.1

Create `packages/luca-observer/app/api/muninn/observations/route.ts`. Recalls recent engrams with concept prefix `session:observation-*` by calling `client.listEngrams(vault, limit, 0, "session:observation")`.

Follow `session/route.ts` pattern with `parseQueryParams(searchParams, ObservationsQuerySchema)`.

Return shape: `{ observations: engrams, total: number }` — rename the `engrams` key to `observations` in the response for semantic clarity.

**Files to create/edit:**
- `packages/luca-observer/app/api/muninn/observations/route.ts` (create)

**Verification:**
- TypeScript compiles clean
- Manual: endpoint returns an array of observation engrams (may be empty if none stored)

---

### Task 1.4: Add GET /api/muninn/metrics route
**Type:** auto
**TDD:** false
**Depends on:** 1.1

Create `packages/luca-observer/app/api/muninn/metrics/route.ts`. Recalls engrams with concept prefix `metric:` by calling `client.listEngrams(vault, limit, 0, "metric:")`.

Return shape: `{ metrics: engrams, total: number }`.

Pattern identical to Task 1.3 but using `MetricsQuerySchema` and the `metric:` tag filter.

**Files to create/edit:**
- `packages/luca-observer/app/api/muninn/metrics/route.ts` (create)

**Verification:**
- TypeScript compiles clean
- Manual: endpoint returns metric engrams (will have entries if Phase 158+ metrics are stored)

---

### Task 1.5: Add GET /api/muninn/checkpoint route
**Type:** auto
**TDD:** false
**Depends on:** 1.1

Create `packages/luca-observer/app/api/muninn/checkpoint/route.ts`. This is a local file reader — NOT a MuninnDB proxy. Reads `.planning/.context-checkpoint.json` from the filesystem using `Bun.file()` (or `fs.readFile` as fallback).

Do NOT use `muninnProxyHandler`. Instead:
1. Read `.planning/.context-checkpoint.json` relative to `process.cwd()`
2. Parse with `CheckpointResponseSchema.safeParse()`
3. If file missing or parse fails, return `{ zone: null, usage_percent: null, checked_at: null, observation_count: 0, checkpoint_age_seconds: null }`
4. If present, compute `checkpoint_age_seconds` from `checked_at` timestamp to now

Return 200 always (file missing is not an error — it means no checkpoint yet).

**Files to create/edit:**
- `packages/luca-observer/app/api/muninn/checkpoint/route.ts` (create)

**Verification:**
- TypeScript compiles clean
- Manual: returns valid JSON even when file does not exist

---

### Task 1.6: Add GET /api/muninn/zone-history route
**Type:** auto
**TDD:** false
**Depends on:** 1.1

Create `packages/luca-observer/app/api/muninn/zone-history/route.ts`. Reads `.planning/.context-metrics.json` history for zone transition data.

Do NOT use `muninnProxyHandler`. Read the local file, extract the last N entries (default 50), return `{ entries: [...], total: number }`. Each entry should include at minimum: `zone`, `usage_percent`, `checked_at`.

Return 200 with empty entries array when file is missing.

**Files to create/edit:**
- `packages/luca-observer/app/api/muninn/zone-history/route.ts` (create)

**Verification:**
- TypeScript compiles clean
- Manual: returns entries array (may be empty if no metrics history)

---

### Task 1.7: Add useMemoryHealth React hook
**Type:** auto
**TDD:** false
**Depends on:** 1.2

Create `packages/luca-observer/hooks/use-memory-health.ts`. Fetches from `/api/muninn/health` and `/api/muninn/stats` in parallel using `Promise.allSettled`. Uses the established `fetchJson`, `fetchingRef`, `NotConfiguredError` pattern from `use-memory.ts`.

Export shape:
```typescript
interface MemoryHealthData {
  health: { status: string; uptime_seconds: number; db_writable: boolean } | null;
  coherence: CoherenceEntry[]; // reuse type from use-vault-health.ts
  entity_count: number;
  contradiction_count: number;
  health_score: number | null; // derived: coherence.score if available
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  configured: boolean;
}
```

No polling interval — manual refresh only (consistent with `use-memory.ts`).

**Files to create/edit:**
- `packages/luca-observer/hooks/use-memory-health.ts` (create)

**Verification:**
- TypeScript compiles clean
- Hook exports all fields in the interface above

---

### Task 1.8: Add useObservations React hook
**Type:** auto
**TDD:** false
**Depends on:** 1.3, 1.4

Create `packages/luca-observer/hooks/use-observations.ts`. Fetches from `/api/muninn/observations` and `/api/muninn/metrics` in parallel. Applies Zod safeParse on both responses.

Export shape:
```typescript
interface ObservationsData {
  observations: MuninnEngram[];
  metrics: MuninnEngram[];
  hit_rate: number | null;    // derived from metric engrams if available
  precision: number | null;   // derived from metric engrams if available
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  configured: boolean;
}
```

Hit rate and precision are derived by scanning metric engrams for concept names matching `metric:recall-hit-rate` and `metric:recall-precision`.

**Files to create/edit:**
- `packages/luca-observer/hooks/use-observations.ts` (create)

**Verification:**
- TypeScript compiles clean
- Hook returns valid data shapes even when no observations/metrics exist

---

### Task 1.9: Add useCheckpoint React hook
**Type:** auto
**TDD:** false
**Depends on:** 1.5, 1.6

Create `packages/luca-observer/hooks/use-checkpoint.ts`. Fetches from `/api/muninn/checkpoint` and `/api/muninn/zone-history` in parallel with a 30s polling interval (matches context metrics polling cadence from `use-context-metrics.ts`).

Export shape:
```typescript
interface CheckpointData {
  zone: string | null;
  usage_percent: number | null;
  observation_count: number;
  checkpoint_age_seconds: number | null;
  zone_history: Array<{ zone: string; usage_percent: number; checked_at: string }>;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}
```

**Files to create/edit:**
- `packages/luca-observer/hooks/use-checkpoint.ts` (create)

**Verification:**
- TypeScript compiles clean
- Polling interval uses `setInterval` with cleanup in `useEffect` return (matches `use-context-metrics.ts` pattern)

---

## Wave 2: Six Page Sections (UI Components)

### Task 2.1: Create SessionStatusHero component
**Type:** auto
**TDD:** false
**Depends on:** 1.9

Create `packages/luca-observer/components/memory/session-status-hero.tsx`. Shows real-time context gauge with zone color, observation count, and checkpoint age. Consumes `CheckpointData` from `use-checkpoint.ts` passed as props.

Visual design:
- Large zone badge with zone-color CSS token (`--color-success`, `--color-info`, etc.)
- CSS progress bar for `usage_percent` (reuse `ContextWindowBar` visual pattern — `h-1 w-full` bar)
- Three stat chips in a flex row: observation count, checkpoint age (humanized), zone label
- Empty state when no checkpoint data available

Follow `context-usage-bar.tsx` for the card structure and `context-window-bar.tsx` for the zone color resolution.

**Files to create/edit:**
- `packages/luca-observer/components/memory/session-status-hero.tsx` (create)

**Verification:**
- TypeScript compiles clean
- Renders without errors when passed null checkpoint data (empty state)

---

### Task 2.2: Create HealthDashboard component
**Type:** auto
**TDD:** false
**Depends on:** 1.7

Create `packages/luca-observer/components/memory/health-dashboard.tsx`. Displays coherence subscores, entity count, contradiction count, and DB health status. Consumes `MemoryHealthData` props.

Visual design:
- Header row: health status dot (green/red for `db_writable`), uptime in seconds, "Connected" badge
- Coherence score bar (CSS, not a chart library) — same pattern as `context-usage-bar.tsx` percentage bar
- Four subscores in a 2x2 grid using the `card` + `font-mono text-xs` pattern: orphan ratio, contradiction density, duplication pressure, temporal variance
- Colored badges using the `coherenceColor()` function pattern already in `context-usage-bar.tsx`

**Files to create/edit:**
- `packages/luca-observer/components/memory/health-dashboard.tsx` (create)

**Verification:**
- TypeScript compiles clean
- All four subscores render with appropriate color coding

---

### Task 2.3: Create RecallEffectiveness component
**Type:** auto
**TDD:** false
**Depends on:** 1.8

Create `packages/luca-observer/components/memory/recall-effectiveness.tsx`. Shows hit rate, precision, and recent metric engrams list. Consumes `ObservationsData` props.

Visual design:
- Two large metric displays: hit rate % and precision % using the colored badge pattern
- Horizontal CSS bar chart for hit rate (same `h-1 rounded-full` pattern from `context-window-bar.tsx`)
- Recent observations list: last 10 observations as a compact `font-mono text-xs` list with timestamp and concept
- Empty state component when no metric engrams are available

**Files to create/edit:**
- `packages/luca-observer/components/memory/recall-effectiveness.tsx` (create)

**Verification:**
- TypeScript compiles clean
- Empty state renders gracefully when no metrics exist

---

### Task 2.4: Create MemoryTimeline component
**Type:** auto
**TDD:** false
**Depends on:** 1.8, 1.9

Create `packages/luca-observer/components/memory/memory-timeline.tsx`. Observation chronology with zone markers and checkpoint events. Consumes both `ObservationsData` and `CheckpointData` props.

Visual design:
- Vertical timeline using CSS border-left for the line (`border-l-2 border-border ml-2`)
- Each event as a row: colored dot (zone color or observation type color), timestamp (`relativeTime()`), concept text
- Zone transitions from `zone_history` shown as horizontal zone markers (background color strip, label)
- Most recent events at top (max 30 events to keep the view performant)
- Scroll container with `max-h-96 overflow-y-auto`

**Files to create/edit:**
- `packages/luca-observer/components/memory/memory-timeline.tsx` (create)

**Verification:**
- TypeScript compiles clean
- Empty state when no timeline data

---

### Task 2.5: Create EnhancedBrainTree component
**Type:** auto
**TDD:** false
**Depends on:** none (uses existing useMemory hook data)

Create `packages/luca-observer/components/memory/enhanced-brain-tree.tsx`. Extends the existing `BrainPanel` with drill-down capability. The existing `BrainPanel` is preserved unchanged — this is a new component that adds type-grouped navigation.

Visual design:
- Top nav tabs: "All", "project-*", "user-*", "session-*" (filter by concept prefix)
- Reuse `BrainEngram` sub-component logic from `brain-panel.tsx` (copy the internal component rather than importing it since it's not exported)
- Search input (`<input>` with `font-mono text-xs border rounded`) to filter by concept text
- Badge showing count per active filter

**Files to create/edit:**
- `packages/luca-observer/components/memory/enhanced-brain-tree.tsx` (create)

**Verification:**
- TypeScript compiles clean
- Filtering by tab and search input works correctly

---

### Task 2.6: Create KnowledgeGraphMini component
**Type:** auto
**TDD:** false
**Depends on:** none (uses existing entity-clusters data via a new fetch)

Create `packages/luca-observer/components/memory/knowledge-graph-mini.tsx`. Simplified entity relationship visualization using CSS only (no force graph library). Shows top 20 entity cluster pairs as a sorted list with co-occurrence counts.

Visual design: Not a canvas graph — a structured list of entity pairs with a CSS bar showing relative co-occurrence weight. This avoids the dynamic import complexity of the full knowledge graph page while still surfacing the data.

Layout:
- Card with title "Entity Co-occurrences"
- Each pair as a row: `entity_a` ↔ `entity_b` with a CSS width bar and count badge
- Top 15 pairs by count
- "View full graph →" link to `/knowledge-graph`

Data source: fetch from `/api/muninn/entity-clusters?vault=V&top_n=15&min_count=2` (already exists).

**Files to create/edit:**
- `packages/luca-observer/components/memory/knowledge-graph-mini.tsx` (create)

**Verification:**
- TypeScript compiles clean
- Renders as a list (no canvas/WebGL requirement)

---

### Task 2.7: Redesign memory page.tsx
**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6

Replace `packages/luca-observer/app/memory/page.tsx` with the new 6-section layout. Wire up all three hooks (`useMemory`, `useMemoryHealth`, `useObservations`, `useCheckpoint`) at the page level and pass data down to section components.

Layout structure:
```
<PageContainer title="Memory" subtitle="MuninnDB Memory Observability">
  {/* Actions: connection status + last updated + refresh */}
  <div className="space-y-6">
    <SessionStatusHero />          {/* checkpoint + zone */}
    <grid 2-col lg>
      <HealthDashboard />           {/* left col */}
      <RecallEffectiveness />       {/* right col */}
    </grid>
    <MemoryTimeline />             {/* full width */}
    <EnhancedBrainTree />          {/* full width */}
    <KnowledgeGraphMini />         {/* full width */}
  </div>
</PageContainer>
```

Each section wrapped in `<ErrorBoundary name="...">`. LoadingSkeleton shown per-section when its hook is loading. Keep the `refresh` button in the page header wired to all four hooks.

**Files to create/edit:**
- `packages/luca-observer/app/memory/page.tsx` (edit, full redesign)

**Verification:**
- `bunx --bun tsc --noEmit` passes
- Manual: launch observer (`bun run dev` in `packages/luca-observer/`), visit `/memory`, verify all 6 sections render
- Manual: verify refresh button triggers data reload
- Manual: verify error boundaries isolate failures per section

---

## Wave 3: Enhanced Header Bar and Polish

### Task 3.1: Create MemoryHealthIndicator header component
**Type:** auto
**TDD:** false
**Depends on:** 1.7

Create `packages/luca-observer/components/layout/memory-health-indicator.tsx`. A compact status indicator for the header bar showing memory health score and checkpoint age.

Visual design (compact, for header use):
- Single colored dot (green/yellow/red) based on coherence score thresholds matching `coherenceColor()` in `context-usage-bar.tsx`
- Observation count badge (`N obs` in `font-mono text-xs`)
- Checkpoint age (`Nmin ago` or `just now` in `font-mono text-xs text-muted-foreground`)
- Tooltip on the container div: "Memory health: X% · N observations · checkpoint Nm ago"
- Hides gracefully when hook data is null/loading

This component fetches its own data internally using `useMemoryHealth` and `useCheckpoint` hooks — it does NOT receive props (self-contained for header use). It uses a 30s polling interval to stay current without hammering the API.

**Files to create/edit:**
- `packages/luca-observer/components/layout/memory-health-indicator.tsx` (create)

**Verification:**
- TypeScript compiles clean
- Renders nothing when hooks return null (no active session)

---

### Task 3.2: Integrate MemoryHealthIndicator into Header
**Type:** checkpoint:human-verify
**TDD:** false
**Depends on:** 3.1

Edit `packages/luca-observer/components/layout/header.tsx` to add `<MemoryHealthIndicator />` between the existing `<ContextWindowBar />` and the vault separator.

Final header order (left to right):
```
SidebarTrigger | Separator | [spacer flex-1] | ContextWindowBar | Separator | MemoryHealthIndicator | Separator | VaultSelector | ThemeToggle
```

Add a `<Separator orientation="vertical" className="mx-1 h-4" />` between `MemoryHealthIndicator` and the vault selector to maintain visual separation.

**Files to create/edit:**
- `packages/luca-observer/components/layout/header.tsx` (edit)

**Verification:**
- TypeScript compiles clean
- Manual: observer header shows memory health dot and observation count
- Manual: dot color changes based on coherence score (test with healthy vs degraded vault)
- Manual: component hides cleanly when MuninnDB is unavailable (configured = false)

---

### Task 3.3: Polish — empty states, loading skeletons, and responsive layout
**Type:** auto
**TDD:** false
**Depends on:** 2.7, 3.2

Final polish pass across all new components:

1. Verify all 6 page sections have appropriate `EmptyState` components when data is absent
2. Add `LoadingSkeleton` variants for `HealthDashboard` (2 cards) and `RecallEffectiveness` (2 stats)
3. Ensure the 2-column grid in page.tsx uses `grid-cols-1 lg:grid-cols-2` for responsive layout
4. Verify dark mode: all color references use CSS custom properties (`var(--color-*)`) not hardcoded hex values
5. Check all new components for `aria-label` and `role` attributes on `Card` regions (matching existing pattern in `context-usage-bar.tsx`)

**Files to create/edit:**
- `packages/luca-observer/app/memory/page.tsx` (minor edits)
- `packages/luca-observer/components/memory/health-dashboard.tsx` (minor edits)
- `packages/luca-observer/components/memory/recall-effectiveness.tsx` (minor edits)

**Verification:**
- `bunx --bun tsc --noEmit` from `packages/luca-observer/` passes clean
- Manual: all sections show empty states rather than blank space when data is unavailable
- Manual: page is readable in both light and dark mode

---

## Verification

After all three waves are complete, run the full verification sequence:

1. **TypeScript**: `bunx --bun tsc --noEmit` from `packages/luca-observer/` — must pass with zero errors
2. **API routes**: Verify all 5 new routes return expected JSON shapes (manual curl or browser)
3. **Page render**: Launch observer and visit `/memory` — all 6 sections must render without console errors
4. **Empty states**: With MuninnDB disconnected, all sections show empty/unavailable states rather than crashing
5. **Header bar**: Memory health indicator appears in header and updates on polling interval
6. **Error isolation**: Each section is independently error-bounded — one section failing does not blank the page

## Success Criteria

- `/api/muninn/health`, `/api/muninn/observations`, `/api/muninn/metrics`, `/api/muninn/checkpoint`, `/api/muninn/zone-history` all respond with valid JSON
- Memory page renders all 6 sections: Session Status, Health Dashboard, Recall Effectiveness, Memory Timeline, Brain Tree, Knowledge Graph Mini
- Header shows memory health indicator and observation count badge
- Zero TypeScript errors in `packages/luca-observer/`
- No new chart libraries added (CSS-only visualization)
- All components follow existing observer patterns: Tailwind, shadcn/ui, Zod safeParse, CSS color tokens

## Output Specification

**New files (12):**
- `packages/luca-observer/app/api/muninn/health/route.ts`
- `packages/luca-observer/app/api/muninn/observations/route.ts`
- `packages/luca-observer/app/api/muninn/metrics/route.ts`
- `packages/luca-observer/app/api/muninn/checkpoint/route.ts`
- `packages/luca-observer/app/api/muninn/zone-history/route.ts`
- `packages/luca-observer/hooks/use-memory-health.ts`
- `packages/luca-observer/hooks/use-observations.ts`
- `packages/luca-observer/hooks/use-checkpoint.ts`
- `packages/luca-observer/components/memory/session-status-hero.tsx`
- `packages/luca-observer/components/memory/health-dashboard.tsx`
- `packages/luca-observer/components/memory/recall-effectiveness.tsx`
- `packages/luca-observer/components/memory/memory-timeline.tsx`
- `packages/luca-observer/components/memory/enhanced-brain-tree.tsx`
- `packages/luca-observer/components/memory/knowledge-graph-mini.tsx`
- `packages/luca-observer/components/layout/memory-health-indicator.tsx`

**Modified files (3):**
- `packages/luca-observer/lib/muninn-schemas.ts` (append 10 new Zod schemas)
- `packages/luca-observer/app/memory/page.tsx` (full redesign)
- `packages/luca-observer/components/layout/header.tsx` (add MemoryHealthIndicator slot)
