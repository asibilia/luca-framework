import { describe, expect, test } from 'bun:test'

import { detectConvergence, type ReviewFinding } from './convergence.ts'

function finding(over: Partial<ReviewFinding>): ReviewFinding {
    return {
        id: 'f1',
        perspective: 'reviewer',
        path: 'src/a.ts',
        line: 10,
        severity: 'should-fix',
        summary: 'something',
        ...over,
    }
}

describe('detectConvergence — grouping', () => {
    test('groups findings on the same path within line tolerance', () => {
        const report = detectConvergence([
            finding({ id: 'a', perspective: 'copilot', line: 10 }),
            finding({ id: 'b', perspective: 'reviewer', line: 11 }),
        ])
        expect(report.groups).toHaveLength(1)
        expect(report.groups[0]!.perspectives).toEqual(['copilot', 'reviewer'])
    })

    test('separates findings beyond line tolerance', () => {
        const report = detectConvergence([
            finding({ id: 'a', line: 10 }),
            finding({ id: 'b', line: 50 }),
        ])
        expect(report.groups).toHaveLength(2)
    })

    test('findings without a line become singleton groups', () => {
        const report = detectConvergence([
            finding({ id: 'a', line: undefined }),
            finding({ id: 'b', line: undefined }),
        ])
        expect(report.groups).toHaveLength(2)
        expect(report.convergentGroups).toHaveLength(0)
    })
})

describe('detectConvergence — promotion', () => {
    test('promotes should-fix to must-fix when 2+ perspectives converge', () => {
        const report = detectConvergence([
            finding({
                id: 'a',
                perspective: 'copilot',
                line: 10,
                severity: 'should-fix',
            }),
            finding({
                id: 'b',
                perspective: 'reviewer',
                line: 10,
                severity: 'nit',
            }),
        ])
        expect(report.convergentGroups).toHaveLength(1)
        expect(report.promotions).toHaveLength(2)
        const promotedA = report.promotedFindings.find((f) => f.id === 'a')
        expect(promotedA!.severity).toBe('must-fix')
    })

    test('does NOT promote when only one perspective flags a line', () => {
        const report = detectConvergence([
            finding({ id: 'a', perspective: 'copilot', severity: 'nit' }),
        ])
        expect(report.promotions).toHaveLength(0)
        expect(report.promotedFindings[0]!.severity).toBe('nit')
    })

    test('already-must-fix findings get a marker but no severity bump', () => {
        const report = detectConvergence([
            finding({
                id: 'a',
                perspective: 'copilot',
                line: 10,
                severity: 'must-fix',
            }),
            finding({
                id: 'b',
                perspective: 'reviewer',
                line: 10,
                severity: 'should-fix',
            }),
        ])
        const promoA = report.promotions.find((p) => p.findingId === 'a')
        expect(promoA!.fromSeverity).toBe('must-fix')
        expect(promoA!.toSeverity).toBe('must-fix')
    })

    test('does not mutate input findings', () => {
        const input = [
            finding({ id: 'a', perspective: 'copilot', severity: 'nit' }),
            finding({ id: 'b', perspective: 'reviewer', severity: 'nit' }),
        ]
        detectConvergence(input)
        expect(input[0]!.severity).toBe('nit')
    })
})
