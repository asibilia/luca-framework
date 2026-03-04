# Phase 112 — Observer SpacetimeDB Migration Completion

## Goal

Fix broken features and stale UI left over from the SSE-to-SpacetimeDB migration. Verify the notes page is fully functional, confirm the header reflects real connection state, and clean all stale SSE/polling references from the observer codebase.

## Context

Phase 111 completed DRY extraction and Tailwind polish. The SpacetimeDB migration (Phase 107) replaced 14 API routes with `useTable()` hooks, but left behind residual issues. This phase closes the migration gap.

### Current State Assessment

**Notes page** (`packages/luca-observer/app/notes/page.tsx`): Already migrated to SpacetimeDB in the working tree — uses `useTable(tables.notes)` (line 25) and `useReducer(reducers.createNote)` (line 26). The migration work described in todo #30 appears to have been done during Phase 111 but was not formally verified or marked complete.

**Header** (`packages/luca-observer/components/layout/header.tsx`): Already uses `useSpacetimeDB()` hook (line 16) with tri-state connection indicator (green/yellow/red). No "SSE Connected" text remains. Todo #32 work appears done.

**Stale comments**: 10 hooks still contain "Replaces the polling-based implementation" or "Replaces the SSE-based EventSource implementation" comments. The iterations page comment (line 17) references "useIterationHistory polling hook". Test helpers reference `/api/events`.

### Key Files

- `packages/luca-observer/app/notes/page.tsx` — Notes page (verify functional)
- `packages/luca-observer/components/layout/header.tsx` — Header connection status (verify functional)
- `packages/luca-observer/components/shared/status-indicator.tsx` — Workflow status badge
- `packages/luca-observer/hooks/use-ledger.ts` — Pattern: migrated hook with stale comment
- `packages/luca-observer/hooks/use-memory.ts` — Pattern: migrated hook with stale comment
- `packages/luca-observer/hooks/use-event-stream.ts` — Stale SSE reference
- `packages/luca-observer/hooks/use-agent-activity.ts` — Stale polling reference
- `packages/luca-observer/hooks/use-metrics.ts` — Stale polling reference
- `packages/luca-observer/hooks/use-planning.ts` — Stale polling reference
- `packages/luca-observer/hooks/use-iteration-history.ts` — Stale polling reference
- `packages/luca-observer/hooks/use-workflow-state.ts` — Stale polling reference
- `packages/luca-observer/hooks/use-harness-result.ts` — Stale polling reference
- `packages/luca-observer/hooks/use-tribunal.ts` — Stale polling reference
- `packages/luca-observer/app/iterations/page.tsx` — Stale "polling hook" comment (line 17)
- `packages/luca-observer/__tests__/utils/test-helpers.ts` — Stale `/api/events` reference
- `packages/luca-observer/__tests__/utils/test-helpers.test.ts` — Stale `/api/events` in test
- `packages/luca-observer/module_bindings/types.ts` — Notes table schema (reference)

## Plan

### Wave 1 — Verification (parallel, #30 + #32)

Both features appear already implemented. This wave confirms they work correctly.

#### Plan 1.1: Verify Notes Page Migration (#30)

**Objective:** Confirm notes page is fully functional with SpacetimeDB.

Tasks:

1. Read `packages/luca-observer/app/notes/page.tsx` and confirm:
   - Uses `useTable(tables.notes)` for data subscription
   - Uses `useReducer(reducers.createNote)` for note creation
   - Has error UI when mutations fail (line 59: catches error, line 114: shows error)
   - Loading state shown while data loads (line 122-127)
   - Empty state shown when no pending notes (line 128-135)
2. Run `bunx --bun tsc --noEmit` scoped to the notes page to confirm no type errors
3. Verify the `Notes` table schema in `module_bindings/types.ts` matches what the page expects (filename, body, priority, status, createdAt, consumedAt fields)
4. If any issues found, fix them. If no issues, mark #30 as verified.

**Verification:** `bunx --bun tsc --noEmit` passes; notes page imports resolve; Notes schema fields match usage.

#### Plan 1.2: Verify Header Connection Status (#32)

**Objective:** Confirm header shows real SpacetimeDB connection state.

Tasks:

1. Read `packages/luca-observer/components/layout/header.tsx` and confirm:
   - Uses `useSpacetimeDB()` hook (not hardcoded values)
   - Shows "SpacetimeDB" when connected (green), "Connecting..." when connecting (yellow), "Disconnected" on error (red)
   - No "SSE Connected" text anywhere in the file
2. Confirm `useSpacetimeDB` is the correct hook from `spacetimedb/react` that exposes `isActive` and `connectionError`
3. Run `bunx --bun tsc --noEmit` to confirm no type errors
4. If any issues found, fix them. If no issues, mark #32 as verified.

**Verification:** `bunx --bun tsc --noEmit` passes; header imports resolve; no "SSE" text in file.

### Wave 2 — Stale Comment Cleanup (serial, #38 partial)

#### Plan 2.1: Update Hook JSDoc Comments

**Objective:** Remove "Replaces the polling/SSE-based implementation" from all hooks. The migration is complete — these comments are no longer useful and create confusion.

Files to update (10 hooks):

1. `packages/luca-observer/hooks/use-agent-activity.ts` — Remove "Replaces the polling-based implementation."
2. `packages/luca-observer/hooks/use-event-stream.ts` — Remove "Replaces the SSE-based EventSource implementation."
3. `packages/luca-observer/hooks/use-metrics.ts` — Remove "Replaces the polling-based implementation."
4. `packages/luca-observer/hooks/use-ledger.ts` — Remove "Replaces the polling-based implementation."
5. `packages/luca-observer/hooks/use-planning.ts` — Remove "Replaces the polling-based implementation."
6. `packages/luca-observer/hooks/use-iteration-history.ts` — Remove "Replaces the polling-based implementation."
7. `packages/luca-observer/hooks/use-workflow-state.ts` — Remove "Replaces the polling-based implementation."
8. `packages/luca-observer/hooks/use-harness-result.ts` — Remove "Replaces the polling-based implementation."
9. `packages/luca-observer/hooks/use-tribunal.ts` — Remove "Replaces the polling-based implementation."
10. `packages/luca-observer/hooks/use-memory.ts` — Remove "Replaces the polling-based implementation."

**Verification:** `grep -r "Replaces the polling\|Replaces the SSE" packages/luca-observer/hooks/` returns zero matches.

#### Plan 2.2: Update Stale Page Comments

**Objective:** Fix page-level comments that reference deleted infrastructure.

Tasks:

1. `packages/luca-observer/app/iterations/page.tsx:17` — Change "the useIterationHistory polling hook" to "the useIterationHistory hook" (remove "polling")

**Verification:** No "polling" in iterations page JSDoc.

#### Plan 2.3: Update Test Helper References

**Objective:** Decide whether stale test helpers referencing `/api/events` should be updated or removed.

Tasks:

1. Read `packages/luca-observer/__tests__/utils/test-helpers.ts` and `test-helpers.test.ts`
2. If these test a deleted API, remove or update the stale references
3. If they serve another purpose, update the URLs/comments to reflect current architecture

**Verification:** No `/api/` references in observer test helpers unless justified.

### Wave 3 — Final Verification

#### Plan 3.1: Full Typecheck and Grep Audit

**Objective:** Confirm the entire observer package is clean.

Tasks:

1. Run `bunx --bun tsc --noEmit` on the full project
2. Run `bun test __tests__/packages/luca-observer/` if observer tests exist
3. Final grep for any remaining `SSE`, `/api/`, or `polling` references in `packages/luca-observer/` — document any justified exceptions

**Verification:** Typecheck passes; no unjustified stale references remain.

## Complexity

**SIMPLE** — 2-3 files with real changes (stale comment cleanup); the two P0 items (#30, #32) appear to already be implemented and need verification only.

## Success Criteria

1. Notes page confirmed functional with SpacetimeDB (no `/api/notes` references)
2. Header confirmed showing real connection state (no "SSE Connected")
3. All 10 hooks cleaned of stale "Replaces the polling/SSE" comments
4. Iterations page comment updated
5. Test helper stale references resolved
6. `bunx --bun tsc --noEmit` passes
7. Todos #30 and #32 can be moved to done

## Risk Assessment

**LOW** — Both P0 features appear already working. The main work is comment cleanup (mechanical, low risk). The only risk is if the notes page or header have subtle runtime bugs not caught by typechecking, which would require a manual browser test.
