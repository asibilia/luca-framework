---
title: Tighten harness iteration caps (max 3 even at CRITICAL)
area: iteration
created: 2026-03-02
source: conversation — Stripe Minions blog review
---

## Context

Stripe's Minions system caps fix iterations at 1-2 CI rounds, citing "diminishing marginal returns for an LLM to run many rounds." Their data at scale (1,300+ PRs/week) confirms that unlimited iteration loops are wasteful.

## Task

Update the complexity gating matrix in `src/complexity/` and `.claude/rules/complexity-gating.md` to tighten harness fix iteration limits:

| Level    | Current | Proposed |
| -------- | ------- | -------- |
| MODERATE | 3       | 2        |
| COMPLEX  | 3       | 2        |
| CRITICAL | 5       | 3        |

Also consider tightening verify fix iterations similarly.

## Notes

- Source: https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2
- Key quote: "diminishing marginal returns for an LLM to run many rounds"
- This is a configuration change — update both the rule docs and the runtime complexity schemas
- Monitor whether the tighter caps cause more tasks to exit with unresolved failures
