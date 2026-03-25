---
phase: 2
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 2 Plan 1: Workflow Domain Scaffolding + Schemas

## Objective

Create the `src/workflow/` domain directory structure (Archetype B, Tier T1) and populate it with the full Zod schema definitions for the DAG workflow engine. This delivers the type foundation that every subsequent Phase A component (builder, sorter, validator, executor, serializer, visualizer) depends on.

## Context

- @docs/runtime-architecture/dag-workflow-engine.md
- @src/workflow/ (does not exist yet — to be created)
- @.planning/todos/pending/runtime-a01-domain-scaffolding.md
- @.planning/todos/pending/runtime-a02-workflow-schemas.md
- @.planning/todos/pending/runtime-a03-step-contracts.md
- @.claude/rules/domain-architecture.md
- @.claude/rules/module-boundary.md

## Tasks

### 1. A01 — Create workflow domain scaffolding

**Type:** auto
**TDD:** false
**Depends on:** nothing

Create the `src/workflow/` directory skeleton following Archetype B (Core Domain) conventions. Three files and one empty directory are created. All schema files are empty placeholders — the actual schemas are added in tasks 2 and 3.

**Files to create:**

- `src/workflow/__schemas/workflow.schemas.ts` — empty placeholder with JSDoc:

```typescript
/**
 * Workflow DAG schemas.
 *
 * Defines the core types for the DAG workflow engine:
 * WorkflowStep, WorkflowDAG, DAGCheckpoint, StepResult,
 * ExecutionResult, ValidationResult, and Adapter.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md
 */

// Schemas will be added in task A02
export {};
```

- `src/workflow/__schemas/contracts.schemas.ts` — empty placeholder with JSDoc:

```typescript
/**
 * Step contract schemas.
 *
 * Typed input/output schemas for each workflow phase:
 * Classify, Discuss, Plan, Execute, Verify, Learn, Commit.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md
 */

// Contracts will be added in task A03
export {};
```

- `src/workflow/index.ts` — barrel with placeholder section comments for A02–A10:

```typescript
/**
 * Public API for the workflow DAG engine domain.
 *
 * Archetype B (Core Domain), Tier T1.
 * Provides typed DAG workflow definition, validation, execution,
 * checkpoint/resume, and Mermaid visualization.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md
 */

// ─── Core Schemas ────────────────────────────────────────────────────────────
// Added by A02

// ─── Step Contracts ──────────────────────────────────────────────────────────
// Added by A03

// ─── DAG Builder ─────────────────────────────────────────────────────────────
// Added by A04

// ─── DAG Sorter ──────────────────────────────────────────────────────────────
// Added by A05

// ─── DAG Validator ───────────────────────────────────────────────────────────
// Added by A06

// ─── DAG Executor ────────────────────────────────────────────────────────────
// Added by A07

// ─── DAG Serializer ──────────────────────────────────────────────────────────
// Added by A08

// ─── DAG Visualizer ──────────────────────────────────────────────────────────
// Added by A09

// ─── Phase Pipeline ──────────────────────────────────────────────────────────
// Added by A10
```

- `src/workflow/__helpers/` — create the directory (empty, no files)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- Directory structure exists: `src/workflow/__schemas/`, `src/workflow/__helpers/`
- `src/workflow/index.ts` contains only comments (barrel invariant preserved)
- No other `.ts` files exist at the `src/workflow/` root besides `index.ts`

---

### 2. A02 — Define core workflow schemas

**Type:** auto
**TDD:** false
**Depends on:** 1 (A01)

Replace the placeholder in `workflow.schemas.ts` with 16 full Zod schemas. These are the type foundation for the entire DAG engine. Implement the schemas verbatim as specified in the todo. Then update the barrel to export all schemas and inferred types.

**Files to edit:**

- `src/workflow/__schemas/workflow.schemas.ts` — replace placeholder `export {}` with the full schema file containing:
  - `StepCategorySchema` / `StepCategory`
  - `StepStatusSchema` / `StepStatus`
  - `ExecutionStatusSchema` / `ExecutionStatus`
  - `BackoffStrategySchema` / `BackoffStrategy`
  - `RetryConfigSchema` / `RetryConfig`
  - `StepMetadataSchema` / `StepMetadata`
  - `WorkflowStepSchema` / `WorkflowStep`
  - `WorkflowDAGSchema` / `WorkflowDAG`
  - `TraceEntrySchema` / `TraceEntry`
  - `StepResultSchema` / `StepResult`
  - `ExecutionResultSchema` / `ExecutionResult`
  - `ValidationIssueSchema` / `ValidationIssue`
  - `ValidationResultSchema` / `ValidationResult`
  - `FailedStepInfoSchema` / `FailedStepInfo`
  - `DAGCheckpointSchema` / `DAGCheckpoint` (includes `checkpointSchemaVersion` field per risk-analysis.md Risk 11)
  - `AdapterSchema` / `Adapter`

- `src/workflow/index.ts` — replace the `// Added by A02` comment under `Core Schemas` with re-export statements for all 16 schemas and all 16 inferred types from `./__schemas/workflow.schemas.ts`

Implementation notes:

- The `guard` field on `WorkflowStepSchema` uses `z.function()` — intentional, guards are runtime closures that cannot be serialized
- `inputSchema` / `outputSchema` use `z.any().optional()` because Zod schemas are not themselves Zod-parseable; at runtime these hold `z.ZodTypeAny` instances
- `AdapterSchema.executeStep` uses `z.function()` — same rationale as `guard`
- `DAGCheckpointSchema` must include `checkpointSchemaVersion: z.number().int().positive().default(1)`

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 16 schema constants are exported from barrel
- All 16 inferred types are exported from barrel
- `DAGCheckpointSchema` includes `checkpointSchemaVersion` field
- Barrel contains only re-export statements (no logic)

---

### 3. A03 — Define step contract schemas

**Type:** auto
**TDD:** false
**Depends on:** 1 (A01)

Replace the placeholder in `contracts.schemas.ts` with 9 full Zod schemas. These capture the typed data flowing between workflow phases in the DAG pipeline. This task is independent of A02 — `contracts.schemas.ts` has no imports from `workflow.schemas.ts`. Implement the schemas verbatim as specified in the todo. Then update the barrel to export all schemas and inferred types.

**Files to edit:**

- `src/workflow/__schemas/contracts.schemas.ts` — replace placeholder `export {}` with the full schema file containing:
  - `ClassifyOutputSchema` / `ClassifyOutput`
  - `AppetiteSchema` / `Appetite`
  - `DiscussOutputSchema` / `DiscussOutput`
  - `PlanOutputSchema` / `PlanOutput`
  - `ExecuteOutputSchema` / `ExecuteOutput`
  - `VerificationGapSchema` / `VerificationGap`
  - `VerifyOutputSchema` / `VerifyOutput`
  - `LearnOutputSchema` / `LearnOutput`
  - `CommitOutputSchema` / `CommitOutput`

- `src/workflow/index.ts` — replace the `// Added by A03` comment under `Step Contracts` with re-export statements for all 9 schemas and all 9 inferred types from `./__schemas/contracts.schemas.ts`

Implementation notes:

- `AppetiteSchema` is a named nested schema extracted from `DiscussOutputSchema` for reuse
- `VerificationGapSchema` is a named nested schema extracted from `VerifyOutputSchema` for reuse
- The JSDoc NOTE on `contracts.schemas.ts` must include the Risk 11 warning: these are initial approximations requiring 2-3 revision cycles once tested against real workflow data
- `contracts.schemas.ts` must NOT import from `workflow.schemas.ts` (no cross-dependency between these two files)

**Verification:**

- `bunx --bun tsc --noEmit` passes
- All 9 schema constants are exported from barrel
- All 9 inferred types are exported from barrel
- `contracts.schemas.ts` imports only from `zod`, not from `workflow.schemas.ts`
- Barrel contains only re-export statements (no logic)

## Verification

Run after all three tasks complete:

1. `bunx --bun tsc --noEmit` — must pass with zero errors
2. Confirm directory structure:
   - `src/workflow/__schemas/workflow.schemas.ts` exists and is non-empty
   - `src/workflow/__schemas/contracts.schemas.ts` exists and is non-empty
   - `src/workflow/__helpers/` directory exists
   - `src/workflow/index.ts` exists and is a pure barrel
3. Confirm barrel exports all 16 core schemas + types and all 9 contract schemas + types
4. Confirm no files exist at `src/workflow/` root other than `index.ts`
5. Confirm `bun run check:drift` passes (no generated file drift introduced)

## Success Criteria

- `src/workflow/` domain is fully scaffolded following Archetype B conventions
- 16 core DAG schemas are defined and exported with inferred types
- 9 step contract schemas are defined and exported with inferred types
- TypeScript type-checks clean with zero errors
- Barrel is a pure re-export file with no logic
- Domain is ready for Phase A tasks A04–A10 to build on

## Output Specification

Produces:

- `src/workflow/__schemas/workflow.schemas.ts` — 16 Zod schemas + inferred types
- `src/workflow/__schemas/contracts.schemas.ts` — 9 Zod schemas + inferred types
- `src/workflow/__helpers/` — empty directory (future home of A04–A09 helpers)
- `src/workflow/index.ts` — pure barrel exporting all public workflow domain API
