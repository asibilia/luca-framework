import { describe, expect, test } from 'bun:test'

import { parseGenericOutput } from './parse-generic.ts'

describe('parseGenericOutput', () => {
    test('parses a structured file:line:col error', () => {
        expect(
            parseGenericOutput('src/x.ts:10:3: error: something broke')
        ).toEqual([
            {
                file: 'src/x.ts',
                line: 10,
                column: 3,
                message: 'something broke',
                severity: 'error',
            },
        ])
    })

    test('omits the column when it is absent', () => {
        const [err] = parseGenericOutput('src/x.ts:10: error: no column here')
        expect(err?.line).toBe(10)
        expect(err?.column).toBeUndefined()
    })

    test('parses a bare error with no file location', () => {
        expect(parseGenericOutput('error: global failure')).toEqual([
            { file: 'unknown', message: 'global failure', severity: 'error' },
        ])
    })

    test('matches case variants of the error keyword', () => {
        expect(parseGenericOutput('ERROR: shouted')).toHaveLength(1)
        expect(parseGenericOutput('Error: capitalized')).toHaveLength(1)
    })

    test('returns an empty array when nothing matches', () => {
        expect(parseGenericOutput('all good here')).toEqual([])
    })
})
