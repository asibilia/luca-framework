import { describe, expect, test } from 'bun:test'

import {
    evaluateRunBudget,
    resolveRunBudgetOverrides,
} from './resolve-run-budget.ts'

import type { BudgetLimits } from '../configs/budget-matrix.ts'

// A COMPLEX-level baseline with cost DISABLED (softCostCeilingUsd: 0), matching
// the default matrix posture. Individual tests widen/narrow as needed.
const LIMITS: BudgetLimits = {
    maxChecksFixIterations: 5,
    maxVerifyIterations: 3,
    maxPlanReviewIterations: 3,
    maxResearchReviewIterations: 3,
    maxReviewIterations: 2,
    maxPhases: 7,
    maxWallClockMs: 1_000_000,
    maxToolCalls: 1000,
    softCostCeilingUsd: 0,
}

describe('evaluateRunBudget', () => {
    test('below-warn on all present dimensions → ok', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 100_000, // 10% of wall-clock
            toolCallCount: 100, // 10% of tool calls
            limits: LIMITS,
        })
        expect(verdict.status).toBe('ok')
        expect(verdict.tripped).toEqual([])
        expect(verdict.signals.wallClockMs?.fraction).toBeCloseTo(0.1)
        expect(verdict.signals.toolCalls?.fraction).toBeCloseTo(0.1)
    })

    test('one dimension ≥ 80% → warn', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 850_000, // 85% of wall-clock
            toolCallCount: 100,
            limits: LIMITS,
        })
        expect(verdict.status).toBe('warn')
        expect(verdict.tripped).toContain('wallClockMs')
        expect(verdict.tripped).not.toContain('toolCalls')
    })

    test('exactly 80% of wall-clock → warn (inclusive boundary)', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 800_000, // exactly 80% of 1_000_000
            limits: LIMITS,
        })
        expect(verdict.status).toBe('warn')
        expect(verdict.tripped).toEqual(['wallClockMs'])
        expect(verdict.signals.wallClockMs?.fraction).toBeCloseTo(0.8)
    })

    test('exactly 100% of wall-clock → halt (inclusive boundary)', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 1_000_000, // exactly 100% of 1_000_000
            limits: LIMITS,
        })
        expect(verdict.status).toBe('halt')
        expect(verdict.tripped).toEqual(['wallClockMs'])
        expect(verdict.signals.wallClockMs?.fraction).toBeCloseTo(1)
    })

    test('one dimension ≥ 100% → halt', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 1_200_000, // 120% of wall-clock
            toolCallCount: 100,
            limits: LIMITS,
        })
        expect(verdict.status).toBe('halt')
        expect(verdict.tripped).toContain('wallClockMs')
    })

    test('halt dominates a concurrent warn (worst-of)', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 850_000, // 85% → would be warn
            toolCallCount: 1000, // 100% → halt
            limits: LIMITS,
        })
        expect(verdict.status).toBe('halt')
        expect(verdict.tripped).toContain('toolCalls')
        expect(verdict.tripped).toContain('wallClockMs')
    })

    test('missing optional signals (only elapsedMs) never halt', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 100_000, // 10% of wall-clock
            limits: LIMITS,
        })
        expect(verdict.status).toBe('ok')
        // Optional dimensions are skipped entirely, not coerced to 0/NaN.
        expect(verdict.signals.toolCalls).toBeUndefined()
        expect(verdict.signals.costUsd).toBeUndefined()
    })

    test('missing optionals never halt even when wall-time is huge but under limit', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 999_999, // just under wall-clock, no optional signals
            limits: LIMITS,
        })
        expect(verdict.status).toBe('warn')
        expect(verdict.tripped).toEqual(['wallClockMs'])
    })

    test('a disabled dimension (softCostCeilingUsd: 0) never trips even with a huge cost', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 100_000,
            costUsd: 9_999,
            limits: LIMITS, // softCostCeilingUsd = 0 → disabled
        })
        expect(verdict.status).toBe('ok')
        expect(verdict.signals.costUsd).toBeUndefined()
        expect(verdict.tripped).toEqual([])
    })

    test('an enabled cost ceiling does trip when exceeded', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 100_000,
            costUsd: 50,
            limits: { ...LIMITS, softCostCeilingUsd: 25 },
        })
        expect(verdict.status).toBe('halt')
        expect(verdict.tripped).toContain('costUsd')
    })

    test('respects a custom warnFraction', () => {
        const verdict = evaluateRunBudget({
            elapsedMs: 550_000, // 55%
            limits: LIMITS,
            warnFraction: 0.5,
        })
        expect(verdict.status).toBe('warn')
    })
})

describe('resolveRunBudgetOverrides', () => {
    test('widens a limit via config override', () => {
        const overrides = resolveRunBudgetOverrides({
            budget: { maxWallClockMs: 9_999_999 },
        })
        expect(overrides.maxWallClockMs).toBe(9_999_999)
    })

    test('narrows a limit via config override', () => {
        const overrides = resolveRunBudgetOverrides({
            budget: { maxToolCalls: 10 },
        })
        expect(overrides.maxToolCalls).toBe(10)
    })

    test('a narrowed override drives evaluateRunBudget to halt', () => {
        const overrides = resolveRunBudgetOverrides({
            budget: { maxToolCalls: 10 },
        })
        const verdict = evaluateRunBudget({
            elapsedMs: 100_000,
            toolCallCount: 50,
            limits: { ...LIMITS, ...overrides },
        })
        expect(verdict.status).toBe('halt')
        expect(verdict.tripped).toContain('toolCalls')
    })

    test('returns {} when the budget section is absent', () => {
        expect(resolveRunBudgetOverrides({})).toEqual({})
    })

    test('returns {} on a malformed budget section (never throws)', () => {
        expect(
            resolveRunBudgetOverrides({ budget: { maxWallClockMs: 'nope' } })
        ).toEqual({})
        expect(resolveRunBudgetOverrides({ budget: 'not-an-object' })).toEqual(
            {}
        )
    })

    test('rejects a wall-clock override of 0 → {} (trip wire stays live)', () => {
        // 0 would hit the `limit > 0` disabled-skip and blind the always-on
        // wall-time dimension. The whole-object safeParse fails closed → {},
        // so merged limits keep the base wall-clock ceiling.
        const overrides = resolveRunBudgetOverrides({
            budget: { maxWallClockMs: 0 },
        })
        expect(overrides).toEqual({})
        const merged: BudgetLimits = { ...LIMITS, ...overrides }
        expect(merged.maxWallClockMs).toBe(LIMITS.maxWallClockMs)
    })

    test('rejects a non-finite (Infinity) wall-clock override → {} (fails closed)', () => {
        // `1e999` parses to `Infinity`; `fraction = elapsed/Infinity → 0` would
        // never trip. `.finite()` rejects it → {} → base ceiling retained.
        const overrides = resolveRunBudgetOverrides({
            budget: { maxWallClockMs: 1e999 },
        })
        expect(overrides).toEqual({})
        const merged: BudgetLimits = { ...LIMITS, ...overrides }
        expect(merged.maxWallClockMs).toBe(LIMITS.maxWallClockMs)
    })
})
