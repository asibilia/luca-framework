---
phase: 3
plan: 1
type: feature
autonomous: true
wave: 1
depends_on: []
---

# Phase 3 Plan 1: DAG Builder, Sorter, Validator

## Objective

Implement the three algorithmic helpers that form the core of the workflow DAG engine: a fluent builder API for constructing DAGs, a topological sorter with wave grouping via Kahn's algorithm, and a static validator with 5 structural checks. These are the first execution-facing modules in the workflow domain — all subsequent phases (executor, serializer, visualizer) depend on them.

A04 and A05 are independent of each other and run in Wave 1. A06 depends on A05 for cycle detection and runs in Wave 2.

## Context

- @src/workflow/index.ts — barrel to update for each helper (placeholders already present)
- @src/workflow/\_\_schemas/workflow.schemas.ts — WorkflowDAGSchema, WorkflowStep, WorkflowDAG, ValidationResult, ValidationIssue types
- @src/workflow/\_\_schemas/contracts.schemas.ts — ClassifyOutputSchema and other step contracts
- @src/shared/\_\_helpers/deep-freeze.ts — deepFreeze utility imported by dag-builder
- @.planning/todos/pending/runtime-a04-dag-builder.md — full verbatim implementation for A04
- @.planning/todos/pending/runtime-a05-dag-sorter.md — full verbatim implementation for A05
- @.planning/todos/pending/runtime-a06-dag-validator.md — full verbatim implementation for A06
- @.planning/phases/03-dag-builder-sorter-validator/03-CONTEXT.md — phase decisions and notes

## Tasks

### Wave 1

#### 1. Implement dag-builder.ts (A04)

**Type:** auto
**TDD:** false
**Depends on:** A01 (complete), A02 (complete)

Create `src/workflow/__helpers/dag-builder.ts` with the full verbatim implementation from the A04 todo file.

Key implementation details:

- Export `buildPhaseDAG(name: string): DAGBuilder` factory function using functional closure — no classes
- Export `StepConfig` interface and `DAGBuilder` interface
- `.step(id, config)` accumulates steps into local array and returns `builder` for chaining
- `.parallelGroup(name, stepIds)` populates local `groups` record
- `.timeout(ms)` and `.version(semver)` set local variables
- `.build()` constructs the raw object, calls `WorkflowDAGSchema.safeParse()`, throws descriptive `Error` on failure, deep-freezes and returns `Readonly<WorkflowDAG>` on success
- Import `deepFreeze` from `~/shared/__helpers/deep-freeze.ts` (allowed per module-boundary rule)
- Import `WorkflowDAGSchema`, `WorkflowStep`, `WorkflowDAG` from `../__schemas/workflow.schemas.ts`

**Files to create/edit:**

- `src/workflow/__helpers/dag-builder.ts` (create)
- `src/workflow/index.ts` (edit: replace `// Added by A04` placeholder with exports)

The barrel addition under `// --- DAG Builder ---` is:

```typescript
// ─── DAG Builder ─────────────────────────────────────────────────────────────

export { buildPhaseDAG } from "./__helpers/dag-builder.ts";
export type { StepConfig, DAGBuilder } from "./__helpers/dag-builder.ts";
```

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors
- `buildPhaseDAG("test").step("a", { handler: "h" }).build()` returns a frozen WorkflowDAG
- `.build()` throws an Error with the DAG name and issue details when schema validation fails
- The returned object is deeply frozen (mutations throw in strict mode)
- No classes used — only functional closures
- Barrel index.ts only contains re-export statements

---

#### 2. Implement dag-sorter.ts (A05)

**Type:** auto
**TDD:** false
**Depends on:** A01 (complete), A02 (complete)

Create `src/workflow/__helpers/dag-sorter.ts` with the full verbatim implementation from the A05 todo file.

Key implementation details:

- Export `topologicalSort(dag: WorkflowDAG): string[][]` — pure function, throws on cycle
- Export `getExecutionOrder(dag: WorkflowDAG): string[]` — convenience wrapper that flattens result
- Kahn's algorithm: compute in-degrees, collect zero-in-degree nodes into waves, process wave by wave
- Steps within each wave are sorted alphabetically for deterministic output
- Missing dependency IDs in `dependsOn` are silently skipped (validator handles that error)
- Cycle detection message includes the unprocessable step IDs: `DAG "${dag.name}" contains a cycle. Unprocessable steps: ${remaining.join(", ")}`
- Import only `WorkflowDAG` type from `../__schemas/workflow.schemas.ts`

**Files to create/edit:**

- `src/workflow/__helpers/dag-sorter.ts` (create)
- `src/workflow/index.ts` (edit: replace `// Added by A05` placeholder with exports)

The barrel addition under `// --- DAG Sorter ---` is:

```typescript
// ─── DAG Sorter ──────────────────────────────────────────────────────────────

export { topologicalSort, getExecutionOrder } from "./__helpers/dag-sorter.ts";
```

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors
- Linear A -> B -> C produces `[["A"], ["B"], ["C"]]`
- Diamond (A -> B, A -> C, B -> D, C -> D) produces `[["A"], ["B", "C"], ["D"]]`
- Cycle (A -> B -> A) throws Error containing the cycle step IDs
- Single-node DAG produces `[["A"]]`
- Empty steps array produces `[]`
- `getExecutionOrder` returns the flattened result of `topologicalSort`
- Barrel index.ts only contains re-export statements

---

### Wave 2

#### 3. Implement dag-validator.ts (A06)

**Type:** auto
**TDD:** false
**Depends on:** Task 2 (A05 sorter must exist for cycle delegation)

Create `src/workflow/__helpers/dag-validator.ts` with the full verbatim implementation from the A06 todo file.

Key implementation details:

- Export `validateDAG(dag: WorkflowDAG): ValidationResult`
- 5 checks dispatched to private helper functions:
  1. `checkNoCycles` — calls `topologicalSort(dag)`, catches thrown Error, pushes `{ type: "cycle", message }` to errors
  2. `checkDependenciesExist` — iterates all `step.dependsOn`, pushes `{ type: "missing-dependency", message, stepId }` for any missing ID
  3. `checkSchemaCompatibility` — best-effort duck-typing via `getZodObjectShape`, pushes warnings of type `"schema-mismatch"` (not errors)
  4. `checkNoOrphanedSteps` — BFS from root steps via forward adjacency, pushes warnings of type `"orphaned-step"` and `"no-root"`
  5. `checkParallelGroups` — iterates `dag.parallelGroups` entries, pushes `{ type: "invalid-parallel-group", message, stepId }` for nonexistent references
- Returns `{ valid: errors.length === 0, errors, warnings }`
- Import `topologicalSort` from `./dag-sorter.ts` (relative, same `__helpers` directory)
- Import `WorkflowDAG`, `ValidationResult`, `ValidationIssue` from `../__schemas/workflow.schemas.ts`
- Schema compatibility (Check 3) and orphaned steps (Check 4) produce warnings only — not errors
- `getZodObjectShape` uses duck-typing on `.shape` property — no `instanceof z.ZodObject` to avoid version issues

**Files to create/edit:**

- `src/workflow/__helpers/dag-validator.ts` (create)
- `src/workflow/index.ts` (edit: replace `// Added by A06` placeholder with exports)

The barrel addition under `// --- DAG Validator ---` is:

```typescript
// ─── DAG Validator ───────────────────────────────────────────────────────────

export { validateDAG } from "./__helpers/dag-validator.ts";
```

**Verification:**

- `bunx --bun tsc --noEmit` passes with no errors
- Cycle (A -> B -> A): returns `valid: false` with error `type === "cycle"`
- Missing dep: returns error `type === "missing-dependency"` with correct `stepId`
- Schema mismatch (B expects field not in A's output): returns warning `type === "schema-mismatch"`
- Orphaned step (unreachable from roots): returns warning `type === "orphaned-step"`
- Invalid parallel group (nonexistent step ID): returns error `type === "invalid-parallel-group"`
- Valid linear pipeline: returns `{ valid: true, errors: [], warnings: [] }`
- Barrel index.ts only contains re-export statements

## Verification

After all three tasks complete:

1. Run `bunx --bun tsc --noEmit` — must pass clean with no type errors across the entire src/ tree
2. Inspect `src/workflow/index.ts` — confirm A04, A05, A06 placeholder comments are replaced with live exports and the file remains a pure barrel (no logic, no schemas)
3. Inspect `src/workflow/__helpers/` — confirm three new files exist: `dag-builder.ts`, `dag-sorter.ts`, `dag-validator.ts`
4. Confirm no classes appear in any of the three new files (`grep -n "class " src/workflow/__helpers/dag-*.ts` should return empty)
5. Confirm `dag-validator.ts` imports `topologicalSort` from `./dag-sorter.ts` (relative) not from the barrel

## Success Criteria

- All three helper files exist at their canonical paths
- `bunx --bun tsc --noEmit` exits 0 with zero diagnostic errors
- `src/workflow/index.ts` barrel exports `buildPhaseDAG`, `StepConfig`, `DAGBuilder`, `topologicalSort`, `getExecutionOrder`, and `validateDAG`
- No classes used in any of the three files
- A06 delegates cycle detection to A05 via direct relative import
- The workflow domain is ready for A07 (DAG executor) which depends on all three helpers

## Output Specification

- `src/workflow/__helpers/dag-builder.ts` — fluent builder factory
- `src/workflow/__helpers/dag-sorter.ts` — Kahn's algorithm with wave grouping
- `src/workflow/__helpers/dag-validator.ts` — 5-check static validator
- `src/workflow/index.ts` — updated barrel with A04/A05/A06 exports replacing placeholders
