PERSPECTIVE: correctness + simplification
VERDICT: APPROVE

## Correctness (Q1–Q4)

Verified against the actual source; no MUST-FIX found.

- **Q1 — stateValueForStep parity.** `STEP_STATE_VALUE_INDEX` (pipeline-machine.ts:316–330) walks `pipelineMachine.states`: for a node with zero `childKeys` it emits the bare key (`idle → 'idle'`), otherwise `{ [parentKey]: childKey }`. The atomic `idle` leaf is correctly distinguished from the 4 compound parents by `Object.keys(node.states).length === 0`. Output is byte-pinned by the golden at pipeline-machine.derivation.test.ts:42–56 (all 13 entries) — no step can be mis-parented.

- **Q2 — getMeta label extraction is robust.** For any resolved leaf, the active-node set is {root, [parent], leaf}; only the top-level parent (or the `idle` leaf) carries `meta.coarsePhase`, and no child leaf carries one. So `Object.values(metas).find(m => m?.coarsePhase)` (pipeline-machine.ts:365) has exactly one candidate — it cannot pick the wrong meta, and the `m?.` guard tolerates meta-less entries. A valid step cannot yield `undefined`; if it ever did, the module-load `throw` (369–371) fails fast. Assertion is correct.

- **Q3 — no module-load ordering hazard.** Definition order is machine (169) → `STEP_STATE_VALUE_INDEX` IIFE (316) → `STEP_TO_STATE_VALUE` (343) → `STEP_TO_COARSE_PHASE` (359). Each const references only symbols declared above it; no TDZ risk. Runtime confirms (luca-core 1011/0).

- **Q4 — no consumer breakage.** `coarsePhaseOf` (coarse-phase-of.ts:19–21) keeps its exact public signature `(PipelineStep) => CoarsePhase`, just indexing the derived table. Values are pinned identical by the literal golden in coarse-phase-of.test.ts:10–24. Grep for `PIPELINE_STEP_TO_COARSE_PHASE` across `packages/` returns zero matches — the demoted symbol has no lingering importers, and the barrel-export guard (derivation.test.ts:64–72) locks that.

## Simplification (Q5–Q6)

- **Q5 — meta approach is justified, not over-built.** Spec correction #12 mandates `getMeta()`. It is also genuinely the cleaner route: `meta.coarsePhase` carries the canonical uppercase `CoarsePhase` value directly, whereas the parent-key alternative (`'planning'`) would need a separate key→CoarsePhase casing/mapping step. The two-const structure (state-value index, then resolveState+getMeta) is the minimal amount to derive both `STEP_TO_STATE_VALUE` and `STEP_TO_COARSE_PHASE` from one source. No simpler equivalent that satisfies the spec.

FINDINGS:
- [NOTE] The derivation-lock loop (derivation.test.ts:27–37) is mildly tautological: it re-runs the same `Object.values(metas).find(m => m?.coarsePhase)?.coarsePhase` expression that builds `STEP_TO_COARSE_PHASE` and compares it to `coarsePhaseOf`, so both sides share the derivation logic. Its real value is guarding against a future hand-reimplementation of `coarsePhaseOf` that diverges from the machine — a weak but non-zero guard. It is fully backstopped by two non-tautological golds: the literal step→coarse-phase table (coarse-phase-of.test.ts:10–24) and the `STEP_TO_STATE_VALUE` byte snapshot (derivation.test.ts:42–56). Coverage is adequate; no change required.
- [NOTE] `STEP_STATE_VALUE_INDEX` and the barrel-guard's runtime-assembled `demotedSymbol` (derivation.test.ts:67) are both clear and self-documenting; the assembled-token trick correctly keeps the source-scan grep from self-matching.

CONSOLIDATED:
  MUST_FIX_COUNT: 0
  SHOULD_FIX_COUNT: 0
  NOTE_COUNT: 2
  CROSS_PHASE_COUNT: 0
