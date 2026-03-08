---
phase: 10
plan: 2
type: bug
autonomous: true
wave: 1
depends_on: []
---

# Phase 10 Plan 2: Data Integrity Reconciliation (Complexity Matrix and Routing Table)

## Objective

Reconcile the divergent `DEFAULT_COMPLEXITY_MATRIX` constants between `src/complexity/` (authoritative) and `packages/luca-framework/` (standalone), and synchronize the complexity-gating rule's category-level summary table with the actual per-agent values in `MODEL_ROUTING_TABLE`. These are data integrity issues that directly affect the v3.0.0 milestone goals.

## Context

@src/complexity/**helpers/defaults.ts
@packages/luca-framework/src/state/defaults.ts
@src/complexity/**helpers/model-routing.ts
@src/rules/general/complexity-gating.rule.ts
@.planning/v3.0.0-MILESTONE-AUDIT.md

## Tasks

### 1. Reconcile DEFAULT_COMPLEXITY_MATRIX values (H6)

**Type:** auto
**TDD:** false
**Depends on:** none

**Problem:** Two constants named `DEFAULT_COMPLEXITY_MATRIX` exist with divergent schemas and numeric values:

| Field                              | src/complexity (authoritative)                                             | packages/luca-framework                  |
| ---------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| Schema                             | 6 fields (no research, discussion, codeReviewAgents, uat, learningCapture) | 11 fields (includes all workflow gating) |
| TRIVIAL planVerificationIterations | 1                                                                          | 0                                        |
| TRIVIAL verifyFixIterations        | 1                                                                          | 0                                        |
| SIMPLE planVerificationIterations  | 1                                                                          | 0                                        |
| MODERATE harnessFixIterations      | 2                                                                          | 3                                        |
| COMPLEX verifyFixIterations        | 1                                                                          | 2                                        |
| CRITICAL harnessFixIterations      | 3                                                                          | 5                                        |
| CRITICAL verifyFixIterations       | 2                                                                          | 3                                        |

The `src/complexity/` version is authoritative because it matches the iteration count table in the complexity-gating rule and is imported by all runtime agents. The `packages/luca-framework/` version is a standalone copy for the state package with a richer schema (includes workflow step gating fields like `research`, `discussion`, `codeReviewAgents`, `uat`, `learningCapture`).

**Fix:** Align the overlapping numeric fields in `packages/luca-framework/src/state/defaults.ts` to match `src/complexity/__helpers/defaults.ts`. The additional fields unique to the packages/ version (`research`, `discussion`, `codeReviewAgents`, `uat`, `learningCapture`) are retained because they serve the state machine's richer gating needs.

**Specific changes to `packages/luca-framework/src/state/defaults.ts`:**

| Level    | Field                      | Old Value | New Value |
| -------- | -------------------------- | --------- | --------- |
| TRIVIAL  | planVerificationIterations | 0         | 1         |
| TRIVIAL  | verifyFixIterations        | 0         | 1         |
| SIMPLE   | planVerificationIterations | 0         | 1         |
| MODERATE | harnessFixIterations       | 3         | 2         |
| COMPLEX  | verifyFixIterations        | 2         | 1         |
| CRITICAL | harnessFixIterations       | 5         | 3         |
| CRITICAL | verifyFixIterations        | 3         | 2         |

Also replace `tailwind-auditor` with `ui` in the `codeReviewAgents` arrays for COMPLEX and CRITICAL levels (this agent does not exist). Note: PLAN-03 Task 1 separately handles the `tailwind-auditor` references in `phase-execute.skill.ts` prompt text. This task handles the data defaults instance only.

**Files to edit:**

- `packages/luca-framework/src/state/defaults.ts`

**Verification:**

- The overlapping fields now match between the two files:
  ```bash
  # TRIVIAL planVerificationIterations should be 1 in both files
  grep -A4 "TRIVIAL" src/complexity/__helpers/defaults.ts | grep planVerification
  grep -A7 "TRIVIAL" packages/luca-framework/src/state/defaults.ts | grep planVerification
  # Both should show: 1
  ```
- `grep "tailwind-auditor" packages/luca-framework/src/state/defaults.ts` returns no results
- `bunx --bun tsc --noEmit` passes

### 2. Synchronize complexity-gating rule routing table with MODEL_ROUTING_TABLE (M4/L8)

**Type:** auto
**TDD:** false
**Depends on:** none

**Problem:** The complexity-gating rule contains a category-level summary table that diverges from the actual per-agent values in `MODEL_ROUTING_TABLE`:

| Agent                      | Rule says                       | Actual (model-routing.ts)      |
| -------------------------- | ------------------------------- | ------------------------------ |
| lu-cognition at CRITICAL   | sonnet (via "Classifiers" row)  | fast (all levels are fast)     |
| lu-debugger at TRIVIAL     | haiku (via "Deep analysis" row) | balanced (TRIVIAL is balanced) |
| lu-router-fast at MODERATE | sonnet (via "Routers" row)      | fast (MODERATE is fast)        |
| lu-router-fast at COMPLEX  | sonnet (via "Routers" row)      | fast (COMPLEX is fast)         |

The rule's summary table groups agents into categories and shows category-level defaults. But some agents within a category have different values than the category row suggests.

**Fix:** Update the rule's Model Routing Table section to add footnotes for agents whose values diverge from the category default, making it clear that the canonical source is `MODEL_ROUTING_TABLE` and this is a summary with exceptions noted.

**Updated table with footnotes:**

```
| Agent Category | TRIVIAL | SIMPLE | MODERATE | COMPLEX | CRITICAL |
|----------------|---------|--------|----------|---------|----------|
| Classifiers (lu-cognition*, lu-learner) | haiku | haiku | haiku | haiku | haiku*/sonnet |
| Routers (lu-router, lu-router-fast*) | haiku | haiku | haiku*/sonnet | haiku*/sonnet | sonnet/balanced* |
| Orchestrators (lu-executor, lu-planner) | haiku | sonnet | sonnet | opus | opus |
| Deep analysis (lu-verifier, lu-debugger*) | haiku/sonnet* | sonnet | opus | opus | opus |
| Reviewers (dx-advocate, code-simplifier) | haiku | sonnet | opus | opus | opus |

*Exceptions from category default -- see MODEL_ROUTING_TABLE for exact per-agent values.
```

Alternatively, a cleaner approach: add a note below the table stating that the table shows category-level defaults and specific agents may differ. The canonical per-agent routing is in `MODEL_ROUTING_TABLE`.

**Chosen approach:** Replace the table with accurate values. Since categories have exceptions, update the table to show the predominant pattern and add a footnote. Also update the lu-cognition row: at CRITICAL, lu-cognition stays fast (not sonnet).

**Files to edit:**

- `src/rules/general/complexity-gating.rule.ts` (the Model Routing Table section)

**Verification:**

- `grep "lu-cognition" src/rules/general/complexity-gating.rule.ts` shows updated text
- The rule no longer claims lu-cognition gets sonnet at CRITICAL
- `bunx --bun tsc --noEmit` passes

## Verification

```bash
# TypeScript compilation
bunx --bun tsc --noEmit

# Confirm H6 numeric reconciliation
grep -A7 "TRIVIAL" packages/luca-framework/src/state/defaults.ts | head -10
# planVerificationIterations should be 1

# Confirm tailwind-auditor removed from packages/ defaults
grep "tailwind-auditor" packages/luca-framework/src/state/defaults.ts
# Expected: no output

# Confirm M4/L8 routing table accuracy
grep -A8 "Model Routing Table" src/rules/general/complexity-gating.rule.ts | head -15
# Should show accurate per-agent values or footnoted exceptions
```

## Success Criteria

- `DEFAULT_COMPLEXITY_MATRIX` overlapping numeric fields are identical between `src/complexity/` and `packages/luca-framework/`
- The complexity-gating rule's routing summary accurately reflects `MODEL_ROUTING_TABLE` per-agent values
- No phantom agent names (tailwind-auditor) in complexity defaults
- TypeScript compilation passes

## Output Specification

- 2 edited source files (`packages/luca-framework/src/state/defaults.ts`, `src/rules/general/complexity-gating.rule.ts`)
- User must run `bun run build:all` after this plan to regenerate rule outputs
