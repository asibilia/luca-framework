/**
 * Shared convergence state machine constants for review loop skills.
 *
 * Both research-review and plan-review use identical
 * convergence transition logic when blocking gaps exist. This module
 * provides the shared state machine description as a string constant
 * that each skill embeds in its content.
 *
 * Each skill defines its own approval conditions (the "happy path")
 * and severity labels, but the core transition logic is shared.
 *
 * @module
 */

/**
 * Core convergence transition logic as a pseudocode block.
 *
 * Describes the IMPROVING/STALLED/DIVERGING/REVIEWING transitions
 * that apply when blocking gaps (B(n) > 0) exist and the iteration
 * budget has not been exhausted.
 *
 * Skills embed this constant inside their Step 6 (convergence check)
 * section, wrapping it with their own approval conditions and
 * severity-specific variable definitions.
 *
 * @example
 * ```typescript
 * const content = `
 * ### Step 6: Check Convergence
 *
 * ${CONVERGENCE_BLOCKING_TRANSITIONS}
 * `;
 * ```
 */
export const CONVERGENCE_BLOCKING_TRANSITIONS = `\
    if iteration > 1 AND B(n) < B(n-1):
        status = "IMPROVING" -> continue
    elif iteration > 1 AND B(n) == B(n-1):
        status = "STALLED" -> continue with enhanced request
    elif iteration > 1 AND B(n) > B(n-1):
        status = "DIVERGING" -> continue with warning
    else:
        status = "REVIEWING" -> continue`;

/**
 * Convergence quick reference table header and blocking-gap rows.
 *
 * Provides the transition rows that are common to both review types.
 * Each skill prepends its own approval rows (e.g., "0 CRITICAL" or
 * "0 BLOCKING") and appends the escalation row.
 *
 * Rows included:
 * - IMPROVING (decreasing blocking count)
 * - STALLED (flat blocking count)
 * - DIVERGING (increasing blocking count)
 * - ESCALATE (iteration budget exhausted)
 */
export const CONVERGENCE_TABLE_BLOCKING_ROWS = `\
| N blocking (iter < max, decreasing) | IMPROVING | Continue |
| N blocking (iter < max, flat) | STALLED | Continue with enhanced request |
| N blocking (iter < max, increasing) | DIVERGING | Continue with warning |
| N blocking (iter = max) | -- | ESCALATE to user |`;
