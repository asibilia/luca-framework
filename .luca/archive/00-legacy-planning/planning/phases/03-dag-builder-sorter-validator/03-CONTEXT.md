# Phase 3 Context: DAG Builder, Sorter, Validator

## Objective

Implement 3 algorithmic helpers in src/workflow/\_\_helpers/: fluent DAG builder, Kahn's topological sorter with wave grouping, and static DAG validator with 5 checks.

## Decisions

### Implementation Approach (locked)

- A04: Fluent builder using functional closures (no classes). Accumulate steps via `.step()`, finalize with `.build()` which validates via `WorkflowDAGSchema.safeParse()` and deep-freezes the result.
- A05: Kahn's algorithm modified for wave grouping. Pure function: `WorkflowDAG → string[][]`. Throws on cycle detection.
- A06: 5 static checks (cycles, missing deps, schema compat, orphans, parallel groups). Delegates cycle detection to A05 sorter. Returns `ValidationResult`.

### Dependencies (locked)

- A04 depends on A01 + A02 (needs WorkflowDAGSchema)
- A05 depends on A01 + A02 (needs WorkflowDAG type)
- A06 depends on A01 + A02 + A05 (uses sorter for cycle detection)
- A04 and A05 are independent of each other

### Key Notes

- All todos have exact TypeScript implementations — implement verbatim
- Zod v4 syntax for z.function() if needed (pitfall from Phase 2)
- Each helper must be added to barrel index.ts exports
- Functional patterns only (no classes)

## No Gray Areas

Complete implementations specified in todo files.
