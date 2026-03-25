/**
 * Shared forward-adjacency map builder for DAG analysis.
 *
 * Extracts the "step -> list of dependent steps" mapping from a DAG,
 * used by both the topological sorter (dag-sorter) and the validator
 * (dag-validator) to traverse the graph in forward direction.
 *
 * @module
 */

import type { WorkflowDAG } from "../__schemas/workflow.schemas.ts";

/**
 * Build a forward-adjacency map (successors map) from a DAG.
 *
 * For each step, returns the list of steps that depend on it.
 * Missing dependency references (step depends on a nonexistent step)
 * are silently skipped — the validator handles those errors separately.
 *
 * @param dag - The workflow DAG to analyze
 * @returns Map where each key is a step ID and the value is the list of
 *   step IDs that directly depend on it (its successors)
 *
 * @example
 * ```typescript
 * // DAG: A -> B, A -> C, B -> D
 * const successors = buildSuccessorsMap(dag);
 * // successors.get("A") => ["B", "C"]
 * // successors.get("B") => ["D"]
 * // successors.get("C") => []
 * // successors.get("D") => []
 * ```
 */
export function buildSuccessorsMap(dag: WorkflowDAG): Map<string, string[]> {
  const stepIds = new Set(dag.steps.map((s) => s.id));
  const successors = new Map<string, string[]>();

  for (const step of dag.steps) {
    successors.set(step.id, []);
  }

  for (const step of dag.steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        // Skip missing dependencies — the validator handles this error
        continue;
      }
      const succs = successors.get(dep);
      if (succs) {
        succs.push(step.id);
      }
    }
  }

  return successors;
}
