/**
 * Post-execution gap detector for workflow DAG coverage auditing.
 *
 * Audits DAG execution results to identify steps that were expected but never
 * ran. Uses structured skip entries (SkippedStepEntry from Wave 1) and a
 * three-tier tolerance model:
 *
 * **Three-Tier Tolerance Model** (from CONTEXT.md Decision #4):
 * - **Tier 1 (Strict):** Required step with no ledger entry -> FAIL
 * - **Tier 2 (Tolerant):** Step skipped via guard or flag -> PASS (no gap)
 * - **Tier 3 (Advisory):** Optional step absent -> WARNING
 *
 * **PREMORTEM Constraint #1 (pre-satisfied):** This module requires structured
 * skip entries (`SkippedStepEntry` with `id`, `reason`, `optional`). The
 * `DAGCheckpointSchema.skippedSteps` was widened from bare string IDs to
 * structured entries in Wave 1 (Plan 1, Task 1).
 *
 * **Integration point:** Exposed via `luca-bridge audit-gaps` subcommand for
 * the verification pipeline. Also importable via `~/workflow` barrel for
 * non-bridge consumers (lu-verifier, phase-execute, etc.).
 *
 * @module workflow/gap-detector
 */

import { z } from "zod";
import isEmpty from "lodash/isEmpty";

import type {
  WorkflowDAG,
  DAGCheckpoint,
  SkippedStepEntry,
} from "../__schemas/workflow.schemas";
import type { BehavioralContract } from "../__schemas/contracts";

import { evaluateContract } from "./contract-evaluator";

// ─── Gap Severity ───────────────────────────────────────────────────────────

/**
 * Severity of a detected gap in execution coverage.
 *
 * - `fail`: Required step was never executed (blocks verification)
 * - `warning`: Optional step was missing or guard threw an exception (advisory)
 * - `info`: Informational note about execution coverage (no action needed)
 */
export const GapSeveritySchema = z.enum(["fail", "warning", "info"]);

/** Severity of a detected gap. */
export type GapSeverity = z.infer<typeof GapSeveritySchema>;

// ─── Execution Gap ──────────────────────────────────────────────────────────

/**
 * A single detected gap in execution coverage.
 *
 * Each gap represents a step that was expected to execute but either didn't
 * run at all or ran with a notable outcome (e.g., guard exception).
 */
export const ExecutionGapSchema = z.object({
  /** Step ID that was expected but not found in a clean state. */
  stepId: z.string(),

  /** Step name for human readability. */
  stepName: z.string(),

  /** Whether the step is declared optional in the DAG definition. */
  optional: z.boolean(),

  /** What was expected (e.g., "completed", "skipped-with-reason"). */
  expectedStatus: z.string(),

  /** What was found (or "missing" if no record exists). */
  actualStatus: z.string().default("missing"),

  /**
   * Severity of this gap:
   * - `fail`: Required step was never executed
   * - `warning`: Optional step missing or guard exception
   * - `info`: Noted skip or informational
   */
  severity: GapSeveritySchema,

  /** Human-readable recommendation for resolving this gap. */
  recommendation: z.string(),
});

/** A single detected execution gap. */
export type ExecutionGap = z.infer<typeof ExecutionGapSchema>;

// ─── Gap Audit Result ───────────────────────────────────────────────────────

/**
 * Result of a gap audit on a DAG execution.
 *
 * Contains the overall audit status, detected gaps, and summary counts
 * for reporting and verification integration.
 */
export const GapAuditResultSchema = z.object({
  /**
   * Overall audit status:
   * - `clean`: No gaps detected (all steps accounted for)
   * - `gaps_found`: One or more gaps detected
   * - `error`: Audit could not complete (e.g., invalid input)
   */
  status: z.enum(["clean", "gaps_found", "error"]),

  /** Detected gaps ordered by severity (fail > warning > info). */
  gaps: z.array(ExecutionGapSchema),

  /** Summary counts for quick reporting. */
  summary: z.object({
    /** Total number of steps defined in the DAG. */
    totalSteps: z.number(),
    /** Number of steps that completed successfully. */
    completedSteps: z.number(),
    /** Number of steps that were skipped (with structured reason). */
    skippedSteps: z.number(),
    /** Number of steps that failed during execution. */
    failedSteps: z.number(),
    /** Number of required steps with no record (FAIL severity). */
    missingSteps: z.number(),
    /** Number of optional steps with no record (WARNING severity). */
    optionalMissing: z.number(),
  }),
});

/** Result of a gap audit. */
export type GapAuditResult = z.infer<typeof GapAuditResultSchema>;

// ─── Gap Detection ──────────────────────────────────────────────────────────

/**
 * Audit a DAG execution for coverage gaps.
 *
 * Examines every step in the DAG definition against the execution checkpoint
 * to determine coverage. Uses the three-tier tolerance model:
 *
 * 1. **Required step with no ledger entry:** FAIL (gap detected)
 * 2. **Step skipped via `--skip` flag:** PASS (requires structured entry with reason)
 * 3. **Step with guard returning false:** PASS (recorded in skippedSteps)
 * 4. **Step with guard exception:** WARNING (should be investigated)
 * 5. **Optional step absent:** WARNING (not failure)
 * 6. **Failed step:** INFO (attempted but failed -- not a coverage gap)
 *
 * @param dag - The workflow DAG definition (source of truth for expected steps)
 * @param checkpoint - The execution checkpoint with completed/skipped/failed steps
 * @param contracts - Optional behavioral contracts to evaluate alongside gap detection
 * @returns GapAuditResult with gaps, summary, and overall status
 *
 * @example
 * ```typescript
 * import { detectGaps, buildPhaseDAG } from "~/workflow";
 *
 * const dag = buildPhaseDAG("test")
 *   .step("classify", { handler: "classify" })
 *   .step("execute", { handler: "execute", dependsOn: ["classify"] })
 *   .build();
 *
 * const checkpoint: DAGCheckpoint = {
 *   dagName: "test",
 *   dagVersion: "1.0.0",
 *   checkpointSchemaVersion: 1,
 *   startedAt: new Date().toISOString(),
 *   currentWave: 2,
 *   completedSteps: { classify: { result: "ok" } },
 *   skippedSteps: [],
 *   failedSteps: {},
 *   context: {},
 * };
 *
 * const result = detectGaps(dag, checkpoint);
 * // result.status === "gaps_found"
 * // result.gaps[0].stepId === "execute"
 * // result.gaps[0].severity === "fail"
 * ```
 *
 * @example
 * ```typescript
 * // With contract evaluation
 * import { detectGaps, CONTRACT_REGISTRY } from "~/workflow";
 *
 * const result = detectGaps(dag, checkpoint, [CONTRACT_REGISTRY["pr-address"]]);
 * // Contract violations appear as additional gaps with source "contract"
 * ```
 */
export function detectGaps(
  dag: WorkflowDAG,
  checkpoint: DAGCheckpoint,
  contracts?: BehavioralContract[],
): GapAuditResult {
  const gaps: ExecutionGap[] = [];

  // Build a lookup map for skipped entries by step ID
  const skippedMap = new Map<string, SkippedStepEntry>();
  for (const entry of checkpoint.skippedSteps) {
    skippedMap.set(entry.id, entry);
  }

  let completedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  let missingCount = 0;
  let optionalMissingCount = 0;

  for (const step of dag.steps) {
    // 1. Check if step completed successfully
    if (checkpoint.completedSteps[step.id] !== undefined) {
      completedCount++;
      continue;
    }

    // 2. Check if step was skipped (structured entry)
    const skipEntry = skippedMap.get(step.id);
    if (skipEntry) {
      skippedCount++;

      // Guard-false and flag-skip are legitimate skips -> PASS (no gap)
      if (
        skipEntry.reason === "guard-false" ||
        skipEntry.reason === "flag-skip"
      ) {
        continue;
      }

      // Guard-exception is a WARNING (should be investigated, but not a gap)
      if (skipEntry.reason === "guard-exception") {
        gaps.push({
          stepId: step.id,
          stepName: step.name,
          optional: step.optional,
          expectedStatus: "completed",
          actualStatus: "skipped-guard-exception",
          severity: "warning",
          recommendation:
            "Step guard threw an exception. Investigate the guard function for errors.",
        });
        continue;
      }

      // Unknown skip reason -- treat as warning
      gaps.push({
        stepId: step.id,
        stepName: step.name,
        optional: step.optional,
        expectedStatus: "completed",
        actualStatus: `skipped-${skipEntry.reason}`,
        severity: "warning",
        recommendation: `Step was skipped with unexpected reason: ${skipEntry.reason}`,
      });
      continue;
    }

    // 3. Check if step failed during execution
    if (checkpoint.failedSteps[step.id] !== undefined) {
      failedCount++;
      // Failed steps attempted execution -- not a coverage gap, but noted
      gaps.push({
        stepId: step.id,
        stepName: step.name,
        optional: step.optional,
        expectedStatus: "completed",
        actualStatus: "failed",
        severity: "info",
        recommendation: `Step attempted but failed: ${checkpoint.failedSteps[step.id]!.error}`,
      });
      continue;
    }

    // 4. Step is in NONE of the above -- this is a coverage gap
    if (step.optional) {
      optionalMissingCount++;
      gaps.push({
        stepId: step.id,
        stepName: step.name,
        optional: true,
        expectedStatus: "completed",
        actualStatus: "missing",
        severity: "warning",
        recommendation:
          "Optional step was not executed. This is advisory only.",
      });
    } else {
      missingCount++;
      gaps.push({
        stepId: step.id,
        stepName: step.name,
        optional: false,
        expectedStatus: "completed",
        actualStatus: "missing",
        severity: "fail",
        recommendation:
          "Required step was never executed. This must be addressed before verification can pass.",
      });
    }
  }

  // ─── Contract Evaluation (optional) ──────────────────────────────────────

  if (contracts && !isEmpty(contracts)) {
    for (const contract of contracts) {
      const auditResult = evaluateContract(contract, checkpoint);

      // Convert contract violations into ExecutionGap entries
      for (const violation of auditResult.violations) {
        const severity =
          violation.kind === "hard" ? ("fail" as const) : ("warning" as const);

        if (severity === "fail") {
          missingCount++;
        } else {
          optionalMissingCount++;
        }

        gaps.push({
          stepId: violation.postcondition_attempted,
          stepName: `contract:${violation.invariant_id}`,
          optional: violation.kind !== "hard",
          expectedStatus: `precondition:${violation.precondition_missing}`,
          actualStatus: "contract-violation",
          severity,
          recommendation:
            violation.kind === "hard"
              ? `Hard contract violation: ${violation.invariant_id}. ` +
                `Step "${violation.postcondition_attempted}" completed without ` +
                `required precondition "${violation.precondition_missing}".`
              : `Soft contract violation: ${violation.invariant_id}. ` +
                `Step "${violation.postcondition_attempted}" completed without ` +
                `precondition "${violation.precondition_missing}". ` +
                `Recovery ${violation.recovery_attempted ? "attempted" : "not attempted"}.`,
        });
      }
    }
  }

  // Determine overall status
  const hasFails = gaps.some((g) => g.severity === "fail");
  const hasGaps = gaps.length > 0;
  const status = hasFails ? "gaps_found" : hasGaps ? "gaps_found" : "clean";

  return {
    status,
    gaps,
    summary: {
      totalSteps: dag.steps.length,
      completedSteps: completedCount,
      skippedSteps: skippedCount,
      failedSteps: failedCount,
      missingSteps: missingCount,
      optionalMissing: optionalMissingCount,
    },
  };
}
