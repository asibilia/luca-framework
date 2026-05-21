import { describe, expect, test } from 'bun:test'

import { wavePathFor } from './wave-path-for.ts'

describe('wavePathFor', () => {
    test('zero-pads wave number to two digits', () => {
        expect(wavePathFor('01-x', 0)).toBe(
            '.luca/phases/01-x/execute/waves/00.md'
        )
        expect(wavePathFor('01-x', 5)).toBe(
            '.luca/phases/01-x/execute/waves/05.md'
        )
        expect(wavePathFor('01-x', 42)).toBe(
            '.luca/phases/01-x/execute/waves/42.md'
        )
    })

    test('accepts boundary values 0 and 99', () => {
        expect(wavePathFor('01-x', 0)).toContain('/00.md')
        expect(wavePathFor('01-x', 99)).toContain('/99.md')
    })

    test('throws on negative wave', () => {
        expect(() => wavePathFor('01-x', -1)).toThrow()
    })

    test('throws on out-of-range wave (>99)', () => {
        expect(() => wavePathFor('01-x', 100)).toThrow()
    })

    test('throws on non-integer wave', () => {
        expect(() => wavePathFor('01-x', 1.5)).toThrow()
    })
})
