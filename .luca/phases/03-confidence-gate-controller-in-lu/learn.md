# Learnings — Phase 3: confidence-gate-controller-in-lu

## Outcome
The confidence gate is wired into `/lu` (skill + command): runs after plan-review→APPROVED, routes `auto`/`research`/`ask`, persists resolutions to `plan-review.md`, injects them into the executor; `full-auto` redefined across 4 surfaces as "pauses only on gate `ask` items + CRITICAL safety". tsc+build PASS; verifier PASS (6/6 + coherence); prose-only (zero luca-core change). **The feature's core behavior is in place.**

## Carry-forward to Phase 4 (review findings — could NOT be fixed in-phase, see pitfall below)
**Must-fix (DX review):**
- **M1:** in `skills/lu/index.ts`, the `finalize` step row is orphaned BELOW the gate sections (after line ~130), outside the step table (which ends at `learn`). The orchestrator reading the table won't reach `finalize` → pipeline never terminates. Fix: move the `finalize` row back into the table immediately after the `learn` row; delete the orphan.
- **M2:** the gate `ask` handling (lu skill ~L109 + command) says "surface a question / wait" but names NO tool → an LLM may emit prose and race ahead. Fix: specify the **AskUserQuestion** tool and "block until answered."

**Should-fix:**
- S1 (idempotency): guard the `## Confidence Gate Resolutions` append against a `plan-review→plan→plan-review` re-run double-append (check section exists first).
- S2 (resume): note on the `plan-review` row that a resuming orchestrator should check `plan-review.md` for the resolutions section before re-running the gate.
- S3 (all-auto): handle empty buckets (counts all 0 → proceed to execute, don't stall).
- S4 (researcher template): give the `research`-bucket researcher spawn a concrete prompt template.
- S5 (command parity): the `/lu` command gate section omits `luca phase current` + "use Edit not Write" — add for parity with the skill.

## Net-new pitfall (persisted — genuine framework bug)
- **v13 pipeline: `review` cannot loop back to `execute`.** The transition table allows only `review → learn`, but the `lu` skill instructs "on must-fix, loop back to execute." Contradiction: must-fix review findings have NO legal in-phase re-entry to execute (and the stage-gate also blocks code edits in REVIEWING). Workaround used: fold the fixes into the next phase's execute step. Real fix (future): either add a `review → execute` transition, or change the lu skill to route must-fix via a legal path (e.g. review→learn→plan re-cycle, or finalize's gap re-entry).

## Notes
- Gate persists to `plan-review.md` (not context.md) because the stage-gate permits only `plan-review.md` at `pipelineStep=plan-review` (`STEP_ARTIFACTS`).
