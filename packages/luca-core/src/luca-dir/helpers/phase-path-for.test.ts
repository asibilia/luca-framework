import { describe, expect, test } from 'bun:test'

import { phasePathFor } from './phase-path-for.ts'

describe('phasePathFor', () => {
    test('returns phase directory when file is omitted', () => {
        expect(phasePathFor('01-auth-rewrite')).toBe(
            '.luca/phases/01-auth-rewrite',
        )
    })

    test('returns specific file paths', () => {
        expect(phasePathFor('01-auth-rewrite', 'plan')).toBe(
            '.luca/phases/01-auth-rewrite/plan.md',
        )
        expect(phasePathFor('12-ws-reconnect', 'research')).toBe(
            '.luca/phases/12-ws-reconnect/research.md',
        )
        expect(phasePathFor('05-x', 'execute/summary')).toBe(
            '.luca/phases/05-x/execute/summary.md',
        )
        expect(phasePathFor('05-x', 'execute/progress')).toBe(
            '.luca/phases/05-x/execute/progress.jsonl',
        )
        expect(phasePathFor('05-x', 'verify')).toBe(
            '.luca/phases/05-x/verify.json',
        )
    })

    test('throws on unpadded NN', () => {
        expect(() => phasePathFor('1-auth')).toThrow()
    })

    test('throws on missing slug description', () => {
        expect(() => phasePathFor('01-')).toThrow()
    })

    test('throws on uppercase slug', () => {
        expect(() => phasePathFor('01-AuthRewrite')).toThrow()
    })
})
