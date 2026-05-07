# Plan 01 Summary: Config Schemas and Complexity Matrix Extensions

**Phase:** 10
**Plan:** 01
**Status:** COMPLETE
**Execution Time:** ~5 minutes

## Tasks Completed

### Task 1: Create workflow-version.schemas.ts

- **Commit:** `863db491`
- **File:** `src/shared/__schemas/workflow-version.schemas.ts` (NEW)
- Created `WorkflowVersionSchema` as a `z.enum(["v1", "v2"]).default("v1")`
- Exports `WorkflowVersion` inferred type
- JSDoc explains discriminator purpose (v1 = linear, v2 = extended pipeline)

### Task 2: Create research-config.schemas.ts

- **Commit:** `6741235b`
- **File:** `src/shared/__schemas/research-config.schemas.ts` (NEW)
- Created `ResearchConfigSchema` with all fields from the config-changes spec
- Fields: `parallelResearchers`, `reviewLoop`, `planReviewLoop`, `graduation`, `perTaskRecall`
- All nested objects use factory-function defaults (Zod v4 compatibility)
- Created `ResearchConfigRefinedSchema` with cross-field validation (perTaskRecall + scoringThreshold)
- All keys use camelCase per existing config convention (Decision 9)

### Task 3: Extend ComplexityGateSchema with review iteration fields

- **Commit:** `d60dd128`
- **Files:** `src/complexity/__schemas/complexity.schemas.ts` (EDIT), `src/complexity/__helpers/defaults.ts` (EDIT)
- Added `researchReviewIterations: z.number().int().nonnegative().default(1)`
- Added `planReviewIterations: z.number().int().nonnegative().default(1)`
- Uses `.nonnegative()` (not `.positive()`) because 0 means "skip review loop"
- JSDoc distinguishes `planReviewIterations` (new, v2 plan review loop) from `planVerificationIterations` (existing, lu-plan-checker loop)
- Updated default matrix values per Decision 14 iteration budgets

### Task 4: Update lu-config.schemas.ts and shared barrel

- **Commit:** `ff937c4c`
- **Files:** `src/shared/__schemas/lu-config.schemas.ts` (EDIT), `src/shared/index.ts` (EDIT)
- Extended lu-config.schemas.ts to import and re-export new schemas
- Added Workflow Version and Research Config sections to shared barrel
- All new types accessible via `import { ... } from "~/shared"`

## Deviations

- **[Rule 3 - Blocking]** Updated `src/complexity/__helpers/defaults.ts` to include the new `researchReviewIterations` and `planReviewIterations` fields in all five complexity matrix entries. Without this, TypeScript compilation failed because the output type from `ComplexityGateSchema` now requires these fields.
- **Zod v4 `.default({})` compatibility:** Nested `z.object()` defaults required factory functions (e.g., `.default(() => ({ maxIterations: 3, continueForImportant: true }))`) instead of `.default({})` because Zod v4 enforces strict input type checking on default values for object schemas with explicit fields.

## Verification

- `bunx --bun tsc --noEmit` passes cleanly after all four commits
- All exports are accessible through the shared barrel
- Schema shapes match the spec in `docs/workflow-system/v2/06-implementation-plan/config-changes.md`
