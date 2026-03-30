# Phase 238: Code Review Fix Loop — Verification

**Phase:** 238
**Complexity:** MODERATE
**Verifier:** lu-verifier
**Mode:** Standard
**Typecheck:** PASSED (bunx --bun tsc --noEmit — zero errors)

---

## Goal

Add a backward transition and fix-loop mechanism for code review findings in the phase-execute pipeline so that critical findings trigger a fix-and-re-review cycle before the orchestrator advances to `"reviewed"`.

---

## Requirement-by-Requirement Verification

### R1 — Review Fix Loop in `phase-execute.skill.ts` Step 3

**Status: PASS**

`src/skills/general/phase-execute.skill.ts` Step 3 (lines 137–183) now contains a hoisted fix loop spec:

- FOR loop up to `REVIEW_FIX_ITERATIONS` iterations
- All 4 reviewers spawned in PARALLEL per iteration (`review-arch-{attempt}`, `review-dx-{attempt}`, `review-security-{attempt}`, `review-simplify-{attempt}`)
- `CRITICAL_COUNT == 0` BREAK condition present
- `review-fix-{attempt}` agent spawned via `REVIEW_FIX_PROMPT` when `attempt < REVIEW_FIX_ITERATIONS` and criticals remain
- No-progress guard documented (unchanged `CRITICAL_COUNT` treated as acknowledged, breaks to prevent stall)
- Skip conditions unchanged: `--skip-review`, `workflow.code_review: false`, harness failed
- All fix iterations remain in `"verified"` state — no backward transitions added
- Context write includes `review_fix_iterations` and `review_critical_resolved` fields

The loop correctly mirrors the harness fix loop at Step 2:

```
Harness: FOR attempt 1..N → harness agent → IF PASSED: BREAK → fix agent
Review:  FOR attempt 1..N → 4 parallel review agents → IF CRITICAL_COUNT==0: BREAK → review-fix agent
```

### R2 — Schema Fields in `PhaseExecuteReviewOutputSchema`

**Status: PASS**

`src/skills/__schemas/phase-execute-context.schemas.ts` lines 80–94 contain:

- `review_fix_iterations: z.number().default(0)` — tracks fix iterations attempted
- `review_critical_resolved: z.boolean().default(false)` — true when final `CRITICAL_COUNT == 0`

Both fields have `.default()` — existing callers creating `PhaseExecuteReviewOutput` without these fields remain schema-valid. JSDoc updated to document both fields.

### R3 — `REVIEW_FIX_PROMPT` Exported from `agent-prompts.ts`

**Status: PASS**

`src/skills/__helpers/agent-prompts.ts` exports `REVIEW_FIX_PROMPT(findings: string, p: AgentPromptParams): string` (lines 594–623).

Mirrors `HARNESS_FIX_PROMPT` pattern:

- Sanitizes HTML entities in findings string
- Uses `memoryProtocol()` for warm recall
- Task instructs: read finding, identify location, fix root cause, commit atomically, typecheck
- Output contract: `FIXES_APPLIED: {N}` and `UNFIXED: {N}` via `outputContract()`

### R4 — `review-fix-` in `agentPrefixes` and `validStates` in `pre-step-phase-execute.ts`

**Status: PASS**

`src/hooks/scripts/pre-step-phase-execute.ts`:

- `agentPrefixes` set contains both `"review-"` and `"review-fix-"` (lines 26–29)
- `validStates` map contains `"review-fix-": new Set(["verified"])` (line 36)
- Fix loop agents are locked to `"verified"` state, consistent with the loop semantics

### R5 — Bridge Sync: No Changes Needed, Comment Added

**Status: PASS**

`src/skills/__schemas/context-cli.ts` `LU_STATE_TO_BRIDGE_EVENTS` (lines 94–115) is functionally unchanged.

An inline comment at lines 111–114 explicitly documents the design decision:

> "The phase-execute review fix loop (Step 3) stays entirely in 'verified' state and does NOT require additional bridge events here. REVIEW_COMPLETE and SKIP_REVIEW remain the only exit events from 'verified' — these are emitted by luca-bridge directly in phase-execute, not via context-cli."

This satisfies the PLAN.md Task 02.3 requirement and the CONTEXT.md "Not Needed" rationale.

### R6 — Fix Loop Pattern Mirrors Harness Fix Loop

**Status: PASS**

The harness fix loop (Step 2, lines 102–134) and review fix loop (Step 3, lines 137–183) share identical structural patterns:

| Aspect                       | Harness Loop             | Review Loop                                |
| ---------------------------- | ------------------------ | ------------------------------------------ |
| Iteration variable           | `HARNESS_FIX_ITERATIONS` | `REVIEW_FIX_ITERATIONS`                    |
| Worker agents                | `harness` agent          | 4 parallel `review-*` agents               |
| Break condition              | `PASSED == true`         | `CRITICAL_COUNT == 0`                      |
| Fix agent                    | `fix` (harness errors)   | `review-fix-{attempt}` (REVIEW_FIX_PROMPT) |
| Non-blocking on last attempt | Yes                      | Yes (log to summary, continue)             |
| State during loop            | `"executed"`             | `"verified"`                               |
| State after loop             | `"verified"`             | `"reviewed"`                               |

---

## Deviations from ROADMAP Task Wording

The ROADMAP tasks use stale pre-discussion language. The CONTEXT.md discussion (01-CONTEXT.md) documents the accepted design changes:

| ROADMAP Task                 | Wording                                                                  | Actual Implementation                                                                                                                          | Verdict                                      |
| ---------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `review-backward-transition` | "Add REVIEW_ISSUES_FOUND event, backward transition verified → executed" | REJECTED in 01-CONTEXT.md Section 3. Option 2 (hoisted loop) implemented instead — stays in "verified", no backward edge.                      | IMPLEMENTED (different mechanism, same goal) |
| `review-fix-loop`            | "Add to lu.skill.ts Step 7k"                                             | IMPLEMENTED in phase-execute.skill.ts Step 3. 01-CONTEXT.md Section 4 confirms lu.skill.ts needs no change — phase-execute delegates entirely. | IMPLEMENTED (correct location)               |
| `bridge-sync-review-state`   | "Add reviewing context state to bridge sync"                             | NOT NEEDED per 01-CONTEXT.md. Comment added instead to document the decision.                                                                  | IMPLEMENTED (comment explains no-op)         |

The deviations are all **intentional design pivots** documented in 01-CONTEXT.md before execution began. The PLAN.md explicitly calls out these decisions. The goal is fully met via the chosen approach.

**One gap:** ROADMAP tasks remain `[ ]` (unchecked). They should be marked `[x]` to reflect completion.

---

## Typecheck

```
bunx --bun tsc --noEmit
# Exit code: 0 — zero type errors
```

---

## Summary

GOAL_MET: true
REQUIREMENTS_CHECKED: 6
REQUIREMENTS_PASSED: 6
GAPS: ROADMAP tasks for Phase 238 remain [ ] (unchecked) — should be marked [x] to reflect completion. All functional requirements are implemented and verified.
