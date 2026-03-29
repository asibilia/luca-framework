/**
 * Contract-to-hook adapter for pre-step enforcement.
 *
 * Bridges behavioral contracts into the pre-step enforcement system.
 * This module lives in T1 (workflow) so that T3 hooks can import it
 * without tier violations (T3 imports T1 = downward).
 *
 * The adapter reads the orchestrator context file to determine the
 * current workflow state, then checks whether the target step's
 * contract preconditions are met.
 *
 * @module workflow/contract-hook-adapter
 * @see src/workflow/__helpers/contract-definitions.ts
 * @see src/hooks/__helpers/enforcement-hook-factory.ts
 */

import { z } from "zod";
import isEmpty from "lodash/isEmpty";

import { CONTRACT_REGISTRY } from "./contract-definitions";

// ─── Context File Schema ────────────────────────────────────────────────────

/**
 * Minimal schema for reading orchestrator context files.
 *
 * Only validates `current_state` and `completed_states` — the fields
 * needed for contract precondition checking. Other fields are passed through.
 */
const HookContextSchema = z
  .object({
    current_state: z.string().optional(),
    completed_states: z.array(z.string()).optional(),
  })
  .passthrough();

// ─── Precondition Check Result ──────────────────────────────────────────────

/**
 * Result of checking contract preconditions for a target step.
 */
export interface PreconditionCheckResult {
  /** Whether the step is allowed to proceed. */
  allowed: boolean;

  /** Violation descriptions (empty if allowed). */
  violations: string[];
}

// ─── Precondition Checker ───────────────────────────────────────────────────

/**
 * Check contract preconditions for a target step in a workflow.
 *
 * Reads the orchestrator context file to determine which states have been
 * completed, then checks the contract for the specified workflow to see if
 * the target step's preconditions are met.
 *
 * This function is designed to be called FROM hooks (T3) but lives in
 * workflow (T1). The hook script imports this function to perform the check.
 * No tier violation: T3 imports T1 (downward).
 *
 * @param workflow - The workflow name (e.g., "pr-address", "lu")
 * @param targetStep - The step ID being attempted (e.g., "pushed", "executing")
 * @param contextPath - Absolute path to the orchestrator context JSON file
 * @returns Promise resolving to PreconditionCheckResult with allowed flag and violation descriptions
 *
 * @example
 * ```typescript
 * import { checkContractPreconditions } from "~/workflow";
 *
 * const result = await checkContractPreconditions(
 *   "pr-address",
 *   "pushed",
 *   "/tmp/pr-address-context.json",
 * );
 *
 * if (!result.allowed) {
 *   console.error("Contract violations:", result.violations);
 * }
 * ```
 */
export async function checkContractPreconditions(
  workflow: string,
  targetStep: string,
  contextPath: string,
): Promise<PreconditionCheckResult> {
  // Look up the contract for this workflow
  const contract = CONTRACT_REGISTRY[workflow];

  if (!contract) {
    // No contract defined for this workflow — allow by default
    return { allowed: true, violations: [] };
  }

  // Find invariants where the target step is the postcondition
  const relevantInvariants = contract.invariants.filter(
    (inv) => inv.postcondition === targetStep,
  );

  if (isEmpty(relevantInvariants)) {
    // No invariants gate this step — allow
    return { allowed: true, violations: [] };
  }

  // Read the context file to determine completed states
  let completedStates: Set<string>;
  try {
    const file = Bun.file(contextPath);
    const exists = await file.exists();

    if (!exists) {
      return {
        allowed: false,
        violations: [
          `Context file not found at ${contextPath}. Blocking step "${targetStep}" as a precaution.`,
        ],
      };
    }

    const fileContent = await file.text();
    const parsed = HookContextSchema.safeParse(JSON.parse(fileContent));

    if (!parsed.success) {
      // Context file is malformed — fail-closed (block the step)
      return {
        allowed: false,
        violations: [
          `Failed to parse context file at ${contextPath}: ${parsed.error.message}`,
        ],
      };
    }

    // Build completed states from context
    // The context file may have completed_states array or we infer from current_state
    const statesFromContext = parsed.data.completed_states ?? [];
    completedStates = new Set(statesFromContext);

    // If current_state is set, add all states up to and including it
    // (the current_state itself counts as completed for postcondition checks)
    if (parsed.data.current_state) {
      completedStates.add(parsed.data.current_state);
    }
  } catch {
    // Context file can't be read — fail-closed
    return {
      allowed: false,
      violations: [
        `Cannot read context file at ${contextPath}. Blocking step "${targetStep}" as a precaution.`,
      ],
    };
  }

  // Check each relevant invariant
  const violations: string[] = [];

  for (const invariant of relevantInvariants) {
    if (!completedStates.has(invariant.precondition)) {
      violations.push(
        `Contract violation [${invariant.id}]: Step "${targetStep}" requires ` +
          `precondition "${invariant.precondition}" to be completed first. ` +
          `${invariant.description}`,
      );
    }
  }

  return {
    allowed: isEmpty(violations),
    violations,
  };
}
