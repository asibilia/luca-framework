---
phase: 10
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 10 Plan 1: Config Schemas and Complexity Matrix Extensions

## Objective

Create the v2 configuration schemas (ResearchConfigSchema, WorkflowVersionSchema) and extend the complexity matrix with review iteration fields. These are T0 Foundation artifacts that all downstream plans depend on -- agents and skills in Plans 2 and 3 import types and reference config shapes defined here.

> Appetite: Large (200,000 tokens remaining of 200,000 ceiling)

## Context

@docs/workflow-system/v2/06-implementation-plan/config-changes.md
@src/shared/**schemas/lu-config.schemas.ts
@src/complexity/**schemas/complexity.schemas.ts
@src/shared/index.ts
@.planning/phases/10-v2-plan-executor-config/CONTEXT.md (Decisions 4, 9)

## Tasks

### 1. Create workflow-version.schemas.ts

**Type:** auto
**Depends on:** none
**Research refs:** research:config-v2-workflow-version

Create `src/shared/__schemas/workflow-version.schemas.ts` with the `WorkflowVersionSchema` enum and inferred type.

The schema is a two-value enum (`"v1"` | `"v2"`) defaulting to `"v1"`. Include JSDoc explaining the discriminator purpose (v1 = linear pipeline, v2 = extended pipeline with parallel research/review/graduation).

**Files to create/edit:**

- `src/shared/__schemas/workflow-version.schemas.ts` (NEW)

**Verification:**

- File exports `WorkflowVersionSchema` and `WorkflowVersion` type
- `WorkflowVersionSchema.parse(undefined)` returns `"v1"` (default)
- `WorkflowVersionSchema.parse("v2")` returns `"v2"`
- `bunx --bun tsc --noEmit` passes

### 2. Create research-config.schemas.ts

**Type:** auto
**Depends on:** none
**Research refs:** research:config-v2-research-section

Create `src/shared/__schemas/research-config.schemas.ts` with `ResearchConfigSchema`, `ResearchConfigRefinedSchema`, and inferred types.

Follow the exact schema shape from `docs/workflow-system/v2/06-implementation-plan/config-changes.md` Section 2. Key requirements:

- All keys use **camelCase** (internal config, not API payload -- per CONTEXT.md Decision 9)
- Nested objects use `.default({})` to make nesting optional
- Include the `.refine()` cross-field validation guard (perTaskRecall + scoringThreshold)
- Export both the base schema and the refined schema

Fields: `parallelResearchers`, `reviewLoop` (with `maxIterations`, `continueForImportant`), `planReviewLoop` (with `maxIterations`), `graduation` (with `confidenceThreshold`, `scoringThreshold`, `autoCleanupAfterMilestone`), `perTaskRecall` (with `enabled`, `maxEngramsPerTask`).

**Files to create/edit:**

- `src/shared/__schemas/research-config.schemas.ts` (NEW)

**Verification:**

- File exports `ResearchConfigSchema`, `ResearchConfigRefinedSchema`, `ResearchConfig` type
- `ResearchConfigSchema.parse({})` returns full default config (all nested defaults applied)
- `ResearchConfigRefinedSchema.safeParse({ perTaskRecall: { enabled: true }, graduation: { scoringThreshold: 0.99 } })` returns `success: false`
- All keys are camelCase (not snake_case)
- `bunx --bun tsc --noEmit` passes

### 3. Extend ComplexityGateSchema with review iteration fields

**Type:** auto
**Depends on:** none
**Research refs:** research:config-v2-complexity-matrix

Add two optional fields to `ComplexityGateSchema` in `src/complexity/__schemas/complexity.schemas.ts`:

```typescript
/** Max iterations for research review loop (overrides research.reviewLoop.maxIterations per-complexity) */
researchReviewIterations: z.number().int().nonnegative().default(1),
/** Max iterations for plan review loop (overrides research.planReviewLoop.maxIterations per-complexity) */
planReviewIterations: z.number().int().nonnegative().default(1),
```

Insert after the existing `default_model` field (around line 158). Use `.nonnegative()` (not `.positive()`) because `0` means "skip review loop" and is a valid value.

Do NOT confuse `planReviewIterations` (new, for plan REVIEW loop) with `planVerificationIterations` (existing, for lu-plan-checker loop). Add a JSDoc comment distinguishing them.

**Files to create/edit:**

- `src/complexity/__schemas/complexity.schemas.ts` (EDIT)

**Verification:**

- `ComplexityGateSchema` now includes `researchReviewIterations` and `planReviewIterations`
- Existing parsing still works (both fields default to 1 when absent)
- `ComplexityGate` type includes the new fields via z.infer
- `bunx --bun tsc --noEmit` passes

### 4. Update lu-config.schemas.ts and shared barrel

**Type:** auto
**Depends on:** 1, 2

Extend `src/shared/__schemas/lu-config.schemas.ts` to import and re-export the new schemas. This makes them available via `~/shared` for downstream consumers.

Add imports and re-exports:

```typescript
import { ResearchConfigSchema } from "./research-config.schemas";
import { WorkflowVersionSchema } from "./workflow-version.schemas";

export {
  ResearchConfigSchema,
  ResearchConfigRefinedSchema,
} from "./research-config.schemas";
export type { ResearchConfig } from "./research-config.schemas";
export { WorkflowVersionSchema } from "./workflow-version.schemas";
export type { WorkflowVersion } from "./workflow-version.schemas";
```

Then update `src/shared/index.ts` barrel to re-export the new schemas under a `Research Config` section:

```typescript
// --- Research Config ---
export {
  ResearchConfigSchema,
  ResearchConfigRefinedSchema,
} from "./__schemas/research-config.schemas";
export type { ResearchConfig } from "./__schemas/research-config.schemas";
export { WorkflowVersionSchema } from "./__schemas/workflow-version.schemas";
export type { WorkflowVersion } from "./__schemas/workflow-version.schemas";
```

**Files to create/edit:**

- `src/shared/__schemas/lu-config.schemas.ts` (EDIT)
- `src/shared/index.ts` (EDIT)

**Verification:**

- `import { ResearchConfigSchema, WorkflowVersionSchema } from "~/shared"` resolves
- `import type { ResearchConfig, WorkflowVersion } from "~/shared"` resolves
- `bunx --bun tsc --noEmit` passes
- No upward tier violations (shared is T0, schemas are T0)

## Verification

- All new schema files exist and export expected symbols
- `bunx --bun tsc --noEmit` passes across the entire project
- No module boundary violations (all new files are in T0 domains: shared, complexity)
- Config defaults match v1 behavior (backward compatible)

## Success Criteria

- `WorkflowVersionSchema`, `ResearchConfigSchema`, `ResearchConfigRefinedSchema` are importable from `~/shared`
- `ComplexityGateSchema` includes `researchReviewIterations` and `planReviewIterations` with `.default(1)`
- All schemas use camelCase keys per CONTEXT.md Decision 9
- Zero type errors

## Output Specification

- `src/shared/__schemas/workflow-version.schemas.ts` (NEW)
- `src/shared/__schemas/research-config.schemas.ts` (NEW)
- `src/complexity/__schemas/complexity.schemas.ts` (EDITED)
- `src/shared/__schemas/lu-config.schemas.ts` (EDITED)
- `src/shared/index.ts` (EDITED)
