import { describe, expect, test } from 'bun:test'

import {
    displayBounded,
    sanitizeForLog,
    sanitizeForStorage,
} from './sanitize.js'

describe('sanitizeForLog', () => {
    test('strips CR, LF, and tab characters → space', () => {
        expect(sanitizeForLog('a\rb\nc\td')).toBe('a b c d')
    })

    test('caps output at 200 characters', () => {
        const input = 'x'.repeat(500)
        const out = sanitizeForLog(input)
        expect(out.length).toBe(200)
        expect(out).toBe('x'.repeat(200))
    })

    test('coerces non-string values via String()', () => {
        expect(sanitizeForLog(42)).toBe('42')
        expect(sanitizeForLog(null)).toBe('null')
        expect(sanitizeForLog(undefined)).toBe('undefined')
        expect(sanitizeForLog({ a: 1 })).toBe('[object Object]')
    })

    test('extracts Error.message instead of [object Object]', () => {
        expect(sanitizeForLog(new Error('boom'))).toBe('boom')
    })

    test('handles empty string', () => {
        expect(sanitizeForLog('')).toBe('')
    })

    test('combines newline strip and length cap', () => {
        const input = 'a\n'.repeat(150)
        const out = sanitizeForLog(input)
        expect(out.length).toBe(200)
        expect(out.includes('\n')).toBe(false)
    })
})

describe('sanitizeForStorage', () => {
    test('strips CR, LF, and tab characters without truncating', () => {
        const input = 'a\rb\nc\td'.repeat(100)
        const out = sanitizeForStorage(input)
        expect(out.includes('\r')).toBe(false)
        expect(out.includes('\n')).toBe(false)
        expect(out.includes('\t')).toBe(false)
        expect(out.length).toBe(input.length)
    })

    test('preserves content beyond 200 chars (no cap)', () => {
        const input = 'y'.repeat(1000)
        expect(sanitizeForStorage(input).length).toBe(1000)
    })

    test('extracts Error.message', () => {
        expect(sanitizeForStorage(new Error('kaboom'))).toBe('kaboom')
    })

    test('coerces non-string values', () => {
        expect(sanitizeForStorage(7)).toBe('7')
        expect(sanitizeForStorage(false)).toBe('false')
    })
})

describe('displayBounded', () => {
    test('respects caller-supplied max length', () => {
        expect(displayBounded('abcdefghij', 5)).toBe('abcde')
    })

    test('strips CR/LF/tab → space', () => {
        expect(displayBounded('a\nb\tc\rd', 100)).toBe('a b c d')
    })

    test('returns full string when shorter than max', () => {
        expect(displayBounded('short', 100)).toBe('short')
    })

    test('handles max of 0 → empty string', () => {
        expect(displayBounded('anything', 0)).toBe('')
    })

    test('extracts Error.message before bounding', () => {
        expect(displayBounded(new Error('long error'), 4)).toBe('long')
    })
})
