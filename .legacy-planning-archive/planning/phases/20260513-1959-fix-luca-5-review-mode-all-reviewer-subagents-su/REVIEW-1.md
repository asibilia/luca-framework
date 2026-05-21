# Code Review — Wave 1

**Date**: 2026-05-13
**Complexity**: MODERATE
**Review Iteration**: 1 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| 1. `bun test` passes | MET | 341/341, duration 558ms |
| 2. `tsc` passes | MET | 0 errors, 2552ms |
| 3. `review.md` Step 4 uses inline directive, NOT fenced block | UNMET | Lines 60–74 still have ``` fence wrapping all record-subagent calls |
| 4. `review.md` correlationId references `Date.now()` | UNMET | Lines 62–65, 70–73 still use `<ts>` literal placeholder |
| 5. Regression tests catch fenced-block reintroduction | UNMET | No fence-split test added; existing `toContain` test passes even with fenced block |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2552ms |
| eslint | skip | — |
| tests | pass (341/341) | 558ms |

## Code Review Findings

### MUST-FIX (5)

- **[architecture/dx/security]** `review.md` fenced block NOT removed — Task 1.1 completely unimplemented. This is the stated root cause of success:false for all 4 outer reviewers. The executor only modified `reviewer.ts` wording but skipped the primary fix.
  - File: `packages/luca-mastracode/src/instructions/review.md:60-74`
  - Fix: Remove ``` fences on lines 60 and 74. Replace block with inline `// →` directive comment matching execute.md:294 pattern. Include concrete correlationId example.

- **[architecture/dx]** Fence-split regression tests NOT added — Task 2.1 completely unimplemented. Existing `toContain('record-subagent')` test at line 52–54 passes even with fenced block present (false green). AC #5 unmet.
  - File: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts:51-54`
  - Fix: Add describe block: read review.md, strip ``` fences with regex, assert `record-subagent` still present in result. Also assert `Date.now()` appears in review.md correlationId directive.

- **[architecture/security]** `<ts>` placeholder NOT replaced with `Date.now()` — AC #4 unmet. Literal `<ts>` in correlationId strings means either: (a) block skipped = success:false; (b) block executed = all 4 correlationIds become `"reviewer-arch-<ts>"` (identical), making invoke↔complete join undefined.
  - File: `packages/luca-mastracode/src/instructions/review.md:62-65, 70-73`
  - Fix: When writing inline directive (MUST-FIX #1), use `Date.now()` pattern e.g. `reviewer-arch-${Date.now()}` or follow execute.md:149 prose.

- **[security]** `success: true` hardcoded in all 4 complete record templates — no failure path expressible. When a reviewer fails, there is no pattern for the orchestrator to emit `success: false`. Compare execute.md:162 which has an explicit `success: false` variant. Audit consumers record success regardless of actual outcome.
  - File: `packages/luca-mastracode/src/instructions/review.md:70-73`
  - Fix: Add `success: false` variant after each complete record template when writing inline directive.

- **[simplification]** New wording in reviewer.ts:107 introduces MORE ambiguity than it removes. `reviewer.ts` contains TWO closing ``` fences: line 89 (closes output format block) and line 107 (closes the template literal). "Append the usage comment immediately after the closing ```" has an ambiguous referent. Old wording "closing ``` of the output block" was more specific. Net regression.
  - File: `packages/luca-mastracode/src/subagents/reviewer.ts:89, 107`
  - Fix: Either (a) revert to old wording with "of the output block" specificity restored, or (b) eliminate the output-format fenced block entirely and use indented prose so only one ``` closing exists.

### SHOULD-FIX (2)

- **[dx]** Test comment at line 93–96 attributes drift to "attention burial when clarification was followed by other sections." Actual root cause per PLAN.md is the fenced block in review.md, not reviewer.ts section ordering. Misleading for future maintainers.
  - File: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts:93-96`
  - Fix: Update comment: "Primary fix (review.md fenced block) is tested in fence-split regression test."

- **[simplification]** Two positional tests (lines 79–101) search for same anchor with different probe strings. Both will fail for the same non-semantic reason on any wording change. The no-trailing-## check already provides terminal-placement guarantee.
  - File: `packages/luca-mastracode/src/__tests__/subagent-telemetry-prose.test.ts:79-101`
  - Fix: Collapse into one test with stable short anchor (e.g. `'usage comment'`).

### NOTE (2)

- **[architecture]** The reviewer.ts:107 rewording is internally consistent: source changed, both test search phrases updated. Self-consistent as a standalone sub-change. Just doesn't address root cause.

- **[dx]** `no-luca-leak.test.ts` does NOT assert structural properties of fenced-block protocol. The gap Task 2.1 was supposed to fill. Adds a second layer of motivation for the fence-split regression test.

## Verdict

**ISSUES_FOUND**

Executor applied stale `iterationPlan` items from a prior pipeline run (tweaking reviewer.ts wording) instead of the new PLAN.md tasks. The three primary deliverables (Task 1.1 = fix review.md, Task 2.1 = regression tests, AC #4 = Date.now()) are completely unimplemented. Tests pass but are false-green.

### Iteration Plan

1. Replace fenced block in `review.md` lines 60–74 with inline `// →` directive: `const ts = Date.now()` + 4 `record-subagent invoke` lines (plain prose) + spawn 4 reviewers + 4 `record-subagent complete` lines. Use `reviewer-arch-${ts}` etc. Add `success: false` variant for complete records.
2. Add fence-split regression test to `subagent-telemetry-prose.test.ts`: strip ``` fences from review.md, assert `record-subagent` present outside fences.
3. Add `Date.now()` reference test: assert `review.md` contains `Date.now()` in Step 4 section.
4. Fix reviewer.ts:107 ambiguous referent — restore "of the output block" or eliminate output-format fence entirely.
