---
title: "P3: Enhance tribunal debate with consensus model"
area: agentic
created: 2026-03-04
source: repo-review audit (agentic-reviewer)
priority: P2
---

## Context

Tribunal implementations spawn multiple agents expecting >1 perspective, but all-or-nothing: if only 1 agent responds or all agree, tribunal still processes without meaningful debate. No minimum agreement threshold exists.

## Task

1. Define `src/agents/__schemas/tribunal-consensus.ts`
2. Support debate types: unanimous, majority, expert-weighted
3. Define `requiredAgreement` threshold (e.g., 0.67 = 2/3)
4. Add `expertAgents` whose votes count double
5. Add `fallbackResolver` for no-consensus cases

## Notes

- Builds on existing debate pattern opportunities documented in MEMORY.md
- Related to MEMORY.md debate audit findings
- Lower priority — current tribunal works, just not optimally
