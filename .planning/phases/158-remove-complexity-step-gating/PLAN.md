---
phase: 158
plan: 1
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 158 Plan 1: Remove Complexity Step Skipping

## Objective

Remove all `"skip"` values from the workflow activation matrix and simplify guard functions so that every workflow step runs at every complexity level. Complexity now controls model tier and iteration counts only — it no longer gates step activation.

The three files to change are:

1. `packages/luca-framework/src/state/defaults.ts` — Replace `"skip"` activation values; remove `"skip"` from the `learningCapture` type union; add `["code-simplifier"]` for TRIVIAL/SIMPLE code review.
2. `packages/luca-framework/src/state/guards.ts` — Simplify step-activation guards to always return `true` (subject only to explicit config boolean overrides).
3. `src/skills/general/phase-discuss.skill.ts` — Remove the complexity check that gates pre-mortem at TRIVIAL/SIMPLE.

Do NOT touch `src/hooks/pi-extensions/luca-complexity.ts` (reserved for Phase 159).

## Context

- @packages/luca-framework/src/state/defaults.ts
- @packages/luca-framework/src/state/guards.ts
- @packages/luca-framework/src/state/utils/complexity-utils.ts
- @src/skills/general/phase-discuss.skill.ts

## Tasks

### 1. Update defaults.ts — replace "skip" values and fix type union

**Type:** auto
**TDD:** false
**Depends on:** —

Remove `"skip"` from the `ComplexityGate.learningCapture` type union so the new type is:

```typescript
learningCapture: "brief" | "standard" | "full" | "full+debrief";
```

Replace every `"skip"` activation value in `DEFAULT_COMPLEXITY_MATRIX` with the correct non-skip equivalent per the CONTEXT.md decisions:

| Field              | TRIVIAL before | TRIVIAL after         | SIMPLE before         | SIMPLE after          |
| ------------------ | -------------- | --------------------- | --------------------- | --------------------- |
| `research`         | `"skip"`       | `"brief"`             | `"skip"`              | `"brief"`             |
| `discussion`       | `"skip"`       | `"brief"`             | `"skip"`              | `"brief"`             |
| `uat`              | `"skip"`       | `"optional"`          | `"skip"`              | `"optional"`          |
| `learningCapture`  | `"skip"`       | `"brief"`             | `"brief"` (unchanged) | `"brief"`             |
| `codeReviewAgents` | `[]`           | `["code-simplifier"]` | `[]`                  | `["code-simplifier"]` |

Also add `"brief"` to the `StepActivation` type union in `packages/luca-framework/src/state/utils/complexity-utils.ts` if it is not already present (currently it is `"skip" | "optional" | "run" | "required" | "required+thorough"`). The new union should be:

```typescript
export type StepActivation =
  | "brief"
  | "optional"
  | "run"
  | "required"
  | "required+thorough";
```

**Files to create/edit:**

- `/Users/alecsibilia/Github/luca-framework/packages/luca-framework/src/state/utils/complexity-utils.ts`
- `/Users/alecsibilia/Github/luca-framework/packages/luca-framework/src/state/defaults.ts`

**Verification:**

- No `"skip"` literal appears in `defaults.ts` or `complexity-utils.ts`.
- `StepActivation` no longer includes `"skip"`.
- `ComplexityGate.learningCapture` no longer includes `"skip"`.
- TRIVIAL and SIMPLE each have `codeReviewAgents: ["code-simplifier"]`.
- `bunx --bun tsc --noEmit` passes in `packages/luca-framework/`.

### 2. Simplify guards.ts — always-on step guards with config-only overrides

**Type:** auto
**TDD:** false
**Depends on:** 1

Rewrite the four complexity-gating guards so they return `true` by default (meaning "run this step") and only return `false` when an explicit workflow config boolean disables the step. The `shouldActivate` helper and `getGateField` helper can be removed or retained as internal utilities — the guard signatures must not change.

Specific guard behaviour after this task:

| Guard                    | New behaviour                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shouldRunResearch`      | Return `true` unless `context.workflow_config.research === false`                                                                                                                               |
| `shouldRunDiscussion`    | Return `true` unless `context.workflow_config.discussion === false`                                                                                                                             |
| `shouldRunUAT`           | Return `true` unless `context.workflow_config.uat_required === false`                                                                                                                           |
| `shouldCaptureLearnings` | Return `true` always (no config override exists for this)                                                                                                                                       |
| `shouldRunLearning`      | Return `true` unless `context.workflow_config.learning === false`                                                                                                                               |
| `shouldRunCodeReview`    | Existing logic retained: `false` if `workflow_config.code_review === false`, then check `codeReviewAgents.length > 0` — this already works correctly after Task 1 adds agents to TRIVIAL/SIMPLE |

The `shouldRunPremortem` and `shouldRunProcessData` guards are gate-based (not complexity-based) and must not be changed.

Remove or update the `shouldActivate` helper accordingly. Remove any remaining references to `"skip"` in the guards file.

**Files to create/edit:**

- `/Users/alecsibilia/Github/luca-framework/packages/luca-framework/src/state/guards.ts`

**Verification:**

- No guard returns `false` based on activation value comparison (no `activation !== "skip"`, no `activation === "required"` checks for step-run guards).
- `shouldRunResearch`, `shouldRunDiscussion`, `shouldRunUAT`, `shouldCaptureLearnings`, `shouldRunLearning` each default to `true` unless the relevant `workflow_config` boolean is `false`.
- `shouldRunCodeReview` still respects `workflow_config.code_review === false` and the `codeReviewAgents` array length.
- `bunx --bun tsc --noEmit` passes in `packages/luca-framework/`.

### 3. Remove complexity-based pre-mortem gate from phase-discuss skill

**Type:** auto
**TDD:** false
**Depends on:** —

In `src/skills/general/phase-discuss.skill.ts`, the "Skip Conditions" block currently reads:

```
Skip pre-mortem (no prompt, no spawn) if ANY of these are true:
- Complexity is TRIVIAL or SIMPLE
- `PREMORTEM_GATE` is "false"
```

Remove the first bullet. The only skip condition after this change is:

```
Skip pre-mortem (no prompt, no spawn) if:
- `PREMORTEM_GATE` is "false"
```

Also update the related Success Criteria line that currently reads:

```
- [ ] Pre-mortem risk analysis completed (MODERATE+) or skipped (TRIVIAL/SIMPLE)
```

Change it to:

```
- [ ] Pre-mortem risk analysis completed or skipped (gate disabled)
```

Do not change the Appetite Declaration auto-inference logic (TRIVIAL/SIMPLE auto-set is intentional and unrelated to step skipping).

**Files to create/edit:**

- `/Users/alecsibilia/Github/luca-framework/src/skills/general/phase-discuss.skill.ts`

**Verification:**

- The "Skip Conditions" block contains exactly one condition: gate disabled.
- No reference to `TRIVIAL or SIMPLE` appears in the pre-mortem gating prose.
- The Success Criteria item no longer mentions `MODERATE+` or `TRIVIAL/SIMPLE` in context of pre-mortem.
- `bunx --bun tsc --noEmit` passes in `src/` (skill files are TypeScript).

## Verification

After all three tasks, run:

```bash
cd /Users/alecsibilia/Github/luca-framework && bunx --bun tsc --noEmit
```

The build must produce zero errors. Then confirm:

1. `grep -r '"skip"' packages/luca-framework/src/state/` returns no matches.
2. `grep -r 'TRIVIAL or SIMPLE' src/skills/general/phase-discuss.skill.ts` returns no matches in the pre-mortem section.
3. Each guard in `guards.ts` that controls a workflow step defaults to `true` rather than inspecting a `"skip"` value.

## Success Criteria

- Zero TypeScript errors across both package scopes.
- `StepActivation` type no longer includes `"skip"`.
- `ComplexityGate.learningCapture` type no longer includes `"skip"`.
- All five complexity levels have at least one `codeReviewAgents` entry.
- All step-activation guards return `true` by default; only explicit config booleans can suppress a step.
- Pre-mortem in phase-discuss is gated solely on the config gate, not on complexity level.

## Output Specification

Three modified TypeScript/skill source files:

- `packages/luca-framework/src/state/utils/complexity-utils.ts` — updated `StepActivation` type
- `packages/luca-framework/src/state/defaults.ts` — updated matrix values and `learningCapture` type
- `packages/luca-framework/src/state/guards.ts` — simplified step-activation guards
- `src/skills/general/phase-discuss.skill.ts` — removed complexity-based pre-mortem gate
