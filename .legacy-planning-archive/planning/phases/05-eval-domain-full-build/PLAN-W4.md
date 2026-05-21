---
phase: 5
plan: 4
type: feature
autonomous: true
wave: 4
depends_on: [1, 2, 3]
---

# Phase 5 Plan 4: Seed Eval Suites (lu-router, lu-verifier, convergence)

## Objective

Create the three seed eval suites that define ground-truth labeled datasets for the framework's core agents and systems. These suites depend only on the Wave 1 schemas (EvalSuite type) and can run in parallel since they are independent data definitions with no logic dependencies between them.

Note: While these suites technically only depend on Wave 1 schemas, they are sequenced as Wave 4 to allow the runner and graders (Waves 2-3) to be available for validation. The suite definitions themselves are pure data -- they import only the `EvalSuite` type from schemas.

## Context

- @.planning/todos/pending/runtime-c06-seed-eval-suite-lu-router.md -- 25 cases for complexity classification
- @.planning/todos/pending/runtime-c07-seed-eval-suite-lu-verifier.md -- 25 cases for gap detection
- @.planning/todos/pending/runtime-c08-seed-eval-suite-convergence.md -- 25 cases for stall detection
- @src/eval/\_\_schemas/eval.schemas.ts -- EvalSuite, EvalCase types from Wave 1

## Tasks

### 1. C06 -- lu-router eval suite

**Type:** auto
**TDD:** false
**Depends on:** (none within this wave)

Create `src/eval/suites/lu-router.eval.ts` with 25 eval cases for lu-router complexity classification.

Distribution: 5 TRIVIAL, 5 SIMPLE, 5 MODERATE, 5 COMPLEX, 5 CRITICAL.

All cases use `code` grading with `exact_match` strategy, except 3 edge cases that use `set_membership` for adjacent acceptable levels:

- `router-simple-002`: accepts TRIVIAL or SIMPLE
- `router-moderate-003`: accepts SIMPLE or MODERATE
- `router-complex-004`: accepts COMPLEX or CRITICAL

Input contract: `{ task_description: string, cognitive_report: string }`.
Expected output: `{ complexity: string }` with `output_path: "complexity"`.

Implement verbatim from `.planning/todos/pending/runtime-c06-seed-eval-suite-lu-router.md`, applying the set_membership overrides for the 3 edge cases.

**Files to create/edit:**

- `src/eval/suites/lu-router.eval.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Suite has exactly 25 cases
- Suite ID is `"lu-router-classification"`
- 3 cases use `set_membership` strategy; 22 use `exact_match`
- All cases have `output_path: "complexity"`
- All cases use `grader: "code"` (zero LLM cost for grading)

### 2. C07 -- lu-verifier eval suite

**Type:** auto
**TDD:** false
**Depends on:** (none within this wave)

Create `src/eval/suites/lu-verifier.eval.ts` with 25 eval cases for lu-verifier gap detection.

Distribution:

- 5 no-gap cases (clean implementations, should produce `status: "passed"`)
- 5 obvious-gap cases (stubs, missing error handling, no types)
- 5 subtle-gap cases (race conditions, division by zero, unsafe JSON.parse)
- 5 false-positive traps (valid patterns that should NOT be flagged)
- 5 partial-completeness cases (some criteria met, others not)

All cases use `composite` grading: 60% code (status match) + 40% LLM (explanation quality). This is the only suite requiring LLM judge calls for grading.

Input contract: `{ phase_goal, code_diff, task_description, verification_criteria }`.
Expected output: `{ status, gaps, score }`.

Implement verbatim from `.planning/todos/pending/runtime-c07-seed-eval-suite-lu-verifier.md`.

**Files to create/edit:**

- `src/eval/suites/lu-verifier.eval.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Suite has exactly 25 cases
- Suite ID is `"lu-verifier-gap-detection"`
- All cases use `grader: "composite"` with code (0.6) + llm (0.4) weights
- False-positive cases expect `status: "passed"`
- Gap cases expect `status: "gaps_found"`

### 3. C08 -- Convergence eval suite

**Type:** auto
**TDD:** false
**Depends on:** (none within this wave)

Create `src/eval/suites/convergence.eval.ts` with 25 eval cases for convergence/stall detection.

Distribution:

- 5 healthy convergence (errors decreasing -> "improved")
- 5 clear stalls (same errors repeating -> "stalled")
- 5 oscillating stalls (errors fix and re-break -> "stalled" or "regressed")
- 5 slow-but-real progress (should NOT flag as stalled -> "improved")
- 5 budget/threshold edge cases

All cases use `code` grading with `exact_match`. All use `trials: 1` because convergence detection is fully deterministic.

Input contract: `{ signals: { error_count_delta, fingerprint_overlap, artifact_change_delta, semantic_overlap? }, previous_stale_count, stale_threshold }`.
Expected output: `{ status, should_halt }`.

Implement verbatim from `.planning/todos/pending/runtime-c08-seed-eval-suite-convergence.md`.

**Files to create/edit:**

- `src/eval/suites/convergence.eval.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Suite has exactly 25 cases
- Suite ID is `"convergence-stall-detection"`
- All cases use `trials: 1` (deterministic)
- All cases use `grader: "code"` (zero LLM cost)
- 5 cases include `semantic_overlap` (4-signal mode)

### 4. Update barrel with suite exports

**Type:** auto
**TDD:** false
**Depends on:** Tasks 1, 2, 3

Extend `src/eval/index.ts` with re-exports for all three suites:

- `luRouterEvalSuite` from `./suites/lu-router.eval`
- `luVerifierEvalSuite` from `./suites/lu-verifier.eval`
- `convergenceEvalSuite` from `./suites/convergence.eval`

**Files to create/edit:**

- `src/eval/index.ts` (edit -- append suite re-exports)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Barrel remains pure re-exports only
- All three suites importable via `~/eval`

## Verification

Run after all tasks complete:

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
```

Confirm:

- Three suite files exist under `src/eval/suites/`
- Total of 75 eval cases across all suites (25 + 25 + 25)
- All suites are importable via barrel

## Success Criteria

- 75 eval cases defined across 3 suites
- lu-router suite covers all 5 complexity levels with 3 edge cases
- lu-verifier suite includes false-positive traps to test precision
- Convergence suite tests the 2-of-3 stale rule with edge cases
- All suites compile and export correctly

## Output Specification

Files created:

- `src/eval/suites/lu-router.eval.ts`
- `src/eval/suites/lu-verifier.eval.ts`
- `src/eval/suites/convergence.eval.ts`

Files modified:

- `src/eval/index.ts` (extended with suite re-exports)
