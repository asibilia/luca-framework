---
title: "Runtime A05: Implement topological sorter with wave grouping"
area: workflow
created: 2026-03-24
source: docs/runtime-architecture/dag-workflow-engine.md
depends_on: [A01, A02]
phase: runtime-a
estimated_files: 2
---

## Context

Implement Kahn's topological sort algorithm with wave grouping. This is a pure function that takes a `WorkflowDAG` and returns `string[][]` where each inner array is a wave of step IDs that can execute in parallel. The sorter is separated from the executor (per research doc recommendation) for testability and reuse by the validator.

## Task

### Files to Create

#### `src/workflow/__helpers/dag-sorter.ts`

````typescript
/**
 * Topological sort with wave grouping for DAG execution.
 *
 * Implements Kahn's algorithm modified to produce "waves" (parallel groups):
 * 1. Compute in-degree for every node
 * 2. Collect all nodes with in-degree 0 into wave[0]
 * 3. For each wave: execute all nodes in parallel, decrement successors' in-degrees
 * 4. Collect newly zero-in-degree nodes into the next wave
 * 5. If any nodes remain unprocessed, the graph has a cycle
 *
 * Separated from the executor for testability (research doc recommendation,
 * addressing the gap where the design doc kept sorting implicit in the executor).
 *
 * @see docs/runtime-architecture/research/dag-engines.md — Section 2.1 (Wave-Grouped Topological Sort)
 * @see docs/runtime-architecture/dag-workflow-engine.md — DAG Sorter
 */

import type { WorkflowDAG } from "../__schemas/workflow.schemas.ts";

/**
 * Topologically sort a DAG into parallel waves using Kahn's algorithm.
 *
 * Each inner array contains step IDs that have no unsatisfied dependencies
 * and can execute concurrently. Waves are ordered: wave[0] runs first,
 * wave[1] runs after wave[0] completes, etc.
 *
 * @param dag - The workflow DAG to sort
 * @returns Array of waves, where each wave is an array of step IDs
 * @throws Error if the DAG contains a cycle (nodes remain after all waves processed)
 *
 * @example
 * ```typescript
 * // Linear pipeline: A -> B -> C
 * // Returns: [["A"], ["B"], ["C"]]
 *
 * // Diamond: A -> B, A -> C, B -> D, C -> D
 * // Returns: [["A"], ["B", "C"], ["D"]]
 * ```
 */
export function topologicalSort(dag: WorkflowDAG): string[][] {
  const stepIds = new Set(dag.steps.map((s) => s.id));
  const waves: string[][] = [];

  // Build adjacency list and compute in-degrees
  const inDegree = new Map<string, number>();
  const successors = new Map<string, string[]>();

  for (const step of dag.steps) {
    inDegree.set(step.id, 0);
    successors.set(step.id, []);
  }

  for (const step of dag.steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        // Skip missing dependencies — the validator handles this error
        continue;
      }
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
      const succs = successors.get(dep);
      if (succs) {
        succs.push(step.id);
      }
    }
  }

  // Collect initial wave: all nodes with in-degree 0
  let currentWave: string[] = [];
  for (const [id, degree] of inDegree.entries()) {
    if (degree === 0) {
      currentWave.push(id);
    }
  }

  let processedCount = 0;

  // Process waves until no more zero-in-degree nodes
  while (currentWave.length > 0) {
    // Sort within wave for deterministic output order
    currentWave.sort();
    waves.push(currentWave);
    processedCount += currentWave.length;

    const nextWave: string[] = [];

    for (const id of currentWave) {
      const succs = successors.get(id) ?? [];
      for (const succ of succs) {
        const newDegree = (inDegree.get(succ) ?? 1) - 1;
        inDegree.set(succ, newDegree);
        if (newDegree === 0) {
          nextWave.push(succ);
        }
      }
    }

    currentWave = nextWave;
  }

  // If not all nodes were processed, there is a cycle
  if (processedCount < dag.steps.length) {
    const remaining = dag.steps
      .filter((s) => !waves.flat().includes(s.id))
      .map((s) => s.id);
    throw new Error(
      `DAG "${dag.name}" contains a cycle. Unprocessable steps: ${remaining.join(", ")}`,
    );
  }

  return waves;
}

/**
 * Get the flattened topological execution order of a DAG.
 *
 * Convenience function that flattens the wave groups into a single
 * ordered array. Useful for debugging and logging.
 *
 * @param dag - The workflow DAG to sort
 * @returns Flat array of step IDs in execution order
 * @throws Error if the DAG contains a cycle
 *
 * @example
 * ```typescript
 * // Linear pipeline: A -> B -> C
 * // Returns: ["A", "B", "C"]
 * ```
 */
export function getExecutionOrder(dag: WorkflowDAG): string[] {
  return topologicalSort(dag).flat();
}
````

### Files to Modify

#### `src/workflow/index.ts`

Replace the `// Added by A05` placeholder comment under `DAG Sorter` with actual exports:

```typescript
// ─── DAG Sorter ──────────────────────────────────────────────────────────────

export { topologicalSort, getExecutionOrder } from "./__helpers/dag-sorter.ts";
```

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] Linear pipeline (A -> B -> C) produces `[["A"], ["B"], ["C"]]`
- [ ] Diamond pattern (A -> B, A -> C, B -> D, C -> D) produces `[["A"], ["B", "C"], ["D"]]`
- [ ] Cycle detection throws an Error with the cycle step IDs in the message
- [ ] Single-node DAG produces `[["A"]]`
- [ ] Empty steps array produces `[]`
- [ ] `getExecutionOrder` returns the flattened result of `topologicalSort`
- [ ] Barrel index only contains re-export statements

## Notes

- Depends on: A01 (directory structure), A02 (WorkflowDAG type)
- The sorter is a pure function with no side effects — it only reads the DAG definition
- Steps within a wave are sorted alphabetically for deterministic output (important for snapshot testing and debugging)
- Missing dependency IDs in `dependsOn` are silently skipped by the sorter — the validator (A06) is responsible for catching that error
- The cycle detection message includes the unprocessable step IDs to aid debugging
