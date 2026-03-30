/**
 * Behavioral contract schemas for workflow enforcement.
 *
 * Behavioral contracts express cross-step temporal properties that state
 * machines alone cannot enforce (e.g., "no push without LEARNED transition").
 * They complement the existing gap detector and enforcement hooks by adding
 * precondition/postcondition invariant checking.
 *
 * Schemas defined here:
 * - InvariantKindSchema: hard vs soft invariant classification
 * - ContractInvariantSchema: a single precondition/postcondition invariant
 * - BehavioralContractSchema: groups invariants for a workflow
 * - ContractViolationSchema: records a detected violation
 * - ContractAuditResultSchema: aggregates violations for a workflow execution
 *
 * @module workflow/contracts
 * @see src/workflow/__helpers/contract-evaluator.ts
 * @see src/workflow/__helpers/contract-definitions.ts
 */

import { z } from "zod";

// ─── Invariant Kind ─────────────────────────────────────────────────────────

/**
 * Classification of an invariant's strictness.
 *
 * - `hard`: Must always hold. Violations are blocking failures.
 * - `soft`: Allows bounded recovery attempts before failing.
 */
export const InvariantKindSchema = z.enum(["hard", "soft"]);

/** Whether an invariant is hard (must hold) or soft (allows recovery). */
export type InvariantKind = z.infer<typeof InvariantKindSchema>;

// ─── Contract Invariant ─────────────────────────────────────────────────────

/**
 * A single behavioral invariant defining a precondition/postcondition
 * relationship between two workflow steps.
 *
 * The invariant states: "Before step `postcondition` can be considered
 * complete, step `precondition` must have completed first."
 *
 * @example
 * ```typescript
 * const invariant: ContractInvariant = {
 *   id: "pr-address:no-push-without-learned",
 *   kind: "hard",
 *   description: "Cannot push without completing the learn step",
 *   precondition: "learned",
 *   postcondition: "pushed",
 *   recovery_limit: 0,
 * };
 * ```
 */
export const ContractInvariantSchema = z.object({
  /** Unique invariant identifier (e.g., "pr-address:no-push-without-learned"). */
  id: z.string().min(1),

  /** Whether this invariant is hard (blocking) or soft (allows recovery). */
  kind: InvariantKindSchema,

  /** Human-readable explanation of what the invariant enforces. */
  description: z.string().min(1),

  /** Step ID that must have completed (the "before" condition). */
  precondition: z.string().min(1),

  /** Step ID being gated (the "after" condition). */
  postcondition: z.string().min(1),

  /**
   * Maximum recovery attempts for soft invariants.
   *
   * Only meaningful when `kind` is `"soft"`. Hard invariants ignore this value.
   * Default is 1 for soft invariants.
   */
  recovery_limit: z.number().int().nonnegative().default(1),
});

/** A single behavioral invariant with precondition/postcondition. */
export type ContractInvariant = z.infer<typeof ContractInvariantSchema>;

// ─── Behavioral Contract ────────────────────────────────────────────────────

/**
 * A behavioral contract grouping invariants for a single workflow.
 *
 * Each workflow (e.g., "pr-address", "lu") has one contract that defines
 * all of its precondition/postcondition relationships.
 *
 * @example
 * ```typescript
 * const contract: BehavioralContract = {
 *   workflow: "pr-address",
 *   invariants: [
 *     {
 *       id: "pr-address:no-push-without-learned",
 *       kind: "hard",
 *       description: "Cannot push without completing the learn step",
 *       precondition: "learned",
 *       postcondition: "pushed",
 *       recovery_limit: 0,
 *     },
 *   ],
 * };
 * ```
 */
export const BehavioralContractSchema = z.object({
  /** Workflow name (e.g., "pr-address", "lu", "verify"). */
  workflow: z.string().min(1),

  /** Invariants that must hold during this workflow's execution. */
  invariants: z.array(ContractInvariantSchema),
});

/** A behavioral contract for a specific workflow. */
export type BehavioralContract = z.infer<typeof BehavioralContractSchema>;

// ─── Contract Violation ─────────────────────────────────────────────────────

/**
 * A detected violation of a behavioral contract invariant.
 *
 * Recorded when a postcondition step completed but its required
 * precondition step did not.
 */
export const ContractViolationSchema = z.object({
  /** ID of the contract this violation belongs to. */
  contract_id: z.string().min(1),

  /** ID of the specific invariant that was violated. */
  invariant_id: z.string().min(1),

  /** Whether the violated invariant is hard or soft. */
  kind: InvariantKindSchema,

  /** ISO timestamp when the violation was detected. */
  violated_at: z.string(),

  /** Step ID that was attempted without its precondition met. */
  postcondition_attempted: z.string().min(1),

  /** Step ID that should have completed but was missing. */
  precondition_missing: z.string().min(1),

  /** Whether recovery was attempted for soft invariants. */
  recovery_attempted: z.boolean(),

  /** Whether recovery succeeded. Null if no recovery was attempted. */
  recovery_succeeded: z.boolean().nullable(),
});

/** A detected violation of a contract invariant. */
export type ContractViolation = z.infer<typeof ContractViolationSchema>;

// ─── Contract Audit Summary ─────────────────────────────────────────────────

/**
 * Summary counts for a contract audit result.
 */
export const ContractAuditSummarySchema = z.object({
  /** Total number of invariants checked. */
  total_invariants: z.number().int().nonnegative(),

  /** Number of hard invariant violations. */
  hard_violations: z.number().int().nonnegative(),

  /** Number of soft invariant violations. */
  soft_violations: z.number().int().nonnegative(),

  /** Number of recovery attempts made. */
  recoveries_attempted: z.number().int().nonnegative(),

  /** Number of successful recoveries. */
  recoveries_succeeded: z.number().int().nonnegative(),
});

/** Summary counts for a contract audit. */
export type ContractAuditSummary = z.infer<typeof ContractAuditSummarySchema>;

// ─── Contract Audit Result ──────────────────────────────────────────────────

/**
 * Aggregated result of a behavioral contract audit for a workflow execution.
 *
 * Contains the overall status, detected violations, and summary counts
 * for reporting and integration with the gap detection pipeline.
 *
 * @example
 * ```typescript
 * const result: ContractAuditResult = {
 *   workflow: "pr-address",
 *   status: "clean",
 *   violations: [],
 *   summary: {
 *     total_invariants: 1,
 *     hard_violations: 0,
 *     soft_violations: 0,
 *     recoveries_attempted: 0,
 *     recoveries_succeeded: 0,
 *   },
 * };
 * ```
 */
export const ContractAuditResultSchema = z.object({
  /** Workflow name that was audited. */
  workflow: z.string().min(1),

  /**
   * Overall audit status:
   * - `clean`: No violations detected
   * - `violations_found`: One or more violations detected
   * - `error`: Audit could not complete
   */
  status: z.enum(["clean", "violations_found", "error"]),

  /** Detected violations ordered by severity (hard > soft). */
  violations: z.array(ContractViolationSchema),

  /** Summary counts for quick reporting. */
  summary: ContractAuditSummarySchema,
});

/** Aggregated contract audit result. */
export type ContractAuditResult = z.infer<typeof ContractAuditResultSchema>;
