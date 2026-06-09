# Audit — architecture

## Verdict
APPROVE

## Summary
The gate is correctly placed, the skill/command are semantically consistent, and the `plan-review.md` write target is confirmed legal; one medium-severity double-append edge case exists in the multi-round plan-review loop, and one low-severity inconsistency in the command's `*(gate)*` row legibility warrants tracking.

## Findings

- **[SHOULD-FIX]** Double-append of `## Confidence Gate Resolutions` in the multi-round plan-review loop
  - File: `packages/luca-tools/src/artifacts/skills/lu/index.ts` lines 86, 111–116
  - File: `packages/luca-tools/src/artifacts/commands/lu.ts` lines 60–61, 77
  - Detail: `pipeline-transitions.ts` permits `plan-review → plan → plan-review` cycling. The plan doc correctly notes that a `plan-review → plan` retry *before* APPROVED re-buckets identically (harmless). However, if the orchestrator somehow re-routes back through `plan-review` *after* APPROVED (and the gate already ran and appended), a second gate pass would append a second `## Confidence Gate Resolutions` section with potentially different researcher answers or re-surfaced `ask` items. The plan document only covers the pre-approval retry path. The transition table makes the post-approval loop-back mechanically legal (plan-review → plan is an edge).
  - Suggestion: Add an idempotency guard at gate sub-step 3 (persist resolutions): before appending, check whether `## Confidence Gate Resolutions` already exists in `plan-review.md`. If it does, skip the append (or overwrite the existing section rather than appending). A one-line Read-then-grep check before the Edit call suffices. Document this guard explicitly in the prose.
  - Cross-phase: false

- **[SHOULD-FIX]** Command's `*(gate)*` pseudo-row is invisible to a resume-from-mid-flight reader
  - File: `packages/luca-tools/src/artifacts/commands/lu.ts` lines 60–61
  - Detail: The pipeline table in `/lu` is also consulted when the orchestrator resumes a mid-flight run (Step 0 branches to "Pipeline loop" and re-reads the table). The `*(gate)*` row has no `pipelineStep` value — an orchestrator resuming at `pipelineStep === "plan-review"` (post-plan-reviewer, pre-gate) has no way to determine from the table alone whether the gate already ran. This is recoverable only by reading `plan-review.md` and checking for the `## Confidence Gate Resolutions` section, but the command prose does not instruct the resuming orchestrator to do this. The skill (`lu/index.ts`) has the same gap — the pipeline loop table has no resume-guard for the gate sub-step.
  - Suggestion: Add a parenthetical to the `plan-review` row in both the skill and command: "On resume at this step, read `plan-review.md` first — if it already contains `## Confidence Gate Resolutions`, skip the gate and advance to `execute` directly." This makes the resume path deterministic without a new pipelineStep.
  - Cross-phase: false

- **[NOTE]** Gate `ask` items pause `full-auto` but oversight-mode interplay is asymmetric
  - File: `packages/luca-tools/src/artifacts/skills/lu/index.ts` lines 137–139
  - File: `packages/luca-tools/src/artifacts/commands/lu.ts` lines 84–86
  - Detail: In `full-auto`, `ask` items pause. In `checkpoint`, `ask` items pause AND the orchestrator also pauses after plan-review (post-gate) for user confirmation. This means in `checkpoint` mode the user sees: (a) gate `ask` question(s), (b) gate `research` spawns, (c) plan-review checkpoint pause — all within the same step. The prose correctly describes this sequence but does not make the ordering of (a)+(b) vs. (c) explicit. If a user expects the checkpoint pause to precede the gate questions, the experience may surprise them.
  - Cross-phase: false

- **[NOTE]** `execute/progress` not in `STEP_ARTIFACTS` for `execute` step (pre-existing, not introduced here)
  - File: `packages/luca-core/src/state/configs/step-artifacts.ts` line 48
  - Detail: `STEP_ARTIFACTS['execute'] = ['execute/summary', 'execute/wave']` — `execute/progress` (the append-only wave progress ledger) is absent. The execute mode body (`execute.ts`) references `execute/progress.jsonl` as a legal artifact. This is a pre-existing gap not introduced by this phase but worth noting as technical debt if the hook strictly enforces this table for progress writes.
  - Cross-phase: false

## Verified locations (evidence for APPROVE)

1. **Gate placement**: `lu/index.ts:86` — `plan-review` row explicitly says "After the reviewer returns `APPROVED`, run the **Confidence Gate** (see below) before advancing." `lu.ts:60` mirrors this with the inline `*(gate)*` row positioned between `plan-review` and `execute`. Confirmed unambiguous for an LLM orchestrator.

2. **`plan-review.md` write legality**: `step-artifacts.ts:47` — `'plan-review': ['plan-review']` confirmed. The gate sub-step 3 in both surfaces correctly targets `plan-review.md` and explicitly forbids `context.md`. This resolves G-ARCH-001 from Round 1.

3. **Skill/command oversight-mode consistency**: `lu/index.ts:137–139` and `lu.ts:84–86` both define: `full-auto` = gate `ask` + CRITICAL safety only; `checkpoint` = post-gate pause after plan-review + verify + learn; `human-in-loop` = every step. Both match `triage.ts:133–134` and `execute.ts:92`. Four surfaces consistent.

4. **De-staling verified**: `architect.ts:353` — "(future)" removed, now reads "active plan→execute confidence gate". `phase-plan/index.ts:270` — now reads "active confidence gate that runs after plan-review and before execute begins". Both updated correctly.

5. **Journal-ordering invariant**: `lu/index.ts` plan doc (plan-review.md:16) explicitly states the invariant. The gate is called only after `plan-reviewer` returns (architect fully exited at `plan`, journal fully populated). Gate is single-pass; `plan-review → plan` retries re-bucket identically per append-only semantics.

## Counts
- MUST_FIX: 0
- SHOULD_FIX: 2
- NOTE: 2
- CROSS_PHASE: 0
