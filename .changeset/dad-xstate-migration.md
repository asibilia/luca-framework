---
"@alecsibilia/luca-core": minor
"@alecsibilia/luca-cli": minor
"@alecsibilia/luca-tools": patch
---

feat: deterministic agentic development — replace the 7 pipeline tables with one XState statechart (DAD P0–P2)

Replaces Luca's 7 hand-rolled pipeline `Record` tables with a single, visualizable XState v5 statechart used statelessly. Deterministic phase/step transitions, a now-live fix-loop iteration budget, and a persistent-runner POC. Backward-compatible — no state schema break, the cold-process enforcement path is preserved. Targets the **v13.2.0** milestone.

- **DAD-P0** hygiene: excised the dead `src/iteration/*` toolkit, repaired the `iterationPlan` prose, reconciled the `architect` double-definition.
- **DAD-P1a**: XState v5 machine + `machineVerdict` adapter + a 169-pair golden parity harness (0 mismatches); `xstate@5.32.2` added to `luca-core`.
- **DAD-P1b**: `luca state advance` is machine-driven via `decideAdvance` → `machineVerdict` (structured reason codes added); the pipeline-guard hook stays a cold process on `checkPipelineGuard`.
- **DAD-P1c**: the fix-loop budget is live as `assign` actions + a `fixloop.counted` telemetry kind, advisory-first (parity-safe).
- **DAD-P1t**: `PIPELINE_STEP_TO_COARSE_PHASE` deleted → coarse phase derived from the machine via `snapshot.getMeta()`; four tables demoted to referenced data.
- **DAD-P1d**: a `luca graph` verb emits a Mermaid `stateDiagram-v2` + machine-definition JSON.
- **DAD-P2**: a persistent-runner POC (`luca start`/`stop`/`status`) — decision **GO**, all 5 acceptance tests pass; purely additive (cold path untouched).
