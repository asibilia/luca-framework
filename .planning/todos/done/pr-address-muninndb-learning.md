---
title: Add MuninnDB learning capture to pr-address
area: skills
created: 2026-03-11
source: conversation
---

## Context

The pr-address skill processes PR review comments and applies fixes, but doesn't capture learnings from common review patterns. This means the same types of review comments keep recurring without the system learning from them.

## Task

Integrate MuninnDB learning capture into the pr-address skill so that:

1. Common PR review comment patterns are stored as engrams (e.g., `pitfall:pr-review-*`)
2. Recurring themes (style issues, architectural violations, missing tests) are identified and remembered
3. Future code generation can be informed by past review feedback to avoid repeat issues
4. The lu-learner agent or equivalent logic captures validated learnings after PR comments are addressed

## Notes

- Follow existing MuninnDB patterns used in lu-learner (engram types: pattern, decision, pitfall, preference)
- Consider categorizing by review comment type (style, architecture, correctness, performance)
- Gate learning capture to avoid noise from one-off comments — only persist patterns seen 2+ times
- pr-address already has a reviewer agent swarm (lu-pr-reviewer) — learning capture could hook into the aggregation step
