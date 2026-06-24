---
id: 124-01
title: "Root-cause module resolution issue causing 29 tests to fail in full suite"
wave: 1
---

## Task Objectives

1. Identify the root cause of module resolution failure when running `bun test` on the full suite
2. Fix the resolution so all tests pass in both individual and full-suite runs
3. Remove the known-issue caveat from CLAUDE.md once fixed
4. Add `bun run test:all` script that validates the full suite

## Context

- ~29 tests in `packages/luca-framework` fail when run as part of the full test suite due to a pre-existing module resolution issue
- Tests pass when run individually
- Only documented in CLAUDE.md line 41 — no GitHub issue, no troubleshooting guide, no CI workaround

## Investigation Steps

1. Run `bun test` to see which 29 tests fail
2. Compare with `bun test <individual-test>` to confirm they pass individually
3. Examine the test setup in `__tests__/` and `bunfig.toml`
4. Look for module resolution ordering issues, path alias problems, or test isolation issues
5. Check for shared state between tests that could cause failures

## Execution Steps

1. Create a diagnostic report documenting the failure pattern
2. Propose and implement the fix (likely a Bun module resolution configuration change or test setup adjustment)
3. Verify all 29 previously failing tests now pass in full suite
4. Update CLAUDE.md to remove the known-issue caveat
5. Add `test:all` script to package.json if not present

## Verification Criteria

- All 29 previously failing tests pass in full-suite run (`bun test`)
- `bun run test:all` completes without errors
- CLAUDE.md known-issue caveat removed
- No tests fail in full suite but pass individually
