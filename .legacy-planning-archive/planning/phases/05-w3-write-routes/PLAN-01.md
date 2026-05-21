---
phase: 05
plan: 01
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 5 Plan 1: Config Section Write Routes

## Objective

Implement six PUT endpoints that write individual sections of `.planning/config.json` through the validation pipeline. Each route validates the incoming payload with a Zod schema and optional semantic validators, performs an atomic write of the full config.json (with only the target section replaced), and returns the updated section with an ETag.

## Context

@packages/luca-studio/lib/validation-pipeline.ts (createApiHandler, createValidationPipeline)
@packages/luca-studio/lib/semantic-validators.ts (checkHarnessEnabled, checkRequiredGates)
@packages/luca-studio/lib/atomic-write.ts
@packages/luca-studio/lib/etag.ts (computeETag)
@packages/luca-studio/lib/project-root.ts (resolveProjectRoot)
@packages/luca-studio/app/api/config/route.ts (existing GET /api/config)
@src/shared/**schemas/lu-config.schemas.ts (LuConfigSchema)
@src/harness/**schemas/harness.schemas.ts (HarnessConfigSchema)
@src/complexity/\_\_schemas/complexity.schemas.ts (ComplexityConfigSchema)
@.planning/config.json (target file, reference for section structure)

## Tasks

### 1. Create config section schemas and shared handler

**Type:** auto
**TDD:** false
**Depends on:** none

Create a shared config-write utility that all six section routes will use, plus Zod schemas for the four config sections that do not yet have dedicated schemas (workflow, gates, planner, complexity matrix).

The shared handler must:

1. Read the full `config.json` from disk
2. Parse the incoming section body with the section-specific Zod schema
3. Run any semantic validators for that section
4. Merge the validated section into the full config object (replace only the target key)
5. Atomic-write the full config.json back to disk
6. Return the updated section with a fresh ETag

This cannot directly use `createApiHandler()` because the write target is a section merge (read-modify-write), not a full-file overwrite. Create a `createConfigSectionHandler()` factory that wraps this pattern.

For schemas that do not yet exist, define them in a new studio-local schemas file. These schemas validate the Studio-facing shape of each section as it appears in config.json. The existing `LuConfigSchema`, `HarnessConfigSchema` are imported from `src/` and reused directly.

Sections and their schemas:

- `workflow` -- new `WorkflowSectionSchema` (matches `config.json` workflow key)
- `gates` -- new `GatesSectionSchema` (Record<string, boolean>)
- `harness` -- reuse `HarnessConfigSchema` from `src/harness/__schemas/`
- `complexity` -- new `ComplexitySectionSchema` (matches `config.json` complexity key with defaultLevel + matrix)
- `lu` -- reuse `LuConfigSchema` from `src/shared/__schemas/`
- `planner` -- new `PlannerSectionSchema` (matches `config.json` planner key)

Semantic validators per section:

- `harness` -- `checkHarnessEnabled` (at least one check enabled)
- `gates` -- `checkRequiredGates` with `["confirm_project", "confirm_phases"]`
- Other sections -- no semantic validators (schema-only)

**Files to create/edit:**

- `packages/luca-studio/lib/config-section-handler.ts` (shared factory)
- `packages/luca-studio/lib/config-section-schemas.ts` (WorkflowSectionSchema, GatesSectionSchema, ComplexitySectionSchema, PlannerSectionSchema)

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- Schemas parse valid config.json sections from the real `.planning/config.json`
- Factory function signature is clean: `createConfigSectionHandler({ section, schema, semanticValidators? })`

### 2. Create the six PUT route files

**Type:** auto
**TDD:** false
**Depends on:** 1

Create Next.js App Router route files for each config section. Each route file is minimal -- it imports the shared factory, configures it for the target section, and exports a `PUT` handler.

Routes:

- `PUT /api/config/workflow` -- uses `WorkflowSectionSchema`
- `PUT /api/config/gates` -- uses `GatesSectionSchema` + `checkRequiredGates` semantic validator
- `PUT /api/config/harness` -- uses `HarnessConfigSchema` + `checkHarnessEnabled` semantic validator
- `PUT /api/config/complexity` -- uses `ComplexitySectionSchema`
- `PUT /api/config/lu` -- uses `LuConfigSchema`
- `PUT /api/config/planner` -- uses `PlannerSectionSchema`

Each route follows the same pattern:

```typescript
import { createConfigSectionHandler } from "~/lib/config-section-handler";
import { WorkflowSectionSchema } from "~/lib/config-section-schemas";

const handler = createConfigSectionHandler({
  section: "workflow",
  schema: WorkflowSectionSchema,
});

export async function PUT(request: Request) {
  return handler(request);
}
```

**Files to create:**

- `packages/luca-studio/app/api/config/workflow/route.ts`
- `packages/luca-studio/app/api/config/gates/route.ts`
- `packages/luca-studio/app/api/config/harness/route.ts`
- `packages/luca-studio/app/api/config/complexity/route.ts`
- `packages/luca-studio/app/api/config/lu/route.ts`
- `packages/luca-studio/app/api/config/planner/route.ts`

**Verification:**

- TypeScript compiles: `bunx --bun tsc --noEmit`
- All six route files follow the same concise pattern
- Each route exports only a `PUT` function

## Verification

- `bunx --bun tsc --noEmit` passes with all new files
- Each PUT route accepts valid section JSON and would return 200 with updated content + ETag
- Invalid data would return 422 with Zod error details
- Semantic violations (all harness checks disabled, required gates removed) would return 422
- File writes are atomic (tmp + rename pattern via shared handler)
- Full config.json integrity: only the target section is modified, all other sections preserved

## Success Criteria

- Six new PUT endpoints registered in the Next.js App Router
- Shared `createConfigSectionHandler()` factory eliminates duplication
- Four new section schemas cover workflow, gates, complexity, and planner
- Two existing schemas (LuConfigSchema, HarnessConfigSchema) reused from src/
- Two sections (harness, gates) have semantic validators wired in

## Output Specification

- `packages/luca-studio/lib/config-section-handler.ts`
- `packages/luca-studio/lib/config-section-schemas.ts`
- `packages/luca-studio/app/api/config/workflow/route.ts`
- `packages/luca-studio/app/api/config/gates/route.ts`
- `packages/luca-studio/app/api/config/harness/route.ts`
- `packages/luca-studio/app/api/config/complexity/route.ts`
- `packages/luca-studio/app/api/config/lu/route.ts`
- `packages/luca-studio/app/api/config/planner/route.ts`
