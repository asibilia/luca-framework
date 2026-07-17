---
id: dad-p1c-fixloop-budget
title: DAD-P1c — Fix-loop budget guard (advisory-first)
trace_id: DAD-P1c
complexity: COMPLEX
waves:
  - wave: 1
    tasks: [t1]
  - wave: 2
    tasks: [t2, t3]
  - wave: 3
    tasks: [t4, t5, t6]
  - wave: 4
    tasks: [t7]
---

# DAD-P1c — Fix-Loop Budget Guard (Advisory-First)

Goal (headline payoff): make the schema-declared-but-never-incremented iteration budget LIVE as machine `assign` actions on the 3 rework edges, written back to `state.json`, surfaced via a new `fixloop.counted` telemetry kind — all ADVISORY (log, never block) so the 169-pair parity stays green. Research: Muninn `research:dad-p1c-fixloop-budget`. Parity-safety: the increment is an `assign` ACTION (mutates `context`, not `.can()`/`next.value`), NOT a blocking guard.

Locked decisions: **3 edges** (checks→execute, verify→checks, review→execute); `resetFixLoop` on the **forward-exit** edges (checks→verify, verify→review, review→learn); `withinFixBudget` guard authored+tested but **edge-unwired** (default `budgetMode:'advisory'`); telemetry emits in the **CLI handler** (core is pure); resolve the telemetry cap from `state.complexity` via `BUDGET_BY_COMPLEXITY` at emit time.

## Tasks

### Wave 1 — Machine counters + actions
- **t1 — Machine changes** in `packages/luca-core/src/state/machine/pipeline-machine.ts` (+ new `guards.ts`, `actions.ts`). Extend `PipelineContext` with 3 counter fields (`checksFixIteration`, `verifyIteration`, `reviewIteration`), 3 cap fields (`max*`), and `budgetMode: 'advisory' | 'enforce'` (undefined ⇒ advisory). Add `incFixLoop` `assign` on the 3 rework edges as a **per-edge PARAMETERIZED action** (`{ type: 'incFixLoop', params: { counter: 'checksFixIteration' } }` etc.) — NOT keyed on `event.to` (checks→execute and review→execute share target `execute` but different counters; `fromLeaf` is not available inside an `assign`). Increment via nullish base: `(ctx[counter] ?? 0) + 1` (parity `parityContext()` supplies no counter fields). Add `resetFixLoop` parameterized `assign` (zeroes that loop's counter) on the 3 forward-exit edges. Author `withinFixBudget` guard (returns `true` when advisory/undefined; `counter < cap` when enforce), register it in `setup({guards})`, but do NOT wire it onto any edge (`toIs` stays the only edge guard).
  Verification: ac-01.1, ac-01.2, ac-02, ac-03, ac-04, ac-05, anti-02

### Wave 2 — Write-back + telemetry
- **t2 — Counter write-back seam.** Extend `machineVerdict` (`machine-verdict.ts`) to accept persisted counters/caps/`budgetMode` — as **ADDITIVE, OPTIONAL** input fields (undefined ⇒ advisory) so the existing 2-arg call `machineVerdict({currentStep, requestedStep})` in `parity.test.ts:40` keeps type-checking (protects anti-01). RETURN the post-transition counter value(s) from `next.context` (currently discarded) as an **optional** `counterUpdate?` — keep `{allowed, reason, resultingStep}` intact (parity-stable). Extend `decideAdvance` (`luca-state-advance.ts`) to thread persisted counters in and return `{ pipelineStep, counterUpdate? }`; the handler spreads `counterUpdate` into the atomic `mutateState` write.
  Verification: ac-07, ac-08, anti-01, anti-04
- **t3 — `fixloop.counted` telemetry.** In the handler's failure-open side-effect block, when `decideAdvance` reports a rework-edge increment, `appendTelemetry` (from `@alecsibilia/luca-core`) a `fixloop.counted` record: `meta = { edge, counterField, nextValue, budget (resolved from state.complexity via BUDGET_BY_COMPLEXITY), verdict: within|exceeded, phaseOfRollout: 'advisory' }`, `runId = state.sessionId`. No schema change (kind is `z.string()`).
  Verification: ac-09

### Wave 3 — Tests
- **t4 — `budget-guard.test.ts`.** Advisory: an over-budget rework advance (`checksFixIteration: 99`) still yields `snapshot.can(event) === true` and `transition()` gives `next.context.checksFixIteration === 100`. Enforce (explicit `budgetMode:'enforce'` context): property test over `BUDGET_BY_COMPLEXITY` tiers asserting `withinFixBudget` allows iff `counter < cap`; a cap-boundary case per (complexity × 3 edges); the zero-cap edge denies the first attempt.
  Verification: ac-06, ac-10, ac-11, ac-12
- **t5 — Handler test update.** Flip the P1b `checks→execute` preservation case: `checksFixIteration` now +1, the other 10 counter/cap fields unchanged. Add a `checks→verify` case asserting `checksFixIteration` reset to 0. Add a `fixloop.counted` telemetry-emission assertion (advisory verdict) on a rework advance.
  Verification: ac-07, ac-08, ac-09
- **t6 — Confirm structural tests unchanged.** `pipeline-machine.graph.test.ts` asserts only the `.can()`-derived edge set, `countLeaves===13`, and top-level children — NONE observe edge action names, so adding `incFixLoop`/`resetFixLoop` changes NONE of them (no snapshot exists to update). Confirm the graph test passes with zero edits; confirm the 169-pair parity test passes unchanged. Do NOT add brittle new action-name assertions.
  Verification: ac-13, ac-16

### Wave 4 — Gate
- **t7 — Gate green.** `bunx --bun tsc --noEmit` exit 0; `bun test packages/luca-core` green (parity + budget tests); the handler test green.
  Verification: ac-14, ac-15, anti-03, anti-05

## Verification Criteria
- **ac-01.1**: `PipelineContext` declares a `budgetMode` field.
- **ac-01.2**: `PipelineContext` declares the six counter/cap numeric fields (3 counters + 3 caps).
- **ac-02**: the `incFixLoop` `assign` action is attached to exactly the 3 rework edges (checks→execute, verify→checks, review→execute).
- **ac-03**: the `resetFixLoop` `assign` action is attached to exactly the 3 forward-exit edges (checks→verify, verify→review, review→learn).
- **ac-04**: a `withinFixBudget` guard is registered in `setup({guards})`.
- **ac-05**: an undefined/absent `budgetMode` is treated as advisory (a context without `budgetMode` never denies).
- **ac-06**: in advisory mode, an over-budget rework advance still returns `allowed === true` (`snapshot.can(event)` true).
- **ac-07**: a `checks→execute` advance persists `checksFixIteration` incremented by 1.
- **ac-08**: a `checks→verify` advance persists `checksFixIteration` reset to 0.
- **ac-09**: a rework-edge advance emits one `fixloop.counted` telemetry record (phaseOfRollout advisory).
- **ac-10**: in enforce mode, `withinFixBudget` returns false at `counter === cap` (unit test).
- **ac-11**: the enforce property test asserts `withinFixBudget` allows iff `counter < cap` across `BUDGET_BY_COMPLEXITY` tiers.
- **ac-12**: a zero-cap edge denies its first attempt in enforce mode (`0 < 0` false).
- **ac-13**: the 169-pair parity test (`pipeline-machine.parity.test.ts`) passes unchanged.
- **ac-14**: `bun test packages/luca-core` passes.
- **ac-15**: `bunx --bun tsc --noEmit` exits 0.
- **ac-16**: `pipeline-machine.graph.test.ts` passes unchanged after the machine changes (edge actions affect no adjacency/leaf/hierarchy assertion).
- **anti-01**: MUST NOT change the allowed/resulting/reason assertions of `pipeline-machine.parity.test.ts` — `git diff` shows that file unchanged (the advisory invariant).
- **anti-02**: MUST NOT wire any blocking guard onto a rework edge — the only edge guard remains `toIs` (a default-context advance is byte-for-byte parity-identical).
- **anti-03**: MUST NOT ship `enforce` as the default `budgetMode` — the default is advisory.
- **anti-04**: MUST NOT modify `checkPipelineGuard` or `PIPELINE_TRANSITIONS` — `git diff` shows `orchestration/pipeline-guard.ts` + `configs/pipeline-transitions.ts` unchanged.
- **anti-05**: MUST NOT change `RELAXATION_PATHS` to force enforce — `git diff` shows `configs/relaxation-paths.ts` unchanged (the enforce flip is deferred to a later slice).

## Deliverables
- **D1**: counters live as machine `assign` actions (increment + reset) written back to state → ac-01.1, ac-01.2, ac-02, ac-03, ac-07, ac-08
- **D2**: advisory-first — parity-safe, telemetry not deny → ac-04, ac-05, ac-06, ac-09, ac-13
- **D3**: enforce guard authored + tested but not the shipped default → ac-10, ac-11, ac-12, anti-03
- **D4**: gate green, no parity/structural regression → ac-14, ac-15, ac-16, anti-01, anti-04, anti-05

## Notes / Decisions (locked from research)
- resetFixLoop attachment (design left it unspecified) = forward-exit edges; caps resolved from complexity at emit time (`resolveBudgetLimits` is wired nowhere in prod today).
- Rejected alternative: the `Research/08` hand-rolled `fix-loop-guard.ts` module — the frozen `Design/01/03` machine-context approach is authoritative (P1a/P1b already shipped the XState machine).
- Deferred: the 2 extra edges (plan-review→plan, research→research), the enforce flip (gated on baseline + escape hatch), fixloop.counted on forward edges.
