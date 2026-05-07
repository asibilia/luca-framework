# Code Review — Wave 2 / Iteration 2

**Date**: 2026-05-07
**Complexity**: COMPLEX
**Review Iteration**: 2 / 2

## Iteration 1 → 2 follow-up

All 4 MUST-FIX from REVIEW-1.md verified resolved. All 4 optional fold-ins applied.

| Fix | Status | Evidence |
|-----|--------|----------|
| ARCH-1: finalize state-only base | APPLIED | finalize.md only mentions `action: "consult"` in explicit-forbid sentence; uses `state.prBase ?? state.baseBranch ?? 'main'` |
| SEC-1: SafeRefName on apply args | APPLIED | ensure-feature-branch.ts:28 schema + 5 field usages; rejects `-C main`, `..@{0}`, space; accepts canonical |
| SEC-2: ReDoS nested-quantifier guard | APPLIED | project-preferences.ts:39-62; executor substituted `/[+*}]\)[+*{]/` for spec regex (mental sim verified: rejects `(a+)+`, `(.+)*`, `(\d{2,}){2,}`; accepts `^PT-\d+$`) |
| SIMP-1: inferredType collapse | APPLIED | 0 references; `const type = input.type ?? 'feat'` |
| SEC-3 fold-in (ticketId) | APPLIED | `.max(64).regex(/^[A-Za-z0-9_\-./]+$/)` line 458-459 |
| SEC-5 fold-in (intent) | APPLIED | `.max(256)` line 466 |
| SIMP-2 fold-in (DEFAULT_PREFERENCES) | APPLIED | consult uses `{ ...DEFAULT_PREFERENCES.branching, defaultBranch: def }` |
| SIMP-3 fold-in (isAsk rename) | APPLIED | `ResolvedBaseRule.isAsk: boolean` + 4 caller usages |

## Automated Checks

| Check | Status | Duration |
|-------|--------|----------|
| tsc | pass | 2.3s |
| bun-test | pass | 0.4s (173/173) |
| rule gate | pass | <1s |

## Code Review Findings

### MUST-FIX (0)

None.

### SHOULD-FIX (0)

None.

### NOTE (1)

- The executor deviated from the spec regex `/(\+|\*|\{[0-9,]+\}){2,}/` (which would have FAILED to match `(a+)+` because `)` separates the two `+`) and substituted `/[+*}]\)[+*{]/` which correctly catches all three target patterns. This is a legitimate spec-correction; the deviation should ideally have been logged in CONFIDENCE-JOURNAL.md but the substitution is sound.

## Verdict

CLEAN — 0 MUST-FIX, 0 SHOULD-FIX. Phase B converged at iteration 2.

Phase B summary:
- 4 waves of feature work + 1 wave of review fixes
- 5 commits on `feat/branching-policy-refactor`
- 173 tests pass (baseline 133 + 32 Phase B + 8 review-fix tests)
- PT-12458 root cause pinned via two-surface regression test (resolve + assert-not-default)
- All architecture/security/DX/simplification concerns addressed
