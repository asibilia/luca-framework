---
title: "Three-layer Jotai atom model (server state, draft, dirty tracking)"
area: ui
created: 2026-03-25
source: docs/brainstorm/observer-studio-rework
depends_on: [studio-w2-new-dependencies]
phase: studio-w2
estimated_size: M
priority: P1
---

## Context

The Studio needs a structured state management layer for editing workflows. The existing Observer uses Jotai for read-only state only (vault.ts). The Studio requires a three-layer atom model supporting server state mirroring, user draft editing, and dirty tracking across multiple concurrent entity editors.

## Task

Implement the three-layer Jotai atom architecture:

- **Layer 1 (Server State):** `configAtom`, `agentRegistryAtom`, `routingTableAtom`, `stateAtom` -- read-only mirrors of disk state, populated from GET endpoints
- **Layer 2 (Draft State):** `configDraftAtom`, `agentDraftAtom(name)` via `atomFamily`, `routingDraftAtom` -- writable copies for editing
- **Layer 3 (Dirty Tracking):** `dirtySetAtom` (Set<string>), `canSaveAtom` (derived), `validationErrorsAtom` (Map<string, ZodError[]>)

Use `atomFamily` for per-entity independent atom trees enabling concurrent multi-entity editing.

See `docs/brainstorm/observer-studio-rework/4.technical-architecture.md` (State Management section) and `docs/brainstorm/observer-studio-rework/9.research-frontend-tech.md` (R12) for Jotai patterns.

## Key Files

- New: `packages/luca-studio/stores/config-atoms.ts`
- New: `packages/luca-studio/stores/entity-atoms.ts`
- New: `packages/luca-studio/stores/dirty-tracking.ts`
- Existing: `packages/luca-studio/stores/vault.ts` (reference pattern)

## Verification

- Draft atoms derive from server state atoms correctly
- `dirtySetAtom` tracks divergence between draft and server state
- `canSaveAtom` returns true only when dirty and no validation errors
- `atomFamily` creates independent atom trees per entity name
- Multiple entities can be edited concurrently without interference
