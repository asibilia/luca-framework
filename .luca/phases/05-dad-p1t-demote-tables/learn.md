# Learnings — DAD-P1t (demote/delete redundant tables)

Phase 5 of the Luca "Deterministic Agentic Development" migration. Deleted the
hand-maintained `PIPELINE_STEP_TO_COARSE_PHASE` table and re-derived the
step→coarse-phase mapping from the XState machine, which already encodes the
structure as parent states. First-pass clean: 0 must-fix, 0 should-fix,
luca-core 1011/0, tsc 0, coarse-phase golden 14/0.

---

## pattern: derive-from-machine behind a stable accessor seam

**Type:** pattern · **Confidence:** HIGH

- **Conjectured:** A hand-maintained lookup table (`PIPELINE_STEP_TO_COARSE_PHASE`)
  is the natural home for the step→coarse-phase mapping, and deleting it means a
  fan-out refactor across every consumer (stage-gate hook, continuation-messages,
  context-refresher, state-advance).
- **Refuted by:** The XState machine already ENCODED the same structure — the 5
  top-level nodes are exactly the coarse phases, with steps as their child leaves.
  The table was a duplicate of information the machine held. And the fan-out never
  happened: every consumer already went through one public accessor,
  `coarsePhaseOf(step)` (`coarse-phase-of.ts:19`).
- **Learned:** When a hand-maintained table duplicates structure a state machine
  already holds, DERIVE the table from the machine instead of maintaining it in
  parallel. Concretely: label each parent node with `meta.coarsePhase`
  (`pipeline-machine.ts:212–286`), then at MODULE LOAD build an O(1) map by
  rehydrating each step's `StateValue` via `resolveState({value,context}).getMeta()`
  and reading back the one non-undefined `coarsePhase` label
  (`pipeline-machine.ts:359–375`). Keep the pre-existing public accessor
  (`coarsePhaseOf`) as a STABLE SEAM and reimplement only its body — it now indexes
  the derived map. Because every consumer already funneled through that seam, the
  deletion collapses to a one-function-body change plus one raw-table-reader
  migration (`STEP_TO_STATE_VALUE`, which was itself built from the deleted table —
  reworked to walk `pipelineMachine.states` structurally), NOT a fan-out refactor.
- **Criterion now:** Prove zero-behavior-change by keeping the pre-existing
  hardcoded-literal golden test UNCHANGED (`coarse-phase-of.test.ts:10–24`, an
  anti-edit constraint). That test — asserting `coarsePhaseOf(step)` against
  13 hardcoded literals (idle→IDLE … finalize→FINALIZING) — is the REAL oracle: it
  proves machine-derived == golden mapping. A machine-vs-machine derivation-lock
  test (both sides read the same `getMeta()`) is TAUTOLOGICAL in isolation — keep it
  only as a weak extra guard against a future hand-reimplementation, never as the
  zero-behavior-change proof. Also add a fail-fast module-load `throw` if any step
  yields no `coarsePhase`, so a machine/meta desync breaks at import, not runtime.

**When to use:** a lookup table duplicates a hierarchy/graph another authority
(state machine, schema, config tree) already encodes, AND consumers reach it
through a single accessor (or one can be introduced first).

**When NOT:** the table encodes information NOT present in the machine (genuine
independent data), or no stable seam exists and introducing one is riskier than
keeping the duplication.

---

## pitfall: an absence-test that names the symbol self-defeats a grep-for-zero deletion probe

**Type:** pitfall · **Confidence:** HIGH

- **Conjectured:** The natural way to lock a deletion is a test asserting the
  symbol's absence from the barrel, e.g.
  `expect(barrel).not.toHaveProperty('PIPELINE_STEP_TO_COARSE_PHASE')`.
- **Refuted by:** The deletion's acceptance criterion (ac-01) is a
  grep-for-zero probe: `grep -rn 'PIPELINE_STEP_TO_COARSE_PHASE' packages/*/src == 0`.
  A test that NAMES the symbol as a string literal re-introduces the contiguous
  token into a `src/*.test.ts` file, so the grep probe finds it and FAILS — the
  guard defeats the very probe that verifies the deletion. grep also doesn't
  distinguish code from comments, so a lingering doc-comment mention of the deleted
  `coarse-phase-map.ts` (in `continuation-messages.ts`) would trip it too.
- **Learned:** When a deletion is verified by a source-scan grep, NO artifact under
  the scanned tree may contain the token as a contiguous literal — including the
  absence-guard test AND comments/docs.
- **Criterion now:** Write absence-guards WITHOUT the literal. Assemble the token at
  runtime — `['PIPELINE','STEP','TO','COARSE','PHASE'].join('_')`
  (`pipeline-machine.derivation.test.ts:67`) — and assert
  `expect(Object.keys(barrel)).not.toContain(demotedSymbol)`, an export-key-set
  comparison. Separately SCRUB every comment/doc mention (repoint dangling
  references to the new source of truth, e.g. the machine meta) so the grep probe
  reads clean. Verify by running the exact grep before declaring done.

---

## Signal Synthesis

Derived solely from the orchestrator-injected `<signal-digest>`.

- **Recurring failure themes:** None. Single positive `satisfaction:outcome`
  signal — checks/verify/review all passed first pass with no fix loop
  (luca-core 1011/0, tsc 0, coarse-phase golden 14/0). No failure or low-confidence
  signals present.
- **Satisfaction valence trends:** Uniformly positive across checks, verify, and
  review steps. Zero must-fix, zero should-fix — a clean phase.
- **Cross-cutting patterns:** Two design moves (surfaced in the digest headline and
  plan-review catch) generalize beyond this phase and are promoted to the pattern
  and pitfall above: (1) derive-not-duplicate behind a stable accessor seam,
  proven by an unchanged hardcoded-literal golden; (2) the self-defeating
  absence-test caught at PLAN-REVIEW time (before it shipped), which is the ideal
  place to catch it — the guard was reshaped into a runtime-assembled export-key
  assertion rather than a named-literal property check.
