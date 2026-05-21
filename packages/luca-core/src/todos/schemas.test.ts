import { describe, expect, test } from 'bun:test'

import { TodoSchema, TodoStatus, slugFromTitle } from './schemas.ts'

describe('TodoStatus enum', () => {
    test.each(['pending', 'backlog', 'done'])('accepts %p', (s) => {
        expect(TodoStatus.safeParse(s).success).toBe(true)
    })

    test('rejects unknown status', () => {
        expect(TodoStatus.safeParse('in-progress').success).toBe(false)
    })
})

describe('TodoSchema — happy path', () => {
    test('parses a minimal todo with required fields only', () => {
        const parsed = TodoSchema.parse({
            schemaVersion: 1,
            id: 'auth-rewrite',
            title: 'Rewrite the auth middleware',
            status: 'pending',
            updatedAt: '2026-05-20T18:00:00Z',
        })
        expect(parsed.id).toBe('auth-rewrite')
        expect(parsed.status).toBe('pending')
        expect(parsed.body).toBeUndefined()
    })

    test('parses a fully-populated todo', () => {
        const parsed = TodoSchema.parse({
            schemaVersion: 1,
            id: 'auth-rewrite',
            title: 'Rewrite the auth middleware',
            body: '## Background\n\nCurrent middleware uses deprecated foo()',
            status: 'done',
            source: 'gh-issue-#42',
            metadata: { priority: 'high', estimate: 'M' },
            updatedAt: '2026-05-20T18:00:00Z',
            verificationRef: { criterionId: 'ac-03' },
        })
        expect(parsed.source).toBe('gh-issue-#42')
        expect(parsed.verificationRef!.criterionId).toBe('ac-03')
    })
})

describe('TodoSchema — validation rejections', () => {
    test('rejects empty title', () => {
        const r = TodoSchema.safeParse({
            schemaVersion: 1,
            id: 'x',
            title: '',
            status: 'pending',
            updatedAt: '2026-05-20T18:00:00Z',
        })
        expect(r.success).toBe(false)
    })

    test('rejects id with non-kebab characters', () => {
        const r = TodoSchema.safeParse({
            schemaVersion: 1,
            id: 'Auth_Rewrite',
            title: 'x',
            status: 'pending',
            updatedAt: '2026-05-20T18:00:00Z',
        })
        expect(r.success).toBe(false)
    })

    test('rejects updatedAt that is not ISO datetime', () => {
        const r = TodoSchema.safeParse({
            schemaVersion: 1,
            id: 'x',
            title: 'x',
            status: 'pending',
            updatedAt: '2026-05-20',
        })
        expect(r.success).toBe(false)
    })

    test('rejects schemaVersion other than 1', () => {
        const r = TodoSchema.safeParse({
            schemaVersion: 2,
            id: 'x',
            title: 'x',
            status: 'pending',
            updatedAt: '2026-05-20T18:00:00Z',
        })
        expect(r.success).toBe(false)
    })
})

describe('slugFromTitle', () => {
    test.each([
        ['Rewrite the auth middleware', 'rewrite-the-auth-middleware'],
        ['Fix bug #42 in @username', 'fix-bug-42-in-username'],
        ['   leading/trailing whitespace   ', 'leading-trailing-whitespace'],
        ['ALL CAPS NAME', 'all-caps-name'],
    ])('slugifies %p → %p', (input, expected) => {
        expect(slugFromTitle(input)).toBe(expected)
    })

    test('throws for empty result (e.g. all punctuation)', () => {
        expect(() => slugFromTitle('!!!')).toThrow()
        expect(() => slugFromTitle('   ')).toThrow()
    })

    test('truncates very long titles to 60 chars max', () => {
        const long = 'a'.repeat(100)
        const slug = slugFromTitle(long)
        expect(slug.length).toBeLessThanOrEqual(60)
    })
})
