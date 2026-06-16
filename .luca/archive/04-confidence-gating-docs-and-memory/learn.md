# Learnings — Phase 4: confidence-gating-docs-and-memory

## Outcome
Final phase complete. Applied the Phase-3 gate-controller review fixes (M1 orphaned-finalize-row, M2 AskUserQuestion, S1–S5 robustness), the Phase-2 CLI cleanups, and wrote `docs/decisions/confidence-gated-lu.md` + 2 follow-up backlog todos. tsc+build PASS (skills:41, commands:17); verifier PASS (12/12, M1 confirmed); DX review APPROVE (0 must-fix). Zero luca-core changes.

## Trivial polish carried out of the pipeline (DX should-fix, not worth a re-cycle)
- `commands/lu.ts` — the `*(gate)*` pseudo-row in the step table is not a real `pipelineStep`; a table-driven orchestrator could try `luca state advance --to-step *(gate)*`. Drop the row (the `plan-review` row already references the gate). Fix post-pipeline.
- `skills/lu/index.ts:86` — tighten the resume-note modal from advisory ("should re-use") to imperative ("must re-use — do NOT re-run the gate").

## Feature summary (4 phases delivered)
1. **Substrate** — `researchable`/`resolution` schema fields, pure `selectConfidenceGateActions()`, `luca confidence gate` CLI.
2. **Emission** — `luca confidence log --researchable/--resolution`; architect mode-agent emits per-decision confidence at plan time.
3. **Controller** — gate runs at tail of plan-review; routes auto/research/ask; `ask` = sole full-auto pause; persists to plan-review.md; injects to executor; `full-auto` redefined across 4 surfaces.
4. **Docs/hardening** — review-fixes + decision doc + follow-ups.

## Net-new process learning (persisted)
- Dogfooding the framework on itself surfaced a real framework bug (review→execute illegal) AND a structural-edit hazard (inserting a section into a markdown step table orphaned the `finalize` row) — both caught by the pipeline's own DX reviewer. The multi-perspective review step earns its keep on prose/instruction edits, not just code.
