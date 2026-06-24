---
id: "115-01"
title: "Foundation: Shared Utilities & EmptyState Component"
wave: 1
phase: 115
gap_closure: true
depends_on: []
---

# Plan 01 — Foundation: Shared Utilities & EmptyState Component

## Objective

Create the shared foundation that subsequent plans depend on:

1. A `safeJsonParse` utility extracted from 6 hooks with identical JSON.parse try/catch blocks
2. A shared `EmptyState` component extracted from 23 components with duplicated dashed-border empty state UI

## Context

### safeJsonParse Duplication (6 hooks)

These hooks all have identical `try { JSON.parse(...) } catch { /* fallback */ }` patterns:

- @file packages/luca-observer/hooks/use-decision-trail.ts (line 30-34: `JSON.parse(row.alternativesJson || "[]")`)
- @file packages/luca-observer/hooks/use-ledger.ts (line 25-29: `JSON.parse(row.detailsJson || "{}")`)
- @file packages/luca-observer/hooks/use-harness-result.ts (line 30-39: `JSON.parse(row.checksJson || "[]")`)
- @file packages/luca-observer/hooks/use-planning.ts (line 24-27: `JSON.parse(row.planJson)`)
- @file packages/luca-observer/hooks/use-tribunal.ts (line 24-27: `JSON.parse(row.resultJson)`)
- @file packages/luca-observer/hooks/use-metrics.ts (line 24-27: `JSON.parse(row.metricsJson)`)

### EmptyState Duplication (23 components)

All 23 components use nearly identical markup:

```tsx
<div className="rounded-lg border border-dashed border-border p-8 text-center">
  <p className="font-mono text-sm text-muted-foreground">No {thing} yet.</p>
</div>
```

Some use `p-6` instead of `p-8`, some use `text-xs` instead of `text-sm`.

Files with the pattern (non-exhaustive representative list):

- @file packages/luca-observer/components/dashboard/recent-events.tsx (line 37-42)
- @file packages/luca-observer/components/dashboard/recent-transitions.tsx (line 25-29)
- @file packages/luca-observer/components/agents/agent-scorecard-table.tsx (line 63-67)
- @file packages/luca-observer/components/agents/agent-activity-log.tsx (line 102-108)
- @file packages/luca-observer/components/workflow/transition-log.tsx (line 46-50)
- @file packages/luca-observer/components/tribunal/findings-table.tsx (line 26-30)
- @file packages/luca-observer/components/planning/session-plan-overview.tsx (line 27-34)
- @file packages/luca-observer/components/memory/memory-entries.tsx (line 115-119)
- @file packages/luca-observer/components/memory/working-sections.tsx (line 91-95)
- @file packages/luca-observer/components/iteration/token-usage-chart.tsx
- @file packages/luca-observer/components/iteration/context-pressure-timeline.tsx
- @file packages/luca-observer/components/iteration/iteration-timeline.tsx
- @file packages/luca-observer/components/iteration/convergence-chart.tsx
- @file packages/luca-observer/components/iteration/error-classification-breakdown.tsx
- @file packages/luca-observer/components/cost/token-usage-trends.tsx
- @file packages/luca-observer/components/cost/session-cost-table.tsx
- @file packages/luca-observer/components/cost/cumulative-cost-curve.tsx
- @file packages/luca-observer/components/cost/cost-breakdown.tsx
- @file packages/luca-observer/components/agents/tool-call-analytics.tsx
- @file packages/luca-observer/components/planning/wsjf-score-table.tsx
- @file packages/luca-observer/components/harness/harness-summary-banner.tsx
- @file packages/luca-observer/components/tribunal/tribunal-summary-banner.tsx
- @file packages/luca-observer/components/memory/brain-panel.tsx

## Tasks

### Task 1: Create `safeJsonParse` utility

**File to create:** `packages/luca-observer/lib/safe-json-parse.ts`

**Implementation:**

````typescript
/**
 * Safely parse a JSON string with a typed fallback value.
 *
 * Replaces 6 identical try/catch JSON.parse blocks across observer hooks.
 * Returns the fallback on any parse error instead of throwing.
 *
 * @param json - The JSON string to parse (may be null/undefined/empty)
 * @param fallback - Value to return on parse failure
 * @returns Parsed value or fallback
 *
 * @example
 * ```typescript
 * const data = safeJsonParse(row.detailsJson, {});
 * const items = safeJsonParse(row.checksJson, []);
 * const plan = safeJsonParse<SessionPlan | null>(row.planJson, null);
 * ```
 */
export function safeJsonParse<T>(
  json: string | null | undefined,
  fallback: T,
): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
````

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes
- File exists at `packages/luca-observer/lib/safe-json-parse.ts`

### Task 2: Create `EmptyState` shared component

**File to create:** `packages/luca-observer/components/shared/empty-state.tsx`

**Implementation:**

````tsx
/**
 * Reusable empty state component for consistent "no data" UI.
 *
 * Replaces 23 duplicated dashed-border empty state patterns across
 * observer components with a single, configurable component.
 *
 * @param message - The empty state message to display
 * @param title - Optional bold title above the message (e.g., "No Plan")
 *
 * @example
 * ```tsx
 * <EmptyState message="No events yet. Start a Luca workflow to see events." />
 * <EmptyState title="No Plan" message="No session plan has been generated yet." />
 * ```
 */
export function EmptyState({
  message,
  title,
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center">
      {title && (
        <p className="font-mono text-lg font-bold text-muted-foreground">
          {title}
        </p>
      )}
      <p
        className={`font-mono text-sm text-muted-foreground${title ? " mt-1" : ""}`}
      >
        {message}
      </p>
    </div>
  );
}
````

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes
- File exists at `packages/luca-observer/components/shared/empty-state.tsx`

### Task 3: Update 6 hooks to use `safeJsonParse`

Replace each hook's inline `try { JSON.parse(...) } catch { ... }` with imported `safeJsonParse`.

**3a. `use-decision-trail.ts`** — Replace lines 29-34:

Before:

```typescript
let alternatives: string[] = [];
try {
  alternatives = JSON.parse(row.alternativesJson || "[]");
} catch {
  // Ignore malformed JSON
}
```

After:

```typescript
const alternatives = safeJsonParse<string[]>(row.alternativesJson, []);
```

Add import: `import { safeJsonParse } from "~/lib/safe-json-parse";`

**3b. `use-ledger.ts`** — Replace lines 24-29:

Before:

```typescript
let eventData: Record<string, unknown> = {};
try {
  eventData = JSON.parse(row.detailsJson || "{}");
} catch {
  // Ignore malformed JSON
}
```

After:

```typescript
const eventData = safeJsonParse<Record<string, unknown>>(row.detailsJson, {});
```

Add import: `import { safeJsonParse } from "~/lib/safe-json-parse";`

**3c. `use-harness-result.ts`** — Replace lines 29-41:

Before:

```typescript
let checks: z.infer<typeof CheckResultSnapshotSchema>[] = [];
try {
  const rawChecks = JSON.parse(row.checksJson || "[]");
  if (Array.isArray(rawChecks)) {
    for (const c of rawChecks) {
      const parsed = CheckResultSnapshotSchema.safeParse(c);
      if (parsed.success) {
        checks.push(parsed.data);
      }
    }
  }
} catch {
  // Ignore malformed JSON
}
```

After:

```typescript
const rawChecks = safeJsonParse<unknown[]>(row.checksJson, []);
const checks = Array.isArray(rawChecks)
  ? rawChecks
      .map((c) => CheckResultSnapshotSchema.safeParse(c))
      .filter(
        (
          r,
        ): r is z.SafeParseSuccess<z.infer<typeof CheckResultSnapshotSchema>> =>
          r.success,
      )
      .map((r) => r.data)
  : [];
```

Add import: `import { safeJsonParse } from "~/lib/safe-json-parse";`

**3d. `use-planning.ts`** — Replace lines 24-27:

Before:

```typescript
try {
  const parsed = JSON.parse(row.planJson);
  return { plan: parsed, hasPlan: true };
} catch {
  return { plan: null, hasPlan: false };
}
```

After:

```typescript
const parsed = safeJsonParse<Record<string, unknown> | null>(
  row.planJson,
  null,
);
return parsed
  ? { plan: parsed, hasPlan: true }
  : { plan: null, hasPlan: false };
```

Add import: `import { safeJsonParse } from "~/lib/safe-json-parse";`

**3e. `use-tribunal.ts`** — Replace lines 24-27:

Before:

```typescript
try {
  const parsed = JSON.parse(row.resultJson);
  return { result: parsed, hasResult: true };
} catch {
  return { result: null, hasResult: false };
}
```

After:

```typescript
const parsed = safeJsonParse<Record<string, unknown> | null>(
  row.resultJson,
  null,
);
return parsed
  ? { result: parsed, hasResult: true }
  : { result: null, hasResult: false };
```

Add import: `import { safeJsonParse } from "~/lib/safe-json-parse";`

**3f. `use-metrics.ts`** — Replace lines 24-27:

Before:

```typescript
try {
  return JSON.parse(row.metricsJson);
} catch {
  return null;
}
```

After:

```typescript
return safeJsonParse<Record<string, unknown> | null>(row.metricsJson, null);
```

Add import: `import { safeJsonParse } from "~/lib/safe-json-parse";`

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes
- `grep -r "JSON\.parse" packages/luca-observer/hooks/` returns zero results (all replaced)

### Task 4: Update components to use `EmptyState` (representative subset)

Replace the duplicated empty state markup in the most impactful components. Target at least 10 files in this task (the remaining can be done incrementally).

**Priority components to update:**

1. `components/dashboard/recent-events.tsx` — Replace lines 37-42
2. `components/dashboard/recent-transitions.tsx` — Replace lines 25-29
3. `components/agents/agent-scorecard-table.tsx` — Replace lines 63-67
4. `components/agents/agent-activity-log.tsx` — Replace lines 102-108
5. `components/workflow/transition-log.tsx` — Replace lines 46-50
6. `components/tribunal/findings-table.tsx` — Replace lines 26-30
7. `components/planning/session-plan-overview.tsx` — Replace lines 27-34
8. `components/memory/memory-entries.tsx` — Replace lines 114-119
9. `components/memory/working-sections.tsx` — Replace lines 90-95
10. `components/planning/wsjf-score-table.tsx`

**Pattern for each:**

Before (example from `recent-transitions.tsx`):

```tsx
<div className="rounded-lg border border-dashed border-border p-8 text-center">
  <p className="font-mono text-sm text-muted-foreground">
    No transitions recorded yet. Start a workflow to see state changes.
  </p>
</div>
```

After:

```tsx
import { EmptyState } from "~/components/shared/empty-state";
// ...
<EmptyState message="No transitions recorded yet. Start a workflow to see state changes." />;
```

For `session-plan-overview.tsx` which has a title:

```tsx
<EmptyState title="No Plan" message="No session plan has been generated yet." />
```

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes
- All 10+ updated components render the `EmptyState` component instead of inline markup

## Success Criteria

1. `safeJsonParse` utility created and used by all 6 hooks (zero `JSON.parse` calls remain in hooks)
2. `EmptyState` component created and used by at least 10 components
3. TypeScript compilation passes
4. No behavioral changes — same UI, same fallback values, same error handling
