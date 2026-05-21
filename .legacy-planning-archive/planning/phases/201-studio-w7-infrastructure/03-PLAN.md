---
phase: 201
plan: 3
type: feature
autonomous: true
wave: 3
depends_on: [1, 2]
---

# Phase 201 Plan 3: Undo/Redo Wiring

## Objective

Wire the existing jotai-history undo/redo atoms (already fully implemented in `stores/entity-atoms.ts`) to keyboard shortcuts and a toolbar indicator, enabling Cmd+Z / Shift+Cmd+Z across all entity editing surfaces.

> Appetite: Large (200K tokens, ~67K tokens remaining per wave at 60% context budget)

This is a wiring-only task. The history atoms (`agentHistoryAtom`, `skillHistoryAtom`, `ruleHistoryAtom`) are already defined with `withHistory()` and `HISTORY_LIMIT = 50`. They are exported from the store barrel but consumed by zero components. No atom creation or jotai-history integration is needed -- only connecting existing atoms to UI.

Key constraint from pre-mortem: SSE re-fetches write to Layer 1 server-state atoms, not Layer 2 draft atoms. Since history wraps the draft atoms, SSE re-fetches do NOT pollute undo history. However, when `useAgentDetail` calls `setDraft()` on initial load or re-fetch, that DOES push a history entry. The useUndo hook must account for this by dispatching RESET after server-initiated draft updates.

## Context

@packages/luca-studio/stores/entity-atoms.ts (history atoms -- already complete)
@packages/luca-studio/hooks/use-pipeline-save.ts (Cmd+S pattern to replicate)
@packages/luca-studio/hooks/use-agent-detail.ts (setDraft on load -- needs RESET)
@packages/luca-studio/app/agents/page.tsx (agent editor page to wire)
@packages/luca-studio/app/skills/page.tsx (skills editor page to wire)
@packages/luca-studio/app/rules/page.tsx (rules editor page to wire)
@.planning/phases/201-studio-w7-infrastructure/201-RESEARCH.md (jotai-history API)
@.planning/phases/201-studio-w7-infrastructure/01-PREMORTEM.md (undo stack pollution risk)

## Tasks

### 1. Create useUndo hook

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/hooks/use-undo.ts` implementing a reusable undo/redo hook that wraps jotai-history dispatch.

Key requirements:

- Accept a history atom instance (from any entity type's `atomFamily`)
- Read `canUndo` and `canRedo` from the history atom value
- Provide `undo()` and `redo()` callbacks that dispatch `UNDO` and `REDO` actions
- Provide `reset()` callback that dispatches `RESET` (for clearing history after server-initiated updates)
- Register keyboard shortcuts: `Cmd+Z` (undo), `Shift+Cmd+Z` (redo)
- Keyboard shortcuts must not conflict with existing `Cmd+S` in pipeline-save or agent page
- Return `{ canUndo, canRedo, undo, redo, reset }` for component consumption
- The hook should import `UNDO`, `REDO`, `RESET` from `jotai-history` (verify these are the correct action names from the installed v0.5.0)

**Files to create/edit:**

- `packages/luca-studio/hooks/use-undo.ts` (CREATE)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Hook exports `useUndo` function
- Imports `UNDO`, `REDO` from `jotai-history`
- Returns `canUndo`, `canRedo`, `undo`, `redo`, `reset`

### 2. Reset history on server-initiated draft updates

**Type:** auto
**TDD:** false
**Depends on:** 1

Modify `packages/luca-studio/hooks/use-agent-detail.ts` to reset the history atom after populating the draft from a server fetch. This prevents the initial load and SSE-triggered re-fetches from creating undo entries that revert to empty state.

Key requirements:

- Import `agentHistoryAtom` from entity-atoms and `useSetAtom` for the history dispatch
- After `setDraft(...)` on successful fetch (line 76-81), dispatch `RESET` on the corresponding history atom
- This ensures the history starts clean after every server load -- Cmd+Z only undoes user edits, never server syncs
- Apply the same pattern if `use-skill-detail.ts` and `use-rule-detail.ts` exist; if they do not exist yet, document the pattern in JSDoc for future hooks

**Files to create/edit:**

- `packages/luca-studio/hooks/use-agent-detail.ts` (MODIFY)
- `packages/luca-studio/hooks/use-skill-detail.ts` (MODIFY if exists)
- `packages/luca-studio/hooks/use-rule-detail.ts` (MODIFY if exists)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- After initial agent load, `canUndo` is false (history was reset)
- After user edits draft, `canUndo` becomes true

### 3. Wire useUndo into agents page

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Add undo/redo support to `packages/luca-studio/app/agents/page.tsx`.

Key requirements:

- Import `useUndo` and `agentHistoryAtom` from their respective modules
- Call `useUndo(agentHistoryAtom(selectedName))` when `selectedName` is non-null
- The hook handles keyboard shortcuts automatically -- no additional event listeners needed
- Optionally surface `canUndo` / `canRedo` state for future toolbar indicators (Phase 202 will add visible UI; for now, keyboard shortcuts are sufficient)

**Files to create/edit:**

- `packages/luca-studio/app/agents/page.tsx` (MODIFY)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `useUndo` is called with the correct history atom for the selected agent
- Cmd+Z / Shift+Cmd+Z keyboard shortcuts are active on the agents page

### 4. Wire useUndo into skills and rules pages

**Type:** auto
**TDD:** false
**Depends on:** 1, 3

Apply the same undo/redo wiring to skills and rules pages, mirroring the agents page pattern.

Key requirements:

- Import `useUndo` and the appropriate history atom (`skillHistoryAtom` or `ruleHistoryAtom`)
- Call `useUndo(skillHistoryAtom(selectedName))` on skills page
- Call `useUndo(ruleHistoryAtom(selectedName))` on rules page
- Verify the pages follow the same selected-name pattern as agents

**Files to create/edit:**

- `packages/luca-studio/app/skills/page.tsx` (MODIFY)
- `packages/luca-studio/app/rules/page.tsx` (MODIFY)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Both pages import and call `useUndo` with entity-specific history atoms
- Keyboard shortcuts work on all three entity pages

## Verification

1. Type check passes: `bunx --bun tsc --noEmit` (zero errors)
2. Initial load: After selecting an agent, `canUndo` is false (RESET fired after server load)
3. User edit: Edit agent config field, `canUndo` becomes true
4. Undo: Cmd+Z reverts the user's last edit (not the server load)
5. Redo: Shift+Cmd+Z re-applies the undone edit
6. Page switch: Select a different agent, history resets for the new agent
7. Cross-entity: Undo works independently on agents, skills, and rules pages
8. No SSE pollution: External config edit via SSE does NOT create undo entries on entity pages (SSE writes to Layer 1 atoms, not entity draft atoms)

## Success Criteria

- Cmd+Z undoes the last user edit on any entity editing surface (agents, skills, rules)
- Shift+Cmd+Z redoes the last undone edit
- Server-initiated updates (initial load, SSE re-fetch) do not appear in undo history
- Each entity has independent undo history (undoing agent A does not affect skill B)
- History limit of 50 entries per entity is respected (already implemented in atoms)
- No new dependencies added (jotai-history already installed and imported)

## Output Specification

| Artifact                   | Path                                             | Type     |
| -------------------------- | ------------------------------------------------ | -------- |
| Undo hook                  | `packages/luca-studio/hooks/use-undo.ts`         | New file |
| History-aware agent detail | `packages/luca-studio/hooks/use-agent-detail.ts` | Modified |
| Undo-wired agents page     | `packages/luca-studio/app/agents/page.tsx`       | Modified |
| Undo-wired skills page     | `packages/luca-studio/app/skills/page.tsx`       | Modified |
| Undo-wired rules page      | `packages/luca-studio/app/rules/page.tsx`        | Modified |
