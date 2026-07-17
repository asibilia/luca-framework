---
id: dad-p1b-swap-write-path
title: DAD-P1b — Repoint `luca state advance` to the stateless machine
trace_id: DAD-P1b
complexity: COMPLEX
waves:
  - wave: 1
    tasks: [t1]
  - wave: 2
    tasks: [t2]
  - wave: 3
    tasks: [t3, t4]
  - wave: 4
    tasks: [t5]
---

# DAD-P1b — Repoint `luca state advance` to the Stateless Machine

Goal: make the P1a XState machine the LIVE control-flow authority at the persisted state mutation, preserving backward-compat and the cold-process model. Research: Muninn `research:dad-p1b-swap-write-path` (repo vault). Locked decisions (from research): swap the MUTATION (`luca-state-advance.ts`) to reuse `machineVerdict` (drop-in — it takes `PipelineGuardInput`); LEAVE the PreToolUse hook on `checkPipelineGuard` (fail-open advisory; parity proves they agree; keeps rich messages); preserve counter fields but add NO increment logic (that is P1c); `pipelineStep` stays a flat string from `stateValueToLeaf(next.value)`; no persisted snapshot / no `createActor` (P2).

## Tasks

### Wave 1 — Export seam
- **t1 — Export `machineVerdict`.** Add `machineVerdict` + the `MachineVerdict` type to `packages/luca-core/src/state/index.ts` (re-exports through the top barrel `src/index.ts`, so `@alecsibilia/luca-core` + `/state` both resolve; no `package.json` exports change). Confirm no import cycle.
  Verification: ac-01, ac-13

### Wave 2 — Swap the mutation
- **t2 — Repoint the mutator.** In `packages/luca-cli/src/write-surface/handlers/luca-state-advance.ts` (~lines 118-132) replace the `isLegalTransition(from,to)` gate + generic throw with `machineVerdict({ currentStep: from, requestedStep: to, complexity, oversight })` (read `complexity`/`oversight` off `s`). On `!allowed`, throw an `Error` whose message includes `verdict.reason` AND retains the substring `illegal` for the illegal-transition case (and enumerates allowed next steps from `PIPELINE_TRANSITIONS[from]`). On allow, `return { ...s, pipelineStep: verdict.resultingStep }`. Extract the pure decision (verdict-call + throw/return-step) into a small testable seam. Do NOT import `checkPipelineGuard`; do NOT add counter increments; do NOT create an actor.
  Verification: ac-02, ac-03, ac-04, ac-05, ac-06, ac-07, anti-01, anti-02

### Wave 3 — Tests
- **t3 — Extend the handler test.** In `packages/luca-cli/src/write-surface/handlers/luca-state-advance.test.ts`: keep legal-advance / illegal-reject / loop-back / field-preservation / bootstrap cases. Add: illegal error text carries the reason code; a `plan→plan` case yields `same-step-no-op` (distinct reason from a cross-step `illegal-transition`); a legal self-loop `research→research` is ACCEPTED; the 5 counters + 6 caps survive an advance unchanged.
  Verification: ac-04, ac-05, ac-06, ac-08, ac-09
- **t4 — Equivalence test.** Add a table-driven test asserting the handler's pure decision seam matches `machineVerdict` (accept/reject + resulting step) over the pair set — proving the swap is a true drop-in.
  Verification: ac-10

### Wave 4 — Gate
- **t5 — Gate green.** `bunx --bun tsc --noEmit` exit 0; `bun test packages/luca-core` green (P1a parity untouched); `bun test packages/luca-cli` green (handler + equivalence).
  Verification: ac-11, ac-12, ac-13, anti-03, anti-04, anti-05, anti-06

## Verification Criteria
- **ac-01**: `machineVerdict` is importable from `@alecsibilia/luca-core` (a `grep` of `state/index.ts` shows the re-export).
- **ac-02**: the mutator in `luca-state-advance.ts` calls `machineVerdict` (grep shows the call).
- **ac-03**: the mutator no longer calls `isLegalTransition` for the transition gate (grep shows that direct-gate call removed from the handler).
- **ac-04**: an illegal cross-step advance throws an error whose text contains the substring `illegal`.
- **ac-05**: a `plan→plan` advance is rejected; its reason code is `same-step-no-op` (not `illegal-transition`).
- **ac-06**: a `research→research` advance is ACCEPTED (the legal self-loop is not rejected as a same-step no-op).
- **ac-07**: a legal advance persists `pipelineStep` equal to the requested `to` step (flat string).
- **ac-08**: an advance leaves every iteration counter/cap field byte-identical (11 fields preserved).
- **ac-09**: advancing from an absent `state.json` bootstraps `idle→triage`.
- **ac-10**: the equivalence test asserts the handler decision matches `machineVerdict` (accept/reject + resulting step) for its pair set.
- **ac-11**: `bun test packages/luca-core` passes (P1a parity gate still green).
- **ac-12**: `bun test packages/luca-cli` passes (handler + equivalence tests).
- **ac-13**: `bunx --bun tsc --noEmit` exits 0.
- **anti-01**: MUST NOT modify the PreToolUse hook — `git diff` shows `packages/luca-tools/src/hooks/pipeline-guard/handler.ts` unchanged (it stays on `checkPipelineGuard`).
- **anti-02**: MUST NOT modify `checkPipelineGuard` — `git diff` shows `orchestration/pipeline-guard.ts` unchanged (still the hook's message source).
- **anti-03**: MUST NOT add counter-increment logic — `git diff` shows `packages/luca-core/src/state/machine/pipeline-machine.ts` unchanged (no `assign`/`incFixLoop`; that is P1c).
- **anti-04**: MUST NOT modify the P1a parity/graph tests — `git diff` shows `pipeline-machine.parity.test.ts` + `pipeline-machine.graph.test.ts` unchanged.
- **anti-05**: MUST NOT introduce a persistent actor — `grep -rn "createActor" packages/luca-cli/src` returns 0 (cold-process invariant).
- **anti-06**: MUST NOT break the state schema — `git diff` shows `packages/luca-core/src/state/schemas.ts` unchanged.

## Deliverables
- **D1**: machine is the live verdict authority at the persisted mutation (drop-in `machineVerdict`) → ac-01, ac-02, ac-03, ac-07
- **D2**: reason-code richness added without breaking callers → ac-04, ac-05, ac-06
- **D3**: no schema break, counters preserved, cold-process → ac-08, ac-09, anti-03, anti-05, anti-06
- **D4**: parity preserved + equivalence proven → ac-10, ac-11, ac-12, ac-13

## Notes / Decisions (locked from research)
- Hook stays `checkPipelineGuard` (mutation-only authority in P1b); single-source message retire = P2.
- Export via existing `/state` subpath (no `package.json` change).
- Success CLI output stays stable; only the error path gains the reason code.
