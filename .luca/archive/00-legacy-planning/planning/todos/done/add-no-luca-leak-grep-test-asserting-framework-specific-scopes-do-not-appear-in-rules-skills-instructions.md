---
title: "Add no-luca-leak grep test asserting framework-specific scopes do not appear in rules/skills/instructions"
area: testing
created: 2026-05-07
priority: medium
source: research
---

## Task

Add no-luca-leak grep test asserting framework-specific scopes do not appear in rules/skills/instructions

## Context

Phase C is prose-only; there is no automated test that prevents future regressions where someone hardcodes a luca-framework convention back into a rule/skill/instruction. RISK-7 from Phase C research.

## Action

Add `packages/luca-mastracode/src/__tests__/no-luca-leak.test.ts` that scans `rules/`, `skills/`, `src/instructions/` for the literal scope tokens `framework|mastracode|studio|config|docs|repo` and asserts zero matches (whitelist fixtures + test files + the seeded memory blob). Phase C should bundle this if scope allows.

## MuninnDB Recall

Search for `research:luca-phase-c-schema-memory-drift` for context.
