import { describe, expect, test } from 'bun:test'

import { parseTscOutput } from './parse-tsc.ts'

describe('parseTscOutput', () => {
    test('parses a standard tsc error line', () => {
        const out =
            "src/foo.ts(42,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'."
        expect(parseTscOutput(out)).toEqual([
            {
                file: 'src/foo.ts',
                line: 42,
                column: 5,
                severity: 'error',
                code: 'TS2345',
                message:
                    "Argument of type 'string' is not assignable to parameter of type 'number'.",
            },
        ])
    })

    test('parses a warning line', () => {
        const [err] = parseTscOutput(
            'src/bar.ts(7,1): warning TS6133: unused variable.'
        )
        expect(err?.severity).toBe('warning')
        expect(err?.code).toBe('TS6133')
    })

    test('parses multiple errors and ignores non-matching lines', () => {
        const out = [
            'Compiling...',
            'src/a.ts(1,1): error TS1000: first.',
            'some noise',
            'src/b.ts(2,2): error TS1001: second.',
        ].join('\n')
        const errors = parseTscOutput(out)
        expect(errors).toHaveLength(2)
        expect(errors.map((e) => e.file)).toEqual(['src/a.ts', 'src/b.ts'])
    })

    test('returns an empty array for empty output', () => {
        expect(parseTscOutput('')).toEqual([])
    })
})
