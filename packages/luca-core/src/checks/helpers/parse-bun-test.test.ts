import { describe, expect, test } from 'bun:test'

import { parseBunTestOutput } from './parse-bun-test.ts'

describe('parseBunTestOutput', () => {
    test('parses a failed test with assertion details and a stack location', () => {
        const out = [
            'src/foo.test.ts:',
            '✗ does the thing [2.5ms]',
            '  Expected: 1',
            '  Received: 2',
            '      at /repo/src/foo.test.ts:10:3',
        ].join('\n')
        expect(parseBunTestOutput(out)).toEqual([
            {
                file: '/repo/src/foo.test.ts',
                line: 10,
                column: 3,
                message: 'does the thing: Expected: 1 Received: 2',
                severity: 'error',
            },
        ])
    })

    test('emits a location-less failure attributed to the test file', () => {
        const out = ['src/bar.test.ts:', '✗ orphan failure'].join('\n')
        expect(parseBunTestOutput(out)).toEqual([
            {
                file: 'src/bar.test.ts',
                message: 'orphan failure',
                severity: 'error',
            },
        ])
    })

    test('parses a compile error', () => {
        const [err] = parseBunTestOutput(
            "error: Cannot find module './missing.ts'"
        )
        expect(err?.severity).toBe('error')
        expect(err?.message).toBe("Cannot find module './missing.ts'")
        expect(err?.file).toBe('unknown')
    })

    test('returns an empty array when all tests pass', () => {
        expect(parseBunTestOutput('5 pass\n0 fail')).toEqual([])
    })
})
