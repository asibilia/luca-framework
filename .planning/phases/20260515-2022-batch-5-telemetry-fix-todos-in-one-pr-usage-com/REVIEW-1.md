# Code Review — Wave 1

**Date**: 2026-05-16
**Complexity**: COMPLEX
**Review Iteration**: 0 / 2

## Requirements Coverage

| Criterion | Status | Evidence |
|-----------|--------|----------|
| shared-prefix.ts omit-on-unknown directive | MET | `shared-prefix.ts:36-39` substrings verified |
| shared-prefix.ts success outcome mapping | MET | `completed*` + `crashed/killed/timeout` directives present |
| shared-prefix.ts durationMs directive | MET | `Date.now() - ts` present |
| shared-prefix.ts size under 2900 | MET | LEN=2877 |
| architect.md:115 field-enumeration form | MET | all 5 substrings in spawn-site region |
| finalize.md:56 field-enumeration form | MET | all 5 substrings in spawn-site region |
| execute.md fabricated example fixed | MET | 8743/2156/Date.now()-ts replaces 12000/3400/45000 |
| execute.md omit directive | PARTIAL | Present but narrower wording (`if model is unknown`) than other modes (`if model or token counts unknown`) |
| review.md omit + never-null directives | MET | line 61 verified |
| postmortem.ts intentional comments | MET | JSDoc + inline at lines 96 & 421 |
| postmortem-vault-comment.test.ts | UNMET | File not created (Task 1.3.3 dropped) |
| usage-comment-completeness.test.ts artifact name | PARTIAL | Delivered as `spawn-site-invariant.test.ts` with stricter coverage (35 vs 20 assertions) |
| correlationId fixture cleanup | MET | 13-digit non-round timestamps |
| All tests pass | MET | 471/471 |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.1s |
| eslint | skip | — |
| bun-test | pass | 0.5s (471/471) |

## Code Review Findings

### MUST-FIX (2)

- **[simplification] MF-1: Missing test file `postmortem-vault-comment.test.ts`**
  - File: `packages/luca-mastracode/src/__tests__/postmortem-vault-comment.test.ts` (absent)
  - Detail: PLAN.md Task 1.3.3 explicitly required this test guarding the two `intentional` comments in `postmortem.ts`. Without it, future edits silently regress.
  - Fix: Create test asserting `readFileSync('...postmortem.ts').match(/intentional/gi)?.length >= 2`.

- **[simplification] MF-2: Named-artifact deviation — accept-with-documentation**
  - File: `packages/luca-mastracode/src/__tests__/spawn-site-invariant.test.ts`
  - Detail: Plan named `usage-comment-completeness.test.ts` (5×4=20 assertions). Delivered `spawn-site-invariant.test.ts` (5×7=35 assertions). Functionally a strict superset.
  - Fix: Update the changeset description to explicitly call out the artifact name + scope deviation (renames `usage-comment-completeness.test.ts` → `spawn-site-invariant.test.ts`, expands from 20 to 35 assertions).

### SHOULD-FIX (3)

- **[architecture] SF-1: execute.md:151 narrower omit directive than other modes**
  - File: `packages/luca-mastracode/src/instructions/execute.md:151`
  - Detail: Says "If `model` is unknown, omit"; other modes say "If `model` OR all token fields are unknown, omit". Folding into iteration plan as cheap inline fix.
  - Fix: Rewrite as "If `model` or all token counts are unknown, **omit** the entire usage comment — never emit `null` or `0` as placeholder values."

- **[simplification] SF-2: Split-brain size ceiling (2900 vs 3000)**
  - File: `shared-prefix-semantics.test.ts:43-48` vs `memory-tier-prefix.test.ts:92-105`
  - Detail: Two thresholds on same invariant.
  - Fix (deferred to follow-up): Remove duplicate size test from new file; tighten existing guard to 2900. Non-blocking — both currently pass.

- **[simplification] SF-3: `extractSpawnSiteRegion` null fallback brittle**
  - File: `spawn-site-invariant.test.ts:73-77`
  - Detail: Null path produces confusing failure messages.
  - Fix (deferred): Return full content on no-match. Non-blocking — all 5 anchored files match.

### NOTE (3)

- Prose duplication across 4 mode files (intentional per plan rationale; could add cross-reference comments)
- File I/O at describe-scope (matches existing convention)
- Numeric-separator regex gap on fabricated-roundnum check (not exploited)

## Verdict

ISSUES_FOUND — 2 MUST-FIX (low effort), 1 SHOULD-FIX folded into iteration plan.

## Iteration Plan (Wave 4)

1. Create `packages/luca-mastracode/src/__tests__/postmortem-vault-comment.test.ts` — asserts `intentional` appears ≥2 times in `postmortem.ts`.
2. Patch `execute.md:151` omit wording to match other modes (architect/finalize/review).
3. Update `.changeset/fix-telemetry-batch-5-quality-regressions.md` to explicitly call out the artifact rename + 35-assertion scope expansion vs plan's 20.
4. Run checks; commit; transition back to review for iter 2.
