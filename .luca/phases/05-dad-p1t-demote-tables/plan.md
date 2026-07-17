---
id: dad-p1t-demote-tables
title: DAD-P1t — Demote/delete the redundant tables
trace_id: DAD-P1t
complexity: MODERATE
waves:
  - wave: 1
    tasks: [t1]
  - wave: 2
    tasks: [t2, t3]
  - wave: 3
    tasks: [t4]
  - wave: 4
    tasks: [t5]
---

# DAD-P1t — Demote/Delete the Redundant Tables

Goal: delete the hand-maintained `PIPELINE_STEP_TO_COARSE_PHASE` table and re-derive the coarse phase from the machine via `snapshot.getMeta()`; the other 4 tables stay (data, not control flow). **NO behavior change** — `coarsePhaseOf(step)` returns the identical golden mapping for all 13 steps. Research: Muninn `research:dad-p1t-demote-tables`. Locked decisions: getMeta + a module-load derived map; rework `STEP_TO_STATE_VALUE` to walk `pipelineMachine.states`; keep `coarsePhaseOf` the public API (consumers untouched); delete `coarse-phase-map.ts`.

## Tasks

### Wave 1 — Machine-derived coarse phase
- **t1 — Machine meta + derived map** in `packages/luca-core/src/state/machine/pipeline-machine.ts`. Add `meta: { coarsePhase }` to the 5 top-level nodes (idle→IDLE, planning→PLANNING, executing→EXECUTING, reviewing→REVIEWING, finalizing→FINALIZING) and declare `types: { meta: { coarsePhase?: CoarsePhase } }` in `setup`. Rework `stateValueForStep` / `STEP_TO_STATE_VALUE` to derive each step's parent by walking `pipelineMachine.states` (remove the `PIPELINE_STEP_TO_COARSE_PHASE`/`COARSE_TO_PARENT` dependency); output must stay byte-identical. Build + export a module-load `STEP_TO_COARSE_PHASE: Record<PipelineStep, CoarsePhase>` computed via `resolveState({value, context:{}}).getMeta()`; add a module-load assertion that every step yields a valid `CoarsePhase` (a runtime backstop; compile-time exhaustiveness is still held by the existing `STEP_TRANSITIONS satisfies Record<PipelineStep,…>`). Also scrub the two `PIPELINE_STEP_TO_COARSE_PHASE` mentions in this file's doc-block (~lines 5, 20). If `setup({ types: { meta } })` rejects the meta slot in the pinned XState v5, fall back to typing `meta` inline on the node config (`tsc` gates either way).
  Verification: ac-02, ac-06, ac-08, anti-02, anti-03

### Wave 2 — Reimplement helper, migrate consumer, delete table
- **t2 — Reimplement + migrate + delete.** Reimplement `packages/luca-core/src/state/helpers/coarse-phase-of.ts` body as `STEP_TO_COARSE_PHASE[step]` (import from `../machine/pipeline-machine.ts`; no cycle). Migrate the one raw-table reader `packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts` (~lines 405-407 + the import) to `coarsePhaseOf(from)`/`coarsePhaseOf(to)`. Remove the `PIPELINE_STEP_TO_COARSE_PHASE` barrel re-export from `state/index.ts`. DELETE `packages/luca-core/src/state/configs/coarse-phase-map.ts`.
  Verification: ac-01, ac-03, ac-07, anti-05
- **t3 — Demote doc annotation.** Add a one-line doc comment to `STAGE_TOOL_MATRIX`, `STEP_ARTIFACTS`, `BUDGET_BY_COMPLEXITY`, `RELAXATION_PATHS` noting each is data referenced by machine state (not control flow). NO logic/value change.
  Verification: anti-04

### Wave 3 — Tests
- **t4 — Derivation-lock + drift tests.** Add a test asserting `coarsePhaseOf(step)` equals the machine `getMeta()`-derived phase across the 13-step set (locks the derivation to the golden output). Add an explicit golden-snapshot test of `STEP_TO_STATE_VALUE` (13 entries) as a tighter direct drift guard. Add a guard asserting `PIPELINE_STEP_TO_COARSE_PHASE` is no longer exported from the state barrel. Update the `PIPELINE_STEP_TO_COARSE_PHASE` mention in the `pipeline-machine.graph.test.ts` header comment (~line 7). Keep `coarse-phase-of.test.ts` (the 13-case golden) UNCHANGED.
  Verification: ac-04, ac-05, ac-12
- (the existing `coarse-phase-of.test.ts` golden is the primary zero-behavior-change gate — do NOT edit it)

### Wave 4 — Gate
- **t5 — Gate green.** `bunx --bun tsc --noEmit` exit 0; `bun test packages/luca-core` green (coarse-phase-of, parity, graph, budget); the stage-gate hook test (`handle-stage-gate-hook.test.ts`) green.
  Verification: ac-09, ac-10, ac-11, anti-01

## Verification Criteria
- **ac-01**: `PIPELINE_STEP_TO_COARSE_PHASE` no longer exists in source — `grep -rn "PIPELINE_STEP_TO_COARSE_PHASE" packages/*/src` returns 0.
- **ac-02**: each of the 5 top-level machine nodes carries a `meta.coarsePhase` label.
- **ac-03**: `coarse-phase-of.ts` derives from the machine map — it no longer imports the raw table.
- **ac-04**: `coarse-phase-of.test.ts` (the 13-case golden mapping) passes unchanged.
- **ac-05**: a derivation-lock test asserts `coarsePhaseOf(step)` equals the machine `getMeta()` phase across the 13-step set.
- **ac-06**: `STEP_TO_STATE_VALUE` is derived from `pipelineMachine.states` (no `PIPELINE_STEP_TO_COARSE_PHASE` dependency); the parity + graph tests stay green, proving byte-identical output.
- **ac-07**: `luca-state-advance.ts` uses `coarsePhaseOf` — `grep "PIPELINE_STEP_TO_COARSE_PHASE" packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts` returns 0.
- **ac-08**: a module-load assertion fails fast if any step yields an invalid `CoarsePhase` (a runtime backstop; compile-time exhaustiveness remains via `STEP_TRANSITIONS satisfies`).
- **ac-09**: the stage-gate hook test (`handle-stage-gate-hook.test.ts`) passes.
- **ac-10**: `bun test packages/luca-core` passes.
- **ac-11**: `bunx --bun tsc --noEmit` exits 0.
- **ac-12**: an explicit golden-snapshot test of `STEP_TO_STATE_VALUE` (13 entries) passes (direct drift guard).
- **anti-01**: MUST NOT edit `coarse-phase-of.test.ts` — `git diff` shows the 13-case golden test unchanged (the zero-behavior-change guarantee).
- **anti-02**: MUST NOT drift `STEP_TO_STATE_VALUE` output — the parity + graph tests stay green (they consume it).
- **anti-03**: MUST NOT add any guard or action via the `meta` change — `meta` is non-structural; `toIs` stays the sole edge guard (the parity test stays green).
- **anti-04**: MUST NOT change the DATA of the 4 demote tables — only doc comments; `STAGE_TOOL_MATRIX`/`STEP_ARTIFACTS`/`BUDGET_BY_COMPLEXITY`/`RELAXATION_PATHS` values unchanged.
- **anti-05**: MUST NOT modify `checkPipelineGuard` or `configs/pipeline-transitions.ts` — `git diff` shows both unchanged.

## Deliverables
- **D1**: `PIPELINE_STEP_TO_COARSE_PHASE` deleted; coarse phase derived from the machine via `getMeta()` → ac-01, ac-02, ac-03, ac-06
- **D2**: zero behavior change — golden mapping preserved → ac-04, ac-05, ac-07, ac-12, anti-01
- **D3**: the 4 tables demoted (data referenced by machine state; no logic change) → anti-04
- **D4**: gate green, no parity regression → ac-09, ac-10, ac-11, anti-02, anti-03, anti-05

## Notes / Decisions (locked from research)
- Migrate the `luca-state-advance.ts` raw-table reader BEFORE deleting the table (else the barrel import breaks the build).
- `coarsePhaseOf` stays the sole public surface; consumers (stage-gate hook, continuation-messages, context-refresher) are untouched.
- `CoarsePhase` enum stays (return type + `STAGE_TOOL_MATRIX` key).
