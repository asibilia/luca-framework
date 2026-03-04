---
id: "100-02"
title: "Iterations & convergence page"
phase: 100
wave: 2
complexity: MODERATE
depends_on: ["100-01"]
tasks:
  - id: "100-02-1"
    title: "Create convergence chart component"
    goal: "Build a CSS-only chart showing error count over iterations with convergence status indicators (improved/stalled/regressed)"
    verify: "ConvergenceChart component renders iteration data points with color-coded convergence status; handles empty data"
  - id: "100-02-2"
    title: "Create budget gauge component"
    goal: "Build a visual gauge showing iteration budget consumption (current vs max) with soft-stop threshold marker"
    verify: "BudgetGauge renders progress bar with current/max, soft-stop line, and color-coded budget status"
  - id: "100-02-3"
    title: "Create error classification breakdown component"
    goal: "Build a component showing error counts by classification (transient, correctable, permanent) with color-coded bars"
    verify: "ErrorClassificationBreakdown renders per-iteration breakdown; shows trend across iterations"
  - id: "100-02-4"
    title: "Create iteration timeline component"
    goal: "Build a scrollable timeline showing each iteration with key metrics (error count, delta, convergence, agent, duration)"
    verify: "IterationTimeline renders expandable iteration cards with all key fields; newest first"
  - id: "100-02-5"
    title: "Wire iterations page with real data"
    goal: "Replace the stub iterations page with convergence chart, budget gauge, error breakdown, and timeline"
    verify: "Iterations page shows real iteration data; handles empty state; no stubs remain"
---

# 100-02: Iterations & Convergence Page

## Goal

Replace the stub iterations page with a real convergence tracking dashboard showing iteration progress, budget status, error classification, and a detailed iteration timeline. This page is the primary tool for understanding whether fix loops are making progress or stalling.

## Context

@packages/luca-observer/src/app/iterations/page.tsx -- Current stub page
@packages/luca-observer/src/hooks/use-iteration-history.ts -- Iteration polling hook (from 100-01)
@packages/luca-observer/src/lib/types.ts -- IterationRecordSnapshotSchema, BudgetStateSnapshotSchema (from 100-01)
@packages/luca-observer/src/lib/constants.ts -- COMPLEXITY_LEVELS, EVENT_TYPES
@packages/luca-observer/src/components/layout/page-container.tsx -- Page layout wrapper
@src/iteration/\_\_schemas/iteration.schemas.ts -- Framework iteration schemas (reference)

**Design principles:**

- CSS-only visualizations (no chart library for MVP)
- Error count chart shows improvement/regression trajectory
- Budget gauge shows how much iteration budget remains
- Error classification shows transient vs correctable vs permanent breakdown
- Timeline shows detailed per-iteration data with expandable details
- All data from /api/iterations route
- Empty state with instructive message when no iterations exist

## Tasks

### Task 100-02-1: Create convergence chart component

Create `packages/luca-observer/src/components/iteration/convergence-chart.tsx`.

A CSS-only chart plotting error count across iterations with convergence status color-coding. Each data point is a bar whose height represents error count. Color indicates convergence status (green = improved, yellow = stalled, red = regressed).

**Key features:**

- Horizontal bar chart with iterations on X axis, error count on Y axis
- Each bar color-coded by convergence_status
- Error delta shown above each bar (+N or -N)
- Zero-error line highlighted
- Responsive width

**Props:**

```typescript
interface ConvergenceChartProps {
  iterations: IterationRecordSnapshot[];
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/iteration/convergence-chart.tsx`
- [ ] Renders bars for each iteration
- [ ] Color codes: improved (green/success), stalled (yellow/warning), regressed (red/destructive)
- [ ] Shows error delta labels
- [ ] Empty state when no iterations
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-02-2: Create budget gauge component

Create `packages/luca-observer/src/components/iteration/budget-gauge.tsx`.

A horizontal progress bar showing iteration budget consumption. Derives budget info from the iteration records (count vs max available from the last record's stale tracking).

**Key features:**

- Progress bar showing current_iteration / max_iterations
- Soft-stop threshold marker (80% default) as a vertical line
- Color transitions: green (under 50%), yellow (50-80%), red (>80%)
- Labels showing "N of M iterations used"
- Budget status badge (under_budget / soft_stop / exceeded)

**Props:**

```typescript
interface BudgetGaugeProps {
  currentIteration: number;
  maxIterations: number;
  softStopPercent?: number;
  status: string;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/iteration/budget-gauge.tsx`
- [ ] Progress bar fills proportionally
- [ ] Soft-stop threshold line visible
- [ ] Color changes based on budget usage
- [ ] Status badge displayed
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-02-3: Create error classification breakdown component

Create `packages/luca-observer/src/components/iteration/error-classification-breakdown.tsx`.

Shows per-iteration error counts broken down by classification (transient, correctable, permanent).

**Key features:**

- Stacked horizontal bars per iteration
- Color-coded: transient (blue/info), correctable (yellow/warning), permanent (red/destructive)
- Legend explaining each classification
- Summary totals at the bottom

**Props:**

```typescript
interface ErrorClassificationBreakdownProps {
  iterations: IterationRecordSnapshot[];
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/iteration/error-classification-breakdown.tsx`
- [ ] Shows per-iteration stacked bars
- [ ] Color-coded by classification
- [ ] Legend with classification descriptions
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-02-4: Create iteration timeline component

Create `packages/luca-observer/src/components/iteration/iteration-timeline.tsx`.

A scrollable list of iteration records with expandable details for each iteration.

**Key features:**

- Each iteration shows: number, loop type, error count, error delta, convergence status, agent invoked, duration
- Click to expand: full error fingerprint lists, artifacts delta, commit hash, timestamp
- Newest first ordering
- Convergence status badge with color

**Props:**

```typescript
interface IterationTimelineProps {
  iterations: IterationRecordSnapshot[];
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/iteration/iteration-timeline.tsx`
- [ ] Renders all iterations newest-first
- [ ] Expandable details per iteration
- [ ] Shows convergence status with color badge
- [ ] Shows agent name and duration
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-02-5: Wire iterations page with real data

Replace the stub in `packages/luca-observer/src/app/iterations/page.tsx`.

```typescript
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { ConvergenceChart } from "~/components/iteration/convergence-chart";
import { BudgetGauge } from "~/components/iteration/budget-gauge";
import { ErrorClassificationBreakdown } from "~/components/iteration/error-classification-breakdown";
import { IterationTimeline } from "~/components/iteration/iteration-timeline";
import { useIterationHistory } from "~/hooks/use-iteration-history";

export default function IterationsPage() {
  const { iterations, loading } = useIterationHistory();

  const lastIteration = iterations[iterations.length - 1];
  const currentIteration = lastIteration?.iteration ?? 0;
  // Derive max from the number of completed iterations + reasonable default
  const maxIterations = Math.max(currentIteration, 3);

  return (
    <PageContainer
      title="Iterations"
      subtitle="Convergence tracking and error classification"
    >
      {loading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground animate-pulse">
            Loading iteration data...
          </p>
        </div>
      ) : iterations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-mono text-lg font-bold text-muted-foreground">
            No Iterations Yet
          </p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            Iteration data will appear here when the harness or verification
            loop runs and records checkpoint data.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <ConvergenceChart iterations={iterations} />
            <BudgetGauge
              currentIteration={currentIteration}
              maxIterations={maxIterations}
              status={lastIteration?.stale_count > 1 ? "exceeded" : "under_budget"}
            />
          </div>
          <ErrorClassificationBreakdown iterations={iterations} />
          <IterationTimeline iterations={iterations} />
        </div>
      )}
    </PageContainer>
  );
}
```

**Steps:**

1. Replace the entire content of `packages/luca-observer/src/app/iterations/page.tsx`
2. Add "use client" directive
3. Wire useIterationHistory hook
4. Show loading, empty, and data states
5. Layout: Chart + Gauge side-by-side, Classification below, Timeline at bottom

**Verify:**

- [ ] Iterations page shows real data when available
- [ ] Empty state with instructive message when no iterations
- [ ] Loading state during initial fetch
- [ ] All four components visible with data
- [ ] No stub/placeholder content remains
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Iterations page fully functional with real data (no stubs)
- [ ] Convergence chart shows error trajectory with status colors
- [ ] Budget gauge shows iteration budget consumption
- [ ] Error classification breakdown shows transient/correctable/permanent
- [ ] Iteration timeline shows expandable per-iteration details
- [ ] Page handles empty state gracefully
- [ ] All components follow observer design patterns (Tailwind, font-mono, color vars)
- [ ] `bunx --bun tsc --noEmit` passes
