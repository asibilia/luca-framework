/**
 * Contract evaluation engine for behavioral invariant checking.
 *
 * Provides pure functions for evaluating behavioral contracts against
 * DAG checkpoints or session ledger entries. The evaluation engine
 * checks precondition/postcondition relationships and detects violations.
 *
 * **Three evaluation paths:**
 * 1. `evaluateContract` — Evaluate against a DAGCheckpoint (checkpoint-based)
 * 2. `evaluateContractFromLedger` — Evaluate against session ledger entries (event-sourced)
 * 3. `mergeContractAndGapAudits` — Merge contract violations into gap audit pipeline
 *
 * All functions are pure (no side effects) and return new objects.
 *
 * @module workflow/contract-evaluator
 * @see src/workflow/__schemas/contracts/contract.schemas.ts
 * @see src/workflow/__helpers/gap-detector.ts
 */

import isEmpty from "lodash/isEmpty";

import type { DAGCheckpoint } from "../__schemas/workflow.schemas";
import type {
  BehavioralContract,
  ContractAuditResult,
  ContractViolation,
} from "../__schemas/contracts";
import type { ExecutionGap, GapAuditResult } from "./gap-detector";

// ─── Ledger Entry Type ──────────────────────────────────────────────────────

/**
 * Minimal shape for session ledger entries used in event-sourced evaluation.
 *
 * The ledger entry only needs an event name, an optional step ID, and a
 * timestamp. This is intentionally loose to accommodate various ledger formats.
 */
export interface LedgerEntry {
  /** Event name (e.g., "STEP_COMPLETE", "STEP_SKIPPED"). */
  event: string;

  /** Step ID associated with the event. */
  stepId?: string;

  /** ISO timestamp of the event. */
  timestamp: string;
}

// ─── Merged Audit Result ────────────────────────────────────────────────────

/**
 * Result of merging contract violations with gap audit results.
 */
export interface MergedAuditResult {
  /** Combined execution gaps (original gaps + contract-derived gaps). */
  gaps: ExecutionGap[];

  /** Contract violations that were detected. */
  contractViolations: ContractViolation[];

  /**
   * Overall status:
   * - `clean`: No gaps or violations
   * - `violations_found`: Contract violations detected
   * - `gaps_found`: Execution gaps detected (no contract violations)
   * - `gaps_and_violations`: Both gaps and contract violations detected
   */
  status: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a ContractAuditResult from a contract and its detected violations.
 *
 * @param contract - The behavioral contract that was evaluated
 * @param violations - Violations detected during evaluation
 * @returns Fully populated ContractAuditResult
 */
function buildAuditResult(
  contract: BehavioralContract,
  violations: ContractViolation[],
): ContractAuditResult {
  const hardViolations = violations.filter((v) => v.kind === "hard").length;
  const softViolations = violations.filter((v) => v.kind === "soft").length;
  const recoveriesAttempted = violations.filter(
    (v) => v.recovery_attempted,
  ).length;
  const recoveriesSucceeded = violations.filter(
    (v) => v.recovery_succeeded === true,
  ).length;

  return {
    workflow: contract.workflow,
    status: isEmpty(violations) ? "clean" : "violations_found",
    violations,
    summary: {
      total_invariants: contract.invariants.length,
      hard_violations: hardViolations,
      soft_violations: softViolations,
      recoveries_attempted: recoveriesAttempted,
      recoveries_succeeded: recoveriesSucceeded,
    },
  };
}

// ─── Checkpoint-Based Evaluation ────────────────────────────────────────────

/**
 * Evaluate a behavioral contract against a DAG checkpoint.
 *
 * For each invariant in the contract, checks whether the postcondition
 * step appears in `checkpoint.completedSteps`. If it does, verifies that
 * the precondition step also appears. A missing precondition when the
 * postcondition exists constitutes a violation.
 *
 * For soft invariants, checks if recovery was attempted by looking for the
 * precondition step with retry evidence in the checkpoint's failed steps.
 *
 * @param contract - The behavioral contract to evaluate
 * @param checkpoint - The DAG execution checkpoint
 * @returns ContractAuditResult with violations and summary
 *
 * @example
 * ```typescript
 * import { evaluateContract } from "~/workflow";
 * import { CONTRACT_REGISTRY } from "~/workflow";
 *
 * const result = evaluateContract(
 *   CONTRACT_REGISTRY["pr-address"],
 *   checkpoint,
 * );
 * // result.status === "clean" | "violations_found"
 * ```
 */
export function evaluateContract(
  contract: BehavioralContract,
  checkpoint: DAGCheckpoint,
): ContractAuditResult {
  const violations: ContractViolation[] = [];
  const now = new Date().toISOString();

  for (const invariant of contract.invariants) {
    // Only check if postcondition step was completed
    const postconditionCompleted =
      checkpoint.completedSteps[invariant.postcondition] !== undefined;

    if (!postconditionCompleted) {
      // Postcondition wasn't attempted, no violation possible
      continue;
    }

    // Check if precondition was met
    const preconditionCompleted =
      checkpoint.completedSteps[invariant.precondition] !== undefined;

    if (preconditionCompleted) {
      // Both precondition and postcondition completed, invariant holds
      continue;
    }

    // Violation: postcondition completed without precondition
    // For soft invariants, check if recovery was attempted
    const recoveryAttempted =
      invariant.kind === "soft" &&
      checkpoint.failedSteps[invariant.precondition] !== undefined;

    const recoverySucceeded = recoveryAttempted
      ? checkpoint.completedSteps[invariant.precondition] !== undefined
      : null;

    violations.push({
      contract_id: contract.workflow,
      invariant_id: invariant.id,
      kind: invariant.kind,
      violated_at: now,
      postcondition_attempted: invariant.postcondition,
      precondition_missing: invariant.precondition,
      recovery_attempted: recoveryAttempted,
      recovery_succeeded: recoverySucceeded,
    });
  }

  return buildAuditResult(contract, violations);
}

// ─── Ledger-Based Evaluation ────────────────────────────────────────────────

/**
 * Evaluate a behavioral contract against session ledger entries.
 *
 * Event-sourced alternative to `evaluateContract`. Builds a completed-step
 * set from STEP_COMPLETE events in the ledger, then applies the same
 * invariant checking logic.
 *
 * @param contract - The behavioral contract to evaluate
 * @param ledgerEntries - Array of session ledger entries
 * @returns ContractAuditResult with violations and summary
 *
 * @example
 * ```typescript
 * import { evaluateContractFromLedger, CONTRACT_REGISTRY } from "~/workflow";
 *
 * const entries = [
 *   { event: "STEP_COMPLETE", stepId: "fetched", timestamp: "2026-03-28T10:00:00Z" },
 *   { event: "STEP_COMPLETE", stepId: "pushed", timestamp: "2026-03-28T10:05:00Z" },
 * ];
 *
 * const result = evaluateContractFromLedger(
 *   CONTRACT_REGISTRY["pr-address"],
 *   entries,
 * );
 * // result.status === "violations_found" (pushed without learned)
 * ```
 */
export function evaluateContractFromLedger(
  contract: BehavioralContract,
  ledgerEntries: LedgerEntry[],
): ContractAuditResult {
  const violations: ContractViolation[] = [];
  const now = new Date().toISOString();

  // Build completed-step set from STEP_COMPLETE events
  const completedSteps = new Set<string>();
  const failedSteps = new Set<string>();

  for (const entry of ledgerEntries) {
    if (entry.event === "STEP_COMPLETE" && entry.stepId) {
      completedSteps.add(entry.stepId);
    }
    if (entry.event === "STEP_FAILED" && entry.stepId) {
      failedSteps.add(entry.stepId);
    }
  }

  for (const invariant of contract.invariants) {
    // Only check if postcondition step was completed
    if (!completedSteps.has(invariant.postcondition)) {
      continue;
    }

    // Check if precondition was met
    if (completedSteps.has(invariant.precondition)) {
      continue;
    }

    // Violation detected
    const recoveryAttempted =
      invariant.kind === "soft" && failedSteps.has(invariant.precondition);

    const recoverySucceeded = recoveryAttempted
      ? completedSteps.has(invariant.precondition)
      : null;

    violations.push({
      contract_id: contract.workflow,
      invariant_id: invariant.id,
      kind: invariant.kind,
      violated_at: now,
      postcondition_attempted: invariant.postcondition,
      precondition_missing: invariant.precondition,
      recovery_attempted: recoveryAttempted,
      recovery_succeeded: recoverySucceeded,
    });
  }

  return buildAuditResult(contract, violations);
}

// ─── Merge Contract + Gap Audits ────────────────────────────────────────────

/**
 * Merge contract violations into the gap audit pipeline.
 *
 * Converts contract violations into ExecutionGap entries for unified
 * reporting. Hard violations become "fail" severity gaps, soft violations
 * (not recovered) become "warning" severity gaps.
 *
 * @param contractResult - Result from contract evaluation
 * @param gapResult - Result from gap detection
 * @returns Merged result with combined gaps, violations, and overall status
 *
 * @example
 * ```typescript
 * import { mergeContractAndGapAudits, evaluateContract, detectGaps } from "~/workflow";
 *
 * const contractResult = evaluateContract(contract, checkpoint);
 * const gapResult = detectGaps(dag, checkpoint);
 * const merged = mergeContractAndGapAudits(contractResult, gapResult);
 * // merged.status includes both gap and contract violation info
 * ```
 */
export function mergeContractAndGapAudits(
  contractResult: ContractAuditResult,
  gapResult: GapAuditResult,
): MergedAuditResult {
  // Convert contract violations into ExecutionGap entries
  const contractGaps: ExecutionGap[] = contractResult.violations.map(
    (violation) => ({
      stepId: violation.postcondition_attempted,
      stepName: `contract:${violation.invariant_id}`,
      optional: false,
      expectedStatus: `precondition:${violation.precondition_missing}`,
      actualStatus: "contract-violation",
      severity:
        violation.kind === "hard" ? ("fail" as const) : ("warning" as const),
      recommendation:
        violation.kind === "hard"
          ? `Hard contract violation: ${violation.invariant_id}. ` +
            `Step "${violation.postcondition_attempted}" completed without ` +
            `required precondition "${violation.precondition_missing}".`
          : `Soft contract violation: ${violation.invariant_id}. ` +
            `Step "${violation.postcondition_attempted}" completed without ` +
            `precondition "${violation.precondition_missing}". Recovery ${violation.recovery_attempted ? "attempted" : "not attempted"}.`,
    }),
  );

  // Combine gaps: original gaps first, then contract-derived gaps
  const combinedGaps = [...gapResult.gaps, ...contractGaps];

  // Determine overall status
  const hasContractViolations = !isEmpty(contractResult.violations);
  const hasGaps = gapResult.status !== "clean";

  let status: string;
  if (hasContractViolations && hasGaps) {
    status = "gaps_and_violations";
  } else if (hasContractViolations) {
    status = "violations_found";
  } else if (hasGaps) {
    status = "gaps_found";
  } else {
    status = "clean";
  }

  return {
    gaps: combinedGaps,
    contractViolations: contractResult.violations,
    status,
  };
}
