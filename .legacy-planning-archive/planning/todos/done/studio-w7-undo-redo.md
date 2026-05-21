---
title: "Undo/redo with jotai-history"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w2-jotai-atom-model, studio-w2-new-dependencies]
phase: studio-w7
estimated_size: S
priority: P2
---

## Context

Editing workflows benefit from undo/redo to let users experiment safely. The `jotai-history` package (official jotaijs org) provides `withHistory(targetAtom, limit)` that wraps any atom with undo/redo capability, matching the spec exactly.

## Task

Integrate `jotai-history` with the draft atom model:

- Wrap each draft atom with `withHistory(draftAtom, 50)` -- per-entity, max 50 entries
- Use `atomFamily` for per-entity history: `agentHistoryAtom = atomFamily((name) => withHistory(agentDraftAtom(name), 50))`
- Export UNDO, REDO, RESET action constants
- Derive `canUndo`/`canRedo` atoms for toolbar button state
- Wire Cmd+Z / Cmd+Shift+Z keyboard shortcuts to undo/redo actions
- Concurrent multi-entity editing gets independent undo stacks via atomFamily

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (Undo/Redo section) and `docs/brainstorm/observer-studio-rework/9.research-frontend-tech.md` (R12) for the jotai-history integration pattern.

## Key Files

- Modified: `packages/luca-studio/stores/entity-atoms.ts` (add history wrapping)
- New: `packages/luca-studio/stores/history-atoms.ts`
- Modified: Canvas toolbar and editor toolbar (add undo/redo buttons)

## Verification

- Editing a field then pressing Cmd+Z reverts the change
- Cmd+Shift+Z re-applies the reverted change
- Undo/redo buttons in toolbar reflect `canUndo`/`canRedo` state
- Each entity has independent undo history (editing Agent A then undoing doesn't affect Agent B)
- History caps at 50 entries per entity
