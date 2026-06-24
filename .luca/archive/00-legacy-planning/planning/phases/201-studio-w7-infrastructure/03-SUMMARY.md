# Phase 201 Wave 3 Summary: Undo/Redo Wiring

## Objective

Wire undo/redo support into Luca Studio entity editor pages using the existing jotai-history atoms (agentHistoryAtom, skillHistoryAtom, ruleHistoryAtom) created in Wave 2.

## Tasks Completed

### Task 1: Create useUndo hook

- **Commit:** `363e4cb8`
- **File:** `packages/luca-studio/hooks/use-undo.ts`
- Created `useUndo(historyAtom)` hook that wraps jotai-history dispatch
- Returns `{ canUndo, canRedo, undo, redo, reset }`
- Registers global `Cmd+Z` (undo) and `Shift+Cmd+Z` (redo) keyboard shortcuts
- Also responds to `Ctrl+Z` / `Shift+Ctrl+Z` for cross-platform support
- Uses `useAtomValue` + `useSetAtom` pattern for clean separation of read/write

### Task 2: Reset history on server-initiated draft updates

- **Commit:** `7967b241`
- **File:** `packages/luca-studio/hooks/use-agent-detail.ts`
- Added `RESET` import from jotai-history and `agentHistoryAtom` from entity-atoms
- After `setDraft()` populates the draft from the server fetch, dispatches `RESET` on the history atom
- Prevents users from undoing back to the empty pre-fetch state

### Task 3: Wire useUndo into agents page

- **Commit:** `a271fc84`
- **File:** `packages/luca-studio/app/agents/page.tsx`
- Calls `useUndo(agentHistoryAtom(selectedName ?? "__noop__"))` in the agents page
- Keyboard shortcuts are active whenever an agent is selected

### Task 4: Wire useUndo into skills and rules pages

- **Commit:** `ed3c576d`
- **Files:** `packages/luca-studio/app/skills/page.tsx`, `packages/luca-studio/app/rules/page.tsx`
- Both pages converted to `"use client"` with `useState` for `selectedName`
- Pre-wired `useUndo(skillHistoryAtom(...))` and `useUndo(ruleHistoryAtom(...))`
- Shortcuts will be active as soon as the entity editors are built out

## Deviations

### HistoryAtom type broadened to `any` write args

- **Rule:** Rule 3 (Blocking) -- the initial `HistoryAtom` type was too strict for the union type produced by `withUndoableHistory`, causing TS2345 errors
- **Fix:** Changed write args from a constrained generic to `any` to accommodate the mixed union (`[SetStateAction<T>] | [UNDO | REDO | RESET]`)
- **Impact:** No runtime impact; type safety is preserved by the hook's internal dispatch calls which only pass known action symbols

## Verification

- `bunx --bun tsc --noEmit` passes (only pre-existing chokidar namespace error, unrelated)
- All 4 commits are atomic and focused on their respective tasks
- jotai-history v0.5.0 API confirmed: `UNDO`, `REDO`, `RESET` are exported symbols; `withHistory` (alias for `withUndoableHistory`) returns `WritableAtom<History<V> & Indicators, ...>`

## Files Modified

| File                                             | Change                              |
| ------------------------------------------------ | ----------------------------------- |
| `packages/luca-studio/hooks/use-undo.ts`         | **New** -- useUndo hook             |
| `packages/luca-studio/hooks/use-agent-detail.ts` | Added RESET dispatch after setDraft |
| `packages/luca-studio/app/agents/page.tsx`       | Wired useUndo with agentHistoryAtom |
| `packages/luca-studio/app/skills/page.tsx`       | Wired useUndo with skillHistoryAtom |
| `packages/luca-studio/app/rules/page.tsx`        | Wired useUndo with ruleHistoryAtom  |
