---
"@alecsibilia/luca-core": minor
"@alecsibilia/luca-cli": minor
"@alecsibilia/luca-tools": patch
---

feat: deterministic agentic development — pipeline hygiene, a live fix-loop budget, graph rendering, and a persistent-runner POC (DAD P0–P2)

Deterministic phase/step transitions with a now-live fix-loop iteration budget, a graph-rendering verb, and a persistent-runner POC. Backward-compatible — no state schema break, the cold-process enforcement path is preserved. Targets the **v13.2.0** milestone.

- **DAD-P0** hygiene: excised the dead `src/iteration/*` toolkit, repaired the `iterationPlan` prose, reconciled the `architect` double-definition.
- **DAD-P1b**: `luca state advance` is driven by `decideAdvance`, with structured reason codes; the pipeline-guard hook stays a cold process on `checkPipelineGuard`.
- **DAD-P1c**: the fix-loop budget is live — `FIX_LOOP_EDGES` plus the increment/reset patches applied on the state write path, advisory-first.
- **DAD-P1d**: a `luca graph` verb emits a Mermaid `stateDiagram-v2` of the pipeline.
- **DAD-P2**: a persistent-runner POC (`luca start`/`stop`/`status`) — decision **GO**, all 5 acceptance tests pass; purely additive (cold path untouched).

Note: this changeset originally described an XState v5 statechart as the transition engine. That layer was removed before release — it was provably decision-equivalent to the 33-line `PIPELINE_TRANSITIONS` table by its own parity contract, while requiring two verdict engines to ship simultaneously. The behaviour above is unchanged; only the mechanism differs, and no released version ever carried the statechart.
