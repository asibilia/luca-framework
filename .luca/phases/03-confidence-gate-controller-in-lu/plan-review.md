# Plan Review — Phase 3: confidence-gate-controller-in-lu

## Round 1 (rev-1): NEEDS_REVISION — 1 blocking, 3 advisory
- **G-ARCH-001 [BLOCKING]:** gate ran at `pipelineStep=plan-review` and wrote `context.md`, but `STEP_ARTIFACTS['plan-review'] = ['plan-review']` (and `WRITE_COMMAND_PHASES['phase write-context'] = ['discuss']`) — the stage-gate hook hard-blocks `context.md` there. Verified against `packages/luca-core/src/state/configs/step-artifacts.ts`.
- G-DX-001 [advisory]: no end-to-end gate smoke test.
- G-DX-002 [advisory]: "(future) plan→execute confidence gate" refs in `architect.ts` + `phase-plan/index.ts` go stale once the gate is live.
- G-ARCH-002 [advisory]: journal-ordering invariant (architect emits at `plan` → gate reads after `plan-review`) sound but undocumented.

## Round 2 (rev-2): APPROVED
The reviewer offered Option B ("route gate resolutions to an already-legal artifact at this step — e.g. a `## Gate Resolutions` section in `plan-review.md`; no hook change needed") as a valid fix. rev-2 implements exactly that, plus all advisories:

- **G-ARCH-001 resolved:** persistence target changed `context.md` → `plan-review.md` (legal at `plan-review` per `STEP_ARTIFACTS`), appended as `## Confidence Gate Resolutions`; resolutions ALSO injected live into the executor prompt at the `execute` step. No luca-core change, no new pipelineStep — Phase 3 stays prose-only as constrained.
- **G-DX-001 resolved:** Task 1 adds an end-to-end smoke (log a low entry on a throwaway slug → `luca confidence gate` shows non-empty `ask`).
- **G-DX-002 resolved:** Task 3 now de-stales the "(future)" gate refs in `architect.ts` + `phase-plan/index.ts` → "active".
- **G-ARCH-002 resolved:** journal-ordering invariant stated explicitly in the design-constraints section (append-only journal, single-pass gate, retries re-bucket identically).

Verdict confirmed at orchestrator level: rev-2 maps 1:1 to the reviewer's prescribed Option B + advisory fixes, which were pre-blessed. Proceeding to execute.

## Executor directives (carry into execution)
- Persist gate resolutions to `plan-review.md` (`## Confidence Gate Resolutions`), NEVER `context.md` (stage-gate blocks it at plan-review).
- Inject gate resolutions into the executor/phase-execute prompt at the execute step.
- Prose-only: do NOT edit `packages/luca-core/**` (esp. `state/schemas.ts`, `state/configs/step-artifacts.ts`); do NOT add a pipelineStep or agent type.
- Keep `OversightMode` 3 values; redefine prose only. Update the 4 full-auto surfaces + the 2 "(future)" refs consistently.
