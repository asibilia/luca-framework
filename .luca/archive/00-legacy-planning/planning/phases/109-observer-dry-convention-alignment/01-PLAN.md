---
id: "109-01"
title: "Extract generic usePollingFetch hook and refactor 9 polling hooks"
phase: 109
wave: 1
complexity: MODERATE
depends_on: []
tasks:
  - id: "109-01-1"
    title: "Create usePollingFetch generic hook"
    goal: "Extract the common fetch-parse-poll pattern from all polling hooks into a single generic usePollingFetch<T> hook in hooks/use-polling-fetch.ts"
    verify: "usePollingFetch exported from ~/hooks/use-polling-fetch.ts; generic over response schema; bunx --bun tsc --noEmit passes"
  - id: "109-01-2"
    title: "Refactor useWorkflowState to use usePollingFetch"
    goal: "Rewrite use-workflow-state.ts to delegate to usePollingFetch with WorkflowSnapshotSchema"
    verify: "use-workflow-state.ts uses usePollingFetch internally; same public API preserved; bunx --bun tsc --noEmit passes"
  - id: "109-01-3"
    title: "Refactor useMetrics to use usePollingFetch"
    goal: "Rewrite use-metrics.ts to delegate to usePollingFetch, replacing the raw type assertion with safeParse"
    verify: "use-metrics.ts uses usePollingFetch internally; type assertion removed; bunx --bun tsc --noEmit passes"
  - id: "109-01-4"
    title: "Refactor useHarnessResult, useLedger, useIterationHistory, usePlanning, useTribunal, useAgentActivity, useMemory to use usePollingFetch"
    goal: "Rewrite all remaining polling hooks to delegate to usePollingFetch, eliminating duplicated fetch-parse-poll boilerplate"
    verify: "All 7 hooks use usePollingFetch internally; same public APIs preserved; bunx --bun tsc --noEmit passes"
---

# 109-01: Extract Generic usePollingFetch Hook

## Goal

Extract the identical fetch-parse-poll pattern duplicated across 9 polling hooks into a single generic `usePollingFetch<T>` hook. This is the highest-priority DRY violation in the observer codebase (HIGH severity from audit) and saves approximately 350 lines of duplicated boilerplate.

## Context

@packages/luca-observer/hooks/use-workflow-state.ts -- Example polling hook (simplest: flat response)
@packages/luca-observer/hooks/use-metrics.ts -- Polling hook with type assertion (no schema validation)
@packages/luca-observer/hooks/use-harness-result.ts -- Polling hook with response schema + field extraction
@packages/luca-observer/hooks/use-ledger.ts -- Polling hook with URL params and response schema
@packages/luca-observer/hooks/use-iteration-history.ts -- Polling hook with response schema
@packages/luca-observer/hooks/use-planning.ts -- Polling hook with nullable + has_X pattern
@packages/luca-observer/hooks/use-tribunal.ts -- Polling hook with nullable + has_X pattern
@packages/luca-observer/hooks/use-agent-activity.ts -- Polling hook with response schema
@packages/luca-observer/hooks/use-memory.ts -- Polling hook with response schema

**Common pattern across all 9 hooks:**

```typescript
const [data, setData] = useState<T | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

const fetchData = useCallback(async () => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch ...");
    const json = await res.json();
    const parsed = Schema.safeParse(json);
    if (parsed.success) {
      setData(parsed.data);
      setError(null);
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : "Unknown error");
  } finally {
    setLoading(false);
  }
}, [deps]);

useEffect(() => {
  fetchData();
  const interval = setInterval(fetchData, intervalMs);
  return () => clearInterval(interval);
}, [fetchData, intervalMs]);
```

**Variations to handle:**

1. **Flat response** (useWorkflowState): Schema validates entire response, data = parsed.data
2. **Wrapped response** (useLedger, useIterationHistory, useAgentActivity): Response schema wraps array + total_count, consumer extracts fields
3. **Nullable response** (useHarnessResult, usePlanning, useTribunal): Response has `result | null` + `has_result` flag
4. **Untyped response** (useMetrics): No schema, uses `as` cast
5. **URL params** (useLedger): URL constructed with query params

**Design decision:** The generic hook should accept a Zod schema and return the full parsed data object. Each consumer hook can then destructure the fields it needs. This keeps the generic hook simple while allowing consumers to shape their return values.

## Tasks

### Task 109-01-1: Create usePollingFetch generic hook

Create `packages/luca-observer/hooks/use-polling-fetch.ts` with a generic hook that encapsulates the fetch-parse-poll pattern.

**Implementation:**

````typescript
"use client";

import { useEffect, useState, useCallback } from "react";

import type { z } from "zod";

/**
 * Generic polling fetch hook that encapsulates the common
 * fetch -> parse -> poll pattern used by all observer data hooks.
 *
 * Fetches data from the given URL at regular intervals, validates
 * the response with the provided Zod schema, and manages loading
 * and error state.
 *
 * @param url - API endpoint URL (can include query params)
 * @param schema - Zod schema to validate the response
 * @param intervalMs - Polling interval in milliseconds
 * @returns Object with parsed data, loading state, and error
 *
 * @example
 * ```typescript
 * const { data, loading, error } = usePollingFetch(
 *   "/api/state",
 *   WorkflowSnapshotSchema,
 *   5000,
 * );
 * ```
 */
export function usePollingFetch<T>(
  url: string,
  schema: z.ZodType<T>,
  intervalMs: number,
): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch ${url}`);
      const json = await res.json();
      const parsed = schema.safeParse(json);
      if (parsed.success) {
        setData(parsed.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [url, schema]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, intervalMs);
    return () => clearInterval(interval);
  }, [fetchData, intervalMs]);

  return { data, loading, error };
}
````

**Key design decisions:**

- Returns `{ data: T | null; loading; error }` -- the universal shape
- Accepts a Zod schema directly so consumers provide their response schema
- The URL is a string (consumers build it with any query params they need)
- `schema` is in the useCallback deps to support schema changes (rare but safe)
- Does NOT try to extract sub-fields -- consumers do that from `data`

**Verify:**

- [ ] File exists at `packages/luca-observer/hooks/use-polling-fetch.ts`
- [ ] `usePollingFetch<T>` exported with correct generic signature
- [ ] Uses safeParse (not parse) for runtime safety
- [ ] Manages loading, error, and data state
- [ ] Cleans up interval on unmount
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-01-2: Refactor useWorkflowState to use usePollingFetch

Rewrite `packages/luca-observer/hooks/use-workflow-state.ts` to use `usePollingFetch`.

**Before** (45 lines of boilerplate):

```typescript
export function useWorkflowState(intervalMs = 5000) {
  const [data, setData] = useState<WorkflowSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ... 30 lines of fetch/parse/poll boilerplate
  return { data, loading, error };
}
```

**After** (~10 lines):

```typescript
export function useWorkflowState(intervalMs = 5000) {
  return usePollingFetch("/api/state", WorkflowSnapshotSchema, intervalMs);
}
```

**Public API is preserved:** Returns `{ data: WorkflowSnapshot | null, loading, error }`.

**Verify:**

- [ ] Hook returns same shape: `{ data, loading, error }`
- [ ] No useState/useCallback/useEffect boilerplate remains
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-01-3: Refactor useMetrics to use usePollingFetch

Rewrite `packages/luca-observer/hooks/use-metrics.ts` to use `usePollingFetch`.

**Current issue:** useMetrics uses `json as Record<string, unknown>` -- a type assertion without schema validation. This refactor also fixes that by adding a simple passthrough schema.

**After:**

```typescript
const MetricsResponseSchema = z.record(z.unknown());

export function useMetrics(intervalMs = 10000) {
  return usePollingFetch("/api/metrics", MetricsResponseSchema, intervalMs);
}
```

This replaces the `as` cast with proper schema validation.

**Verify:**

- [ ] Hook returns `{ data: Record<string, unknown> | null, loading, error }`
- [ ] Type assertion (`as`) removed, replaced with schema safeParse
- [ ] `bunx --bun tsc --noEmit` passes

### Task 109-01-4: Refactor remaining 7 hooks to use usePollingFetch

Refactor all remaining polling hooks:

1. **use-harness-result.ts**: Keep local `HarnessResponseSchema`, use `usePollingFetch`, destructure `result` and `hasResult` from `data`
2. **use-ledger.ts**: Keep local `LedgerResponseSchema`, use `usePollingFetch` with URL `"/api/ledger?tail=${tail}"`, destructure `entries` and `totalCount` from `data`
3. **use-iteration-history.ts**: Keep local `IterationsResponseSchema`, use `usePollingFetch`, destructure `iterations` from `data`
4. **use-planning.ts**: Keep local `PlanningResponseSchema`, use `usePollingFetch`, destructure `plan` and `hasPlan` from `data`
5. **use-tribunal.ts**: Keep local `TribunalResponseSchema`, use `usePollingFetch`, destructure `result` and `hasResult` from `data`
6. **use-agent-activity.ts**: Keep local `AgentsResponseSchema`, use `usePollingFetch`, destructure `agents` from `data`
7. **use-memory.ts**: Keep local `MemoryResponseSchema`, use `usePollingFetch`, destructure from `data`

**Pattern for hooks that need to extract sub-fields:**

```typescript
export function useHarnessResult(intervalMs = 15000) {
  const { data, loading, error } = usePollingFetch(
    "/api/harness",
    HarnessResponseSchema,
    intervalMs,
  );

  return {
    result: data?.result ?? null,
    hasResult: data?.has_result ?? false,
    loading,
    error,
  };
}
```

**Pattern for hooks with URL params:**

```typescript
export function useLedger(tail = 50, intervalMs = 10000) {
  const { data, loading, error } = usePollingFetch(
    `/api/ledger?tail=${tail}`,
    LedgerResponseSchema,
    intervalMs,
  );

  return {
    entries: data?.entries ?? [],
    totalCount: data?.total_count ?? 0,
    loading,
    error,
  };
}
```

**Verify:**

- [ ] All 7 hooks use usePollingFetch internally
- [ ] All public APIs preserved (same return shapes)
- [ ] Response schemas remain local to each hook file
- [ ] No useState/useCallback/useEffect boilerplate in any hook
- [ ] `bunx --bun tsc --noEmit` passes

## Success Criteria

- [ ] `usePollingFetch<T>` generic hook created and exported
- [ ] All 9 polling hooks refactored to use it
- [ ] ~350 lines of duplicated boilerplate eliminated
- [ ] All public hook APIs preserved (no breaking changes to consumers)
- [ ] useMetrics type assertion replaced with schema validation
- [ ] `bunx --bun tsc --noEmit` passes
