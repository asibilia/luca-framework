---
id: "100-03"
title: "Planning (WSJF) page"
phase: 100
wave: 2
complexity: MODERATE
depends_on: ["100-01"]
tasks:
  - id: "100-03-1"
    title: "Create WSJF score table component"
    goal: "Build a sortable table showing WSJF-scored items with title, area, score, complexity, zone, and dependency status"
    verify: "WSJFScoreTable renders all scored items with sortable columns; highlights Big Rock item; handles empty data"
  - id: "100-03-2"
    title: "Create session plan overview component"
    goal: "Build a summary card showing the current session plan: total effort points, session cap, item count, and rationale"
    verify: "SessionPlanOverview renders plan summary with all key fields; shows 'No Plan' empty state"
  - id: "100-03-3"
    title: "Create quality zone indicator component"
    goal: "Build a visual indicator showing the current quality zone (peak/good/degrading/stop) with color and description"
    verify: "QualityZoneIndicator renders correct zone with color and description; adapts to all 4 zones"
  - id: "100-03-4"
    title: "Wire planning page with real data"
    goal: "Replace the stub planning page with WSJF table, session plan overview, and quality zone indicator"
    verify: "Planning page shows real planning data; handles empty state; no stubs remain"
---

# 100-03: Planning (WSJF) Page

## Goal

Replace the stub planning page with a real WSJF planning dashboard showing session plan items, WSJF scores, quality zone assignments, and session capacity. This page is the primary tool for understanding what work is planned and how it was prioritized.

## Context

@packages/luca-observer/src/app/planning/page.tsx -- Current stub page
@packages/luca-observer/src/hooks/use-planning.ts -- Planning polling hook (from 100-01)
@packages/luca-observer/src/lib/types.ts -- SessionPlanSnapshotSchema, WSJFScoredItemSnapshotSchema (from 100-01)
@packages/luca-observer/src/lib/constants.ts -- COMPLEXITY_LEVELS
@packages/luca-observer/src/components/layout/page-container.tsx -- Page layout wrapper
@src/planner/\_\_schemas/planner.schemas.ts -- Framework planner schemas (reference)

**Design principles:**

- WSJF table is the centerpiece showing prioritized items
- Big Rock item (index 0) is visually distinguished
- Quality zones use consistent color-coding from COMPLEXITY_LEVELS pattern
- Session plan summary shows capacity and rationale
- All data from /api/planning route
- Empty state with instructive message when no plan exists

## Tasks

### Task 100-03-1: Create WSJF score table component

Create `packages/luca-observer/src/components/planning/wsjf-score-table.tsx`.

A table showing all WSJF-scored items from the session plan. Columns: title, area, WSJF score, complexity, zone, dependency status.

**Key features:**

- Sortable by WSJF score (default: descending)
- Big Rock item (first item) highlighted with distinct styling
- Complexity badge with color from COMPLEXITY_LEVELS
- Quality zone badge with color (peak=green, good=blue, degrading=yellow, stop=red)
- Dependency status indicator (free vs blocked)
- Responsive: horizontal scroll on small screens

**Props:**

```typescript
interface WSJFScoreTableProps {
  items: WSJFScoredItemSnapshot[];
  bigRockIndex?: number;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/planning/wsjf-score-table.tsx`
- [ ] Renders all items in a table
- [ ] Big Rock item visually distinguished
- [ ] Complexity and zone color-coded
- [ ] Shows dependency status
- [ ] Empty state for no items
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-03-2: Create session plan overview component

Create `packages/luca-observer/src/components/planning/session-plan-overview.tsx`.

A summary card showing the current session plan metadata.

**Key features:**

- Total effort points
- Session cap (minutes)
- Number of items planned
- Generated timestamp
- Plan rationale (displayed as a blockquote)
- "No Plan" empty state

**Props:**

```typescript
interface SessionPlanOverviewProps {
  plan: SessionPlanSnapshot | null;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/planning/session-plan-overview.tsx`
- [ ] Shows all key plan metadata
- [ ] Rationale displayed as a formatted quote
- [ ] Shows "No Plan" when plan is null
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-03-3: Create quality zone indicator component

Create `packages/luca-observer/src/components/planning/quality-zone-indicator.tsx`.

A visual bar showing the four quality zones with the current zone highlighted.

**Key features:**

- Four horizontal segments: peak, good, degrading, stop
- Current zone highlighted with glow/border
- Percentage labels at zone boundaries (0%, 30%, 50%, 70%, 100%)
- Description of what each zone means for task selection
- Color-coded: peak=success, good=info, degrading=warning, stop=destructive

**Props:**

```typescript
interface QualityZoneIndicatorProps {
  currentZone?: string;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/planning/quality-zone-indicator.tsx`
- [ ] Shows all 4 zones with labels
- [ ] Current zone visually highlighted
- [ ] Percentage boundaries displayed
- [ ] Color-coded per zone
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-03-4: Wire planning page with real data

Replace the stub in `packages/luca-observer/src/app/planning/page.tsx`.

```typescript
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { SessionPlanOverview } from "~/components/planning/session-plan-overview";
import { WSJFScoreTable } from "~/components/planning/wsjf-score-table";
import { QualityZoneIndicator } from "~/components/planning/quality-zone-indicator";
import { usePlanning } from "~/hooks/use-planning";

export default function PlanningPage() {
  const { plan, hasPlan, loading } = usePlanning();

  const currentZone = plan?.items[0]?.assigned_zone;

  return (
    <PageContainer
      title="Planning"
      subtitle="WSJF scores, session plans, and quality zones"
    >
      {loading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground animate-pulse">
            Loading planning data...
          </p>
        </div>
      ) : !hasPlan ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-mono text-lg font-bold text-muted-foreground">
            No Session Plan
          </p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            A session plan will appear here when the planner generates
            WSJF-scored items for the current session.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <SessionPlanOverview plan={plan} />
            <QualityZoneIndicator currentZone={currentZone} />
          </div>
          <WSJFScoreTable
            items={plan?.items ?? []}
            bigRockIndex={plan?.big_rock_index}
          />
        </div>
      )}
    </PageContainer>
  );
}
```

**Verify:**

- [ ] Planning page shows real data when available
- [ ] Empty state with instructive message when no plan
- [ ] Loading state during initial fetch
- [ ] All three components visible with data
- [ ] No stub/placeholder content remains
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Planning page fully functional with real data (no stubs)
- [ ] WSJF table shows prioritized items with scores and zones
- [ ] Session plan overview shows capacity and rationale
- [ ] Quality zone indicator shows current zone status
- [ ] Page handles empty state gracefully
- [ ] All components follow observer design patterns
- [ ] `bunx --bun tsc --noEmit` passes
