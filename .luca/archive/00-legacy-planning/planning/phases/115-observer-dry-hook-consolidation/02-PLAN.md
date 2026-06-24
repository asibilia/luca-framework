---
id: "115-02"
title: "Remove Phantom Error Fields from All Observer Hooks"
wave: 1
phase: 115
gap_closure: true
depends_on: []
---

# Plan 02 — Remove Phantom Error Fields from All Observer Hooks

## Objective

Remove the `error: null as string | null` phantom field from all 14 observer hooks. This field is vestigial from a previous HTTP-based architecture and never carries a real value in the SpacetimeDB subscription model.

## Context

All 14 observer hooks return `error: null as string | null` as a hardcoded `null` value. In the SpacetimeDB model, errors are signaled through the connection/subscription lifecycle, not through individual table subscriptions. The `useTable()` hook returns `[rows, isLoading]` — there is no error channel.

Keeping this phantom field:

- Misleads consumers into thinking error state is handled per-hook
- Adds unnecessary type complexity (`string | null` that is always `null`)
- Wastes return object space on every hook call

### Affected Hooks (14 total)

All hooks in `packages/luca-observer/hooks/` except `use-event-stream.ts` (which does not return an error field) and `use-media-query.ts` (unrelated utility hook):

1. @file packages/luca-observer/hooks/use-token-usage.ts — line 66
2. @file packages/luca-observer/hooks/use-tool-calls.ts — line 43
3. @file packages/luca-observer/hooks/use-decision-trail.ts — line 51
4. @file packages/luca-observer/hooks/use-context-health.ts — line 59
5. @file packages/luca-observer/hooks/use-cost-tracking.ts — line 47
6. @file packages/luca-observer/hooks/use-agent-activity.ts — line 72
7. @file packages/luca-observer/hooks/use-harness-result.ts — line 60
8. @file packages/luca-observer/hooks/use-iteration-history.ts — line 46
9. @file packages/luca-observer/hooks/use-ledger.ts — line 58
10. @file packages/luca-observer/hooks/use-memory.ts — line 39
11. @file packages/luca-observer/hooks/use-metrics.ts — line 31
12. @file packages/luca-observer/hooks/use-planning.ts — line 36
13. @file packages/luca-observer/hooks/use-tribunal.ts — line 36
14. @file packages/luca-observer/hooks/use-workflow-state.ts — line 37

## Tasks

### Task 1: Check for consumers that destructure `error`

Before removing the field, find any components that use `error` from these hooks.

**Action:** Search for `error` destructured from hook returns across the observer codebase.

```bash
grep -rn "error" packages/luca-observer/components/ packages/luca-observer/app/ --include="*.tsx" --include="*.ts" | grep -E "\b(useTokenUsage|useToolCalls|useDecisionTrail|useContextHealth|useCostTracking|useAgentActivity|useHarnessResult|useIterationHistory|useLedger|useMemory|useMetrics|usePlanning|useTribunal|useWorkflowState)\b"
```

If any components destructure `error`, update them to remove the destructured field.

**Verification:** All consumers identified and catalogued.

### Task 2: Remove `error: null as string | null` from all 14 hooks

For each hook, remove the `error` property from the return object.

**Pattern — Before:**

```typescript
return {
  tokenUsage,
  totals,
  loading: isLoading,
  error: null as string | null, // ← remove this line
};
```

**Pattern — After:**

```typescript
return {
  tokenUsage,
  totals,
  loading: isLoading,
};
```

**Specific changes per file:**

| Hook File                  | Line | Return Object Key to Remove     |
| -------------------------- | ---- | ------------------------------- |
| `use-token-usage.ts`       | 66   | `error: null as string \| null` |
| `use-tool-calls.ts`        | 43   | `error: null as string \| null` |
| `use-decision-trail.ts`    | 51   | `error: null as string \| null` |
| `use-context-health.ts`    | 59   | `error: null as string \| null` |
| `use-cost-tracking.ts`     | 47   | `error: null as string \| null` |
| `use-agent-activity.ts`    | 72   | `error: null as string \| null` |
| `use-harness-result.ts`    | 60   | `error: null as string \| null` |
| `use-iteration-history.ts` | 46   | `error: null as string \| null` |
| `use-ledger.ts`            | 58   | `error: null as string \| null` |
| `use-memory.ts`            | 39   | `error: null as string \| null` |
| `use-metrics.ts`           | 31   | `error: null as string \| null` |
| `use-planning.ts`          | 36   | `error: null as string \| null` |
| `use-tribunal.ts`          | 36   | `error: null as string \| null` |
| `use-workflow-state.ts`    | 37   | `error: null as string \| null` |

### Task 3: Update any consumers that reference `error`

If Task 1 found consumers that destructure `error`, update them:

- Remove `error` from destructuring patterns
- Remove any `if (error)` conditional rendering that depended on it
- If a component has error UI that was gated on this field, leave the error UI in place but remove the never-true condition

**Verification:**

- `bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json` passes
- `grep -rn "error: null as string" packages/luca-observer/hooks/` returns zero results
- No TypeScript errors from consumers accessing `.error` on hook return values

## Success Criteria

1. All 14 hooks no longer return `error: null as string | null`
2. All consumers updated to not reference the removed field
3. TypeScript compilation passes with zero errors
4. No behavioral changes — the field was always `null`, so removing it changes nothing at runtime
