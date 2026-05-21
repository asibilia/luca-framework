---
title: "Code Review Fix Loop: Add backward transition for review findings"
area: workflow
created: 2026-03-30
source: audit-finding
---

## Context

During the pre-edit workflow gate audit (v8.5.2 Phase 236), analysis of the phase-execute state machine revealed that code review findings have no fix-loop mechanism. When parallel reviewers (architecture, DX, security, simplifier) discover issues, the system transitions to `reviewed` state and continues to learning/commit — there's no backward path to an edit-permitting state to fix the issues.

Contrast with the harness fix loop, which correctly stays in `executed` state and loops `harness → fix → harness` until passing.

## Task

Add a fix-loop mechanism for code review findings in the phase-execute state machine. Options:

1. **Backward transition**: Add `REVIEW_ISSUES_FOUND` event that transitions from `verified` back to `executed`, allowing re-execution of fixes
2. **Hoisted review fix loop** (like harness): Loop `review → plan-fix → execute-fix → review` within the lu orchestrator
3. **Gap routing**: Capture review findings as "code review gaps" and route to `--gaps-only` (like UAT diagnose path)

## Key References

| File                                                  | Purpose                                         |
| ----------------------------------------------------- | ----------------------------------------------- |
| `src/skills/__schemas/states/phase-execute.states.ts` | State machine — needs backward transition       |
| `src/hooks/scripts/pre-step-phase-execute.ts`         | Hook — needs updated validStates                |
| `src/skills/luca/lu.skill.ts`                         | Orchestrator — Step 7k needs fix-loop logic     |
| `src/skills/general/phase-execute.skill.ts`           | Phase-execute spec — reviewer integration point |

## Notes

- This is a pre-existing design gap, not caused by the edit gate
- The edit gate does not create stuck states because reviewers are read-only
- Gap closure (lu.skill.ts Step 7p) partially mitigates this at the lu level
