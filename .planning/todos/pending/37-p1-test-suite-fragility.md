---
title: "P1: Document and fix test suite fragility (29 tests fail in full run)"
area: dx
created: 2026-03-04
source: repo-review audit (dx-reviewer)
priority: P1
---

## Context

~29 tests in `packages/luca-framework` fail when run as part of the full test suite due to a pre-existing module resolution issue. They pass when run individually. This is only documented in CLAUDE.md line 41 — no GitHub issue, no troubleshooting guide, no CI workaround.

## Task

1. Create GitHub issue to track the root cause of module resolution failure
2. Add troubleshooting section to docs explaining the workaround
3. Create `bun run test:all-safe` script that runs the known-working subset
4. Investigate root cause — likely a Bun module resolution ordering issue
5. If root cause fix is complex, at minimum ensure CI can pass reliably

## Notes

- New developers will run `bun test`, get failures, assume they broke something
- CI/CD cannot validate the full suite
- Only mentioned in CLAUDE.md — not in README, troubleshooting, or test docs
- Merged with todo #61 (full-suite-test-isolation-fix) which describes the same root cause from the v2.8.0 done-todo audit
