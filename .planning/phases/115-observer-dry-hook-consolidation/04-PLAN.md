---
id: "115-04"
title: "Extract useFilteredTable Factory Hook from Duplicated Pipelines"
wave: 2
phase: 115
gap_closure: true
depends_on: ["115-01", "115-02"]
---

# Plan 04 — Extract useFilteredTable Factory Hook from Duplicated Pipelines

## Objective

Extract a `useFilteredTable` factory hook from 5 observer hooks that share the same filter-by-session → map-rows → sort-by-timestamp → slice-to-limit pipeline. This eliminates ~60 lines of duplicated logic.

## Context

### The Repeated Pipeline Pattern

Five hooks follow an identical structural pattern:

```
useTable(tables.X)  →  filter by sessionId  →  map to snake_case  →  orderBy timestamp desc  →  slice(0, limit)
```

### Affected Hooks

1. @file packages/luca-observer/hooks/use-token-usage.ts
   - Table: `tables.tokenUsage`
   - Filter: `sessionId`
   - Sort: `timestamp` desc
   - Limit: `100`
   - Extra: computes `totals` aggregation after pipeline

2. @file packages/luca-observer/hooks/use-tool-calls.ts
   - Table: `tables.toolCalls`
   - Filter: `sessionId`
   - Sort: `timestamp` desc
   - Limit: `100`
   - Extra: none

3. @file packages/luca-observer/hooks/use-decision-trail.ts
   - Table: `tables.decisionLogs`
   - Filter: `sessionId`
   - Sort: `timestamp` desc
   - Limit: `50`
   - Extra: JSON.parse for `alternativesJson` (handled by safeJsonParse after Plan 01)

4. @file packages/luca-observer/hooks/use-context-health.ts
   - Table: `tables.contextSnapshots`
   - Filter: `sessionId`
   - Sort: `timestamp` desc
   - Limit: `50`
   - Extra: computes `latest` and `health` after pipeline

5. @file packages/luca-observer/hooks/use-cost-tracking.ts
   - Table: `tables.costTracking`
   - Filter: `sessionId`
   - Sort: none (no orderBy used)
   - Limit: none (no slice used)
   - Extra: computes `totalCost` aggregation

### Key Observations

- All 5 hooks subscribe to a SpacetimeDB table via `useTable()`
- All filter rows by an optional `sessionId` parameter
- All map rows from camelCase (SpacetimeDB wire format) to snake_case (observer display format)
- 4 of 5 sort by timestamp descending with `orderBy` from lodash
- 4 of 5 apply a `slice(0, limit)` cap
- Some compute post-pipeline aggregations (totals, latest, health)

### Design Decision

The factory should handle the common pipeline (filter → map → sort → limit) while leaving post-pipeline computation to each hook's `useMemo`. The mapper function is unique per hook and must remain hook-specific.

## Tasks

### Task 1: Create `useFilteredTable` factory hook

**File to create:** `packages/luca-observer/hooks/use-filtered-table.ts`

**Implementation:**

````typescript
"use client";

import { useMemo } from "react";

import orderBy from "lodash/orderBy";
import { useTable } from "spacetimedb/react";

/**
 * Factory hook for the common SpacetimeDB table pipeline:
 * subscribe → filter by sessionId → map rows → sort → limit.
 *
 * Extracts the repeated pattern from 5 observer hooks into a single
 * reusable hook. Each consumer provides a table reference, a mapper
 * function, and optional sort/limit configuration.
 *
 * @param table - SpacetimeDB table reference (e.g., `tables.tokenUsage`)
 * @param mapper - Function to transform a raw SpacetimeDB row into the desired shape
 * @param options - Optional configuration for filtering, sorting, and limiting
 * @returns Object with mapped rows array and loading state
 *
 * @example
 * ```typescript
 * const { rows, loading } = useFilteredTable(
 *   tables.toolCalls,
 *   (row) => ({
 *     id: Number(row.id),
 *     session_id: row.sessionId,
 *     tool_name: row.toolName,
 *     timestamp: Number(row.timestamp),
 *   }),
 *   { sessionId, sortBy: "timestamp", limit: 100 }
 * );
 * ```
 */
export function useFilteredTable<TRow, TMapped extends Record<string, unknown>>(
  table: Parameters<typeof useTable>[0],
  mapper: (row: TRow) => TMapped,
  options: {
    sessionId?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    limit?: number;
  } = {},
) {
  const [rawRows, isLoading] = useTable(table);
  const {
    sessionId,
    sortBy = "timestamp",
    sortOrder = "desc",
    limit,
  } = options;

  const rows = useMemo(() => {
    const filtered = sessionId
      ? (rawRows as TRow[]).filter(
          (r) => (r as Record<string, unknown>).sessionId === sessionId,
        )
      : (rawRows as TRow[]);

    const mapped = filtered.map(mapper);

    const sorted = sortBy ? orderBy(mapped, sortBy, sortOrder) : mapped;

    return limit ? sorted.slice(0, limit) : sorted;
  }, [rawRows, sessionId, sortBy, sortOrder, limit, mapper]);

  return { rows, loading: isLoading };
}
````

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes
- File exists at `packages/luca-observer/hooks/use-filtered-table.ts`

### Task 2: Refactor `use-tool-calls.ts` to use `useFilteredTable`

This is the simplest hook (no post-pipeline computation), making it the ideal first refactor.

**Before (current implementation, ~25 lines of logic):**

```typescript
export function useToolCalls(sessionId?: string, limit = 100) {
  const [rows, isLoading] = useTable(tables.toolCalls);

  const toolCalls = useMemo(() => {
    const filtered = sessionId
      ? rows.filter((r) => r.sessionId === sessionId)
      : rows;

    const mapped = filtered.map((row) => ({
      id: Number(row.id),
      session_id: row.sessionId,
      tool_name: row.toolName,
      duration_ms: Number(row.durationMs),
      input_size: Number(row.inputSize),
      output_size: Number(row.outputSize),
      turn_number: Number(row.turnNumber),
      timestamp: Number(row.timestamp),
    }));

    const sorted = orderBy(mapped, "timestamp", "desc");
    return sorted.slice(0, limit);
  }, [rows, sessionId, limit]);

  return { toolCalls, loading: isLoading };
}
```

**After (~15 lines, mapper-only):**

```typescript
import { useCallback } from "react";

import { tables } from "~/module_bindings";

import { useFilteredTable } from "./use-filtered-table";

export function useToolCalls(sessionId?: string, limit = 100) {
  const mapper = useCallback(
    (
      row: typeof tables.toolCalls extends { __rowType: infer R } ? R : never,
    ) => ({
      id: Number(row.id),
      session_id: row.sessionId,
      tool_name: row.toolName,
      duration_ms: Number(row.durationMs),
      input_size: Number(row.inputSize),
      output_size: Number(row.outputSize),
      turn_number: Number(row.turnNumber),
      timestamp: Number(row.timestamp),
    }),
    [],
  );

  const { rows: toolCalls, loading } = useFilteredTable(
    tables.toolCalls,
    mapper,
    { sessionId, limit },
  );

  return { toolCalls, loading };
}
```

Note: The exact row type will need to be determined by inspecting the generated `tool_calls_table.ts` bindings. Use the actual row type from the generated bindings rather than the generic inference above.

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes
- Behavior is identical to the original implementation

### Task 3: Refactor `use-decision-trail.ts` to use `useFilteredTable`

Similar to Task 2, but includes `safeJsonParse` integration from Plan 01.

**After:**

```typescript
import { useCallback } from "react";

import { tables } from "~/module_bindings";
import { safeJsonParse } from "~/lib/safe-json-parse";

import { useFilteredTable } from "./use-filtered-table";

export function useDecisionTrail(sessionId?: string, limit = 50) {
  const mapper = useCallback((row: /* row type */) => {
    const alternatives = safeJsonParse<string[]>(row.alternativesJson, []);
    return {
      id: Number(row.id),
      session_id: row.sessionId,
      decision_type: row.decisionType,
      chosen_approach: row.chosenApproach,
      alternatives,
      reasoning: row.reasoning,
      timestamp: Number(row.timestamp),
    };
  }, []);

  const { rows: decisions, loading } = useFilteredTable(
    tables.decisionLogs,
    mapper,
    { sessionId, limit },
  );

  return { decisions, loading };
}
```

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes

### Task 4: Refactor `use-token-usage.ts` to use `useFilteredTable`

This hook has post-pipeline `totals` computation. The factory handles the pipeline; the `useMemo` wraps only the aggregation.

**After:**

```typescript
import { useCallback, useMemo } from "react";

import { tables } from "~/module_bindings";

import { useFilteredTable } from "./use-filtered-table";

export function useTokenUsage(sessionId?: string, limit = 100) {
  const mapper = useCallback((row: /* row type */) => ({
    id: Number(row.id),
    session_id: row.sessionId,
    turn_number: Number(row.turnNumber),
    input_tokens: Number(row.inputTokens),
    output_tokens: Number(row.outputTokens),
    cache_read_tokens: Number(row.cacheReadTokens),
    cache_write_tokens: Number(row.cacheWriteTokens),
    timestamp: Number(row.timestamp),
  }), []);

  const { rows: tokenUsage, loading } = useFilteredTable(
    tables.tokenUsage,
    mapper,
    { sessionId, limit },
  );

  const totals = useMemo(
    () =>
      tokenUsage.reduce(
        (acc, row) => ({
          input_tokens: acc.input_tokens + row.input_tokens,
          output_tokens: acc.output_tokens + row.output_tokens,
          cache_read_tokens: acc.cache_read_tokens + row.cache_read_tokens,
          cache_write_tokens: acc.cache_write_tokens + row.cache_write_tokens,
          total_tokens:
            acc.total_tokens + row.input_tokens + row.output_tokens,
        }),
        {
          input_tokens: 0,
          output_tokens: 0,
          cache_read_tokens: 0,
          cache_write_tokens: 0,
          total_tokens: 0,
        },
      ),
    [tokenUsage],
  );

  return { tokenUsage, totals, loading };
}
```

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes

### Task 5: Refactor `use-context-health.ts` to use `useFilteredTable`

This hook has post-pipeline `latest` + `health` computation.

**After:**

```typescript
import { useCallback, useMemo } from "react";

import { tables } from "~/module_bindings";

import { useFilteredTable } from "./use-filtered-table";

export function useContextHealth(sessionId?: string, limit = 50) {
  const mapper = useCallback((row: /* row type */) => ({
    id: Number(row.id),
    session_id: row.sessionId,
    context_percent: Number(row.contextPercent),
    message_count: Number(row.messageCount),
    estimated_tokens: Number(row.estimatedTokens),
    phase: row.phase,
    timestamp: Number(row.timestamp),
  }), []);

  const { rows: snapshots, loading } = useFilteredTable(
    tables.contextSnapshots,
    mapper,
    { sessionId, limit },
  );

  const { latest, health } = useMemo(() => {
    const latest = snapshots[0] ?? null;
    let health: "peak" | "good" | "degrading" | "critical" = "peak";
    if (latest) {
      const pct = latest.context_percent;
      if (pct >= 70) health = "critical";
      else if (pct >= 50) health = "degrading";
      else if (pct >= 30) health = "good";
    }
    return { latest, health };
  }, [snapshots]);

  return { snapshots, latest, health, loading };
}
```

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes

### Task 6: Refactor `use-cost-tracking.ts` to use `useFilteredTable`

This hook is the exception — it does NOT sort or limit. Pass `sortBy: undefined` and no `limit`.

**After:**

```typescript
import { useCallback, useMemo } from "react";

import { tables } from "~/module_bindings";

import { useFilteredTable } from "./use-filtered-table";

export function useCostTracking(sessionId?: string) {
  const mapper = useCallback((row: /* row type */) => ({
    session_id: row.sessionId,
    input_cost_cents: Number(row.inputCostCents),
    output_cost_cents: Number(row.outputCostCents),
    total_cost_cents: Number(row.totalCostCents),
    turn_count: Number(row.turnCount),
    timestamp: Number(row.timestamp),
  }), []);

  const { rows: costRows, loading } = useFilteredTable(
    tables.costTracking,
    mapper,
    { sessionId, sortBy: undefined },
  );

  const { cost, totalCost } = useMemo(() => {
    const totalCost = costRows.reduce(
      (acc, row) => acc + row.total_cost_cents,
      0,
    );
    return {
      cost: sessionId ? (costRows[0] ?? null) : costRows,
      totalCost,
    };
  }, [costRows, sessionId]);

  return { cost, totalCost, loading };
}
```

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes

## Implementation Notes

### Row Type Resolution

The exact SpacetimeDB row types will need to be resolved from the generated bindings. Check:

- `packages/luca-observer/module_bindings/token_usage_table.ts` for `TokenUsageRow`
- `packages/luca-observer/module_bindings/tool_calls_table.ts` for `ToolCallsRow`
- etc.

The mapper function parameter type should match the actual generated row type. If the generated types are not easily importable, use `Parameters<typeof useTable<typeof tables.X>>[0]` or the actual row type from the generated `*_table.ts` files.

### Mapper Stability

All mapper functions are wrapped in `useCallback(fn, [])` with empty dependencies to ensure referential stability, since they are pure row-to-object transforms with no external dependencies.

## Success Criteria

1. `useFilteredTable` factory hook created at `packages/luca-observer/hooks/use-filtered-table.ts`
2. All 5 hooks refactored to use the factory (use-token-usage, use-tool-calls, use-decision-trail, use-context-health, use-cost-tracking)
3. Each hook's public API (return type, parameter names) remains identical
4. TypeScript compilation passes
5. ~60 lines of duplicated filter/sort/slice logic eliminated
