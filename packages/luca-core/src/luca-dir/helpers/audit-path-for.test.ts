import { describe, expect, test } from 'bun:test'

import { auditPathFor } from './audit-path-for.ts'

describe('auditPathFor', () => {
    test('builds path for valid slug + reviewer', () => {
        expect(auditPathFor('01-auth', 'code-review')).toBe(
            '.luca/phases/01-auth/audits/code-review.md',
        )
        expect(auditPathFor('07-fix', 'security')).toBe(
            '.luca/phases/07-fix/audits/security.md',
        )
    })

    test('throws on invalid reviewer (uppercase)', () => {
        expect(() => auditPathFor('01-x', 'CodeReview')).toThrow()
    })

    test('throws on invalid reviewer (trailing dash)', () => {
        expect(() => auditPathFor('01-x', 'code-')).toThrow()
    })

    test('throws on invalid slug', () => {
        expect(() => auditPathFor('1-x', 'code-review')).toThrow()
    })
})
