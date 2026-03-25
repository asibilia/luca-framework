# Phase 2 Context: Eval Domain + DRY Cleanup

## Phase Objective

Fix 6 audit findings: extract shared DAG successors map (#3), remove eval suite barrel exports (#8), extract makeFailResult factory (#9), collapse mock adapter (#10), rename duplicate TokenUsageSchema (#13), move interfaces to \_\_schemas/ (#14-15).

## Decisions

### 1. Extract shared buildSuccessorsMap (#3)

Extract from dag-sorter.ts, export as shared helper. Both dag-sorter and dag-validator import it.

### 2. Remove eval suite re-exports from barrel (#8)

Remove the 3 eval suite constant re-exports from src/eval/index.ts. Consumers import suites directly from src/eval/suites/.

### 3. Extract makeFailResult factory (#9)

Create a `makeFailResult(reason, metadata?)` helper in src/eval/\_\_helpers/. Replace 14+ inline literals across code-grader.ts, composite-grader.ts, eval-runner.ts.

### 4. Collapse createMockAdapter (#10)

Remove standalone `createMockAdapter`, replace with `createMockAdapterWithResponses(new Map())`. Export alias if needed.

### 5. Rename duplicate TokenUsageSchema (#13)

Rename adapter's schema to `AdapterTokenUsageSchema`/`AdapterTokenUsage` in api-executor.ts. Eval's schema stays as `TokenUsageSchema`.

### 6. Move interfaces to \_\_schemas/ (#14-15)

Move `LlmAdapter` from llm-grader.ts and `RunEvalOptions` from eval-runner.ts to src/eval/\_\_schemas/eval.schemas.ts.
