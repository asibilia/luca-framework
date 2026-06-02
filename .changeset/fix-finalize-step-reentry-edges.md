---
"@alecsibilia/luca": patch
---

Fix the pipeline state machine: restore missing re-entry edges and replace the `milestone`/`complete` steps with a terminal `finalize` step.

The transition table only encoded the happy path, so transitions the mode instructions document were illegal and rejected at runtime by `isLegalTransition`:

- **`review → execute`** (MUST-FIX/SHOULD-FIX iteration) was missing — a blocking review finding could not loop back to fix and was silently carried forward to `learn`.
- **`finalize`'s gap-detection / postmortem re-entries** (`→ execute`, `→ review`) were dead.

It also promoted `milestone` and `complete` to pipelineSteps, conflating a work-organization concept (a milestone = a set of phases) with the per-phase lifecycle — leaving `finalize` with no real home (it squatted on `learn`/REVIEWING, where the stage-gate blocks the commits and `gh pr create` that PR creation needs).

This collapses the machine to 13 steps with `finalize` as the terminal mode:

- Steps: `idle, triage, research, discuss, architect, plan, plan-review, execute, checks, verify, review, learn, finalize`.
- Transitions: `review: ['learn','execute']`, `learn: ['plan','finalize']`, `finalize: ['idle','execute','review']`.
- `finalize → FINALIZING` coarse phase (permits commits — fixes the latent PR-creation block) and resets the run to `idle`; one run finalizes one milestone (fresh `/lu` for the next).
- Legacy `state.json` with `milestone`/`complete`/`cleanup` folds to `finalize` via `LEGACY_PIPELINE_STEP_MAP`, so in-flight state still parses.

Also conforms the coarse mode bodies to the fine table (`research → discuss`, `architect → plan`, `triage → research`) so they no longer self-advance into illegal transitions, makes `finalize`'s entry-time advance idempotent (advance only if still at `learn`), and sweeps the instruction surface plus step-keyed tables (coarse-phase map, step artifacts, context-refresher, continuation-messages) to the new vocabulary.
