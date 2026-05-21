# Phase 238: Code Review Fix Loop — Wave 01 Summary

**Phase:** 238
**Wave:** 01
**Status:** COMPLETE
**Type check:** PASSED (bunx --bun tsc --noEmit — zero errors)

---

## Tasks Completed

### Wave 01: Schema + Prompt Changes

**Task 01.1 — PhaseExecuteReviewOutputSchema extended**

- File: `src/skills/__schemas/phase-execute-context.schemas.ts`
- Added `review_fix_iterations: z.number().default(0)` and `review_critical_resolved: z.boolean().default(false)` to `PhaseExecuteReviewOutputSchema`
- Updated JSDoc comment to document both new fields
- Both fields have `.default()` so existing callers remain valid

**Task 01.2 — REVIEW_FIX_PROMPT added to agent-prompts.ts**

- File: `src/skills/__helpers/agent-prompts.ts`
- Added exported function `REVIEW_FIX_PROMPT(findings: string, p: AgentPromptParams): string`
- Inserted after `CODE_REVIEW_PROMPT`, before `LEARNING_CAPTURE_PROMPT`
- Mirrors `HARNESS_FIX_PROMPT` pattern exactly: sanitizes input, uses `memoryProtocol`, uses `outputContract`
- Output contract: `FIXES_APPLIED: {N}` and `UNFIXED: {N}`

**Task 01.3 — review-fix- prefix registered in pre-step-phase-execute.ts**

- File: `src/hooks/scripts/pre-step-phase-execute.ts`
- Added `"review-fix-"` to `agentPrefixes` set
- Added `"review-fix-": new Set(["verified"])` to `validStates` map
- Fix loop agents are locked to `"verified"` state, matching the loop semantics

### Wave 02: Spec Update

**Task 02.1 — Step 3 replaced with hoisted review fix loop**

- File: `src/skills/general/phase-execute.skill.ts`
- Replaced flat Step 3 "Code Review (verified -> reviewed) — PARALLEL agents" with "Code Review Fix Loop (verified -> reviewed) — HOISTED"
- Loop structure: FOR attempt = 1 to REVIEW_FIX_ITERATIONS, spawn parallel reviewers, parse CRITICAL_COUNT, break if 0, spawn review-fix-{attempt} if attempt < max
- No-progress guard documented: unchanged CRITICAL_COUNT treated as acknowledged, breaks to prevent stall
- Context write updated to include `review_fix_iterations` and `review_critical_resolved` fields

**Task 02.2 — Success Criteria updated**

- Replaced "Code review completed" criterion with two new criteria:
  - "Code review fix loop ran (parallel reviewers + optional fix agent, unless skipped)"
  - "Review fix loop resolved CRITICAL findings or exhausted iterations"

**Task 02.3 — Bridge sync verified, comment added**

- File: `src/skills/__schemas/context-cli.ts`
- Confirmed `LU_STATE_TO_BRIDGE_EVENTS` requires no changes
- Added inline comment to the map noting that the review fix loop stays in "verified" state and does not require additional bridge events
- `REVIEW_COMPLETE` and `SKIP_REVIEW` remain the only exit events from "verified"

---

## Files Modified

| File                                                    | Change                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/skills/__schemas/phase-execute-context.schemas.ts` | Added `review_fix_iterations` + `review_critical_resolved` fields to schema |
| `src/skills/__helpers/agent-prompts.ts`                 | Added `REVIEW_FIX_PROMPT` export                                            |
| `src/hooks/scripts/pre-step-phase-execute.ts`           | Added `"review-fix-"` to `agentPrefixes` and `validStates`                  |
| `src/skills/general/phase-execute.skill.ts`             | Replaced Step 3 with hoisted fix loop spec; updated success criteria        |
| `src/skills/__schemas/context-cli.ts`                   | Added clarifying comment to `LU_STATE_TO_BRIDGE_EVENTS`                     |

---

## Overall Success Criteria Verification

- [x] `PhaseExecuteReviewOutputSchema` has `review_fix_iterations` and `review_critical_resolved` fields with defaults
- [x] `REVIEW_FIX_PROMPT` exported from `agent-prompts.ts`, mirrors `HARNESS_FIX_PROMPT` pattern
- [x] `pre-step-phase-execute.ts` has `"review-fix-"` in both `agentPrefixes` and `validStates` (state: `"verified"`)
- [x] `phase-execute.skill.ts` Step 3 replaced with hoisted fix loop spec (loop structure, no-progress guard, context write)
- [x] Step 3 skip conditions unchanged: `--skip-review`, `workflow.code_review: false`, harness failed
- [x] All fix iterations stay in `"verified"` state — no backward transitions added
- [x] `lu.skill.ts` unchanged (bridge sync not needed)
- [x] `context-cli.ts` has clarifying comment only — no functional changes to bridge events
- [x] `bunx --bun tsc --noEmit` passes on all modified files
- [x] No test files created (no-tests rule)

---

## Deviations from Plan

None. All tasks executed exactly as specified in PLAN.md.
