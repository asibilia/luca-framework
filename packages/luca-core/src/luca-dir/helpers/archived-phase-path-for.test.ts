import { describe, expect, test } from 'bun:test'

import { archivedPhasePathFor } from './archived-phase-path-for.ts'

describe('archivedPhasePathFor', () => {
    test('builds archive path for a valid phase slug', () => {
        expect(archivedPhasePathFor('01-auth')).toBe('.luca/archive/01-auth')
    })

    test('throws on invalid slug', () => {
        expect(() => archivedPhasePathFor('auth')).toThrow()
    })
})
