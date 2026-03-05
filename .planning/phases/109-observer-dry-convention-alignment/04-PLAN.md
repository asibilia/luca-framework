---
id: "109-04"
title: "Convention alignment: lodash orderBy, Tailwind headers, schema-first, safeParse"
phase: 109
wave: 2
complexity: SIMPLE
depends_on: []
tasks:
  - id: "109-04-1"
    title: "Replace 7 Array.sort/reverse instances with lodash orderBy"
    goal: "Replace all Array.sort() and [...arr].reverse() calls in observer components and lib with lodash orderBy per project convention"
    verify: "No Array.sort() or .reverse() calls remain in observer code (except notes/route.ts .sort() for strings); lodash/orderBy imported; bunx --bun tsc --noEmit passes"
  - id: "109-04-2"
    title: "Fix 2 Tailwind table header inconsistencies"
    goal: "Align agent-scorecard-table and findings-table table headers with the project standard pattern (font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground)"
    verify: "Both tables use consistent th class pattern matching transition-log.tsx and wsjf-score-table.tsx; bunx --bun tsc --noEmit passes"
  - id: "109-04-3"
    title: "Fix budget-gauge.tsx destructuring default (move to Zod schema)"
    goal: "Move the softStopPercent = 80 destructuring default to a Zod schema per schema-first-parsing convention"
    verify: "No default value in destructuring; BudgetGaugePropsSchema defined with default; props parsed via schema; bunx --bun tsc --noEmit passes"
  - id: "109-04-4"
    title: "Replace 2 type assertions with safeParse in use-event-stream.ts and use-metrics.ts"
    goal: "Replace 'as' type casts with proper Zod safeParse validation in use-event-stream.ts (JSON.parse as StoredEvent) and use-metrics.ts (json as Record)"
    verify: "No 'as StoredEvent' or 'as Record' casts remain; both use safeParse; bunx --bun tsc --noEmit passes"
---

# 109-04: Convention Alignment -- lodash orderBy, Tailwind Headers, Schema-First, safeParse

## Goal

Close the remaining MEDIUM and LOW severity convention gaps identified in the v2.7.0 milestone audit. This plan handles four independent categories of fixes: lodash orderBy migration, Tailwind consistency, schema-first parsing, and type assertion removal.

## Context

@packages/luca-observer/components/agents/agent-scorecard-table.tsx -- Uses Array.sort(), inconsistent th classes
@packages/luca-observer/components/agents/agent-activity-log.tsx -- Uses Array.sort() for timestamp comparison
@packages/luca-observer/components/planning/wsjf-score-table.tsx -- Uses Array.sort() with multi-field comparator
@packages/luca-observer/components/iteration/iteration-timeline.tsx -- Uses [...arr].reverse()
@packages/luca-observer/components/workflow/transition-log.tsx -- Uses [...arr].reverse()
@packages/luca-observer/components/dashboard/recent-transitions.tsx -- Uses [...arr].reverse()
@packages/luca-observer/lib/file-watcher.ts -- Uses records.sort() in readIterationHistory
@packages/luca-observer/lib/db.ts -- Uses [...arr].reverse() (2 instances)
@packages/luca-observer/components/tribunal/findings-table.tsx -- Inconsistent th classes
@packages/luca-observer/components/iteration/budget-gauge.tsx -- Destructuring default for softStopPercent
@packages/luca-observer/hooks/use-event-stream.ts -- Type assertion: JSON.parse(data) as StoredEvent
@packages/luca-observer/hooks/use-metrics.ts -- Type assertion: json as Record<string, unknown>

**Project conventions:**

- lodash-preference.md: Use `orderBy` instead of `Array.sort()` and `.reverse()`
- schema-first-parsing.md: No destructuring defaults; use Zod schemas
- schema-first-parsing.md: Use safeParse instead of type assertions

**Note:** The use-metrics.ts type assertion fix may overlap with Plan 109-01 (usePollingFetch refactor). If Plan 109-01 is executed first and already fixes the type assertion in use-metrics.ts, skip that part here. Handle use-event-stream.ts regardless (it is NOT a polling hook and is not covered by Plan 109-01).

## Tasks

### Task 109-04-1: Replace Array.sort/reverse with lodash orderBy

Replace all `Array.sort()` and `[...arr].reverse()` calls with `lodash/orderBy`.

**File-by-file changes:**

**1. agent-scorecard-table.tsx** (line 54):

```typescript
// Before:
const sorted = [...agents].sort(
  (a, b) => b.invocation_count - a.invocation_count,
);

// After:
import orderBy from "lodash/orderBy";
const sorted = orderBy(agents, "invocation_count", "desc");
```

**2. agent-activity-log.tsx** (line 46):

```typescript
// Before:
return events.sort(
  (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
);

// After:
import orderBy from "lodash/orderBy";
return orderBy(events, (e) => new Date(e.timestamp).getTime(), "desc");
```

**3. wsjf-score-table.tsx** (line 71):

This one has multi-field dynamic sorting with `sortField` and `sortDirection` state. The lodash `orderBy` handles this elegantly:

```typescript
// Before:
const sorted = [...items].sort((a, b) => {
  const mul = sortDirection === "asc" ? 1 : -1;
  if (sortField === "wsjf_score") return mul * (a.wsjf_score - b.wsjf_score);
  if (sortField === "title") return mul * a.title.localeCompare(b.title);
  if (sortField === "area") return mul * a.area.localeCompare(b.area);
  if (sortField === "complexity")
    return mul * a.complexity.localeCompare(b.complexity);
  return 0;
});

// After:
import orderBy from "lodash/orderBy";
const sorted = orderBy(items, [sortField], [sortDirection]);
```

**4. iteration-timeline.tsx** (line 33):

```typescript
// Before:
const sorted = [...iterations].reverse();

// After:
import orderBy from "lodash/orderBy";
// Iterations come in ascending order; reverse to newest-first
const sorted = orderBy(iterations, (x) => iterations.indexOf(x), "desc");
```

Actually, since `[...arr].reverse()` just reverses the array, a cleaner approach is:

```typescript
import orderBy from "lodash/orderBy";
// Newest first (iterations are sorted ascending by iteration number)
const sorted = orderBy(iterations, "iteration", "desc");
```

**5. transition-log.tsx** (line 67):

```typescript
// Before:
const reversed = [...entries].reverse();

// After:
import orderBy from "lodash/orderBy";
const reversed = orderBy(entries, "sequence_number", "desc");
```

**6. recent-transitions.tsx** (line 33):

```typescript
// Before:
const sorted = [...entries].reverse();

// After:
import orderBy from "lodash/orderBy";
const sorted = orderBy(entries, "sequence_number", "desc");
```

**7. file-watcher.ts** (line 237):

```typescript
// Before:
return records.sort((a, b) => a.iteration - b.iteration);

// After:
import orderBy from "lodash/orderBy";
return orderBy(records, "iteration", "asc");
```

**8. db.ts** (lines 124, 156):

```typescript
// Before (line 124):
result = [...result].reverse();

// After:
import orderBy from "lodash/orderBy";
// Reverse to get newest-first (events are stored in insertion order)
result = orderBy(result, "id", "desc");
```

For line 156 (sessions), the reverse is just newest-first:

```typescript
// Before:
return [...store.sessions.values()].reverse();

// After:
// Sessions don't have a natural sort key, so use array index reversal
// This is equivalent to orderBy with identity desc
return orderBy([...store.sessions.values()], (_s, idx) => idx, "desc");
```

**Note:** For `db.ts`, check if the data structures have natural sort keys (id, timestamp). If not, the simplest approach may be to use `orderBy` with an index-based iteratee, or use `lodash/reverse` (which creates a new array, unlike the native `.reverse()` which mutates). If the intent is truly just "reverse array order" with no sort key, then `[...arr].reverse()` can be an acceptable exception, but `orderBy` with a sort key is preferred when one exists.

**Verify:**

- [ ] All 7+ instances of `.sort()` and `.reverse()` replaced with `lodash/orderBy`
- [ ] Individual `import orderBy from "lodash/orderBy"` in each file
- [ ] No mutation of original arrays
- [ ] Sort behavior preserved (ascending/descending matches original)
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-04-2: Fix Tailwind table header inconsistencies

Align table headers in `agent-scorecard-table.tsx` and `findings-table.tsx` with the established pattern used by `transition-log.tsx` and `wsjf-score-table.tsx`.

**Established pattern** (from transition-log.tsx):

```html
<thead className="sticky top-0 bg-card">
  <tr
    className="border-b border-border font-mono text-xs uppercase tracking-wider text-muted-foreground"
  >
    <th className="px-3 py-2 text-left">Header</th>
  </tr>
</thead>
```

Key traits: `font-mono text-xs uppercase tracking-wider text-muted-foreground` on the `<tr>`, with minimal `<th>` classes.

**1. agent-scorecard-table.tsx:**

Current:

```html
<thead>
  <tr className="border-b border-border bg-muted/50">
    <th className="px-4 py-2 font-semibold text-muted-foreground">Agent</th>
    <th className="px-4 py-2 text-right font-semibold text-muted-foreground">
      Invocations
    </th>
  </tr>
</thead>
```

Issues:

- Uses `bg-muted/50` instead of `bg-card` (or no bg)
- Uses `font-semibold` instead of `font-medium`
- Missing `font-mono text-xs uppercase tracking-wider` on the `<tr>`
- Styling on individual `<th>` instead of `<tr>`

After:

```html
<thead>
  <tr
    className="border-b border-border bg-muted/50 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
  >
    <th className="px-4 py-2 text-left">Agent</th>
    <th className="px-4 py-2 text-right">Invocations</th>
    <th className="px-4 py-2 text-right">Total Duration</th>
    <th className="px-4 py-2 text-right">Avg Duration</th>
    <th className="px-4 py-2 text-right">Last Invoked</th>
  </tr>
</thead>
```

**2. findings-table.tsx:**

Current:

```html
<thead>
  <tr className="border-b border-border">
    <th
      className="py-2 text-left font-mono text-xs font-medium text-muted-foreground"
    >
      Resolution
    </th>
    <th
      className="py-2 text-right font-mono text-xs font-medium text-muted-foreground"
    >
      Count
    </th>
    <th
      className="py-2 text-right font-mono text-xs font-medium text-muted-foreground"
    >
      Percent
    </th>
  </tr>
</thead>
```

Issues:

- `font-mono text-xs font-medium text-muted-foreground` on individual `<th>` instead of `<tr>`
- Missing `uppercase tracking-wider` from the pattern

After:

```html
<thead>
  <tr
    className="border-b border-border font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
  >
    <th className="py-2 text-left">Resolution</th>
    <th className="py-2 text-right">Count</th>
    <th className="py-2 text-right">Percent</th>
  </tr>
</thead>
```

**Verify:**

- [ ] Both tables use consistent header pattern
- [ ] `font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground` on `<tr>`
- [ ] `<th>` elements have minimal classes (padding + alignment only)
- [ ] Visual appearance matches other tables in the observer
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-04-3: Fix budget-gauge.tsx destructuring default

Move the `softStopPercent = 80` destructuring default to a Zod schema per the schema-first-parsing convention.

**Current:**

```typescript
export function BudgetGauge({
  currentIteration,
  maxIterations,
  softStopPercent = 80,  // ❌ Default in destructuring
  status,
}: { ... })
```

**After:**

```typescript
import { z } from "zod";

/**
 * Props schema for BudgetGauge component.
 *
 * Defines defaults via Zod schema per schema-first-parsing convention.
 */
const BudgetGaugePropsSchema = z.object({
  currentIteration: z.number(),
  maxIterations: z.number(),
  softStopPercent: z.number().default(80),
  status: z.string(),
});

type BudgetGaugeProps = z.infer<typeof BudgetGaugePropsSchema>;

export function BudgetGauge(rawProps: BudgetGaugeProps) {
  const { currentIteration, maxIterations, softStopPercent, status } =
    BudgetGaugePropsSchema.parse(rawProps);

  // ... rest unchanged
}
```

**Verify:**

- [ ] No `= 80` default in destructuring
- [ ] `BudgetGaugePropsSchema` defined with `softStopPercent: z.number().default(80)`
- [ ] Props parsed through schema
- [ ] Type inferred from schema
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-04-4: Replace type assertions with safeParse

**1. use-event-stream.ts** (line 36):

Current:

```typescript
const parsed = JSON.parse(event.data) as StoredEvent;
```

After:

```typescript
import { StoredEventSchema } from "~/lib/types";

// In the onmessage handler:
const parseResult = StoredEventSchema.safeParse(JSON.parse(event.data));
if (!parseResult.success) return; // Skip invalid events
const parsed = parseResult.data;
```

This requires that `StoredEventSchema` is exported from `~/lib/types.ts`. Check if it exists; if not, define it there based on the `StoredEvent` type.

**2. use-metrics.ts** (line 23):

Current:

```typescript
setData(json as Record<string, unknown>);
```

**Note:** If Plan 109-01 has already been executed, use-metrics.ts will have been refactored to use `usePollingFetch` with a `z.record(z.unknown())` schema, which already eliminates this type assertion. In that case, skip this sub-task for use-metrics.ts.

If Plan 109-01 has NOT been executed yet, add a schema:

```typescript
import { z } from "zod";

const MetricsResponseSchema = z.record(z.unknown());

// In the fetch callback:
const parsed = MetricsResponseSchema.safeParse(json);
if (parsed.success) {
  setData(parsed.data);
  setError(null);
}
```

**Verify:**

- [ ] No `as StoredEvent` cast in use-event-stream.ts
- [ ] No `as Record<string, unknown>` cast in use-metrics.ts (or already fixed by 109-01)
- [ ] Both use safeParse for validation
- [ ] `StoredEventSchema` exported from types.ts (or defined locally)
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] All Array.sort/reverse instances replaced with lodash orderBy
- [ ] Table headers in agent-scorecard-table and findings-table aligned with project pattern
- [ ] budget-gauge.tsx uses Zod schema for default props
- [ ] Type assertions in use-event-stream.ts and use-metrics.ts replaced with safeParse
- [ ] `bunx --bun tsc --noEmit` passes
