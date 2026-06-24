---
title: "PR-tooling: filter-stale empty diff_hunk fix (Copilot false-positives)"
area: pr-tooling
created: 2026-05-17
priority: high
source: pr-feedback-audit
---

## Task

PR-tooling: filter-stale empty diff_hunk fix (Copilot false-positives)

## Problem

`prReview(action: 'filter-stale')` marks 100% of Copilot bot comments as stale with reason `content-mismatch` when `diff_hunk` is empty. Copilot's review API consistently returns empty `diff_hunk` even when the cited code is intact. Pattern recurring across PRs #234, #236, #239, #247, #248, #249, #251, #253 (8+ iterations). Every PR review wastes time manually overriding the stale verdict.

## Recommendations

- **R1.1** Patch `prReview.filter-stale`: when `diff_hunk` is empty, fall back to `commit_id === HEAD` check. Mark as `unknown` (not `stale`) so categorization proceeds.
- **R1.2** Emit telemetry counter `prReview.stale.empty_diff_hunk` to verify fix in production.
- **R1.3** Add regression test fixture using real Copilot comment payload (empty `diff_hunk`).

## Acceptance

- [ ] Empty `diff_hunk` + matching `commit_id` no longer marked stale
- [ ] Telemetry counter emitted on every empty-hunk encounter
- [ ] Regression test with real Copilot payload fixture
- [ ] Update prReview JSDoc to document fallback behavior

## Memory References

- `01KRPD06NZ7553PNTP1Z6633A8` — pattern:filter-stale-false-positive-on-empty-diff-hunk-pr-253
- `01KRESVJX7CEADMCJJKNHFJ5A7` — pattern:filter-stale-false-positives-on-empty-diff-hunks

## Source

PR feedback audit 2026-05-17 (Theme 1).
