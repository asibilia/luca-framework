# Phase 2 Summary: Eval Domain + DRY Cleanup

**Status:** Complete
**Duration:** Single session
**Commits:** 6

## Changes

### Task 1: Extract shared buildSuccessorsMap (#3) -- `3adcd481`

- Created `src/workflow/__helpers/dag-adjacency.ts` with `buildSuccessorsMap()` helper
- Updated `dag-sorter.ts` to import and use shared helper (removed inline successor map building)
- Updated `dag-validator.ts` to use shared helper in `checkNoOrphanedSteps()` (replaced duplicated forward adjacency logic)
- Exported `buildSuccessorsMap` from workflow barrel

### Task 2: Remove eval suite re-exports from barrel (#8) -- `cc1428ed`

- Removed `luRouterEvalSuite`, `luVerifierEvalSuite`, `convergenceEvalSuite` re-exports from `src/eval/index.ts`
- Updated `scripts/eval.ts` to import suites directly from `src/eval/suites/` (the only consumer)
- Barrel now exports API-only (schemas, helpers, adapters)

### Task 3: Extract makeFailResult factory (#9) -- `984be6de`

- Created `src/eval/__helpers/grader-utils.ts` with `makeFailResult(reason, metadata?)` factory
- Replaced 14 inline `{ passed: false, score: 0.0, reason, metadata: {} }` literals across:
  - `code-grader.ts` (5 instances)
  - `composite-grader.ts` (4 instances)
  - `eval-runner.ts` (5 instances, including timeout result)
- Exported `makeFailResult` from eval barrel

### Task 4: Collapse createMockAdapter (#10) -- `69c68358`

- Replaced 22-line `createMockAdapter()` implementation with 2-line alias
- Delegates to `createMockAdapterWithResponses(new Map())` which has identical fallback behavior
- Net: -26 lines

### Task 5: Rename duplicate TokenUsageSchema (#13) -- `e059e3b0`

- Renamed `TokenUsageSchema` to `AdapterTokenUsageSchema` in `src/adapters/api/api-executor.ts`
- Renamed `TokenUsage` type to `AdapterTokenUsage`
- Updated barrel chain: `api/index.ts` and `adapters/index.ts`
- Eval domain's `TokenUsageSchema` (snake_case fields) remains canonical

### Task 6: Move interfaces to \_\_schemas/ (#14-15) -- `586ad284`

- Moved `LlmAdapter` interface from `llm-grader.ts` to `eval.schemas.ts`
- Moved `RunEvalOptions` interface from `eval-runner.ts` to `eval.schemas.ts`
- Moved `CustomGraderFn` type from `code-grader.ts` to `eval.schemas.ts` (needed by RunEvalOptions)
- Updated all 5 consuming files to import from `__schemas/` instead of `__helpers/`
- Updated eval barrel to re-export from `__schemas/` exclusively

## Deviations

- **[Rule 2 - Missing Critical]** `CustomGraderFn` was also moved to `__schemas/` alongside `LlmAdapter` and `RunEvalOptions`, even though the instructions only specified the latter two. This was necessary because `RunEvalOptions` references `CustomGraderFn`, and leaving it in `__helpers/` would have created a reverse import (schemas importing from helpers).

## Verification

- `bunx --bun tsc --noEmit` passed after every commit (6/6)
- No new dependencies added
- Domain boundary rules respected -- no upward imports
- All 6 audit findings resolved

## Files Changed

| File                                      | Action                                    |
| ----------------------------------------- | ----------------------------------------- |
| `src/workflow/__helpers/dag-adjacency.ts` | Created (shared helper)                   |
| `src/workflow/__helpers/dag-sorter.ts`    | Modified (use shared helper)              |
| `src/workflow/__helpers/dag-validator.ts` | Modified (use shared helper)              |
| `src/workflow/index.ts`                   | Modified (export buildSuccessorsMap)      |
| `src/eval/index.ts`                       | Modified (barrel cleanup)                 |
| `src/eval/__schemas/eval.schemas.ts`      | Modified (added interfaces)               |
| `src/eval/__helpers/grader-utils.ts`      | Created (makeFailResult factory)          |
| `src/eval/__helpers/code-grader.ts`       | Modified (use factory + re-export type)   |
| `src/eval/__helpers/composite-grader.ts`  | Modified (use factory + schema imports)   |
| `src/eval/__helpers/eval-runner.ts`       | Modified (use factory + schema imports)   |
| `src/eval/__helpers/anthropic-adapter.ts` | Modified (collapsed mock + schema import) |
| `src/eval/__helpers/llm-grader.ts`        | Modified (import from schemas)            |
| `src/adapters/api/api-executor.ts`        | Modified (renamed schema)                 |
| `src/adapters/api/index.ts`               | Modified (renamed re-export)              |
| `src/adapters/index.ts`                   | Modified (renamed re-export)              |
| `scripts/eval.ts`                         | Modified (direct suite imports)           |
