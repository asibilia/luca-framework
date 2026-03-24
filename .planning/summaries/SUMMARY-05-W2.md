# SUMMARY: Phase 05, Wave 2 — Graders, Reporter, and Comparator

## Objective

Implement the three grader types (code, LLM, composite), eval reporter with JSON/markdown/console output, and eval comparator with regression detection -- completing Wave 2 of the eval framework foundation.

## Tasks Completed

| #   | Task                    | Commit     | Files                                    |
| --- | ----------------------- | ---------- | ---------------------------------------- |
| 1   | C02a — Code grader      | `6ee70ab7` | `src/eval/__helpers/code-grader.ts`      |
| 2   | C02b — LLM grader       | `b27bd3cb` | `src/eval/__helpers/llm-grader.ts`       |
| 3   | C02c — Composite grader | `67581e56` | `src/eval/__helpers/composite-grader.ts` |
| 4   | C04 — Eval reporter     | `5f6c7d3e` | `src/eval/__helpers/eval-reporter.ts`    |
| 5   | C05 — Eval comparator   | `24668f4c` | `src/eval/__helpers/eval-comparator.ts`  |
| 6   | Barrel update           | `46855a71` | `src/eval/index.ts`                      |

## Key Implementation Details

### Code Grader (code-grader.ts)

- 6 strategies: exact_match, contains, regex, set_membership, threshold, custom
- Synchronous, zero LLM cost
- Uses `lodash/get` for value extraction via `output_path`
- `CustomGraderFn` type exported for user-provided scoring functions

### LLM Grader (llm-grader.ts)

- `LlmAdapter` interface abstracts LLM calls for testability
- Fixed judge system prompt instructs JSON-only response
- JSON parse with try/catch and regex fallback for score extraction
- Full error handling returns structured `GraderResult` on failure

### Composite Grader (composite-grader.ts)

- Weighted combination of code + LLM sub-graders
- Nested composite explicitly blocked (returns score 0.0)
- `metadata.per_grader` array provides per-entry breakdown

### Eval Reporter (eval-reporter.ts)

- `writeJsonReport`: Bun.write() to `.planning/evals/{component}/`, latest.json as file copy
- `formatMarkdownReport`: Summary table + per-case results + failures section
- `printConsoleReport`: ANSI-colored box format with pass/fail icons
- `printComparisonReport`: Delta table with directional arrows
- `loadLatestReport` / `loadReport`: Bun.file() with exists() check, null on error
- Uses `mkdir` from `node:fs/promises` for directory creation

### Eval Comparator (eval-comparator.ts)

- `compareEvalRuns`: pass@1 regression detection, 3-tier verdict (fail/warn/pass)
- Significance threshold (default 0.05) prevents noisy warnings
- Cases only in one run excluded from comparison
- Schema validation via `EvalComparisonSchema.safeParse`
- `compareWithLatestBaseline`: convenience wrapper combining load + compare

## Deviations

- **[Rule 1 — Bug]** Fixed TypeScript strict null check on regex capture group in llm-grader.ts (`scoreMatch[1]` possibly undefined). Added explicit undefined guard.

## Verification

All files pass `bunx --bun tsc --noEmit` after each task. No type errors.

## Files Created

- `src/eval/__helpers/code-grader.ts`
- `src/eval/__helpers/llm-grader.ts`
- `src/eval/__helpers/composite-grader.ts`
- `src/eval/__helpers/eval-reporter.ts`
- `src/eval/__helpers/eval-comparator.ts`

## Files Modified

- `src/eval/index.ts` (added Wave 2 barrel exports)
