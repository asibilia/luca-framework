import type { BudgetState, BudgetStatus } from "../__schemas/iteration.schemas";
import { budgetStateSchema } from "../__schemas/iteration.schemas";

/**
 * Create an initial budget state for an iteration loop.
 *
 * @param maxIterations - Maximum iterations allowed (from ComplexityGate)
 * @param softStopPercent - Percentage threshold for soft stop (default 80)
 * @returns Initialized BudgetState with current_iteration=0 and status=under_budget
 *
 * @example
 * ```typescript
 * const budget = createBudgetState(3); // 3 max iterations, 80% soft stop
 * // { max_iterations: 3, current_iteration: 0, soft_stop_percent: 80, status: "under_budget" }
 * ```
 */
export function createBudgetState(
  maxIterations: number,
  softStopPercent: number = 80,
): BudgetState {
  return budgetStateSchema.parse({
    max_iterations: maxIterations,
    current_iteration: 0,
    soft_stop_percent: softStopPercent,
    status: "under_budget",
  });
}

/**
 * Assess the budget status based on current iteration vs max.
 *
 * Uses iteration count as a proxy for token cost since exact
 * token counting is not available in the Claude Code runtime.
 *
 * Status determination:
 * - exceeded: current_iteration >= max_iterations (hard limit)
 * - soft_stop: current_iteration / max_iterations >= soft_stop_percent / 100
 * - under_budget: still within budget
 *
 * @param state - Current budget state
 * @returns The assessed BudgetStatus
 */
export function assessBudget(state: BudgetState): BudgetStatus {
  if (state.current_iteration >= state.max_iterations) {
    return "exceeded";
  }

  const percentUsed = (state.current_iteration / state.max_iterations) * 100;

  if (percentUsed >= state.soft_stop_percent) {
    return "soft_stop";
  }

  return "under_budget";
}

/**
 * Advance the budget state by one iteration and reassess status.
 *
 * Returns a NEW BudgetState (immutable -- does not mutate input).
 *
 * @param state - Current budget state
 * @returns New BudgetState with incremented iteration and updated status
 *
 * @example
 * ```typescript
 * const initial = createBudgetState(3);
 * const after1 = advanceBudget(initial);   // current_iteration: 1, status: "under_budget"
 * const after2 = advanceBudget(after1);    // current_iteration: 2, status: "under_budget"
 * const after3 = advanceBudget(after2);    // current_iteration: 3, status: "exceeded"
 * ```
 */
export function advanceBudget(state: BudgetState): BudgetState {
  const nextIteration = state.current_iteration + 1;

  const nextState: BudgetState = {
    ...state,
    current_iteration: nextIteration,
    status: "under_budget", // placeholder, reassessed below
  };

  nextState.status = assessBudget(nextState);
  return nextState;
}

/**
 * Determine whether a new iteration should be started.
 *
 * This is the primary decision point called by the orchestrator
 * BEFORE beginning a new iteration. It checks the budget state
 * and returns a clear allowed/denied decision with reason.
 *
 * Logic:
 * - If max_iterations is 0: not allowed (loop disabled for this complexity)
 * - If status is "exceeded": not allowed (hard limit reached)
 * - If status is "soft_stop": not allowed (soft threshold reached)
 * - Otherwise: allowed
 *
 * @param state - Current budget state
 * @returns Decision object with boolean and human-readable reason
 */
export function shouldStartIteration(state: BudgetState): {
  allowed: boolean;
  reason: string;
} {
  if (state.max_iterations === 0) {
    return {
      allowed: false,
      reason: "Loop disabled: max_iterations is 0 for this complexity level",
    };
  }

  const percentUsed = Math.round(
    (state.current_iteration / state.max_iterations) * 100,
  );

  if (state.status === "exceeded") {
    return {
      allowed: false,
      reason: `Budget exceeded: ${state.current_iteration} of ${state.max_iterations} iterations used (${percentUsed}%)`,
    };
  }

  if (state.status === "soft_stop") {
    return {
      allowed: false,
      reason: `Soft stop: ${state.current_iteration} of ${state.max_iterations} iterations used (${percentUsed}% >= ${state.soft_stop_percent}% threshold)`,
    };
  }

  return {
    allowed: true,
    reason: `Budget OK: iteration ${state.current_iteration + 1} of ${state.max_iterations} (${percentUsed}%)`,
  };
}

/**
 * Token-aware budget assessment result.
 *
 * Extends the basic BudgetStatus with token-specific information
 * when token tracking fields are present in the budget state.
 */
export interface TokenBudgetAssessment {
  /** Overall budget status (combines iteration and token signals) */
  status: BudgetStatus;
  /** Iteration-based status */
  iterationStatus: BudgetStatus;
  /** Token-based status (null if tokens not tracked) */
  tokenStatus: BudgetStatus | null;
  /** Iteration usage as a percentage (0-100) */
  iterationPercent: number;
  /** Token usage as a percentage (0-100), null if not tracked */
  tokenPercent: number | null;
  /** Human-readable summary */
  summary: string;
}

/**
 * Assess the budget using both iteration count and token usage.
 *
 * When token fields (max_tokens, tokens_used) are present in the
 * budget state, both signals are evaluated and the more restrictive
 * status is returned. This prevents runaway token consumption even
 * when iteration count is under budget.
 *
 * When token fields are absent, behaves identically to assessBudget().
 *
 * @param state - Current budget state (optionally with token fields)
 * @returns TokenBudgetAssessment with combined status and details
 *
 * @example
 * ```typescript
 * const state = {
 *   ...createBudgetState(5),
 *   max_tokens: 100000,
 *   tokens_used: 85000,
 * };
 * const assessment = assessBudgetWithTokens(state);
 * // assessment.status === "soft_stop" (85% token usage >= 80% threshold)
 * // assessment.tokenPercent === 85
 * ```
 */
export function assessBudgetWithTokens(
  state: BudgetState,
): TokenBudgetAssessment {
  const iterationStatus = assessBudget(state);
  const iterationPercent =
    state.max_iterations > 0
      ? Math.round((state.current_iteration / state.max_iterations) * 100)
      : 0;

  // If token fields are not present, fall back to iteration-only
  if (
    state.max_tokens === undefined ||
    state.max_tokens === null ||
    state.tokens_used === undefined ||
    state.tokens_used === null
  ) {
    return {
      status: iterationStatus,
      iterationStatus,
      tokenStatus: null,
      iterationPercent,
      tokenPercent: null,
      summary: `Iteration ${state.current_iteration}/${state.max_iterations} (${iterationPercent}%): ${iterationStatus}`,
    };
  }

  // Compute token-based status
  const tokenPercent =
    state.max_tokens > 0
      ? Math.round((state.tokens_used / state.max_tokens) * 100)
      : 0;

  let tokenStatus: BudgetStatus;
  if (state.tokens_used >= state.max_tokens) {
    tokenStatus = "exceeded";
  } else if (tokenPercent >= state.soft_stop_percent) {
    tokenStatus = "soft_stop";
  } else {
    tokenStatus = "under_budget";
  }

  // The more restrictive status wins
  const statusPriority: Record<BudgetStatus, number> = {
    exceeded: 2,
    soft_stop: 1,
    under_budget: 0,
  };

  const combinedStatus =
    statusPriority[tokenStatus] > statusPriority[iterationStatus]
      ? tokenStatus
      : iterationStatus;

  return {
    status: combinedStatus,
    iterationStatus,
    tokenStatus,
    iterationPercent,
    tokenPercent,
    summary: `Iteration ${state.current_iteration}/${state.max_iterations} (${iterationPercent}%), Tokens ${state.tokens_used}/${state.max_tokens} (${tokenPercent}%): ${combinedStatus}`,
  };
}

/**
 * CLI entry point for budget operations.
 *
 * Usage:
 *   bun run src/iteration/budget.ts create \
 *     --max-iterations=3 --soft-stop-percent=80
 *
 *   bun run src/iteration/budget.ts assess \
 *     --state='{ ... BudgetState JSON ... }'
 *
 *   bun run src/iteration/budget.ts advance \
 *     --state='{ ... BudgetState JSON ... }'
 *
 *   bun run src/iteration/budget.ts should-start \
 *     --state='{ ... BudgetState JSON ... }'
 *
 * Outputs JSON result to stdout.
 */
if (import.meta.main) {
  const subcommand = Bun.argv[2];
  const args = Bun.argv.slice(3);

  function getArg(name: string, defaultValue: string = ""): string {
    const prefix = `--${name}=`;
    const arg = args.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : defaultValue;
  }

  try {
    switch (subcommand) {
      case "create": {
        const maxIterations = parseInt(getArg("max-iterations", "3"), 10);
        const softStopPercent = parseInt(getArg("soft-stop-percent", "80"), 10);
        const state = createBudgetState(maxIterations, softStopPercent);
        console.log(JSON.stringify(state, null, 2));
        process.exit(0);
        break;
      }
      case "assess": {
        const stateRaw = getArg("state");
        if (!stateRaw) {
          console.error("Missing --state argument");
          process.exit(2);
        }
        const state = budgetStateSchema.parse(JSON.parse(stateRaw));
        const status = assessBudget(state);
        console.log(JSON.stringify({ status }));
        process.exit(0);
        break;
      }
      case "advance": {
        const stateRaw = getArg("state");
        if (!stateRaw) {
          console.error("Missing --state argument");
          process.exit(2);
        }
        const state = budgetStateSchema.parse(JSON.parse(stateRaw));
        const nextState = advanceBudget(state);
        console.log(JSON.stringify(nextState, null, 2));
        process.exit(0);
        break;
      }
      case "should-start": {
        const stateRaw = getArg("state");
        if (!stateRaw) {
          console.error("Missing --state argument");
          process.exit(2);
        }
        const state = budgetStateSchema.parse(JSON.parse(stateRaw));
        const decision = shouldStartIteration(state);
        console.log(JSON.stringify(decision, null, 2));
        process.exit(decision.allowed ? 0 : 1);
        break;
      }
      default: {
        console.error(
          `Unknown subcommand: ${subcommand}. Use: create, assess, advance, should-start`,
        );
        process.exit(2);
      }
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}
