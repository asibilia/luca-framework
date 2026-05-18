import { describe, expect, test } from 'bun:test'

import { clampTokens, finiteOrNull } from './numeric.js'

describe('finiteOrNull', () => {
    test('returns finite non-negative number as-is', () => {
        expect(finiteOrNull(0)).toBe(0)
        expect(finiteOrNull(42)).toBe(42)
        expect(finiteOrNull(3.14)).toBe(3.14)
    })

    test('returns null for NaN', () => {
        expect(finiteOrNull(Number.NaN)).toBeNull()
    })

    test('returns null for ±Infinity', () => {
        expect(finiteOrNull(Number.POSITIVE_INFINITY)).toBeNull()
        expect(finiteOrNull(Number.NEGATIVE_INFINITY)).toBeNull()
    })

    test('returns null for negative numbers', () => {
        expect(finiteOrNull(-1)).toBeNull()
        expect(finiteOrNull(-0.0001)).toBeNull()
    })

    test('returns null for null / undefined', () => {
        expect(finiteOrNull(null)).toBeNull()
        expect(finiteOrNull(undefined)).toBeNull()
    })

    test('returns null for non-number types via type-narrowing guard', () => {
        // Cast to bypass compile-time check; runtime guard is the contract.
        expect(finiteOrNull('5' as unknown as number)).toBeNull()
        expect(finiteOrNull({} as unknown as number)).toBeNull()
    })
})

describe('clampTokens', () => {
    test('returns floored integer for valid inputs', () => {
        expect(clampTokens(100)).toBe(100)
        expect(clampTokens(1.9)).toBe(1)
        expect(clampTokens(0)).toBe(0)
    })

    test('returns null for non-finite values', () => {
        expect(clampTokens(Number.NaN)).toBeNull()
        expect(clampTokens(Number.POSITIVE_INFINITY)).toBeNull()
    })

    test('returns null for negative values', () => {
        expect(clampTokens(-1)).toBeNull()
    })

    test('returns null when value exceeds default max (10_000_000)', () => {
        expect(clampTokens(10_000_001)).toBeNull()
        expect(clampTokens(10_000_000)).toBe(10_000_000)
    })

    test('respects custom max argument', () => {
        expect(clampTokens(150, 100)).toBeNull()
        expect(clampTokens(100, 100)).toBe(100)
        expect(clampTokens(50, 100)).toBe(50)
    })

    test('returns null for null / undefined', () => {
        expect(clampTokens(null)).toBeNull()
        expect(clampTokens(undefined)).toBeNull()
    })
})
