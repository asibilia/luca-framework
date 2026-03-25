---
phase: 2
plan: 1
type: execution
autonomous: true
complexity: MODERATE
---

# Phase 2 Plan: Eval Domain + DRY Cleanup

## Objective

Fix 6 audit findings from the v6.0.0 milestone audit: extract duplicated DAG code, clean up eval barrel, DRY grader patterns, collapse mock adapter, resolve naming collisions, and move interfaces to canonical locations.

## Context

- @.planning/v6.0.0-MILESTONE-AUDIT.md
- @.planning/phases/02-eval-domain-dry-cleanup/CONTEXT.md

## Tasks

### Task 1: Extract shared buildSuccessorsMap (#3)

- **Files:** `src/workflow/__helpers/dag-adjacency.ts` (new), `dag-sorter.ts`, `dag-validator.ts`, `workflow/index.ts`
- **Action:** Extract duplicated forward-adjacency map builder into shared helper

### Task 2: Remove eval suite re-exports from barrel (#8)

- **Files:** `src/eval/index.ts`, `scripts/eval.ts`
- **Action:** Remove large data object re-exports, update consumer to use direct imports

### Task 3: Extract makeFailResult factory (#9)

- **Files:** `src/eval/__helpers/grader-utils.ts` (new), `code-grader.ts`, `composite-grader.ts`, `eval-runner.ts`, `eval/index.ts`
- **Action:** Replace 14+ inline `{ passed: false, score: 0.0, ... }` literals

### Task 4: Collapse createMockAdapter (#10)

- **Files:** `src/eval/__helpers/anthropic-adapter.ts`
- **Action:** Replace standalone implementation with alias to `createMockAdapterWithResponses(new Map())`

### Task 5: Rename duplicate TokenUsageSchema (#13)

- **Files:** `src/adapters/api/api-executor.ts`, `api/index.ts`, `adapters/index.ts`
- **Action:** Rename to `AdapterTokenUsageSchema`/`AdapterTokenUsage` to disambiguate from eval's schema

### Task 6: Move interfaces to \_\_schemas/ (#14-15)

- **Files:** `src/eval/__schemas/eval.schemas.ts`, `llm-grader.ts`, `eval-runner.ts`, `composite-grader.ts`, `anthropic-adapter.ts`, `code-grader.ts`, `eval/index.ts`
- **Action:** Move `LlmAdapter`, `RunEvalOptions`, `CustomGraderFn` to canonical schema location

## Verification

- [ ] `bunx --bun tsc --noEmit` passes after each task
- [ ] Each task committed atomically
- [ ] No new external dependencies added
- [ ] Domain boundary rules respected (no upward imports)

## Success Criteria

- All 6 audit findings (#3, #8, #9, #10, #13, #14-15) resolved
- Zero typecheck errors
- 6 atomic commits with descriptive messages
