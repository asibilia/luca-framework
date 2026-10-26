import { describe, expect, test } from 'bun:test'

import { plural } from './stuck-format'

/** The counted words the stuck comments share. */

describe('plural', () => {
    test('counts a word, adding s past one', () => {
        expect(plural(1, 'fix round')).toBe('1 fix round')
        expect(plural(2, 'fix round')).toBe('2 fix rounds')
        expect(plural(0, 'rebase')).toBe('0 rebases')
    })

    test('a word ending in a consonant and y ends in ies, so the stuck comments say "failed tries"', () => {
        expect(plural(1, 'failed try')).toBe('1 failed try')
        expect(plural(3, 'failed try')).toBe('3 failed tries')
        expect(plural(2, 'day')).toBe('2 days')
    })
})
