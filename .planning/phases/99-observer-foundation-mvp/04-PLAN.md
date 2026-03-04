---
id: "99-04"
title: "Harness verification results page"
phase: 99
wave: 2
complexity: MODERATE
depends_on: ["99-01"]
tasks:
  - id: "99-04-1"
    title: "Create harness summary banner component"
    goal: "Build a banner showing the overall harness status (passed/failed), duration, error/warning counts, and timestamp"
    verify: "HarnessSummaryBanner renders pass/fail with color, duration, error count, warning count, and formatted timestamp"
  - id: "99-04-2"
    title: "Create check result card component"
    goal: "Build a card component for a single harness check result showing name, status, errors, and raw output"
    verify: "CheckResultCard renders check name, status badge, error list, and expandable raw output"
  - id: "99-04-3"
    title: "Create parsed error list component"
    goal: "Build a component rendering parsed errors with file, line, column, message, and severity"
    verify: "ParsedErrorList renders error/warning items with file:line:column format and severity color-coding"
  - id: "99-04-4"
    title: "Wire harness page with real data"
    goal: "Replace the stub harness page with summary banner, check result cards, and error details fed by /api/harness"
    verify: "Harness page shows real harness result data; handles no-result state; no stubs"
---

# 99-04: Harness Verification Results Page

## Goal

Replace the stub harness page with a real verification results page showing the latest harness run: overall status, per-check results, parsed errors with file/line details, and raw output. This is the primary tool for understanding verification failures.

## Context

@packages/luca-observer/src/app/harness/page.tsx -- Current stub page
@packages/luca-observer/src/hooks/use-harness-result.ts -- Harness polling hook (from 99-02)
@packages/luca-observer/src/lib/types.ts -- HarnessResultSnapshotSchema, CheckResultSnapshotSchema, ParsedErrorSnapshotSchema (from 99-01)
@packages/luca-observer/src/lib/constants.ts -- EVENT_TYPES with harness.result
@packages/luca-observer/src/components/layout/page-container.tsx -- Page layout wrapper
@src/harness/\_\_schemas/harness.schemas.ts -- Reference for harness data structure

**Design principles:**

- Display data from the single `/api/harness` endpoint
- Each check (test, typecheck, lint, build) gets its own card
- Errors are displayed with file:line:column format for quick navigation
- Raw output is expandable for debugging
- Empty state when no harness has run yet

## Tasks

### Task 99-04-1: Create harness summary banner component

Create `packages/luca-observer/src/components/harness/harness-summary-banner.tsx`.

Shows the top-level harness status as a prominent banner.

```typescript
"use client";

import type { HarnessResultSnapshot } from "~/lib/types";

/**
 * Summary banner for the latest harness run.
 *
 * Shows overall pass/fail status, duration, error/warning counts,
 * and when the harness last ran.
 *
 * @param result - The latest harness result snapshot, or null if no run exists
 */
export function HarnessSummaryBanner({
  result,
}: {
  result: HarnessResultSnapshot | null;
}) {
  if (!result) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="font-mono text-lg font-bold text-muted-foreground">
          No Harness Run
        </p>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          Run the verification harness to see results here.
        </p>
      </div>
    );
  }

  const passed = result.status === "passed";
  const statusColor = passed ? "success" : "destructive";
  const durationSeconds = (result.duration / 1000).toFixed(1);

  return (
    <div
      className="rounded-lg border-2 p-4"
      style={{ borderColor: `var(--color-${statusColor})` }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-xl font-bold"
            style={{ color: `var(--color-${statusColor})` }}
          >
            {passed ? "PASSED" : "FAILED"}
          </span>
          <span className="font-mono text-sm text-muted-foreground">
            {result.checks.length} checks in {durationSeconds}s
          </span>
        </div>
        <div className="flex items-center gap-4">
          {result.total_errors > 0 && (
            <span className="font-mono text-sm" style={{ color: "var(--color-destructive)" }}>
              {result.total_errors} error{result.total_errors !== 1 ? "s" : ""}
            </span>
          )}
          {result.total_warnings > 0 && (
            <span className="font-mono text-sm" style={{ color: "var(--color-warning)" }}>
              {result.total_warnings} warning{result.total_warnings !== 1 ? "s" : ""}
            </span>
          )}
          {result.timestamp && (
            <span className="font-mono text-xs text-muted-foreground">
              {new Date(result.timestamp).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/harness/harness-summary-banner.tsx`
- [ ] Shows "No Harness Run" when result is null
- [ ] Shows PASSED (green) or FAILED (red) status
- [ ] Displays duration, error count, warning count, timestamp
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-04-2: Create check result card component

Create `packages/luca-observer/src/components/harness/check-result-card.tsx`.

Renders a card for a single check result (test, typecheck, lint, build) with status, errors, and expandable raw output.

```typescript
"use client";

import { useState } from "react";

import type { CheckResultSnapshot } from "~/lib/types";

import { ParsedErrorList } from "./parsed-error-list";

/**
 * Card showing a single harness check result.
 *
 * Displays check name, status badge, error/warning counts,
 * duration, and expandable error list + raw output.
 *
 * @param check - The check result snapshot to display
 */
export function CheckResultCard({ check }: { check: CheckResultSnapshot }) {
  const [showOutput, setShowOutput] = useState(false);

  const statusConfig: Record<string, { label: string; color: string }> = {
    passed: { label: "Passed", color: "success" },
    failed: { label: "Failed", color: "destructive" },
    skipped: { label: "Skipped", color: "muted-foreground" },
    timeout: { label: "Timeout", color: "warning" },
  };

  const config = statusConfig[check.status] ?? statusConfig.skipped;
  const durationSeconds = (check.duration / 1000).toFixed(1);

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold text-foreground">
            {check.name}
          </span>
          <span
            className="rounded px-2 py-0.5 font-mono text-xs font-medium"
            style={{
              color: `var(--color-${config.color})`,
              backgroundColor: `color-mix(in srgb, var(--color-${config.color}) 15%, transparent)`,
            }}
          >
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {check.errors.length > 0 && (
            <span className="font-mono text-xs" style={{ color: "var(--color-destructive)" }}>
              {check.errors.length} error{check.errors.length !== 1 ? "s" : ""}
            </span>
          )}
          {check.warnings.length > 0 && (
            <span className="font-mono text-xs" style={{ color: "var(--color-warning)" }}>
              {check.warnings.length} warning{check.warnings.length !== 1 ? "s" : ""}
            </span>
          )}
          <span className="font-mono text-xs text-muted-foreground">
            {durationSeconds}s
          </span>
        </div>
      </div>

      {check.errors.length > 0 && (
        <div className="border-b border-border px-4 py-2">
          <ParsedErrorList errors={check.errors} />
        </div>
      )}

      {check.warnings.length > 0 && (
        <div className="border-b border-border px-4 py-2">
          <ParsedErrorList errors={check.warnings} />
        </div>
      )}

      {check.raw_output && (
        <div className="px-4 py-2">
          <button
            type="button"
            onClick={() => setShowOutput(!showOutput)}
            className="font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            {showOutput ? "Hide" : "Show"} raw output
          </button>
          {showOutput && (
            <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
              {check.raw_output}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/harness/check-result-card.tsx`
- [ ] Shows check name with status badge (color-coded)
- [ ] Shows error and warning counts
- [ ] Renders parsed errors when present
- [ ] Raw output is expandable
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-04-3: Create parsed error list component

Create `packages/luca-observer/src/components/harness/parsed-error-list.tsx`.

Renders a list of parsed errors/warnings with file location and severity.

```typescript
import type { ParsedErrorSnapshot } from "~/lib/types";

/**
 * List of parsed errors or warnings from a harness check.
 *
 * Renders each error with file:line:column format, message,
 * and severity color-coding.
 *
 * @param errors - Array of parsed errors to display
 */
export function ParsedErrorList({
  errors,
}: {
  errors: ParsedErrorSnapshot[];
}) {
  if (errors.length === 0) return null;

  return (
    <div className="space-y-1">
      {errors.map((error, idx) => {
        const location = [
          error.file,
          error.line !== undefined ? error.line : null,
          error.column !== undefined ? error.column : null,
        ]
          .filter((v) => v !== null)
          .join(":");

        const isWarning = error.severity === "warning";

        return (
          <div key={idx} className="flex items-start gap-2">
            <span
              className="mt-0.5 font-mono text-xs"
              style={{
                color: isWarning
                  ? "var(--color-warning)"
                  : "var(--color-destructive)",
              }}
            >
              {isWarning ? "warn" : "err"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {location}
            </span>
            <span className="font-mono text-xs text-foreground">
              {error.message}
            </span>
            {error.code && (
              <span className="font-mono text-xs text-muted-foreground">
                ({error.code})
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Verify:**

- [ ] File exists at `packages/luca-observer/src/components/harness/parsed-error-list.tsx`
- [ ] Renders file:line:column format
- [ ] Color-codes errors (red) vs warnings (yellow)
- [ ] Shows error code when present
- [ ] Returns null for empty array
- [ ] `bunx --bun tsc --noEmit` passes

### Task 99-04-4: Wire harness page with real data

Replace the stub in `packages/luca-observer/src/app/harness/page.tsx`.

```typescript
"use client";

import { PageContainer } from "~/components/layout/page-container";
import { HarnessSummaryBanner } from "~/components/harness/harness-summary-banner";
import { CheckResultCard } from "~/components/harness/check-result-card";
import { useHarnessResult } from "~/hooks/use-harness-result";

/**
 * Harness verification results page.
 *
 * Shows the latest harness run: overall status, per-check results,
 * parsed errors with file/line details, and raw output.
 */
export default function HarnessPage() {
  const { result, loading } = useHarnessResult();

  return (
    <PageContainer
      title="Harness"
      subtitle="Verification check results and error details"
    >
      {loading ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            Loading harness results...
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <HarnessSummaryBanner result={result} />
          {result && result.checks.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-mono text-sm font-medium text-foreground">
                Check Results
              </h3>
              {result.checks.map((check) => (
                <CheckResultCard key={check.name} check={check} />
              ))}
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}
```

**Steps:**

1. Replace the entire content of `packages/luca-observer/src/app/harness/page.tsx`
2. Add "use client" directive
3. Wire useHarnessResult hook
4. Show loading state, then banner + check cards

**Verify:**

- [ ] Harness page shows real harness result data when available
- [ ] Shows loading state during initial fetch
- [ ] Shows "No Harness Run" banner when no result exists
- [ ] Per-check cards with expandable errors and raw output
- [ ] No stub/placeholder content remains
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] Harness page fully functional with real data (no stubs)
- [ ] Summary banner shows overall pass/fail status
- [ ] Individual check cards with status, errors, warnings, and raw output
- [ ] Parsed errors show file:line:column format
- [ ] Page handles empty state gracefully (no harness run yet)
- [ ] All components follow observer design patterns
- [ ] `bunx --bun tsc --noEmit` passes
