# Phase 258 Wave 1 Summary: Schema & Classifier Foundation

## Tasks Completed

### Task 1: Classifier Zod Schemas

- Created `src/complexity/__schemas/classify.schemas.ts`
- Defines 7 schemas: `classifierInputSchema`, `classifierOutputSchema`, `keywordDictionarySchema`, `classifierWeightsSchema`, `classifierThresholdsSchema`, `routingHistoryEntrySchema`, `classifierComplexitySchema`
- All types exported via `z.infer`
- Imports `COMPLEXITY_LEVELS` from sibling `complexity.schemas.ts` (T0 intra-domain)

### Task 2: Deterministic Heuristic Classifier

- Created `src/complexity/__helpers/classify.ts`
- Exports `classifyComplexity(input: ClassifierInput): ClassifierOutput`
- Five signal dimensions: keyword, file_scope, cross_cutting, risk, novelty
- Default weights: 0.2, 0.3, 0.2, 0.15, 0.15
- CLI entry point via `import.meta.main` with `--description`, `--file-count`, `--scope`, `--risk`, `--dependency-count` args
- Zero LLM dependency

### Task 3: Routing History Module

- Created `src/complexity/__helpers/routing-history.ts`
- Exports `appendRoutingEntry()` and `readRoutingHistory()`
- JSONL format at `.planning/routing-history.jsonl`
- Uses `appendFileSync` from `node:fs` for appends, `Bun.file()` for reads
- Per-line safeParse for corrupt line resilience

### Task 4: Adaptive Adjustment Module

- Created `src/complexity/__helpers/adaptive-adjust.ts`
- Exports `adjustComplexity()` with 1-level cap, 20-entry window, 60% threshold
- User override always wins (D10)
- Returns `{ adjusted, reason }` for observability

### Task 5: WorkflowContext Schema Extension

- Extended `workflowContextSchema` in `packages/luca-framework/src/state/types.ts`
- Added `git_workflow` (optional object with ticket_id, github_issue, branch, base_branch, pr_number)
- Added `token_profile` (enum: budget/balanced/quality, default: "balanced")
- Added `schema_version` (int, default: 1)
- Added `@deprecated` JSDoc on standalone ticket_id, github_issue, branch, base_branch fields
- Backward compatible: all new fields are optional with defaults

## Verification Results

- `bunx --bun tsc --noEmit`: PASSED (0 errors)
- `bun classify.ts --description="fix a typo in README"`: outputs `complexity: "TRIVIAL"`, `route: "direct"`
- `bun classify.ts --description="cross-cutting migration of auth system" --file-count=12 --scope="auth,api,database"`: outputs `complexity: "COMPLEX"`, `route: "phased"`

## Deviations

None.

## Files Created (4)

- `src/complexity/__schemas/classify.schemas.ts`
- `src/complexity/__helpers/classify.ts`
- `src/complexity/__helpers/routing-history.ts`
- `src/complexity/__helpers/adaptive-adjust.ts`

## Files Modified (1)

- `packages/luca-framework/src/state/types.ts`
