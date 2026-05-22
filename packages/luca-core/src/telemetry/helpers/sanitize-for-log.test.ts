import { describe, expect, test } from 'bun:test'

import { sanitizeForLog } from './sanitize-for-log.ts'

describe('sanitizeForLog', () => {
    test('strips CR / LF / tab to single spaces', () => {
        expect(sanitizeForLog('a\nb\tc\rd')).toBe('a b c d')
    })

    test('extracts .message from Error instances', () => {
        expect(sanitizeForLog(new Error('boom'))).toBe('boom')
    })

    test('caps output at 200 characters', () => {
        expect(sanitizeForLog('x'.repeat(500)).length).toBe(200)
    })

    test('coerces non-string values to strings', () => {
        expect(sanitizeForLog(42)).toBe('42')
        expect(sanitizeForLog(null)).toBe('null')
    })
})
