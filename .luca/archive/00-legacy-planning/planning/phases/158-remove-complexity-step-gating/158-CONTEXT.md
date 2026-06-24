# Phase 158 Context: Remove Complexity Step Skipping

## Decision 1: Guard Function Strategy [researched]

**Decision:** Simplify all guard functions to always return `true` by default. Only return `false` when explicit user override flags are set (`--skip-review`, `--skip-uat`, `--skip-research`) or when config booleans disable a step (`workflow.code_review: false`).

**Rationale:** The complexity-gating rule states "ALL workflow steps run at every complexity level." Guards should not gate on complexity-derived activation values. The activation value in the matrix becomes informational only (indicating depth/model tier), not a skip gate.

**Affected guards:**

- `shouldRunResearch` — always true (unless `workflow.research: false`)
- `shouldRunDiscussion` — always true
- `shouldRunUAT` — always true (unless `workflow.uat_required: false`)
- `shouldCaptureLearnings` — always true
- `shouldRunCodeReview` — always true (unless `workflow.code_review: false`)

## Decision 2: Type Union Change [researched]

**Decision:** Remove `"skip"` from the `learningCapture` type union in `defaults.ts`. Replace with `"brief"` as the minimum active value. Search for all call sites that pattern-match on `"skip"` and update them.

**Current type:** `"skip" | "brief" | "standard" | "full" | "full+debrief"`
**New type:** `"brief" | "standard" | "full" | "full+debrief"`

Also: Create a `StepActivation` type that excludes "skip" — or simply remove "skip" from wherever it's used as a union member.

## Decision 3: Code Review Agents for TRIVIAL/SIMPLE [researched]

**Decision:** Add a minimal reviewer set for TRIVIAL/SIMPLE: `["code-simplifier"]`. This ensures code review runs at every level (per the rule) while keeping the reviewer count proportional to complexity.

**Matrix after changes:**

- TRIVIAL: `codeReviewAgents: ["code-simplifier"]`
- SIMPLE: `codeReviewAgents: ["code-simplifier"]`
- MODERATE: `codeReviewAgents: ["dx-advocate", "code-simplifier"]` (unchanged)
- COMPLEX/CRITICAL: unchanged

## Decision 4: Activation Values for TRIVIAL/SIMPLE [researched]

**Decision:** Replace all `"skip"` values with active alternatives:

| Field           | TRIVIAL (was) | TRIVIAL (new) | SIMPLE (was) | SIMPLE (new) |
| --------------- | ------------- | ------------- | ------------ | ------------ |
| research        | "skip"        | "brief"       | "skip"       | "brief"      |
| discussion      | "skip"        | "brief"       | "skip"       | "brief"      |
| uat             | "skip"        | "optional"    | "skip"       | "optional"   |
| learningCapture | "skip"        | "brief"       | "brief"      | "brief"      |

These values are informational depth indicators. The guards determine whether the step runs (always true); the activation value tells the executing agent how deep to go.

## Scope Exclusion

**Exclude:** `src/hooks/pi-extensions/luca-complexity.ts` — Phase 159 deletes the entire `pi-extensions/` directory. Do not modify this file.

## Files to Modify

1. `packages/luca-framework/src/state/defaults.ts` — Replace "skip" values, update type union
2. `packages/luca-framework/src/state/guards.ts` — Simplify guards to always return true (respect config overrides)
3. `src/skills/general/phase-discuss.skill.ts` — Remove complexity check from pre-mortem gating text

## Verification

- `bunx --bun tsc --noEmit` — catches type union changes and call site breaks
- `bun run check:drift` — validates compiled outputs remain in sync
