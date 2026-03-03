---
title: "Add Test Coverage for Context Domain (0 tests, 6 source files)"
area: testing
created: 2026-03-02
source: repo-audit
tier: 1
complexity: MODERATE
---

## Context

Standard repo audit (2026-03-02) found the `src/context/` domain has **zero test coverage** across 6 source files. This is the only domain in `src/` with no tests at all. Context is a T1 Core domain used by entity domains (agents, skills, rules), making it a high-value test target.

## Task

Create tests for the context domain's helpers and schemas:

1. **`src/context/__schemas/context.schemas.ts`** — Validate Zod schema parsing, defaults, and edge cases
2. **`src/context/__helpers/context-assembler.ts`** — Test context assembly logic
3. **`src/context/__helpers/defaults.ts`** — Test default value generation
4. **`src/context/__helpers/resolve-context-tier.ts`** — Test tier resolution for different inputs
5. **`src/context/__helpers/result-aggregator.ts`** — Test result aggregation
6. **`src/context/__helpers/result-envelope.ts`** — Test envelope wrapping/unwrapping

Test files should go in `__tests__/src/context/` following existing test directory conventions.

## Notes

- Start with schema tests (highest value — validates contracts)
- `resolve-context-tier.ts` is likely the most complex helper and most important to test
- All other T1 Core domains (memory, planner, iteration, harness) already have tests
- This domain is depended on by T2 Entity domains, so regressions here would cascade
