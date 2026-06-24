---
id: "99-03"
title: "Workflow state machine page with transition visualization"
phase: 99
wave: 2
complexity: MODERATE
depends_on: ["99-01"]
tasks:
  - id: "99-03-1"
    title: "Create state diagram component"
    goal: "Build a visual state diagram showing all workflow states with the current state highlighted, using CSS-only rendering (no chart library)"
    verify: "StateDiagram component renders all 13 workflow states in a grid, highlights current state with color; works with real /api/state data"
  - id: "99-03-2"
    title: "Create transition log component"
    goal: "Build a component showing the full transition history from the ledger with detailed event data"
    verify: "TransitionLog renders ledger entries with expandable event_data; newest first; scrollable"
  - id: "99-03-3"
    title: "Create workflow context panel component"
    goal: "Build a component showing key fields from the current workflow context (session, branch, ticket, complexity, oversight)"
    verify: "WorkflowContextPanel renders current context fields from /api/state in a structured layout"
  - id: "99-03-4"
    title: "Wire workflow page with real data"
    goal: "Replace the stub workflow page with the three components, fed by real data from /api/state and /api/ledger"
    verify: "Workflow page shows state diagram, context panel, and transition log with real data; no stubs"
---

# 99-03: Workflow State Machine Page

## Goal

Replace the stub workflow page with a real state machine visualization showing the current workflow state, context metadata, and a full transition history log from the session ledger. This is the primary debugging tool for understanding where the workflow is and how it got there.

## Context

@packages/luca-observer/src/app/workflow/page.tsx -- Current stub page
@packages/luca-observer/src/lib/constants.ts -- WORKFLOW_STATES with labels and colors
@packages/luca-observer/src/lib/types.ts -- WorkflowSnapshotSchema, LedgerEntrySchema
@packages/luca-observer/src/hooks/use-workflow-state.ts -- Existing hook for polling /api/state
@packages/luca-observer/src/hooks/use-ledger.ts -- Ledger polling hook (from 99-02)
@packages/luca-observer/src/components/layout/page-container.tsx -- Page layout wrapper
@packages/luca-framework/src/state/types.ts -- WORKFLOW_STATES array (source of truth for state names)

**Design principles:**

- CSS-only state diagram (no D3, Mermaid, or heavy chart libs for MVP)
- State nodes arranged in a logical grid showing the workflow flow
- Current state highlighted with animation/glow
- Transition log shows the raw ledger data for debugging
- All data from existing API routes (/api/state, /api/ledger)

## Tasks

### Task 99-03-1: Create state diagram component

Create `packages/luca-observer/src/components/workflow/state-diagram.tsx`.

This is a CSS-only grid-based state diagram. Each state is a node; the current state is highlighted. States are arranged in a flow that represents the typical workflow progression.

```typescript
"use client";

import { WORKFLOW_STATES } from "~/lib/constants";

/**
 * Visual state diagram for the Luca workflow.
 *
 * Renders all workflow states as nodes in a grid layout,
 * highlighting the current active state. Uses CSS-only rendering
 * (no chart library dependencies).
 *
 * @param currentState - The currently active workflow state string
 */
export function StateDiagram({ currentState }: { currentState: string }) {
  // Define the flow layout: rows of states in execution order
  const rows = [
    ["idle"],
    ["preflight", "routing"],
    ["discussing", "planning"],
    ["executing"],
    ["verifying"],
    ["learning", "committing"],
    ["complete"],
    ["paused", "suspended", "failed"],
  ];

  return (
    <div className="space-y-3">
      <h3 className="font-mono text-sm font-medium text-foreground">
        State Machine
      </h3>
      <div className="space-y-2">
        {rows.map((row, rowIdx) => (
          <div key={rowIdx} className="flex items-center justify-center gap-2">
            {row.map((state) => {
              const config =
                WORKFLOW_STATES[state as keyof typeof WORKFLOW_STATES];
              const isActive = state === currentState;
              const label = config?.label ?? state;
              const color = config?.color ?? "muted-foreground";

              return (
                <div
                  key={state}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs transition-all ${
                    isActive
                      ? "border-2 font-bold shadow-sm"
                      : "border-border text-muted-foreground"
                  }`}
                  style={
                    isActive
                      ? {
                          borderColor: `var(--color-${color})`,
                          color: `var(--color-${color})`,
                          boxShadow: `0 0 8px var(--color-${color})`,
                        }
                      : undefined
                  }
                >
                  {label}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Steps:**

1. Create `packages/luca-observer/src/components/workflow/state-diagram.tsx`
2. Arrange states in logical rows following the workflow progression
3. Highlight active state with color, bold text, and box-shadow glow
4. Use WORKFLOW_STATES colors from constants

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/workflow/state-diagram.tsx`
- [ ] Renders all 13 workflow states
- [ ] Current state is visually highlighted (border, color, glow)
- [ ] Inactive states are muted
- [ ] Responsive layout
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-03-2: Create transition log component

Create `packages/luca-observer/src/components/workflow/transition-log.tsx`.

Shows the full transition history from the session ledger with expandable details for each entry.

```typescript
"use client";

import { useState } from "react";

import { WORKFLOW_STATES } from "~/lib/constants";

import type { LedgerEntry } from "~/lib/types";

/**
 * Transition log showing all state machine transitions from the ledger.
 *
 * Displays a chronological log of transitions with expandable event data
 * for debugging. Each entry shows: sequence number, state transition,
 * event type, and timestamp.
 *
 * @param entries - Array of ledger entries to display
 */
export function TransitionLog({ entries }: { entries: LedgerEntry[] }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          No transitions recorded. The ledger is empty.
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
          Transition Log
        </h3>
        <span className="font-mono text-xs text-muted-foreground">
          {entries.length} transitions
        </span>
      </div>
      <div className="rounded-lg border border-border">
        <div className="max-h-96 overflow-y-auto">
          {sorted.map((entry) => {
            const isExpanded = expandedId === entry.sequence_number;
            const toState =
              WORKFLOW_STATES[
                entry.current_state as keyof typeof WORKFLOW_STATES
              ];

            return (
              <div
                key={entry.sequence_number}
                className="border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : entry.sequence_number)
                  }
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50"
                >
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    #{entry.sequence_number}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {entry.previous_state}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    →
                  </span>
                  <span
                    className="font-mono text-xs font-medium"
                    style={{
                      color: `var(--color-${toState?.color ?? "muted-foreground"})`,
                    }}
                  >
                    {toState?.label ?? entry.current_state}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                    {entry.event_type}
                  </span>
                  {entry.timestamp && (
                    <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30 px-3 py-2">
                    <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">
                      {JSON.stringify(entry.event_data, null, 2)}
                    </pre>
                    {entry.session_id && (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Session: {entry.session_id}
                      </p>
                    )}
                    {entry.actions_executed.length > 0 && (
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        Actions: {entry.actions_executed.join(", ")}
                      </p>
                    )}
                  </div>
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

1. Create `packages/luca-observer/src/components/workflow/transition-log.tsx`
2. Each row is clickable to expand/collapse event_data details
3. Show color-coded current_state using WORKFLOW_STATES constants

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/workflow/transition-log.tsx`
- [ ] Renders empty state when no entries
- [ ] Shows entries newest-first
- [ ] Click expands/collapses event_data JSON
- [ ] Shows session_id and actions_executed in expanded view
- [ ] Scrollable container
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-03-3: Create workflow context panel component

Create `packages/luca-observer/src/components/workflow/workflow-context-panel.tsx`.

Shows a structured view of the current workflow context: identity, position, classification, and execution status.

```typescript
"use client";

import { COMPLEXITY_LEVELS } from "~/lib/constants";

import type { WorkflowSnapshot } from "~/lib/types";

/**
 * Panel showing the current workflow context metadata.
 *
 * Displays key context fields from STATE.md: session identity,
 * workflow position, classification, and configuration.
 *
 * @param state - Current workflow snapshot from /api/state
 */
export function WorkflowContextPanel({
  state,
}: {
  state: WorkflowSnapshot | null;
}) {
  if (!state) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="font-mono text-sm text-muted-foreground">
          Loading workflow context...
        </p>
      </div>
    );
  }

  const complexityConfig =
    COMPLEXITY_LEVELS[state.complexity as keyof typeof COMPLEXITY_LEVELS] ??
    COMPLEXITY_LEVELS.MODERATE;

  const fields = [
    { label: "Session ID", value: state.session_id || "None" },
    { label: "Phase", value: state.current_phase > 0 ? `Phase ${state.current_phase}` : "None" },
    { label: "Plan", value: state.current_plan || "None" },
    { label: "Complexity", value: complexityConfig.label, color: complexityConfig.color },
    { label: "Oversight", value: state.oversight },
    { label: "Ticket", value: state.ticket_id || "None" },
    { label: "Branch", value: state.branch || "None" },
  ];

  return (
    <div className="space-y-2">
      <h3 className="font-mono text-sm font-medium text-foreground">
        Workflow Context
      </h3>
      <div className="rounded-lg border border-border">
        {fields.map((field) => (
          <div
            key={field.label}
            className="flex items-center justify-between border-b border-border px-3 py-2 last:border-b-0"
          >
            <span className="font-mono text-xs text-muted-foreground">
              {field.label}
            </span>
            <span
              className="font-mono text-xs font-medium"
              style={
                field.color ? { color: `var(--color-${field.color})` } : undefined
              }
            >
              {field.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Steps:**

1. Create `packages/luca-observer/src/components/workflow/workflow-context-panel.tsx`
2. Render key/value pairs from WorkflowSnapshot
3. Color-code complexity using COMPLEXITY_LEVELS constants

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/workflow/workflow-context-panel.tsx`
- [ ] Shows all key context fields (session, phase, plan, complexity, oversight, ticket, branch)
- [ ] Handles null state gracefully (loading indicator)
- [ ] Complexity is color-coded
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-03-4: Wire workflow page with real data

Replace the stub in `packages/luca-observer/src/app/workflow/page.tsx` with the three components.

```typescript
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { StateDiagram } from "~/components/workflow/state-diagram";
import { TransitionLog } from "~/components/workflow/transition-log";
import { WorkflowContextPanel } from "~/components/workflow/workflow-context-panel";
import { useWorkflowState } from "~/hooks/use-workflow-state";
import { useLedger } from "~/hooks/use-ledger";

/**
 * Workflow state machine page.
 *
 * Shows the current workflow state diagram, context metadata,
 * and a full transition log from the session ledger.
 */
export default function WorkflowPage() {
  const { data: state } = useWorkflowState();
  const { entries } = useLedger(100);

  return (
    <PageContainer
      title="Workflow"
      subtitle="State machine visualization and transition log"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <StateDiagram currentState={state?.workflow_state ?? "idle"} />
        <WorkflowContextPanel state={state} />
      </div>
      <TransitionLog entries={entries} />
    </PageContainer>
  );
}
```

**Steps:**

1. Replace the entire content of `packages/luca-observer/src/app/workflow/page.tsx`
2. Add "use client" directive (hooks require client-side rendering)
3. Wire up useWorkflowState and useLedger hooks
4. Layout: StateDiagram + Context side-by-side, TransitionLog below

**Verify:**

- [ ] Workflow page shows state diagram with current state highlighted
- [ ] Context panel shows real workflow metadata
- [ ] Transition log shows real ledger entries with expandable details
- [ ] Page renders without errors when data sources are empty
- [ ] No stub/placeholder content remains
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Workflow page fully functional with real data (no stubs)
- [ ] State diagram shows all 13 states with current state highlighted
- [ ] Transition log shows expandable ledger entries
- [ ] Context panel shows current workflow metadata
- [ ] All components follow observer design patterns (Tailwind, font-mono, color vars)
- [ ] `bunx --bun tsc --noEmit` passes
