import { describe, expect, test } from 'bun:test'

import { parseAndFingerprint } from './parse-and-fingerprint.ts'

describe('parseAndFingerprint', () => {
    const tscLine = 'src/foo.ts(42,5): error TS2345: bad argument.'

    test('parses via the named registry parser and attaches a fingerprint', () => {
        const [err] = parseAndFingerprint('tsc', tscLine)
        expect(err?.file).toBe('src/foo.ts')
        expect(err?.line).toBe(42)
        expect(err?.message).toBe('bad argument.')
        expect(err?.fingerprint).toMatch(/^[0-9a-f]{12}$/)
    })

    test('the fingerprint is deterministic for the same error', () => {
        const a = parseAndFingerprint('tsc', tscLine)
        const b = parseAndFingerprint('tsc', tscLine)
        expect(a[0]?.fingerprint).toBe(b[0]?.fingerprint)
    })

    test('returns an empty array for an unknown check name', () => {
        expect(parseAndFingerprint('not-a-real-check', 'whatever')).toEqual([])
    })
})
