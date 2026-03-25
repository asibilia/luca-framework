---
phase: 5
plan: 2
type: feature
autonomous: true
wave: 2
depends_on: [1]
---

# Phase 5 Plan 2: Graders, Reporter, and Comparator

## Objective

Implement the three independent helper modules that depend only on the Wave 1 schemas: the grader trio (code, LLM, composite), the eval reporter, and the eval comparator. These modules can be developed in parallel since they share no interdependencies -- each imports only from `__schemas/eval.schemas`.

## Context

- @.planning/todos/pending/runtime-c02-eval-graders.md -- grader implementations (code, llm, composite)
- @.planning/todos/pending/runtime-c04-eval-reporter.md -- reporter with JSON/markdown/console output
- @.planning/todos/pending/runtime-c05-eval-comparator.md -- regression detection and verdict logic
- @src/eval/\_\_schemas/eval.schemas.ts -- schemas from Wave 1
- @src/eval/index.ts -- barrel to extend with helper exports

## Tasks

### 1. C02a -- Code grader

**Type:** auto
**TDD:** false
**Depends on:** (none within this wave)

Create `src/eval/__helpers/code-grader.ts` with the `gradeWithCode` function and `CustomGraderFn` type.

Implements 6 strategies: exact_match, contains, regex, set_membership, threshold, custom. Uses `lodash/get` for value extraction via `config.output_path`. Synchronous -- no async needed.

Implement verbatim from `.planning/todos/pending/runtime-c02-eval-graders.md` (Section 1).

**Files to create/edit:**

- `src/eval/__helpers/code-grader.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 6 strategies have implementations
- `gradeWithCode` is synchronous
- Value extraction uses `lodash/get`

### 2. C02b -- LLM grader

**Type:** auto
**TDD:** false
**Depends on:** (none within this wave)

Create `src/eval/__helpers/llm-grader.ts` with the `gradeWithLlm` async function and `LlmAdapter` interface.

The `LlmAdapter` interface abstracts LLM calls for testability. The grader sends a structured judge prompt with rubric, parses the JSON response, and handles malformed responses with regex fallback.

Implement verbatim from `.planning/todos/pending/runtime-c02-eval-graders.md` (Section 2).

**Files to create/edit:**

- `src/eval/__helpers/llm-grader.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- `LlmAdapter` interface exported
- Judge system prompt matches spec exactly
- JSON parse has try/catch with regex fallback

### 3. C02c -- Composite grader

**Type:** auto
**TDD:** false
**Depends on:** Tasks 1, 2 (imports from code-grader and llm-grader)

Create `src/eval/__helpers/composite-grader.ts` with the `gradeWithComposite` async function.

Combines multiple graders with configurable weights. Computes weighted score, determines pass/fail based on `pass_threshold`. Does NOT support nested composite graders. Metadata includes per-grader breakdown.

Implement verbatim from `.planning/todos/pending/runtime-c02-eval-graders.md` (Section 3).

**Files to create/edit:**

- `src/eval/__helpers/composite-grader.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Nested composite returns score 0.0 with "not supported" reason
- Null adapter with LLM entry returns score 0.0
- Metadata contains `per_grader` array

### 4. C04 -- Eval reporter

**Type:** auto
**TDD:** false
**Depends on:** (none within this wave)

Create `src/eval/__helpers/eval-reporter.ts` with five exported functions:

- `writeJsonReport` -- writes to `.planning/evals/{component}/{run_id}.json` and updates `latest.json`
- `formatMarkdownReport` -- generates markdown summary table
- `printConsoleReport` -- colorized ANSI console output
- `printComparisonReport` -- colorized comparison display
- `loadLatestReport` / `loadReport` -- read reports from disk

Uses `Bun.file()` and `Bun.write()` for file I/O per project conventions. `latest.json` is a file copy, not a symlink.

Implement verbatim from `.planning/todos/pending/runtime-c04-eval-reporter.md`.

**Files to create/edit:**

- `src/eval/__helpers/eval-reporter.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Uses `Bun.file()` and `Bun.write()` (not node:fs for writes)
- `latest.json` written as file copy
- Console output uses ANSI escape codes
- `loadReport` returns null for missing files

### 5. C05 -- Eval comparator

**Type:** auto
**TDD:** false
**Depends on:** Task 4 (imports `loadLatestReport` from reporter)

Create `src/eval/__helpers/eval-comparator.ts` with two exported functions:

- `compareEvalRuns` -- computes regressions, improvements, deltas, verdict
- `compareWithLatestBaseline` -- convenience wrapper that loads baseline then compares

Verdict logic: "fail" when regressions exist AND avg_score_delta < -threshold; "warn" when regressions exist but score drop is within threshold; "pass" when no regressions. Default significance threshold: 0.05.

Implement verbatim from `.planning/todos/pending/runtime-c05-eval-comparator.md`.

**Files to create/edit:**

- `src/eval/__helpers/eval-comparator.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Cases only in one run are excluded from comparison
- Verdict correctly uses significance threshold
- `compareWithLatestBaseline` returns null when no baseline exists

### 6. Update barrel with Wave 2 exports

**Type:** auto
**TDD:** false
**Depends on:** Tasks 1, 2, 3, 4, 5

Extend `src/eval/index.ts` with re-exports for all Wave 2 modules:

- Grader exports: `gradeWithCode`, `CustomGraderFn`, `gradeWithLlm`, `LlmAdapter`, `gradeWithComposite`
- Reporter exports: `writeJsonReport`, `formatMarkdownReport`, `printConsoleReport`, `printComparisonReport`, `loadLatestReport`, `loadReport`, `ReportFormat`
- Comparator exports: `compareEvalRuns`, `compareWithLatestBaseline`

**Files to create/edit:**

- `src/eval/index.ts` (edit -- append helper re-exports)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Barrel remains pure re-exports only
- All new functions are importable via `~/eval`

## Verification

Run after all tasks complete:

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
```

Confirm:

- Five new helper files exist under `src/eval/__helpers/`
- All exports accessible via barrel
- No tier violations (eval imports only from T0 shared and T1 peers)

## Success Criteria

- All three grader types compile and export correctly
- Reporter handles all three output formats
- Comparator produces correct verdicts with significance threshold
- Barrel is updated and pure
- Domain boundary check passes

## Output Specification

Files created:

- `src/eval/__helpers/code-grader.ts`
- `src/eval/__helpers/llm-grader.ts`
- `src/eval/__helpers/composite-grader.ts`
- `src/eval/__helpers/eval-reporter.ts`
- `src/eval/__helpers/eval-comparator.ts`

Files modified:

- `src/eval/index.ts` (extended with helper re-exports)
