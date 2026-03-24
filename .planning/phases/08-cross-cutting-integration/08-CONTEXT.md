# Phase 8 — Cross-Cutting Integration: Context

## Phase Scope

Create 5 decision/planning documents and 1 utility script for cross-cutting runtime architecture concerns. All items are documentation-first with exact content prescribed in todo files.

## Decisions

### 1. Output locations [verified — todos prescribe exact paths]

- X03 → `docs/runtime-architecture/decisions/backlog-integration-decisions.md`
- X04 → `scripts/targeted-recompile.ts`
- X05 → `docs/runtime-architecture/decisions/behavioral-equivalence-criteria.md`
- X06 → `packages/luca-framework/src/state/types.ts` (event additions) + 2 more files
- X07 → `docs/runtime-architecture/decisions/iteration-integration-spec.md`
- X08 → `docs/runtime-architecture/decisions/open-questions-resolved.md`

### 2. X06 is the only item modifying production code [verified]

X06 adds DAG lifecycle events to the state machine types. All other items create new standalone files. X06 touches `packages/luca-framework/src/state/types.ts`.

### 3. All items are independent [verified — no cross-deps in todos]

All 6 todos have `depends_on: []`. They can execute in a single wave.

## Wave Suggestions

- **Wave 1:** All 6 items in parallel (no dependencies between them)

## Deferred Ideas

None.
