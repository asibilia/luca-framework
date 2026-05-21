# 100-06 SUMMARY: Agent Activity Page

## Status: COMPLETE

## What Was Done

### Task 100-06-1: Agent Scorecard Table

Created `packages/luca-observer/src/components/agents/agent-scorecard-table.tsx`.

- Table with columns: Agent, Invocations, Total Duration, Avg Duration, Last Invoked
- Sorted by invocation count (most active agent first)
- Duration formatted as human-readable (e.g., "2.5s", "1m 30s", "< 1s")
- Last invoked formatted as relative time (e.g., "5 min ago", "just now")
- Row click calls `onSelectAgent` for cross-filtering with activity log
- Selected agent row highlighted with `bg-accent/10`
- Empty state with dashed border and muted message

### Task 100-06-2: Agent Activity Log

Created `packages/luca-observer/src/components/agents/agent-activity-log.tsx`.

- Flattens all agent events into a single chronological list (newest first)
- Filterable by `selectedAgent` prop (linked to scorecard selection)
- Each event shows: EventBadge (color-coded type), agent name, status, duration, timestamp
- Status color-coded: success/passed = green, failed/error = red, skipped = muted
- Scrollable container with `max-h-96` and `overflow-y-auto`
- Event count indicator in section header
- Title changes to show filtered agent name when selected
- Empty state for no events / no events for selected agent

### Task 100-06-3: Agent Registry Panel

Created `packages/luca-observer/src/components/agents/agent-registry-panel.tsx`.

- Lists all 20 known agents organized by 7 categories (Orchestration, Code, Review, Research, Verification, Planning, Memory)
- Each category has a color-coded header
- Active agents (with recorded events) show green dot and invocation count badge
- Inactive agents shown with muted dot and text
- Active/total count in section header (e.g., "3 / 20 active")
- Scrollable container matching activity log height
- Static registry defined as constant (not API-derived)

### Task 100-06-4: Wire Agents Page

Replaced stub in `packages/luca-observer/src/app/agents/page.tsx`.

- Added `"use client"` directive
- Wired `useAgentActivity` hook for polling agent data
- Local `selectedAgent` state links scorecard selection to activity log filter
- Computed `activeAgents` and `invocationCounts` from API data
- Three states: loading (animated pulse), empty (instructive message), data (full dashboard)
- Layout: scorecard table full-width, then activity log + registry panel in 2-column grid
- No stub/placeholder content remains

## Verification

- **Type check**: `bunx --bun tsc --noEmit` -- zero errors in new/modified files (pre-existing errors in check-result-card, budget-gauge, brain-panel, memory-entries, test-helpers unrelated)
- **API conventions**: All component props use camelCase (internal TypeScript), API data uses snake_case
- **Pattern compliance**: All components follow existing observer patterns (SectionHeader, EventBadge, font-mono styling, dashed border empty states, var(--color-\*) theming)

## Files Changed

### Modified

- `packages/luca-observer/src/app/agents/page.tsx` -- replaced stub with full agent dashboard

### Created

- `packages/luca-observer/src/components/agents/agent-scorecard-table.tsx`
- `packages/luca-observer/src/components/agents/agent-activity-log.tsx`
- `packages/luca-observer/src/components/agents/agent-registry-panel.tsx`

## Design Decisions

1. **Duration formatting in component, not utility**: The `formatDuration` and `formatRelativeTime` helpers are local to the scorecard table since they are specific to display formatting and not reused elsewhere. If other components need them later, they can be extracted to `~/lib/format-utils.ts`.

2. **Flat event list, not grouped**: The activity log flattens all agent events into a single chronological list rather than grouping by agent. This provides a timeline view. Agent-specific filtering is handled via the `selectedAgent` prop from scorecard selection.

3. **Static agent registry**: The registry panel uses a hardcoded constant of known agents rather than discovering them from the API. This ensures all agents are shown even when they have no recorded activity, matching the plan requirement for active/inactive status indicators.

4. **Two-column layout for log + registry**: The activity log and registry panel sit side by side in a responsive grid (`lg:grid-cols-2`), with the scorecard table spanning full width above. This matches the information hierarchy: summary first, then detail + reference.
