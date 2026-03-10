/**
 * Validates a proposed skill execution order against the dependency graph.
 *
 * Takes a list of skill names and checks whether they can execute in
 * the given order without violating dependency constraints or mutual
 * exclusion rules.
 *
 * T2-compliant: imports only from local schemas and helpers (T2).
 */
import { z } from "zod";

import type { SkillDependencyMap } from "../__schemas/skill-dependencies";
import { buildDependencyOrder, detectConflicts } from "./dependency-graph";
import { createDefaultDependencyMap } from "./default-dependency-map";

/**
 * Result schema for skill order validation.
 *
 * Uses snake_case for API compatibility per project conventions.
 */
export const SkillOrderValidationResultSchema = z.object({
  /** Whether the proposed order is valid */
  is_valid: z.boolean(),
  /** The proposed order that was validated */
  proposed_order: z.array(z.string()),
  /** The correct topological order (may differ from proposed) */
  valid_order: z.array(z.string()),
  /** Dependency violations found (empty if valid) */
  violations: z.array(z.string()).default([]),
  /** Mutual exclusion conflicts found (empty if none) */
  conflicts: z.array(z.string()).default([]),
});

export type SkillOrderValidationResult = z.infer<
  typeof SkillOrderValidationResultSchema
>;

/**
 * Validate whether a proposed skill execution order respects the dependency graph.
 *
 * Checks two things:
 * 1. Ordering: Every skill's required_before/blocked_by dependencies appear
 *    earlier in the proposed order.
 * 2. Conflicts: No mutually exclusive skills are both present (they cannot
 *    coexist in the same execution plan).
 *
 * @param proposedOrder - The skill names in the order they would execute
 * @param deps - Optional custom dependency map (defaults to the core workflow map)
 * @returns A validated result with violations and the correct order
 *
 * @example
 * ```typescript
 * // Valid order
 * const result = validateSkillOrder(["phase-plan", "phase-execute", "verify"]);
 * // { is_valid: true, violations: [], conflicts: [], ... }
 *
 * // Invalid order (phase-execute before phase-plan)
 * const result = validateSkillOrder(["phase-execute", "phase-plan"]);
 * // { is_valid: false, violations: ["phase-execute requires phase-plan before it"], ... }
 *
 * // Conflict (mutually exclusive skills)
 * const result = validateSkillOrder(["phase-execute", "git-commit"]);
 * // { is_valid: false, conflicts: ["phase-execute and git-commit are mutually exclusive"], ... }
 * ```
 */
export function validateSkillOrder(
  proposedOrder: string[],
  deps?: SkillDependencyMap,
): SkillOrderValidationResult {
  const dependencyMap = deps ?? createDefaultDependencyMap();

  if (proposedOrder.length === 0) {
    return SkillOrderValidationResultSchema.parse({
      is_valid: true,
      proposed_order: [],
      valid_order: [],
    });
  }

  // Step 1: Detect mutual exclusion conflicts
  const conflicts = detectConflicts(dependencyMap, proposedOrder);

  // Step 2: Build the correct topological order
  let validOrder: string[];
  try {
    validOrder = buildDependencyOrder(dependencyMap, proposedOrder);
  } catch (error) {
    // Circular dependency — report as a violation
    const message =
      error instanceof Error ? error.message : "Circular dependency detected";
    return SkillOrderValidationResultSchema.parse({
      is_valid: false,
      proposed_order: proposedOrder,
      valid_order: [],
      violations: [message],
      conflicts,
    });
  }

  // Step 3: Check if proposed order respects dependencies
  const violations: string[] = [];
  const positionMap = new Map<string, number>();

  for (let i = 0; i < proposedOrder.length; i++) {
    positionMap.set(proposedOrder[i]!, i);
  }

  for (const skill of proposedOrder) {
    const entry = dependencyMap[skill];
    if (!entry) continue;

    const skillPosition = positionMap.get(skill)!;

    for (const prereq of entry.required_before) {
      const prereqPosition = positionMap.get(prereq);
      // Only check prereqs that are in the proposed order
      if (prereqPosition === undefined) continue;

      if (prereqPosition >= skillPosition) {
        violations.push(
          `${skill} requires ${prereq} before it (position ${prereqPosition} >= ${skillPosition})`,
        );
      }
    }

    for (const blocker of entry.blocked_by) {
      const blockerPosition = positionMap.get(blocker);
      if (blockerPosition === undefined) continue;

      if (blockerPosition >= skillPosition) {
        violations.push(
          `${skill} is blocked by ${blocker} which has not completed (position ${blockerPosition} >= ${skillPosition})`,
        );
      }
    }
  }

  const isValid = violations.length === 0 && conflicts.length === 0;

  return SkillOrderValidationResultSchema.parse({
    is_valid: isValid,
    proposed_order: proposedOrder,
    valid_order: validOrder,
    violations,
    conflicts,
  });
}
