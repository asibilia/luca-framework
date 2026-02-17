---
title: "Consolidate scattered test files into __tests__/"
area: testing
priority: high
created: 2026-02-16
source: repo-audit
---

## Context

The repo has a centralized `__tests__/` directory at root, but 20 test files are scattered across source directories. Additionally, some modules have co-located `__tests__/` dirs inside `src/`. No documented test convention exists.

## Task

1. **Decide on convention**: Centralized `__tests__/` (majority pattern) vs co-located. Document the decision.
2. **Move scattered test files** to `__tests__/` with proper mirror structure:

   **In `scripts/` (5 files):**
   - `scripts/build-utils.test.ts`
   - `scripts/check-drift.test.ts`
   - `scripts/plugin-spec-e2e.test.ts`
   - `scripts/plugin-spec-hooks-format.test.ts`
   - `scripts/plugin-spec-structure.test.ts`

   **In `src/compilers/` (2 files):**
   - `src/compilers/plugin.compiler.test.ts`
   - `src/compilers/plugin.types.test.ts`

   **In `src/iteration/` (5 files):**
   - `src/iteration/budget.test.ts`
   - `src/iteration/checkpoint.test.ts`
   - `src/iteration/classifier.test.ts`
   - `src/iteration/convergence.test.ts`
   - `src/iteration/types.test.ts`

   **In `src/planner/` (8 files):**
   - `src/planner/cost-model.test.ts`
   - `src/planner/defaults.test.ts`
   - `src/planner/integration.test.ts`
   - `src/planner/scheduler.test.ts`
   - `src/planner/scoring.test.ts`
   - `src/planner/todo-parser.test.ts`
   - `src/planner/types.test.ts`
   - `src/planner/weekly.test.ts`

3. **Consolidate source-tree `__tests__/` dirs:**
   - `src/memory/__tests__/` (13 files)
   - `src/rules/__tests__/` (1 file)
   - `src/rules/profiles/__tests__/` (2 files)
   - `src/shared/__tests__/` (5 files)

4. Update all import paths in moved test files
5. Add a test convention rule or document in CLAUDE.md

## Notes

- Total: 20 scattered files + ~21 files in source-tree `__tests__/` dirs
- `packages/luca-state/src/__tests__/` is fine — package-scoped tests belong with the package
