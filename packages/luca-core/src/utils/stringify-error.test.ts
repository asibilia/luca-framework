import { describe, expect, it } from 'bun:test'

import { stringifyError } from './stringify-error.ts'

describe('stringifyError', () => {
    it('returns the message of an Error', () => {
        expect(stringifyError(new Error('boom'))).toBe('boom')
    })

    it('returns the message of an Error subclass', () => {
        class CustomError extends Error {}
        expect(stringifyError(new CustomError('nope'))).toBe('nope')
    })

    it('stringifies a thrown string', () => {
        expect(stringifyError('plain string')).toBe('plain string')
    })

    it('stringifies a thrown number', () => {
        expect(stringifyError(42)).toBe('42')
    })

    it('stringifies a thrown plain object', () => {
        expect(stringifyError({ code: 'ENOENT' })).toBe('[object Object]')
    })

    it('stringifies null and undefined', () => {
        expect(stringifyError(null)).toBe('null')
        expect(stringifyError(undefined)).toBe('undefined')
    })
})
