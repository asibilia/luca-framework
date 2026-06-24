---
id: "99-02"
title: "Dashboard overview page with real data from ledger and state"
phase: 99
wave: 2
complexity: MODERATE
depends_on: ["99-01"]
tasks:
  - id: "99-02-1"
    title: "Create useLedger hook for polling ledger data"
    goal: "React hook that polls /api/ledger for recent transitions, returning typed LedgerEntry array with loading and error states"
    verify: "useLedger hook exported from ~/hooks/use-ledger.ts; returns { entries, loading, error } with proper types"
  - id: "99-02-2"
    title: "Create useHarnessResult hook for polling harness data"
    goal: "React hook that polls /api/harness for the latest harness result snapshot"
    verify: "useHarnessResult hook exported from ~/hooks/use-harness-result.ts; returns { result, loading, error } with proper types"
  - id: "99-02-3"
    title: "Enhance OverviewCards with real ledger and harness data"
    goal: "Add harness status and recent transitions count cards to the dashboard overview, sourced from real data"
    verify: "OverviewCards shows harness pass/fail status from /api/harness and transition count from /api/ledger; no stub data"
  - id: "99-02-4"
    title: "Create RecentTransitions component"
    goal: "New component showing the last 20 state transitions from the ledger with state, event type, and timestamp"
    verify: "RecentTransitions renders a table/list of ledger entries with previous_state -> current_state, event_type, and formatted timestamp"
  - id: "99-02-5"
    title: "Wire dashboard page to use real data sources"
    goal: "Update the dashboard page to include RecentTransitions alongside existing RecentEvents, with both SSE and ledger data visible"
    verify: "Dashboard page shows overview cards, recent SSE events, and recent ledger transitions in a cohesive layout"
---

# 99-02: Dashboard Overview Page with Real Data

## Goal

Upgrade the dashboard from showing only in-memory SSE events to also displaying real data from the session ledger (persisted JSONL) and harness results (persisted JSON). The dashboard becomes the single-pane-of-glass for workflow observability with live + historical data.

## Context

@packages/luca-observer/src/app/page.tsx -- Current dashboard page (uses SSE events only)
@packages/luca-observer/src/components/dashboard/overview-cards.tsx -- Current overview cards (workflow state, complexity, events, phase)
@packages/luca-observer/src/components/dashboard/recent-events.tsx -- Current SSE event list
@packages/luca-observer/src/hooks/use-event-stream.ts -- Existing SSE hook pattern to follow
@packages/luca-observer/src/hooks/use-workflow-state.ts -- Existing polling hook pattern to follow
@packages/luca-observer/src/hooks/use-metrics.ts -- Existing polling hook pattern to follow
@packages/luca-observer/src/lib/types.ts -- LedgerEntrySchema, HarnessResultSnapshotSchema (from 99-01)
@packages/luca-observer/src/lib/constants.ts -- WORKFLOW_STATES, COMPLEXITY_LEVELS display metadata

**Design principles:**

- MVP -- keep components simple and functional
- Poll-based data fetching (consistent with existing hooks)
- No state management libraries beyond React useState
- Tailwind for styling, matching existing observer design
- Components are "use client" (client-side rendered, polling)

## Tasks

### Task 99-02-1: Create useLedger hook for polling ledger data

Create `packages/luca-observer/src/hooks/use-ledger.ts` -- a polling hook for ledger entries.

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

import type { LedgerEntry } from "~/lib/types";
import { LedgerEntrySchema } from "~/lib/types";
import { z } from "zod";

/**
 * API Response schema for /api/ledger.
 *
 * Uses snake_case for API compatibility.
 */
const LedgerResponseSchema = z.object({
  entries: z.array(LedgerEntrySchema).default([]),
  total_count: z.number().default(0),
});

/**
 * React hook for polling ledger entries from the API.
 *
 * Polls /api/ledger at the specified interval to get recent
 * state machine transitions from session-ledger.jsonl.
 *
 * @param tail - Number of most recent entries to fetch (default 50)
 * @param intervalMs - Polling interval in milliseconds (default 10000)
 * @returns Object with entries, total count, loading state, and error
 */
export function useLedger(tail = 50, intervalMs = 10000) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLedger = useCallback(async () => {
    try {
      const res = await fetch(`/api/ledger?tail=${tail}`);
      if (!res.ok) throw new Error("Failed to fetch ledger");
      const json = await res.json();
      const parsed = LedgerResponseSchema.safeParse(json);
      if (parsed.success) {
        setEntries(parsed.data.entries);
        setTotalCount(parsed.data.total_count);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [tail]);

  useEffect(() => {
    fetchLedger();
    const interval = setInterval(fetchLedger, intervalMs);
    return () => clearInterval(interval);
  }, [fetchLedger, intervalMs]);

  return { entries, totalCount, loading, error };
}
```

**Steps:**

1. Create `packages/luca-observer/src/hooks/use-ledger.ts`
2. Follow the exact pattern of `use-workflow-state.ts` (polling with useState/useCallback/useEffect)
3. Use safeParse for API response validation

**Verify:**

- [ ] File exists at `packages/luca-observer/src/hooks/use-ledger.ts`
- [ ] Exports `useLedger` hook
- [ ] Returns `{ entries, totalCount, loading, error }`
- [ ] Uses safeParse for response validation
- [ ] Follows existing polling hook pattern
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-02-2: Create useHarnessResult hook for polling harness data

Create `packages/luca-observer/src/hooks/use-harness-result.ts`.

```typescript
"use client";

import { useEffect, useState, useCallback } from "react";

import type { HarnessResultSnapshot } from "~/lib/types";
import { HarnessResultSnapshotSchema } from "~/lib/types";
import { z } from "zod";

/**
 * API Response schema for /api/harness.
 *
 * Uses snake_case for API compatibility.
 */
const HarnessResponseSchema = z.object({
  result: HarnessResultSnapshotSchema.nullable().default(null),
  has_result: z.boolean().default(false),
});

/**
 * React hook for polling harness result from the API.
 *
 * Polls /api/harness at the specified interval to get the latest
 * verification harness result.
 *
 * @param intervalMs - Polling interval in milliseconds (default 15000)
 * @returns Object with result, hasResult flag, loading state, and error
 */
export function useHarnessResult(intervalMs = 15000) {
  const [result, setResult] = useState<HarnessResultSnapshot | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHarness = useCallback(async () => {
    try {
      const res = await fetch("/api/harness");
      if (!res.ok) throw new Error("Failed to fetch harness result");
      const json = await res.json();
      const parsed = HarnessResponseSchema.safeParse(json);
      if (parsed.success) {
        setResult(parsed.data.result);
        setHasResult(parsed.data.has_result);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHarness();
    const interval = setInterval(fetchHarness, intervalMs);
    return () => clearInterval(interval);
  }, [fetchHarness, intervalMs]);

  return { result, hasResult, loading, error };
}
```

**Steps:**

1. Create `packages/luca-observer/src/hooks/use-harness-result.ts`
2. Follow exact polling hook pattern

**Verify:**

- [ ] File exists at `packages/luca-observer/src/hooks/use-harness-result.ts`
- [ ] Exports `useHarnessResult` hook
- [ ] Returns `{ result, hasResult, loading, error }`
- [ ] Uses safeParse for response validation
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-02-3: Enhance OverviewCards with real ledger and harness data

Modify `packages/luca-observer/src/components/dashboard/overview-cards.tsx` to add two new data cards:

1. **Harness Status** -- shows the latest harness pass/fail from `/api/harness`
2. **Transitions** -- shows total ledger transition count from `/api/ledger`

**Changes:**

1. Import the two new hooks:

```typescript
import { useLedger } from "~/hooks/use-ledger";
import { useHarnessResult } from "~/hooks/use-harness-result";
```

2. Call hooks inside the component:

```typescript
const { totalCount: transitionCount } = useLedger(50);
const { result: harnessResult, hasResult: hasHarness } = useHarnessResult();
```

3. Replace the existing `cards` array with an expanded version:

Add after the existing "Phase" card:

```typescript
{
  title: "Harness",
  value: hasHarness
    ? harnessResult?.status === "passed" ? "Passed" : "Failed"
    : "No Run",
  subtitle: hasHarness
    ? `${harnessResult?.total_errors ?? 0} errors, ${harnessResult?.total_warnings ?? 0} warnings`
    : undefined,
  color: hasHarness
    ? harnessResult?.status === "passed" ? "success" : "destructive"
    : "muted-foreground",
},
{
  title: "Transitions",
  value: transitionCount.toString(),
  color: "accent",
},
```

4. Update the grid from `grid-cols-2 lg:grid-cols-4` to `grid-cols-2 lg:grid-cols-3 xl:grid-cols-6` to accommodate 6 cards.

**Verify:**

- [ ] OverviewCards shows 6 cards total: Workflow State, Complexity, Events, Phase, Harness, Transitions
- [ ] Harness card shows "Passed"/"Failed"/"No Run" based on real data
- [ ] Transitions card shows real count from ledger
- [ ] Responsive grid layout works at all breakpoints
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-02-4: Create RecentTransitions component

Create `packages/luca-observer/src/components/dashboard/recent-transitions.tsx`.

This component renders a list/table of the most recent state machine transitions from the ledger, showing the state transition flow.

```typescript
"use client";

import { WORKFLOW_STATES } from "~/lib/constants";

import type { LedgerEntry } from "~/lib/types";

/**
 * Display the most recent state machine transitions from the ledger.
 *
 * Shows a chronological list of transitions with:
 * - Previous state -> Current state
 * - Event type that triggered the transition
 * - Timestamp
 *
 * @param entries - Array of ledger entries to display
 */
export function RecentTransitions({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No transitions recorded yet. Start a workflow to see state changes.
        </p>
      </div>
    );
  }

  // Show newest first
  const sorted = [...entries].reverse();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-sm font-medium text-foreground">
          Recent Transitions
        </h3>
        <span className="font-mono text-xs text-muted-foreground">
          {entries.length} entries
        </span>
      </div>
      <div className="rounded-lg border border-border">
        <div className="max-h-80 overflow-y-auto">
          {sorted.map((entry) => {
            const fromState =
              WORKFLOW_STATES[entry.previous_state as keyof typeof WORKFLOW_STATES];
            const toState =
              WORKFLOW_STATES[entry.current_state as keyof typeof WORKFLOW_STATES];

            return (
              <div
                key={entry.sequence_number}
                className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-b-0"
              >
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  #{entry.sequence_number}
                </span>
                <span
                  className="font-mono text-xs"
                  style={{ color: `var(--color-${fromState?.color ?? "muted-foreground"})` }}
                >
                  {fromState?.label ?? entry.previous_state}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  →
                </span>
                <span
                  className="font-mono text-xs font-medium"
                  style={{ color: `var(--color-${toState?.color ?? "muted-foreground"})` }}
                >
                  {toState?.label ?? entry.current_state}
                </span>
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {entry.event_type}
                </span>
                {entry.timestamp && (
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

**Steps:**

1. Create `packages/luca-observer/src/components/dashboard/recent-transitions.tsx`
2. Follow the same styling patterns as `recent-events.tsx`
3. Use WORKFLOW_STATES from constants for color-coded state labels

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/dashboard/recent-transitions.tsx`
- [ ] Renders empty state when no entries
- [ ] Shows newest transitions first
- [ ] Uses color-coded workflow state labels
- [ ] Shows sequence number, state transition, event type, and timestamp
- [ ] Scrollable container for long lists
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-02-5: Wire dashboard page to use real data sources

Update `packages/luca-observer/src/app/page.tsx` to include the new RecentTransitions component alongside the existing RecentEvents.

**Changes:**

1. Add imports:

```typescript
import { RecentTransitions } from "~/components/dashboard/recent-transitions";
import { useLedger } from "~/hooks/use-ledger";
```

2. Call useLedger in the component:

```typescript
const { entries: ledgerEntries } = useLedger(20);
```

3. Add RecentTransitions to the page layout, creating a two-column layout for events and transitions:

```tsx
<div className="grid gap-6 lg:grid-cols-2">
  <RecentEvents events={events} onClear={clear} />
  <RecentTransitions entries={ledgerEntries} />
</div>
```

**Verify:**

- [ ] Dashboard page shows both SSE events and ledger transitions
- [ ] Two-column layout on large screens, stacked on mobile
- [ ] OverviewCards enhanced with harness and transition data
- [ ] Page renders without errors when no ledger/harness data exists
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Dashboard shows real data from 3 sources: SSE (live), ledger (persisted), harness (persisted)
- [ ] Two new polling hooks created: useLedger, useHarnessResult
- [ ] OverviewCards expanded with Harness Status and Transitions cards
- [ ] RecentTransitions component shows color-coded state machine transitions
- [ ] Dashboard works gracefully when data sources are empty
- [ ] `bunx --bun tsc --noEmit` passes
