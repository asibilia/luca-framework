import { describe, expect, test } from 'bun:test'

import { parseEslintOutput } from './parse-eslint.ts'

describe('parseEslintOutput', () => {
    test('parses eslint --format json output', () => {
        const json = JSON.stringify([
            {
                filePath: '/repo/src/x.ts',
                messages: [
                    {
                        line: 3,
                        column: 7,
                        message: 'Unexpected var',
                        ruleId: 'no-var',
                        severity: 2,
                    },
                ],
            },
        ])
        expect(parseEslintOutput(json)).toEqual([
            {
                file: '/repo/src/x.ts',
                line: 3,
                column: 7,
                message: 'Unexpected var',
                code: 'no-var',
                severity: 'error',
            },
        ])
    })

    test('maps JSON severity 1 to warning and a null ruleId to undefined code', () => {
        const json = JSON.stringify([
            {
                filePath: '/repo/src/y.ts',
                messages: [
                    {
                        line: 1,
                        column: 1,
                        message: 'soft',
                        ruleId: null,
                        severity: 1,
                    },
                ],
            },
        ])
        const [err] = parseEslintOutput(json)
        expect(err?.severity).toBe('warning')
        expect(err?.code).toBeUndefined()
    })

    test('falls back to regex parsing of default eslint output', () => {
        const out = [
            'src/foo.ts',
            '  12:5  error  Unexpected console statement  no-console',
        ].join('\n')
        expect(parseEslintOutput(out)).toEqual([
            {
                file: 'src/foo.ts',
                line: 12,
                column: 5,
                severity: 'error',
                message: 'Unexpected console statement',
                code: 'no-console',
            },
        ])
    })

    test('returns an empty array for clean output', () => {
        expect(parseEslintOutput('')).toEqual([])
    })
})
