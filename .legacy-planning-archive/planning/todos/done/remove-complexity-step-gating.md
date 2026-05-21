---
title: Remove complexity-based workflow step skipping
area: workflow
created: 2026-03-13
source: conversation
---

## Context

During autopilot execution, the message "Pre-mortem skipped (SIMPLE complexity)" appeared. The complexity-gating rule and autopilot skill both explicitly state that ALL workflow steps run at every complexity level — complexity controls model tier only. The code contradicts this documented rule.

## Task

Remove all complexity-based step skipping from the workflow. Complexity should only control:

- **Model tier** (which model an agent gets — via `MODEL_ROUTING_TABLE`)
- **Loop budgets** (iteration counts, verification depth)

It should **never** skip workflow steps (research, discussion, pre-mortem, code review, UAT, learning capture).

## Affected Files

### Primary Sources (edit these)

1. **`packages/luca-framework/src/state/defaults.ts`** (lines 64-141)
   - Complexity matrix sets research, discussion, code_review, uat, learning_capture to `"skip"` for TRIVIAL/SIMPLE
   - Fix: change all `"skip"` to active values so every step runs at every level

2. **`src/skills/general/phase-discuss.skill.ts`** (lines 262-268)
   - Explicitly skips pre-mortem for TRIVIAL/SIMPLE complexity
   - Also lines 100-101, 187: text says pre-mortem is "MODERATE+ only"
   - Fix: remove complexity check, always run pre-mortem

3. **`src/hooks/pi-extensions/luca-complexity.ts`** (lines 22-87)
   - Duplicate gating matrix with `"skip"` values for TRIVIAL/SIMPLE
   - Fix: remove step-skipping fields or set all to active

4. **`packages/luca-framework/src/state/guards.ts`** (lines 63-297)
   - Guard functions (shouldRunResearch, shouldRunDiscussion, shouldRunCodeReview, shouldRunUAT, shouldRunPremortem) check activation fields that inherit "skip" values
   - Fix: simplify guards to always return true (or respect only explicit user flags like --skip-review)

### Generated Output (rebuild after source changes)

5. **`.pi/extensions/luca-complexity.ts`** (2 copies) — generated from #3, rebuild via `bun run build:all`

### Already Correct (no changes needed)

- **`src/skills/general/autopilot.skill.ts`** (lines 58, 729) — correctly states steps should never be skipped
- **`src/complexity/__helpers/model-routing.ts`** — model tier routing stays unchanged
- **`src/rules/general/complexity-gating.rule.ts`** — rule text already correct, code just doesn't match

## Fix Approach

1. Remove all `"skip"` activation values from complexity matrices in `defaults.ts`
2. Remove complexity check from pre-mortem gating in `phase-discuss.skill.ts`
3. Update guard functions in `guards.ts` to not gate on complexity
4. Update pi-extension gating matrix source
5. Rebuild generated outputs via `bun run build:all`
6. Verify with `bunx --bun tsc --noEmit`

## Notes

- Explicit user flags (`--skip-review`, `--skip-uat`, `--skip-research`) should still work
- Config booleans (`workflow.code_review: false`, `workflow.uat_required: false`) should still work
- Only automatic complexity-based skipping is removed
- The complexity-gating rule in `.claude/rules/complexity-gating.md` should also be reviewed to ensure the "Loop Budgets" table doesn't imply step skipping
