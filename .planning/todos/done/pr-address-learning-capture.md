---
title: Make pr-address lu-learner learning capture execute reliably
area: skills
created: 2026-03-27
source: conversation
---

## Context

PR #112 run showed pr-address skipping Step 7.5 (lu-learner MuninnDB capture) entirely. The orchestrator rushed from lu-executor straight to push+respond. Four Copilot-caught pitfalls (idle state gap, wrong object level, event name mismatch, shell injection) were never stored in MuninnDB.

## Task

Apply 5 prompt-engineering changes to `src/skills/general/pr-address.skill.ts` to make learning capture structurally unavoidable:

1. **Renumber Step 7.5 to Step 8** — Promote from fractional sub-step to first-class integer step. Cascade: Step 8→9, Step 9→10.
2. **Update Overview** — Add "Learn" as its own numbered entry (currently hidden behind "Verify (cont.)").
3. **Add MANDATORY marker + push-blocker** to the learning step header.
4. **Add checkpoint banner** between Verify (Step 7) and Learn (Step 8).
5. **Add precondition checklist** to Push step (Step 10) that gates push on learning completion.
6. **Update Success Criteria** — Learning before push with emphasis.

## Notes

- Full plan at `.claude/plans/atomic-squishing-plum.md`
- Single file change, no new deps or schemas
- Cross-references to update: lines 93, 422, 597, 604, 656, 683, 750-762
- If prompt-level fix still fails, escalate to luca-bridge state machine integration
