---
title: "Fix Test Suite Isolation Bug (validateBranding Module Resolution)"
area: testing
created: 2026-03-01
source: repo-audit
tier: 1
complexity: MODERATE
---

## Context

Repo audit confirmed 31 test failures in the full suite (2633 pass, 31 fail out of 2664). Per AGENTS.md this is a known pre-existing issue: tests in `packages/luca-framework` fail due to a module resolution ordering issue where the `validateBranding` export is not found. The same tests pass when run individually.

## Task

Investigate and fix the module resolution ordering issue:

1. Identify which module exports `validateBranding` and how it's resolved
2. Determine why import order in the full test suite causes the export to be missing
3. Likely causes: circular dependency, barrel re-export ordering, or Bun's module cache behavior
4. Fix the root cause so all 2664 tests pass in a single `bun test` run

## Notes

- 98.8% pass rate currently — this is a reliability/CI issue, not a code correctness issue
- Tests pass individually: `bun test __tests__/packages/luca-framework/`
- May be related to Bun-specific module resolution quirks
- Fixing this would unblock reliable CI gating on the full test suite
