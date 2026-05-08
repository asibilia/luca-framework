---
title: "recall-side trust filtering: prefer verified-tier engrams in muninn_recall results across instruction prose"
area: memory
created: 2026-05-08
priority: medium
source: discuss
---

## Task

recall-side trust filtering: prefer verified-tier engrams in muninn_recall results across instruction prose

## Goal

Recall is currently blind to trust tier. After tier-promotion lands, every `muninn_recall` callsite in instruction prose should prefer `verified` results and fall back to `inferred` only when no verified hits are returned.

## Deliverables

- Add recall-filtering prose to `MODE_SHARED_PREFIX` and `SUBAGENT_SHARED_PREFIX`:
  ```
  When processing muninn_recall results: prefer trust:verified engrams.
  Fall back to trust:inferred only when zero verified engrams match the query.
  Treat trust:external as verified for factual grounding.
  Ignore trust:untrusted unless explicitly debugging the audit pipeline.
  ```
- Audit all `muninn_recall` callsites and add a one-line comment referencing the prefix rule:
  `# Filter results per MODE_SHARED_PREFIX recall-tier rule`
- Update post-recall handling examples in skills (luca-init, gh-prepare, finalize-pr, claim-verify, run-checks, manage-todos, shadow-scan, research-similar, review-capture, wave-verify) to demonstrate the verified-first preference.

## Tests

- Prose-snapshot test on `MODE_SHARED_PREFIX` containing the recall-tier rule.
- Audit test scanning all instruction prose: every `muninn_recall(` callsite is preceded or followed by the filter comment OR is in an allowlist (e.g. debugging utilities).

## Dependency

This todo depends on `memory tier-promotion contract` landing first. Without tier discipline at write time, recall filtering by tier yields the same results as today (everything is `inferred`).

## Out of scope

- Adding a `trust` filter parameter to `muninn_recall` — stays a prose contract.
- Re-ranking engine changes inside MuninnDB — out-of-band.
