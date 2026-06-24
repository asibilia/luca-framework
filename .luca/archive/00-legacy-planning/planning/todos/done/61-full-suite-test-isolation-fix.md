---
title: Fix 29-test full-suite module resolution failure
area: dx
created: 2026-03-05
source: v2.8.0 done-todo audit (partial: 29-fix-test-isolation-validate-branding)
---

## Context

Todo `29-fix-test-isolation-validate-branding` was marked done. The `validateBranding` function exists and passes tests individually. However, the underlying root cause — 29 tests failing when run as part of the full suite — was documented as a known pre-existing issue rather than fixed.

## Partial Completion

The following WAS implemented:

- `validateBranding` function exists with proper tests
- Test isolation improvements were made

## Gaps

The following was NOT fixed:

- ~29 tests in `packages/luca-framework` fail when run in the full suite (`bun test`) due to a module resolution issue
- Tests pass individually (`bun test __tests__/packages/luca-framework/`)
- This is documented in CLAUDE.md as a known issue but never root-caused

## Task

1. Root-cause the module resolution issue that causes 29 tests to fail in full suite
2. Fix the resolution so all tests pass in both individual and full-suite runs
3. Remove the known-issue caveat from CLAUDE.md once fixed

## Notes

This overlaps with `37-p1-test-suite-fragility.md` which is already in pending. Consider merging these two todos — they describe the same underlying problem. Priority: P1 (documented in CLAUDE.md as a high-leverage gotcha).
