import type { ProcedureEntry } from "./types.ts";

// ─── Retirement Evaluation ───────────────────────────────────────────────────

/**
 * Evaluate whether a procedure should be retired.
 *
 * Criteria:
 * 1. **Consistently failing**: success_rate < min_success_rate AND
 *    execution_count >= min_executions
 * 2. **Stale and unproven**: last_executed_at older than max_stale_days AND
 *    execution_count < min_executions
 *
 * @param entry - Procedure entry to evaluate
 * @param options - Optional threshold overrides
 * @param options.min_executions - Minimum executions before judging success rate (default: 5)
 * @param options.min_success_rate - Minimum acceptable success rate (default: 0.3)
 * @param options.max_stale_days - Days without execution before considered stale (default: 180)
 * @returns Assessment with should_retire flag and human-readable reason
 *
 * @example
 * ```typescript
 * const assessment = evaluateRetirement(entry, { min_success_rate: 0.5 });
 * if (assessment.should_retire) {
 *   const retired = applyRetirement(entry, assessment.reason);
 * }
 * ```
 */
export function evaluateRetirement(
  entry: ProcedureEntry,
  options?: {
    min_executions?: number;
    min_success_rate?: number;
    max_stale_days?: number;
  },
): { should_retire: boolean; reason: string } {
  const minExecutions = options?.min_executions ?? 5;
  const minSuccessRate = options?.min_success_rate ?? 0.3;
  const maxStaleDays = options?.max_stale_days ?? 180;

  // Criterion 1: Consistently failing
  if (
    entry.execution_count >= minExecutions &&
    entry.success_rate < minSuccessRate
  ) {
    return {
      should_retire: true,
      reason: `Low success rate (${entry.success_rate.toFixed(2)} after ${entry.execution_count} executions, threshold: ${minSuccessRate.toFixed(2)})`,
    };
  }

  // Criterion 2: Stale and unproven
  if (entry.last_executed_at && entry.execution_count < minExecutions) {
    const lastExecuted = new Date(entry.last_executed_at);
    const now = new Date();
    const daysSinceExecution = Math.floor(
      (now.getTime() - lastExecuted.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceExecution > maxStaleDays) {
      return {
        should_retire: true,
        reason: `Stale procedure (${daysSinceExecution} days since last execution, only ${entry.execution_count} executions)`,
      };
    }
  }

  return {
    should_retire: false,
    reason: "Procedure is healthy",
  };
}

// ─── Apply Retirement ────────────────────────────────────────────────────────

/**
 * Apply retirement to a procedure. Returns a new entry with status="retired".
 *
 * Does NOT mutate the input entry. Creates a shallow copy with updated
 * status and retirement_reason fields.
 *
 * @param entry - Procedure entry to retire
 * @param reason - Human-readable retirement reason
 * @returns New ProcedureEntry with status="retired" and retirement_reason set
 *
 * @example
 * ```typescript
 * const retired = applyRetirement(entry, "Low success rate (0.20 after 5 executions)");
 * // retired.status === "retired"
 * // retired.retirement_reason === "Low success rate (0.20 after 5 executions)"
 * ```
 */
export function applyRetirement(
  entry: ProcedureEntry,
  reason: string,
): ProcedureEntry {
  return { ...entry, status: "retired", retirement_reason: reason };
}

// ─── Update Execution Stats ─────────────────────────────────────────────────

/**
 * Update execution statistics for a procedure after an execution.
 *
 * Increments execution_count, optionally increments success_count,
 * recomputes success_rate (rounded to 2 decimal places), and updates
 * last_executed_at to the current ISO 8601 timestamp.
 *
 * Does NOT mutate the input entry.
 *
 * @param entry - Procedure entry to update
 * @param success - Whether the execution was successful
 * @returns New ProcedureEntry with updated statistics
 *
 * @example
 * ```typescript
 * const updated = updateExecutionStats(entry, true);
 * // updated.execution_count === entry.execution_count + 1
 * // updated.success_count === entry.success_count + 1
 * // updated.success_rate recomputed
 * ```
 */
export function updateExecutionStats(
  entry: ProcedureEntry,
  success: boolean,
): ProcedureEntry {
  const newExecCount = entry.execution_count + 1;
  const newSuccessCount = success
    ? entry.success_count + 1
    : entry.success_count;
  const newRate = newExecCount > 0 ? newSuccessCount / newExecCount : 0;

  return {
    ...entry,
    execution_count: newExecCount,
    success_count: newSuccessCount,
    success_rate: Math.round(newRate * 100) / 100,
    last_executed_at: new Date().toISOString(),
  };
}
