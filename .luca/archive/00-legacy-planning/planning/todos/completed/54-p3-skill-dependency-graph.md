---
title: "P3: Implement skill dependency graph"
area: agentic
created: 2026-03-04
source: repo-review audit (agentic-reviewer)
priority: P2
---

## Context

The skill registry exports 47 skills with no metadata about execution order, dependencies, or conflicts. Skills execute in arbitrary order which could cause race conditions.

## Task

1. Add `src/skills/__schemas/skill-dependencies.ts` with Zod schema
2. Define `requiredBefore`, `blockedBy`, `mutuallyExclusive` fields
3. Implement topological sort for skill execution ordering
4. Add conflict detection for mutually exclusive skills
5. Enable safe parallel execution for independent skills

## Notes

- Lower priority — no known bugs from this yet
- Would enable parallel skill execution optimization
- Consider as part of broader workflow orchestration improvements
