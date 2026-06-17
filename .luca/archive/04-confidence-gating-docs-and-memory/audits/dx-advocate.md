# Audit — dx-advocate

## Verdict
APPROVE

## Summary
The gate controller DX is structurally correct — finalize is reachable, AskUserQuestion is specified in both surfaces, idempotency guards and all-auto fast-paths match, and the decision doc accurately describes what was built. Two minor clarity issues were found that could confuse a naive orchestrator but do not block execution.

## Verified Locations
- `packages/luca-tools/src/artifacts/skills/lu/index.ts:92` — `finalize` row exists once in the step table (M1 fix confirmed, no orphaned copy)
- `packages/luca-tools/src/artifacts/skills/lu/index.ts:121` — **AskUserQuestion** explicitly named with "block until answered" directive (M2 confirmed)
- `packages/luca-tools/src/artifacts/commands/lu.ts:86` — **AskUserQuestion** explicitly named with block directive (command parity confirmed)
- `packages/luca-tools/src/artifacts/skills/lu/index.ts:106` and `lu.ts:76` — all-auto fast-path check `counts.research === 0 && counts.ask === 0` consistent across both surfaces (S3 confirmed)
- `packages/luca-tools/src/artifacts/skills/lu/index.ts:124` and `lu.ts:87` — idempotency guard before appending resolutions, `Edit` not `Write`, both surfaces (S1 confirmed)
- `packages/luca-cli/src/write-surface/handlers/luca-confidence-log.ts:126` — `lucaConfidenceLogTool.description` now includes `researchable?` and `resolution?` (Phase-2 cleanup confirmed)
- `packages/luca-cli/src/commands/write-surface/confidence.ts:173` — `--resolution` error message cites `luca confidence log --help` (Phase-2 cleanup confirmed)
- `docs/decisions/confidence-gated-lu.md` — all Phase 04 changes (M1, M2, S1–S5) match the code; follow-ups clearly identified as NOT implemented

## Findings

- **[SHOULD-FIX]** `*(gate)*` pseudo-row in the command step table could trigger mis-advance
  - File: `packages/luca-tools/src/artifacts/commands/lu.ts:61`
  - Issue: The pipeline loop says "run the step using the table below; advance to the next step." The table contains a `*(gate)*` row that is not a valid `pipelineStep`. A naive orchestrator following the table row-by-row may attempt `luca state advance --to-step *(gate)*`, which the state machine will reject. The plan-review row text above it does handle the gate inline ("then run the Confidence Gate (see below)"), but having a non-step row in the step table is a DX trap.
  - Suggestion: Remove the `*(gate)*` row from the step table entirely. The plan-review row already contains the gate instruction; the gate section below provides full detail. The pseudo-row adds no information and creates an ambiguous table entry.

- **[SHOULD-FIX]** Advisory "should re-use" tone in skill plan-review row conflicts with imperative gate section
  - File: `packages/luca-tools/src/artifacts/skills/lu/index.ts:86`
  - Issue: The plan-review row says a resuming orchestrator "should re-use" the existing resolutions section, but the Confidence Gate section (line 98) imperatively says "skip steps 1–3 below." The mixed modal register ("should" vs imperative "skip") could lead an LLM to treat the resume check as advisory rather than mandatory, re-running the gate on a resume.
  - Suggestion: Change "should re-use it rather than re-running the gate" to "must re-use it — do NOT re-run the gate" to match the imperative register of the gate section.

- **[NOTE]** Decision doc accurately flags the `review → execute` transition gap (lines 125–133) as a known structural issue not implemented in this phase. No action needed here; it is correctly deferred.

- **[NOTE]** The command (lu.ts) and skill (index.ts) number the gate steps differently (skill: steps 1–6; command: steps 1–7, with resume check as a preamble and all-auto as step 2). Both documents are internally consistent, but cross-reference between them could mislead. Low risk given they are separate execution surfaces.

## Counts
- MUST_FIX: 0
- SHOULD_FIX: 2
- NOTE: 2
- CROSS_PHASE: 0
