---
phase: 144
plan: 2
type: improvement
autonomous: true
wave: 1
depends_on: []
---

# Phase 144 Plan 2: Framework Schema Placement and Naming Fixes

## Objective

Move schemas that are currently defined inside `__helpers/` files into their
correct `__schemas/` directories per the domain architecture invariant, convert
the `RecallResult` interface to a Zod schema, and rename `interop-scanner.ts` in
the agents domain to resolve the naming collision with the `src/interop/` domain.

This addresses LOW #2 #4 #5 #6 #7 from the audit.

## Context

@src/agents/**helpers/interop-scanner.ts
@src/agents/**helpers/embedding-recall.ts
@src/agents/index.ts
@src/skills/**helpers/validate-skill-order.ts
@src/skills/index.ts
@src/shared/**helpers/recall-cache.ts
@src/shared/**helpers/memory-context-builder.ts
@src/shared/**helpers/memory-feedback.ts
@src/shared/index.ts
@.claude/rules/domain-architecture.md
@.claude/rules/module-boundary.md

## Tasks

### 1. Move interop-scanner schemas to \_\_schemas/ and rename file

**Type:** auto
**TDD:** false
**Depends on:** none

Two changes to the agents domain interop scanner:

**A. Extract schemas to `__schemas/`:**

Create `src/agents/__schemas/interop-scanner.schemas.ts` containing:

- `InteropFindingSchema` (and `InteropFinding` type)
- `InteropReportSchema` (and `InteropReport` type)

These schemas are currently defined inline in
`src/agents/__helpers/interop-scanner.ts` (lines 23-56). Move them to the
`__schemas/` directory per the domain architecture invariant that schemas live in
`__schemas/`, not `__helpers/`.

**B. Rename the helper file:**

Rename `src/agents/__helpers/interop-scanner.ts` to
`src/agents/__helpers/agent-interop-scanner.ts` to resolve the naming collision
with the `src/interop/` domain (LOW #7). The `src/interop/` domain has its own
`scanner.ts` in `__helpers/`, and having `interop-scanner` in the agents domain
creates ambiguity.

**Import updates required:**

1. `src/agents/__helpers/agent-interop-scanner.ts`: Import schemas from
   `../__schemas/interop-scanner.schemas` instead of defining inline.

2. `src/agents/index.ts` (barrel): Update schema exports to point at
   `__schemas/interop-scanner.schemas` and helper exports to point at
   `__helpers/agent-interop-scanner`.

No external consumers exist beyond the barrel -- all external code imports via
`~/agents` barrel.

**Files to create/edit:**

- Create: `src/agents/__schemas/interop-scanner.schemas.ts`
- Edit: `src/agents/__helpers/interop-scanner.ts` -> rename to `src/agents/__helpers/agent-interop-scanner.ts`
- Edit: `src/agents/index.ts`

**Verification:**

- `InteropFindingSchema` and `InteropReportSchema` live in `__schemas/`
- `agent-interop-scanner.ts` imports schemas from `__schemas/`
- Barrel exports all symbols from new locations
- `bunx --bun tsc --noEmit` passes

### 2. Move validate-skill-order schema to \_\_schemas/

**Type:** auto
**TDD:** false
**Depends on:** none

Extract `SkillOrderValidationResultSchema` (and its inferred type) from
`src/skills/__helpers/validate-skill-order.ts` (lines 21-36) into a new file
`src/skills/__schemas/skill-order-validation.schemas.ts`.

Update `validate-skill-order.ts` to import the schema from the new location.

Update `src/skills/index.ts` barrel to export the schema and type from
`__schemas/skill-order-validation.schemas` instead of from
`__helpers/validate-skill-order`.

**Files to create/edit:**

- Create: `src/skills/__schemas/skill-order-validation.schemas.ts`
- Edit: `src/skills/__helpers/validate-skill-order.ts`
- Edit: `src/skills/index.ts`

**Verification:**

- `SkillOrderValidationResultSchema` lives in `__schemas/`
- `validate-skill-order.ts` imports schema from `__schemas/`
- Barrel exports schema from new location
- `bunx --bun tsc --noEmit` passes

### 3. Move recall-cache schemas to \_\_schemas/

**Type:** auto
**TDD:** false
**Depends on:** none

Extract `RecalledEngramSchema`, `RecallCacheEntrySchema`, and their inferred
types from `src/shared/__helpers/recall-cache.ts` (lines 36-106) into a new file
`src/shared/__schemas/recall-cache.schemas.ts`.

Update `recall-cache.ts` to import schemas from the new location.

Update intra-domain consumers that import types from `recall-cache.ts`:

- `src/shared/__helpers/memory-context-builder.ts` (imports `getCachedRecall` --
  no change needed, function stays in `__helpers/`)
- `src/shared/__helpers/memory-feedback.ts` (imports `RecalledEngram` type --
  update import path to `__schemas/recall-cache.schemas`)

Update `src/shared/index.ts` barrel to export schemas and types from
`__schemas/recall-cache.schemas` instead of from `__helpers/recall-cache`.
Keep function exports (`getCachedRecall`, `setCachedRecall`, `hasRecallCache`,
`clearRecallCache`) pointing at `__helpers/recall-cache`.

**Files to create/edit:**

- Create: `src/shared/__schemas/recall-cache.schemas.ts`
- Edit: `src/shared/__helpers/recall-cache.ts`
- Edit: `src/shared/__helpers/memory-feedback.ts`
- Edit: `src/shared/index.ts`

**Verification:**

- `RecalledEngramSchema` and `RecallCacheEntrySchema` live in `__schemas/`
- `recall-cache.ts` imports schemas from `__schemas/`
- `memory-feedback.ts` imports `RecalledEngram` from `__schemas/`
- Barrel correctly splits schema vs function exports
- `bunx --bun tsc --noEmit` passes

### 4. Convert RecallResult interface to Zod schema

**Type:** auto
**TDD:** false
**Depends on:** 1

Convert the `RecallResult` interface in
`src/agents/__helpers/embedding-recall.ts` (line 240) and the
`RecallScoringContext` interface (line 262) to Zod schemas.

Create these schemas in the existing
`src/agents/__schemas/recall-scoring.schemas.ts` file (which already contains
`RecallScoringWeightsSchema`, `ScoreBreakdownSchema`, and
`ScoredRecallResultSchema`).

New schemas:

```typescript
export const RecallResultSchema = z.object({
  id: z.string(),
  concept: z.string(),
  content: z.string(),
  score: z.number(),
  tags: z.array(z.string()).optional(),
  created_at: z.string().optional(),
});

export type RecallResult = z.infer<typeof RecallResultSchema>;

export const RecallScoringContextSchema = z.object({
  tags: z.array(z.string()).default([]),
  currentMilestone: z.string().optional(),
  agentName: z.string().optional(),
});

export type RecallScoringContext = z.infer<typeof RecallScoringContextSchema>;
```

Update `embedding-recall.ts` to import `RecallResult` and
`RecallScoringContext` from the schemas file instead of defining them inline.

Update `src/agents/index.ts` barrel to export the new schemas and types from
`__schemas/recall-scoring.schemas` instead of from `__helpers/embedding-recall`.

**Files to create/edit:**

- Edit: `src/agents/__schemas/recall-scoring.schemas.ts`
- Edit: `src/agents/__helpers/embedding-recall.ts`
- Edit: `src/agents/index.ts`

**Verification:**

- No `interface RecallResult` or `interface RecallScoringContext` remains in `embedding-recall.ts`
- Both are Zod schemas in `recall-scoring.schemas.ts`
- Types are inferred via `z.infer<>`
- Barrel exports updated
- `bunx --bun tsc --noEmit` passes

## Verification

1. `bunx --bun tsc --noEmit` passes with no errors
2. No schemas remain in `__helpers/` files for the four cases addressed
3. All barrel exports are updated to point at `__schemas/` for schema symbols
4. `agent-interop-scanner.ts` replaces `interop-scanner.ts` in the agents domain
5. No broken imports across the codebase

## Success Criteria

- Four schema-in-helpers violations resolved (interop-scanner, validate-skill-order, recall-cache, embedding-recall)
- Interop naming collision resolved via rename to `agent-interop-scanner`
- RecallResult and RecallScoringContext converted from interfaces to Zod schemas
- All type-checking passes
- Barrel indices correctly re-export from new locations

## Output Specification

- Created: `src/agents/__schemas/interop-scanner.schemas.ts`
- Created: `src/skills/__schemas/skill-order-validation.schemas.ts`
- Created: `src/shared/__schemas/recall-cache.schemas.ts`
- Renamed: `src/agents/__helpers/interop-scanner.ts` -> `src/agents/__helpers/agent-interop-scanner.ts`
- Modified: `src/agents/__helpers/agent-interop-scanner.ts` (import update)
- Modified: `src/agents/__helpers/embedding-recall.ts` (interface -> schema import)
- Modified: `src/agents/__schemas/recall-scoring.schemas.ts` (new schemas added)
- Modified: `src/agents/index.ts` (barrel updates)
- Modified: `src/skills/__helpers/validate-skill-order.ts` (import update)
- Modified: `src/skills/index.ts` (barrel update)
- Modified: `src/shared/__helpers/recall-cache.ts` (schema extraction)
- Modified: `src/shared/__helpers/memory-feedback.ts` (import update)
- Modified: `src/shared/index.ts` (barrel update)
