import { z } from 'zod'

import type { BudgetLimits } from '../configs/budget-matrix.ts'

/**
 * Run-budget status. Worst-of across all present dimensions:
 * - `halt` when any present dimension is at or above its limit (fraction ≥ 1),
 * - `warn` when any present dimension is at or above `warnFraction` (default 0.8),
 * - `ok` otherwise.
 */
export type RunBudgetStatus = 'ok' | 'warn' | 'halt'

/**
 * The wired run-budget dimensions. Each has a real `dimensions` row in
 * {@link evaluateRunBudget} backed by a `BudgetLimits` ceiling. Used to type
 * the verdict keys so they can't drift into magic strings.
 */
export type RunBudgetDimension = 'wallClockMs' | 'toolCalls' | 'costUsd'

/**
 * Per-dimension echo of the signal that fed the verdict. Only dimensions that
 * were actually evaluated (present signal + enabled limit) appear here.
 */
export interface RunBudgetSignal {
    /** Observed value for the dimension. */
    value: number
    /** Configured limit for the dimension. */
    limit: number
    /** value / limit, clamped to ≥ 0. */
    fraction: number
}

/**
 * Advisory verdict from {@link evaluateRunBudget}. `tripped` lists the dimension
 * keys whose fraction crossed `warnFraction` (i.e. contributed a `warn` or
 * `halt`). `signals` echoes the fraction/values of every evaluated dimension.
 */
export interface RunBudgetVerdict {
    status: RunBudgetStatus
    tripped: RunBudgetDimension[]
    signals: Partial<Record<RunBudgetDimension, RunBudgetSignal>>
}

export interface EvaluateRunBudgetInput {
    /** Wall-clock elapsed since run start. The one guaranteed trip wire. */
    elapsedMs: number
    /** Best-effort tool-call count. Skipped entirely when undefined. */
    toolCallCount?: number
    /** Best-effort session cost. Skipped entirely when undefined. */
    costUsd?: number
    /** Resolved per-complexity ceilings. */
    limits: BudgetLimits
    /** Warn threshold as a fraction of the limit. Defaults to 0.8. */
    warnFraction?: number
}

const DEFAULT_WARN_FRACTION = 0.8

/**
 * Pure, I/O-free run-budget evaluator. Mirrors the pure-core style of
 * `withinFixBudget` (state/machine/guards.ts). For each PRESENT signal whose
 * limit is enabled (> 0), it computes fraction-of-limit and takes a worst-of
 * status.
 *
 * Undefined optional signals are SKIPPED — never coerced to 0 or NaN, and never
 * force a halt. A dimension whose limit is 0 (disabled, e.g. the default
 * `softCostCeilingUsd`) is likewise skipped. Wall-time is always evaluated.
 */
export function evaluateRunBudget(
    input: EvaluateRunBudgetInput
): RunBudgetVerdict {
    const warnFraction = input.warnFraction ?? DEFAULT_WARN_FRACTION

    // (dimension key, observed value, configured limit) triples. Optional
    // signals are only listed when defined; wall-time is always present.
    const dimensions: Array<{
        key: RunBudgetDimension
        value: number | undefined
        limit: number
    }> = [
        { key: 'wallClockMs', value: input.elapsedMs, limit: input.limits.maxWallClockMs },
        { key: 'toolCalls', value: input.toolCallCount, limit: input.limits.maxToolCalls },
        { key: 'costUsd', value: input.costUsd, limit: input.limits.softCostCeilingUsd },
    ]

    const signals: Partial<Record<RunBudgetDimension, RunBudgetSignal>> = {}
    const tripped: RunBudgetDimension[] = []
    let status: RunBudgetStatus = 'ok'

    for (const { key, value, limit } of dimensions) {
        // Skip absent signals and disabled (0 / non-positive) limits — never
        // coerce a missing optional into a halting fraction.
        if (value === undefined) continue
        if (!(limit > 0)) continue

        const fraction = value <= 0 ? 0 : value / limit
        signals[key] = { value, limit, fraction }

        if (fraction >= 1) {
            status = 'halt'
            tripped.push(key)
        } else if (fraction >= warnFraction) {
            if (status !== 'halt') status = 'warn'
            tripped.push(key)
        }
    }

    return { status, tripped, signals }
}

/**
 * Partial schema over the numeric run-budget limit fields. Every field is
 * optional so a repo can widen or narrow a single dimension via the
 * `.luca/config.json` `budget` section. Schema-first: no destructuring
 * defaults, `.safeParse` never throws.
 */
const RunBudgetOverridesSchema = z
    .object({
        // Wall-time is the always-on trip wire: 0 is NOT a valid override (it
        // would hit the `limit > 0` "disabled" skip and blind the guard), and
        // `Infinity` (via `1e999`) would drive `fraction = elapsed/Infinity → 0`
        // and never trip. `positive().finite()` fails those closed to the base
        // ceiling (`.safeParse` failure → `{}`).
        maxWallClockMs: z.number().positive().finite().optional(),
        maxToolCalls: z.number().nonnegative().finite().optional(),
        softCostCeilingUsd: z.number().nonnegative().finite().optional(),
    })
    .partial()

/**
 * Read the optional `budget` section from the opaque `.luca/config.json` record
 * and return a `Partial<BudgetLimits>` of the run-budget ceilings. On any parse
 * failure (or a missing/malformed section) returns `{}` — never throws
 * (schema-first-parsing rule).
 */
export function resolveRunBudgetOverrides(
    config: Record<string, unknown>
): Partial<BudgetLimits> {
    const parsed = RunBudgetOverridesSchema.safeParse(config.budget)
    if (!parsed.success) return {}

    // Zod strips unknown keys and omits absent optionals, so `parsed.data` is
    // already a `Partial<BudgetLimits>`. The whole-object `.safeParse` fails
    // closed (any bad field → `{}`), keeping the base ceilings live.
    return parsed.data
}
