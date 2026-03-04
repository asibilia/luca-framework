---
id: "100-05"
title: "Tribunal & debate page"
phase: 100
wave: 2
complexity: MODERATE
depends_on: ["100-01"]
tasks:
  - id: "100-05-1"
    title: "Create tribunal summary banner component"
    goal: "Build a banner showing overall tribunal metrics: total findings, disagreements, rebuttals, withdrawals, modifications, and token cost"
    verify: "TribunalSummaryBanner renders all summary metrics; handles no-result state"
  - id: "100-05-2"
    title: "Create findings table component"
    goal: "Build a table showing all review findings with severity, file, agent source, and resolution status"
    verify: "FindingsTable renders findings sorted by severity; color-coded severity badges; filterable by agent"
  - id: "100-05-3"
    title: "Create disagreements panel component"
    goal: "Build a panel showing detected disagreements between reviewers with conflict type and involved findings"
    verify: "DisagreementsPanel renders disagreement cards with conflict type badges and linked findings"
  - id: "100-05-4"
    title: "Create rebuttal timeline component"
    goal: "Build a timeline showing debate rounds with challenger, challenge text, defender response, and resolution"
    verify: "RebuttalTimeline renders debate rounds chronologically with color-coded resolution badges"
  - id: "100-05-5"
    title: "Wire tribunal page with real data"
    goal: "Replace the stub tribunal page with summary banner, findings table, disagreements panel, and rebuttal timeline"
    verify: "Tribunal page shows real tribunal data; handles empty state; no stubs remain"
---

# 100-05: Tribunal & Debate Page

## Goal

Replace the stub tribunal page with a real debate visualization showing tribunal session results including findings, disagreements between reviewers, debate rebuttals, and resolution outcomes. This page is the primary tool for understanding how code review conflicts are resolved through structured debate.

## Context

@packages/luca-observer/src/app/tribunal/page.tsx -- Current stub page
@packages/luca-observer/src/hooks/use-tribunal.ts -- Tribunal polling hook (from 100-01)
@packages/luca-observer/src/lib/types.ts -- TribunalResultSnapshotSchema, ReviewFindingSnapshotSchema, DisagreementSnapshotSchema, RebuttalSnapshotSchema (from 100-01)
@packages/luca-observer/src/lib/constants.ts -- EVENT_TYPES with tribunal.result
@packages/luca-observer/src/components/layout/page-container.tsx -- Page layout wrapper
@src/shared/\_\_schemas/tribunal.schemas.ts -- Framework tribunal schemas (reference)

**Design principles:**

- Summary banner at top with key metrics
- Findings table as the primary reference (all findings from all reviewers)
- Disagreements panel highlights conflicts that triggered debate
- Rebuttal timeline shows the debate rounds and resolutions
- Severity color-coding: CRITICAL=red, HIGH=orange, MEDIUM=yellow, LOW=green
- Resolution color-coding: upheld=blue, withdrawn=red, modified=yellow
- All data from /api/tribunal route
- Empty state with instructive message when no tribunal has run

**Note on data availability:**

The tribunal result data is written to `.planning/tribunal-result.json` by the phase-execute skill during code review. This file may not exist if no code review with tribunal has been run in the current session. The page should handle this gracefully with an informative empty state.

## Tasks

### Task 100-05-1: Create tribunal summary banner component

Create `packages/luca-observer/src/components/tribunal/tribunal-summary-banner.tsx`.

Shows the high-level tribunal session metrics as a prominent banner.

**Key features:**

- Phase number
- Total findings count
- Disagreements detected count
- Rebuttals conducted count
- Findings withdrawn count (with red color if > 0)
- Findings modified count (with yellow color if > 0)
- Debate token cost
- Timestamp
- "No Tribunal Run" empty state

**Props:**

```typescript
interface TribunalSummaryBannerProps {
  result: TribunalResultSnapshot | null;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/tribunal/tribunal-summary-banner.tsx`
- [ ] Shows all key metrics
- [ ] Shows "No Tribunal Run" when result is null
- [ ] Metrics color-coded where applicable
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-05-2: Create findings table component

Create `packages/luca-observer/src/components/tribunal/findings-table.tsx`.

A table showing all review findings from the tribunal with key fields.

**Key features:**

- Columns: severity, file:line, issue, suggestion, source agent
- Sorted by severity (CRITICAL first, LOW last)
- Severity badges with color: CRITICAL=destructive, HIGH=warning, MEDIUM=info, LOW=muted-foreground
- Agent name badges
- Filterable by severity level or agent name
- Empty state when no findings

**Props:**

```typescript
interface FindingsTableProps {
  // For MVP, derive findings from event data or show summary counts
  totalFindings: number;
  findingsWithdrawn: number;
  findingsModified: number;
}
```

Note: The full findings list is not included in `TribunalResultSnapshotSchema` (which stores summary counts). The MVP displays the aggregate metrics. When full findings data becomes available in the API response, the table can be enhanced to show individual findings.

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/tribunal/findings-table.tsx`
- [ ] Shows finding counts with breakdown
- [ ] Color-coded severity distribution
- [ ] Empty state for zero findings
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-05-3: Create disagreements panel component

Create `packages/luca-observer/src/components/tribunal/disagreements-panel.tsx`.

A panel showing the count and types of disagreements detected between reviewers.

**Key features:**

- Total disagreements count
- Conflict type breakdown: contradictory, severity_mismatch, scope_overlap
- Each type with description and icon/color
- Visual indicator of debate resolution rate

**Props:**

```typescript
interface DisagreementsPanelProps {
  disagreementsDetected: number;
  rebuttalsConducted: number;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/tribunal/disagreements-panel.tsx`
- [ ] Shows disagreement count and debate resolution rate
- [ ] Color-coded conflict type indicators
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-05-4: Create rebuttal timeline component

Create `packages/luca-observer/src/components/tribunal/rebuttal-timeline.tsx`.

Shows debate round statistics and outcomes.

**Key features:**

- Rebuttals conducted count
- Resolution breakdown: upheld vs withdrawn vs modified
- Visual bars showing resolution distribution
- Resolution colors: upheld=info/blue, withdrawn=destructive/red, modified=warning/yellow
- Token cost summary

**Props:**

```typescript
interface RebuttalTimelineProps {
  rebuttalsConducted: number;
  findingsWithdrawn: number;
  findingsModified: number;
  debateTokenCost: number;
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/tribunal/rebuttal-timeline.tsx`
- [ ] Shows rebuttal count and resolution breakdown
- [ ] Resolution bars with color coding
- [ ] Token cost displayed
- [ ] `bunx --bun tsc --noEmit` passes

### Task 100-05-5: Wire tribunal page with real data

Replace the stub in `packages/luca-observer/src/app/tribunal/page.tsx`.

```typescript
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { TribunalSummaryBanner } from "~/components/tribunal/tribunal-summary-banner";
import { FindingsTable } from "~/components/tribunal/findings-table";
import { DisagreementsPanel } from "~/components/tribunal/disagreements-panel";
import { RebuttalTimeline } from "~/components/tribunal/rebuttal-timeline";
import { useTribunal } from "~/hooks/use-tribunal";

export default function TribunalPage() {
  const { result, hasResult, loading } = useTribunal();

  return (
    <PageContainer
      title="Tribunal"
      subtitle="Debate results, findings, and rebuttals"
    >
      {loading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground animate-pulse">
            Loading tribunal data...
          </p>
        </div>
      ) : !hasResult ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="font-mono text-lg font-bold text-muted-foreground">
            No Tribunal Run
          </p>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            Tribunal data will appear here when a code review with debate
            is triggered at MODERATE+ complexity.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <TribunalSummaryBanner result={result} />
          <div className="grid gap-6 lg:grid-cols-2">
            <DisagreementsPanel
              disagreementsDetected={result?.disagreements_detected ?? 0}
              rebuttalsConducted={result?.rebuttals_conducted ?? 0}
            />
            <RebuttalTimeline
              rebuttalsConducted={result?.rebuttals_conducted ?? 0}
              findingsWithdrawn={result?.findings_withdrawn ?? 0}
              findingsModified={result?.findings_modified ?? 0}
              debateTokenCost={result?.debate_token_cost ?? 0}
            />
          </div>
          <FindingsTable
            totalFindings={result?.total_findings ?? 0}
            findingsWithdrawn={result?.findings_withdrawn ?? 0}
            findingsModified={result?.findings_modified ?? 0}
          />
        </div>
      )}
    </PageContainer>
  );
}
```

**Verify:**

- [ ] Tribunal page shows real data when available
- [ ] Empty state with instructive message when no tribunal result
- [ ] Loading state during initial fetch
- [ ] All four components visible with data
- [ ] No stub/placeholder content remains
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Tribunal page fully functional with real data (no stubs)
- [ ] Summary banner shows key tribunal metrics
- [ ] Findings display with severity information
- [ ] Disagreements panel shows debate trigger information
- [ ] Rebuttal timeline shows resolution outcomes
- [ ] Page handles empty state gracefully
- [ ] All components follow observer design patterns
- [ ] `bunx --bun tsc --noEmit` passes
