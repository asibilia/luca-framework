# 100-01 SUMMARY: Observer Data Hooks and API Routes for Deep Pages

## Status: COMPLETE

## What Was Done

### Task 100-01-1: Observer-Local Zod Schemas

Added 13 new Zod schemas to `packages/luca-observer/src/lib/types.ts`:

- **Iteration schemas**: `ConvergenceSignalsSnapshotSchema`, `IterationRecordSnapshotSchema`, `BudgetStateSnapshotSchema`
- **Planning schemas**: `WSJFScoredItemSnapshotSchema`, `SessionPlanSnapshotSchema`
- **Tribunal schemas**: `ReviewFindingSnapshotSchema`, `DisagreementSnapshotSchema`, `RebuttalSnapshotSchema`, `TribunalResultSnapshotSchema`
- **Agent activity schema**: `AgentActivitySnapshotSchema`

All schemas use snake_case field names per API conventions. All have exported `z.infer<>` types. No imports from luca-framework.

### Task 100-01-2: File Reader Utilities

Added three new reader functions to `packages/luca-observer/src/lib/file-watcher.ts`:

- `readIterationHistory()` -- reads `.planning/checkpoints/*.json`, validates with safeParse, returns sorted records
- `readSessionPlan()` -- reads `.planning/session-plan.json`, returns parsed plan or null
- `readTribunalResult()` -- reads `.planning/tribunal-result.json`, returns parsed result or null

All handle missing files/directories gracefully.

### Tasks 100-01-3 through 100-01-6: API Routes

Created four new Next.js API routes:

- `GET /api/iterations` -- returns `{ iterations, total_count }`
- `GET /api/planning` -- returns `{ plan, has_plan }`
- `GET /api/tribunal` -- returns `{ result, has_result }`
- `GET /api/agents` -- returns `{ agents, total_count }` (aggregates from in-memory SSE events by agent_name)

All follow the established pattern from `/api/harness/route.ts` with `dynamic = "force-dynamic"` and snake_case responses.

### Task 100-01-7: React Polling Hooks

Created five new hooks in `packages/luca-observer/src/hooks/`:

- `useIterationHistory(intervalMs?)` -- polls /api/iterations
- `usePlanning(intervalMs?)` -- polls /api/planning
- `useTribunal(intervalMs?)` -- polls /api/tribunal
- `useAgentActivity(intervalMs?)` -- polls /api/agents
- `useMemory(intervalMs?)` -- polls /api/memory

All follow the safeParse + polling pattern from `use-harness-result.ts` with loading, error, and data states.

## Verification

- **Type check**: `bunx --bun tsc --noEmit` -- zero errors in new/modified files (pre-existing errors in `test-helpers.test.ts` and `check-result-card.tsx` unrelated)
- **Tests**: All 29 observer tests pass, 0 failures
- **API conventions**: All response payloads use snake_case
- **No cross-package imports**: Observer types are fully self-contained

## Files Changed

### Modified

- `packages/luca-observer/src/lib/types.ts` -- 13 new schemas + types
- `packages/luca-observer/src/lib/file-watcher.ts` -- 3 new reader functions

### Created

- `packages/luca-observer/src/app/api/iterations/route.ts`
- `packages/luca-observer/src/app/api/planning/route.ts`
- `packages/luca-observer/src/app/api/tribunal/route.ts`
- `packages/luca-observer/src/app/api/agents/route.ts`
- `packages/luca-observer/src/hooks/use-iteration-history.ts`
- `packages/luca-observer/src/hooks/use-planning.ts`
- `packages/luca-observer/src/hooks/use-tribunal.ts`
- `packages/luca-observer/src/hooks/use-agent-activity.ts`
- `packages/luca-observer/src/hooks/use-memory.ts`

## Design Decisions

1. **Agent route uses in-memory SSE events, not ledger**: The `/api/agents` route queries the in-memory event store (`queryEvents` from `~/lib/db`) rather than reading ledger JSONL, since the `StoredEvent` type already has `agent_name`, `duration_ms`, `status`, and `timestamp` fields directly on the object. This avoids an unnecessary file I/O layer for data that is already in memory.

2. **useMemory hook added even though /api/memory existed**: The plan specified creating a useMemory hook since the API route existed but had no corresponding hook. This enables the memory deep page UI in Plan 100-04.

3. **readdir imported dynamically**: The `readIterationHistory` function uses dynamic `import("node:fs/promises")` for `readdir` since the top-level import only brings in `readFile` (matching the existing pattern in the file).

## Commit

`feat(100-01): add observer data hooks and API routes for deep pages`
