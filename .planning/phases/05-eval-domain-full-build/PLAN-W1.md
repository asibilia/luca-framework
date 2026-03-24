---
phase: 5
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 5 Plan 1: Eval Domain Scaffolding, Schemas, and Early Domain Registration

## Objective

Bootstrap the `src/eval/` domain with Archetype B (Core Domain) directory structure, all Zod schemas, an initial barrel index, and early `eval: 1` registration in the domain boundary checker. This plan delivers the foundation that all subsequent waves depend on and satisfies the premortem constraint requiring early DOMAIN_TIER registration.

> Appetite: Large (200,000 tokens remaining of 200,000 ceiling)

## Context

- @.planning/todos/pending/runtime-c01-eval-domain-scaffolding-schemas.md -- complete schema definitions
- @.planning/todos/pending/runtime-c10-domain-barrel-registration.md -- DOMAIN_TIER registration (early portion only)
- @src/workflow/ -- reference Archetype B domain structure
- @scripts/check-domain-boundaries.ts -- DOMAIN_TIER record to update
- @.claude/rules/domain-architecture.md -- T1 Core domain table
- @.claude/rules/module-boundary.md -- dependency tier map

## Tasks

### 1. Create eval domain directory structure

**Type:** auto
**TDD:** false
**Depends on:** (none)

Create the directory skeleton for the eval domain:

```
src/eval/__schemas/
src/eval/__helpers/
src/eval/suites/
```

**Files to create/edit:**

- `src/eval/__schemas/` (create directory)
- `src/eval/__helpers/` (create directory)
- `src/eval/suites/` (create directory)

**Verification:**

- All three directories exist
- No flat files in domain root yet

### 2. Create eval schemas

**Type:** auto
**TDD:** false
**Depends on:** Task 1

Create `src/eval/__schemas/eval.schemas.ts` with all Zod schemas as specified in C01. This is the single source of truth for all eval domain types.

Schemas to define (all with snake_case field names):

- `GraderTypeSchema`, `CodeGraderStrategySchema`
- `GraderResultSchema`, `CodeGraderConfigSchema`, `LlmGraderConfigSchema`
- `CompositeGraderEntrySchema`, `CompositeGraderConfigSchema`
- `EvalCaseSchema`, `EvalSuiteConfigSchema`, `EvalSuiteSchema`
- `TokenUsageSchema`, `EvalResultSchema`, `EvalRunMetadataSchema`, `EvalReportSchema`
- `ComparisonVerdictSchema`, `EvalDeltasSchema`, `EvalComparisonSchema`
- All `const` arrays (`GRADER_TYPES`, `CODE_GRADER_STRATEGIES`, `COMPARISON_VERDICTS`)
- All inferred types via `z.infer<typeof Schema>`

Implement verbatim from `.planning/todos/pending/runtime-c01-eval-domain-scaffolding-schemas.md`.

**Files to create/edit:**

- `src/eval/__schemas/eval.schemas.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All schemas parse valid inputs without error
- All types are exported

### 3. Create initial barrel index

**Type:** auto
**TDD:** false
**Depends on:** Task 2

Create `src/eval/index.ts` as a pure barrel file with re-exports from `__schemas/eval.schemas`. Only schema and type re-exports at this stage -- helper exports will be added by subsequent waves.

Implement verbatim from C01's barrel specification.

**Files to create/edit:**

- `src/eval/index.ts` (create)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Barrel contains only `export` and `export type` statements
- `grep -v '^export\|^$\|^//' src/eval/index.ts | wc -l` returns 0

### 4. Verify eval domain registration (already done in Phase 1)

**Type:** auto
**TDD:** false
**Depends on:** Task 3

Verify that `eval: 1` already exists in the `DOMAIN_TIER` record in `scripts/check-domain-boundaries.ts` (added during Phase 1 X02). Also verify `.claude/rules/domain-architecture.md` and `.claude/rules/module-boundary.md` already reference eval at T1.

**NOTE:** These registrations were completed in Phase 1. Do NOT add duplicate entries. This task is verification-only.

**Files to create/edit:** None (read-only verification)

**Verification:**

- `grep "eval: 1" scripts/check-domain-boundaries.ts` finds the entry
- `bun run scripts/check-domain-boundaries.ts` passes with zero violations
- `grep -i "eval" .claude/rules/domain-architecture.md` confirms T1 Core listing
- `grep -i "eval" .claude/rules/module-boundary.md` confirms T1 tier

## Verification

Run after all tasks complete:

```bash
bunx --bun tsc --noEmit
bun run scripts/check-domain-boundaries.ts
```

Confirm:

- `src/eval/__schemas/eval.schemas.ts` exists with all schema definitions
- `src/eval/index.ts` is a pure barrel
- `src/eval/__helpers/` and `src/eval/suites/` directories exist (empty)
- No flat files in `src/eval/` root except `index.ts`
- `eval: 1` is registered in domain boundary checker

## Success Criteria

- All eval Zod schemas compile and export correctly
- Domain boundary checker recognizes eval as T1 Core
- Architecture docs are updated
- Foundation is ready for Wave 2 helpers

## Output Specification

Files created:

- `src/eval/__schemas/eval.schemas.ts`
- `src/eval/index.ts`

Files modified: None (W1 Task 4 is verification-only; registrations already exist from Phase 1)
