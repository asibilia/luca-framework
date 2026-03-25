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
import { buildSuccessorsMap } from "./dag-adjacency.ts";

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
  const successors = buildSuccessorsMap(dag);

  for (const step of dag.steps) {
    inDegree.set(step.id, 0);
  }

  for (const step of dag.steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        continue;
      }
      inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
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
