# Phase 200 Plan 1 Summary: phase-execute.skill.ts Prompt Audit Fixes

## Objective

Apply Fix 4 (code review team clarification) to phase-execute.skill.ts, making security-auditor consistently conditional-only across all references.

## Pre-execution Verification

Confirmed research findings before editing:

- **Fix 2 (recipients):** All 4 reviewer Task() prompts already have `**Recipient:** phase-execute orchestrator`. Skipped.
- **Fix 6 (wave cap):** Sub-wave splitting with "max 5 plans" cap already present at line 444. Skipped.
- **Fix 8 (gap-fix format):** `<output_format>` block already present in gap-fix executor prompt at line 1804. Skipped.

## Tasks Completed

### Task 1: Clarify security-auditor as conditional-only (Fix 4)

**Commit:** `e0b9da02` -- `fix(200-01): clarify security-auditor as conditional in team declarations`

**Changes made (3 edits in `src/skills/general/phase-execute.skill.ts`):**

1. **Line ~1974 (model routing prose):** Changed "Always spawn ALL standard reviewers" to "Always spawn the 3 core reviewers (dx-advocate, code-simplifier, code-architect). Conditionally spawn security-auditor if changed files match security patterns."
2. **Line ~2347 (REVIEW.md template):** Changed unconditional `security-auditor` listing to `{NEEDS_SECURITY ? ", security-auditor" : ""}` gated reference.
3. **Line ~2639 (success criteria):** Changed "dx-advocate, code-simplifier, code-architect, security-auditor" to "dx-advocate, code-simplifier, code-architect; security-auditor if triggered".

**Location already correct (no change needed):**

- Line 40 (sub-agent declarations): Already said "(conditional)".

## Verification

- All `security-auditor` references in file are now consistently conditional
- No "ui" reviewer references found (clean)
- Type check (`bunx --bun tsc --noEmit`) passes with zero errors

## Deviations

None. All changes matched the plan exactly.

## Files Modified

- `src/skills/general/phase-execute.skill.ts` (3 edits)
