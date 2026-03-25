---
title: "Runtime A01: Create workflow domain scaffolding"
area: workflow
created: 2026-03-24
source: docs/runtime-architecture/dag-workflow-engine.md
depends_on: []
phase: runtime-a
estimated_files: 3
---

## Context

Create the `src/workflow/` directory structure following Archetype B (Core Domain) conventions. This is the skeleton that all subsequent Phase A tasks build on. The domain sits at T1 Core in the dependency tier map, alongside context, planner, harness, iteration, observability, and interop.

## Task

### Files to Create

#### `src/workflow/__schemas/workflow.schemas.ts`

Create an empty placeholder file. The actual schemas are defined in task A02.

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

#### `src/workflow/__schemas/contracts.schemas.ts`

Create an empty placeholder file. The actual schemas are defined in task A03.

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

#### `src/workflow/index.ts`

Create a barrel file with placeholder comments for each module. The actual exports are added incrementally as each task completes.

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

### Files to Modify

None.

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Directory structure exists: `src/workflow/__schemas/`, `src/workflow/__helpers/`
- [ ] `src/workflow/index.ts` contains only comments and no logic (barrel invariant preserved)
- [ ] No other `.ts` files exist at the `src/workflow/` root besides `index.ts`

## Notes

- Depends on: none (first task)
- The `__helpers/` directory is created empty; helper files are added by tasks A04-A09
- The barrel `index.ts` starts with placeholder comments; each subsequent task adds its exports
