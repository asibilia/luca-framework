/**
 * Fix-loop budget guard (DAD-P1c) — AUTHORED BUT EDGE-UNWIRED.
 *
 * `withinFixBudget` is the enforce-mode gate: it denies a rework advance once
 * the loop's counter reaches its cap. It is registered in the machine's
 * `setup({ guards })` so it is available and type-checked, but it is
 * DELIBERATELY NOT wired onto any edge — the only edge guard remains `toIs`.
 * Wiring a blocking guard onto a rework edge would make the machine over-deny
 * versus the legacy guard and break the 169-pair parity harness. The enforce
 * flip is a later slice, gated on a baseline + escape hatch.
 *
 * Default posture is ADVISORY: when `budgetMode` is `undefined` or `'advisory'`
 * the guard returns `true` unconditionally — it never denies. Only an explicit
 * `budgetMode: 'enforce'` context makes it compare `counter < cap`.
 */
import type { FixLoopCounter, FixLoopCap } from './actions.ts'
import type { PipelineContext } from './pipeline-machine.ts'

// Single source of truth for the cap-field union is `actions.ts`. Re-exported
// here so existing importers of `guards.ts` (e.g. budget-guard.test.ts) keep
// resolving `FixLoopCap` without a second, drift-prone definition.
export type { FixLoopCap }

/** Params carried by the guard: which counter/cap pair to compare. */
export interface WithinFixBudgetParams {
    counter: FixLoopCounter
    cap: FixLoopCap
}

/**
 * Advisory-first budget check. Returns `true` (allow) whenever `budgetMode` is
 * not `'enforce'`. In enforce mode it allows iff `counter < cap` — so a counter
 * at or above its cap denies, and a zero cap denies the first attempt
 * (`0 < 0` is false).
 *
 * Pure and directly testable: the enforce property harness calls this without
 * routing through the machine (the guard is edge-unwired).
 */
export function withinFixBudget(
    context: PipelineContext,
    params: WithinFixBudgetParams
): boolean {
    if (context.budgetMode !== 'enforce') return true
    const count = context[params.counter] ?? 0
    const cap = context[params.cap] ?? 0
    return count < cap
}
