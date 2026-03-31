# Phase 256: Step Enforcement Phase 1 — XState Value Normalization

## Objective

Create `resolveStateValue()` and `resolveStatePath()` utilities. Replace all 22 `String(snapshot.value)` call sites across 6 files. Extend `computePipelinePosition()` with optional compound state path parameter. Zero behavior change — forward-compatible with Phase 257 compound sub-states.

## Context

See `.planning/todos/pending/step-enforcement-phase-1-value-normalization.md` for full details including expert panel research and exact line numbers.

## Wave 1: All tasks (single wave — tightly coupled)

### Task 1: create-resolve-utils

Create `packages/luca-framework/src/state/__helpers/resolve-state-value.ts` with:

- `resolveStateValue(value: unknown): string` — top-level state name
- `resolveStatePath(value: unknown): string` — full dot-path
  Export both from `packages/luca-framework/src/state/index.ts`.

### Task 2: replace-bridge-callsites

Replace 15 `String(snapshot.value)` calls in `packages/luca-framework/src/state/bridge.ts`. See todo for exact line numbers.

### Task 3: replace-machine-callsite

Replace `snapshot.value as string` at line 674 in `packages/luca-framework/src/state/machine.ts` (`getAllowedEvents`).

### Task 4: replace-hook-callsites

- `src/hooks/__helpers/enforcement-hook-factory.ts` line 310
- `src/hooks/__helpers/orchestrator-gate-config.ts` line 179
- `src/hooks/scripts/statusline.ts` line 77

### Task 5: update-snapshot-docs

Update JSDoc example in `packages/luca-framework/src/state/snapshot.ts` line 214.

### Task 6: extend-pipeline-position

- Add `fullStatePath?: string` param to `computePipelinePosition()` in `pipeline-position.ts`
- Extend `PipelinePosition` type with executing sub-positions
- Wire enforcement factory to pass `resolveStatePath()` as second arg

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `grep -rn "String(.*snapshot\.value\|\.value as string" packages/luca-framework/src/state/ src/hooks/` — 0 matches
- [ ] Existing behavior unchanged (all states still flat strings)

## Success Criteria

All 22 `String(snapshot.value)` calls replaced with `resolveStateValue()`. `computePipelinePosition()` accepts optional compound path. Type check passes.
