/**
 * Static analysis of DAG definitions at build time.
 *
 * Performs 5 validation checks:
 * 1. No cycles — topological sort succeeds (delegates to dag-sorter)
 * 2. All dependsOn references exist — every step ID in dependsOn points to an existing step
 * 3. Schema compatibility — output schema of step N is compatible with input schema of dependent step
 * 4. No orphaned steps — every step is reachable from at least one root (zero-dependency step)
 * 5. Parallel group validation — parallel groups reference only existing step IDs
 *
 * @see docs/architecture/dag-engine.md — DAG Validator
 */

import type { z } from "zod";

import type {
  WorkflowDAG,
  ValidationResult,
  ValidationIssue,
} from "../__schemas/workflow.schemas.ts";
import { topologicalSort } from "./dag-sorter.ts";
import { buildSuccessorsMap } from "./dag-adjacency.ts";

/**
 * Validate a DAG definition before execution.
 *
 * Returns a ValidationResult containing errors (which prevent execution)
 * and warnings (which indicate potential issues but do not prevent execution).
 *
 * @param dag - The workflow DAG to validate
 * @returns ValidationResult with valid flag, errors array, and warnings array
 *
 * @example
 * ```typescript
 * import { validateDAG, buildPhaseDAG } from "~/workflow";
 *
 * const dag = buildPhaseDAG("test").step("a", { handler: "h" }).build();
 * const result = validateDAG(dag);
 * if (!result.valid) {
 *   console.error("DAG validation failed:", result.errors);
 * }
 * ```
 */
export function validateDAG(dag: WorkflowDAG): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Build a step ID set for lookups
  const stepIds = new Set(dag.steps.map((s) => s.id));
  const stepMap = new Map(dag.steps.map((s) => [s.id, s]));

  // ── Check 1: No cycles ───────────────────────────────────────────────────
  checkNoCycles(dag, errors);

  // ── Check 2: All dependsOn references exist ──────────────────────────────
  checkDependenciesExist(dag, stepIds, errors);

  // ── Check 3: Schema compatibility ────────────────────────────────────────
  checkSchemaCompatibility(dag, stepMap, warnings);

  // ── Check 4: No orphaned steps ───────────────────────────────────────────
  checkNoOrphanedSteps(dag, stepIds, stepMap, warnings);

  // ── Check 5: Parallel group validation ───────────────────────────────────
  checkParallelGroups(dag, stepIds, errors);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ─── Check 1: No Cycles ─────────────────────────────────────────────────────

/**
 * Verify the DAG contains no cycles by attempting topological sort.
 */
function checkNoCycles(dag: WorkflowDAG, errors: ValidationIssue[]): void {
  try {
    topologicalSort(dag);
  } catch (err) {
    errors.push({
      type: "cycle",
      message:
        err instanceof Error
          ? err.message
          : `DAG "${dag.name}" contains a cycle`,
    });
  }
}

// ─── Check 2: Dependencies Exist ─────────────────────────────────────────────

/**
 * Verify all dependsOn references point to existing steps.
 */
function checkDependenciesExist(
  dag: WorkflowDAG,
  stepIds: Set<string>,
  errors: ValidationIssue[],
): void {
  for (const step of dag.steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        errors.push({
          type: "missing-dependency",
          message: `Step "${step.id}" depends on "${dep}" which does not exist in the DAG`,
          stepId: step.id,
        });
      }
    }
  }
}

// ─── Check 3: Schema Compatibility ──────────────────────────────────────────

/**
 * Best-effort schema compatibility check between connected steps.
 *
 * If step A's outputSchema is defined and step B (which dependsOn A) has
 * inputSchema defined, verify B's inputSchema fields are a subset of
 * A's outputSchema fields.
 *
 * This is a best-effort static check — runtime validation at step boundaries
 * is the authoritative gate.
 */
function checkSchemaCompatibility(
  dag: WorkflowDAG,
  stepMap: Map<string, (typeof dag.steps)[number]>,
  warnings: ValidationIssue[],
): void {
  for (const step of dag.steps) {
    if (!step.inputSchema) continue;

    // For each dependency, check if its output schema covers this step's input schema
    for (const depId of step.dependsOn) {
      const depStep = stepMap.get(depId);
      if (!depStep?.outputSchema) continue;

      // Both schemas must be Zod objects to compare fields
      const inputShape = getZodObjectShape(step.inputSchema);
      const outputShape = getZodObjectShape(depStep.outputSchema);

      if (!inputShape || !outputShape) continue;

      // Check that every field in inputSchema exists in outputSchema
      for (const fieldName of Object.keys(inputShape)) {
        if (!(fieldName in outputShape)) {
          warnings.push({
            type: "schema-mismatch",
            message: `Step "${step.id}" expects input field "${fieldName}" but upstream step "${depId}" does not produce it`,
            stepId: step.id,
          });
        }
      }
    }
  }
}

/**
 * Attempt to extract the shape (field map) from a Zod object schema.
 * Returns null if the schema is not a ZodObject.
 */
function getZodObjectShape(schema: unknown): Record<string, unknown> | null {
  if (
    schema &&
    typeof schema === "object" &&
    "shape" in schema &&
    typeof (schema as { shape: unknown }).shape === "object" &&
    (schema as { shape: unknown }).shape !== null
  ) {
    return (schema as { shape: Record<string, unknown> }).shape;
  }
  return null;
}

// ─── Check 4: No Orphaned Steps ─────────────────────────────────────────────

/**
 * Verify every step is reachable from at least one root (zero-dependency step).
 *
 * A step is "orphaned" if it has dependencies but none of its dependency
 * chains lead back to a root step. In practice, this is already caught by
 * the cycle check — but this provides a more specific error message for
 * the case where a step depends on itself or forms a disconnected subgraph.
 */
function checkNoOrphanedSteps(
  dag: WorkflowDAG,
  stepIds: Set<string>,
  stepMap: Map<string, (typeof dag.steps)[number]>,
  warnings: ValidationIssue[],
): void {
  // Find root steps (no dependencies)
  const roots = dag.steps
    .filter((s) => s.dependsOn.length === 0)
    .map((s) => s.id);

  if (roots.length === 0 && dag.steps.length > 0) {
    warnings.push({
      type: "no-root",
      message: `DAG "${dag.name}" has no root steps (steps with zero dependencies)`,
    });
    return;
  }

  // BFS from roots to find all reachable steps
  const reachable = new Set<string>();
  const queue = [...roots];

  // Build forward adjacency: step -> steps that depend on it
  const forwardAdj = buildSuccessorsMap(dag);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const children = forwardAdj.get(current) ?? [];
    for (const child of children) {
      if (!reachable.has(child)) {
        queue.push(child);
      }
    }
  }

  // Report unreachable steps
  for (const step of dag.steps) {
    if (!reachable.has(step.id)) {
      warnings.push({
        type: "orphaned-step",
        message: `Step "${step.id}" is not reachable from any root step`,
        stepId: step.id,
      });
    }
  }
}

// ─── Check 5: Parallel Group Validation ──────────────────────────────────────

/**
 * Verify parallel groups reference only existing step IDs.
 */
function checkParallelGroups(
  dag: WorkflowDAG,
  stepIds: Set<string>,
  errors: ValidationIssue[],
): void {
  if (!dag.parallelGroups) return;

  for (const [groupName, groupStepIds] of Object.entries(dag.parallelGroups)) {
    for (const stepId of groupStepIds) {
      if (!stepIds.has(stepId)) {
        errors.push({
          type: "invalid-parallel-group",
          message: `Parallel group "${groupName}" references step "${stepId}" which does not exist`,
          stepId,
        });
      }
    }
  }
}
