---
phase: 2
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 2 Plan 2: Three-Layer Jotai Atom Model

## Objective

Implement the three-layer Jotai atom architecture for Studio state management: server state (read-only mirrors of disk), draft state (writable copies for editing), and dirty tracking (divergence detection + validation). This establishes the state foundation that all editor UI will consume in later phases.

## Context

@packages/luca-studio/stores/vault.ts (existing Jotai patterns)
@packages/luca-studio/stores/session.ts (existing atom patterns)
@packages/luca-studio/stores/filters.ts (existing atom patterns)
@packages/luca-studio/stores/theme.ts (existing atomWithStorage pattern)
@docs/brainstorm/observer-studio-rework/4.technical-architecture.md (State Management section, lines 114-160)
@packages/luca-studio/package.json (jotai, jotai-history now available)

## Tasks

### 1. Create server state and config draft atoms

**Type:** auto
**TDD:** false
**Depends on:** none

Create `packages/luca-studio/stores/config-atoms.ts` with Layer 1 (server state) and Layer 2 (draft state) atoms for config:

**Layer 1 -- Server State (read-only mirrors):**

- `configAtom` -- mirrors `config.json`, populated from GET `/api/config`
- `agentRegistryAtom` -- mirrors agent list + frontmatter from GET `/api/entities/agents`
- `routingTableAtom` -- mirrors MODEL_ROUTING_TABLE from GET `/api/routing-table`
- `stateAtom` -- mirrors `state.json` from GET `/api/state`

**Layer 2 -- Config Draft:**

- `configDraftAtom` -- writable copy derived from `configAtom`
- `routingDraftAtom` -- writable copy derived from `routingTableAtom`

Server state atoms use `atom<T | null>(null)` pattern (null until first fetch). Draft atoms derive initial value from server state and become independently writable.

**Files to create/edit:**

- `packages/luca-studio/stores/config-atoms.ts` (new)

**Verification:**

- File exports all six atoms with correct types
- Draft atoms derive from server state atoms
- `bunx --bun tsc --noEmit` passes

### 2. Create entity draft atoms with atomFamily

**Type:** auto
**TDD:** false
**Depends on:** 1

Create `packages/luca-studio/stores/entity-atoms.ts` with per-entity atom trees using `atomFamily`:

- `agentDraftAtom(name: string)` -- per-agent writable draft via `atomFamily`
- `skillDraftAtom(name: string)` -- per-skill writable draft via `atomFamily`
- `ruleDraftAtom(name: string)` -- per-rule writable draft via `atomFamily`
- `agentHistoryAtom(name: string)` -- per-agent undo/redo via `withHistory` from `jotai-history`, max 50 entries
- `skillHistoryAtom(name: string)` -- per-skill undo/redo
- `ruleHistoryAtom(name: string)` -- per-rule undo/redo

Each entity family creates independent atom trees, enabling concurrent multi-entity editing without interference. History atoms wrap draft atoms with `withHistory(draftAtom, 50)`.

Define Zod schemas for the entity draft shapes (or use `unknown` with documentation noting schemas will be tightened when API routes are built in Phase 4-5).

**Files to create/edit:**

- `packages/luca-studio/stores/entity-atoms.ts` (new)

**Verification:**

- `atomFamily` creates independent atoms per entity name
- `withHistory` wraps each draft atom family correctly
- Multiple entities can be created without atom key collisions
- `bunx --bun tsc --noEmit` passes

### 3. Create dirty tracking atoms

**Type:** auto
**TDD:** false
**Depends on:** 1, 2

Create `packages/luca-studio/stores/dirty-tracking.ts` with Layer 3:

- `dirtySetAtom` -- `atom<Set<string>>` tracking entity keys with unsaved changes (e.g., `"config"`, `"agent:lu-router"`, `"routing"`)
- `validationErrorsAtom` -- `atom<Map<string, string[]>>` mapping entity keys to validation error messages
- `canSaveAtom` -- derived read-only atom: `true` when `dirtySetAtom.size > 0` AND `validationErrorsAtom` has no errors for any dirty key
- Helper write atoms: `markDirtyAtom(key)`, `markCleanAtom(key)`, `setValidationErrorsAtom(key, errors)`

The dirty set tracks divergence between draft and server state. The `canSaveAtom` is the single source of truth for whether a save button should be enabled.

**Files to create/edit:**

- `packages/luca-studio/stores/dirty-tracking.ts` (new)

**Verification:**

- `dirtySetAtom` correctly tracks entity keys
- `canSaveAtom` returns `false` when nothing is dirty
- `canSaveAtom` returns `true` when dirty and no validation errors
- `canSaveAtom` returns `false` when dirty but validation errors exist for a dirty key
- `bunx --bun tsc --noEmit` passes

## Verification

1. All three new files exist in `packages/luca-studio/stores/`
2. `bunx --bun tsc --noEmit` passes with no errors
3. Draft atoms correctly derive initial values from server state atoms
4. `atomFamily` produces independent atom instances per entity name
5. `dirtySetAtom` + `canSaveAtom` interaction logic is correct
6. History atoms wrap drafts with 50-entry limit

## Success Criteria

- Layer 1 atoms exist for config, agent registry, routing table, and state
- Layer 2 atoms exist for config draft, routing draft, and per-entity drafts (agent/skill/rule)
- Layer 3 atoms exist for dirty tracking, validation errors, and canSave derivation
- `atomFamily` enables concurrent multi-entity editing
- `jotai-history` integration provides undo/redo per entity
- All files follow existing store patterns (JSDoc, functional, no classes)
- Typecheck passes cleanly

## Output Specification

- `packages/luca-studio/stores/config-atoms.ts` -- Server state + config draft atoms
- `packages/luca-studio/stores/entity-atoms.ts` -- Per-entity atomFamily drafts + history
- `packages/luca-studio/stores/dirty-tracking.ts` -- Dirty set, validation errors, canSave
