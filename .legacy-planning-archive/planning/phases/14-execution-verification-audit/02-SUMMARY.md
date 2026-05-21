---
id: 14-02
status: complete
started: 2026-02-11
completed: 2026-02-11
---

# Plan 14-02 Summary: Goal-Backward Verification & Specification Anchoring

## Deliverables

- **Step 2.5 (Specification Anchoring)** added to `.claude/agents/lu-verifier.md`
- **Step 9.5 (Goal-Backward Objective Check)** added to `.claude/agents/lu-verifier.md`
- **VERIFICATION.md template** updated with 2 new sections in `.claude/agents/lu-verifier.md`
- **Step 7 verifier prompt** updated in `.claude/skills/lu-execute-phase/SKILL.md`

## What Was Done

### Task 1: Add Step 2.5 — Specification Anchoring

- Inserted between Step 2 (Establish Must-Haves) and Step 3 (Verify Observable Truths)
- Loads PLAN.md files and extracts `## Objective` sections
- Builds traceability matrix: plan-objective ↔ must-have mapping
- Flags untraced must-haves and uncovered objectives
- Derives additional must-haves for uncovered objectives
- Handles missing PLAN.md gracefully (skip with note)

### Task 2: Add Step 9.5 — Goal-Backward Objective Check

- Inserted between Step 9 (Determine Overall Status) and Step 10 (Structure Gap Output)
- Re-reads each PLAN.md objective fresh (prevents memory drift)
- Classifies each objective: PASS / PARTIAL / FAIL / SKIP
- Detects "specification gaps" — all artifacts verified but intent not fully met
- Can downgrade overall status from `passed` to `gaps_found` if objectives fail

### Task 3: Update VERIFICATION.md Template

- Added "Specification Anchoring" section after Observable Truths
  - Plan-Objective ↔ Must-Have traceability table
  - Untraced must-haves and uncovered objectives fields
- Added "Goal-Backward Objective Check" section before Gaps Summary
  - Per-objective PASS/PARTIAL/FAIL table
  - Specification gaps and objective score fields

### Task 4: Update lu-execute-phase Step 7

- Added `PLAN_CONTENTS` variable to context loading (reads all PLAN.md files)
- Added `{plan_contents}` to the verifier prompt context
- Added `<specification_anchoring>` instruction block explaining Steps 2.5 and 9.5
- Backward-compatible: empty plan contents triggers graceful skip

## Design Decisions

- **Additive approach**: New steps numbered 2.5 and 9.5 (inserted between existing steps, no renumbering)
- **Graceful degradation**: Both steps handle missing PLAN.md (skip with note)
- **Fresh re-injection**: Step 9.5 re-reads objectives instead of relying on earlier memory
- **Status escalation**: Objective failures can upgrade `passed` → `gaps_found` or `human_needed`

## Files Modified

- `.claude/agents/lu-verifier.md` — Added Step 2.5, Step 9.5, updated template, updated success criteria
- `.claude/skills/lu-execute-phase/SKILL.md` — Updated Step 7 context and prompt

## Requirements Delivered

| Requirement                           | Status   |
| ------------------------------------- | -------- |
| AUDIT-03 (goal-backward verification) | Complete |
| AUDIT-04 (specification anchoring)    | Complete |
