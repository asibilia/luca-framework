---
title: "P2: Enforce complexity gating matrix in XState guards"
area: agentic
created: 2026-03-04
source: repo-review audit (agentic-reviewer)
priority: P2
---

## Context

The complexity gating matrix defines which workflow steps activate at each complexity level (TRIVIAL → CRITICAL), but it lives in `.planning/config.json` and is only enforced at the skill level. Each skill must manually check complexity — no central enforcement via XState guards.

## Task

1. Move complexity matrix to `src/complexity/__schemas/` as Zod schema
2. Add XState guards that reference the matrix for gating decisions
3. Remove manual complexity checks from individual skills where possible
4. Add TypeScript inference so matrix changes are type-safe
5. Validate config matrix against schema on load

## Notes

- Skills can accidentally spawn agents that should be gated off for TRIVIAL/SIMPLE tasks
- This wastes tokens on unnecessary agent invocations
- Matrix is documented in `.claude/rules/complexity-gating.md` but not mechanically enforced
