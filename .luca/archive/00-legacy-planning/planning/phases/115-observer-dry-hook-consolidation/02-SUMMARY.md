# Plan 115-02 Summary: Remove Phantom Error Fields from All Observer Hooks

## Status: COMPLETE

## What Was Done

Removed the vestigial `error: null as string | null` field from all 14 observer hooks in `packages/luca-observer/hooks/`. This field was a remnant of a prior HTTP-based architecture and never carried a real value under the SpacetimeDB subscription model.

## Task Results

### Task 1: Consumer Audit

Searched all components and pages in `packages/luca-observer/` for destructuring or referencing `.error` from any of the 14 hooks. **Zero consumers found.** All call sites only destructure domain-specific fields (e.g., `loading`, `data`, `entries`, `result`).

### Task 2: Remove `error: null as string | null` from All 14 Hooks

7 of the 14 hooks had already been cleaned by the prior Plan 115-01 (safeJsonParse refactor commit `6416c00`). The remaining 7 were updated in this plan:

| Hook                       | Commit                |
| -------------------------- | --------------------- |
| `use-token-usage.ts`       | `6416c00` (prior)     |
| `use-tool-calls.ts`        | `6416c00` (prior)     |
| `use-decision-trail.ts`    | `6416c00` (prior)     |
| `use-context-health.ts`    | `6416c00` (prior)     |
| `use-cost-tracking.ts`     | `6416c00` (prior)     |
| `use-agent-activity.ts`    | `6416c00` (prior)     |
| `use-harness-result.ts`    | `6416c00` (prior)     |
| `use-iteration-history.ts` | `73c4904` (this plan) |
| `use-ledger.ts`            | `73c4904` (this plan) |
| `use-memory.ts`            | `73c4904` (this plan) |
| `use-metrics.ts`           | `73c4904` (this plan) |
| `use-planning.ts`          | `73c4904` (this plan) |
| `use-tribunal.ts`          | `73c4904` (this plan) |
| `use-workflow-state.ts`    | `73c4904` (this plan) |

JSDoc `@returns` tags were also updated to remove "and error" from all 14 hooks.

### Task 3: Update Consumers

No consumers needed updating (confirmed in Task 1).

## Verification

- `grep -rn "error: null as string" packages/luca-observer/hooks/` returns **zero results**
- TypeScript compilation (`bunx --bun tsc --noEmit --project packages/luca-observer/tsconfig.json`) shows only pre-existing type errors in `planning/page.tsx` and `tribunal/page.tsx` (unrelated to this change -- those are `Record<string, unknown>` typing issues from the safeJsonParse refactor)
- No new TypeScript errors introduced by this plan

## Behavioral Impact

None. The `error` field was always hardcoded to `null` and never referenced by any consumer. Removing it is a pure dead-code cleanup with zero runtime impact.
