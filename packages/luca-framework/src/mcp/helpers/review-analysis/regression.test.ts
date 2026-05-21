import { describe, expect, test } from 'bun:test'

import type { ReviewFinding } from './convergence.ts'
import { checkRegression, findingIdentity } from './regression.ts'

function finding(over: Partial<ReviewFinding>): ReviewFinding {
    return {
        id: 'f1',
        perspective: 'reviewer',
        path: 'src/a.ts',
        line: 10,
        severity: 'should-fix',
        summary: 'something is wrong here',
        ...over,
    }
}

describe('findingIdentity', () => {
    test('is stable across differing ids', () => {
        const a = finding({ id: 'x1' })
        const b = finding({ id: 'x2' })
        expect(findingIdentity(a)).toBe(findingIdentity(b))
    })

    test('differs when path or line differ', () => {
        expect(findingIdentity(finding({ line: 10 }))).not.toBe(
            findingIdentity(finding({ line: 20 })),
        )
    })
})

describe('checkRegression', () => {
    test('flags a new finding on a touched path as a regression', () => {
        const before: ReviewFinding[] = []
        const after = [finding({ id: 'a', path: 'src/a.ts', line: 5 })]
        const report = checkRegression({
            before,
            after,
            touchedPaths: ['src/a.ts'],
        })
        expect(report.regressions).toHaveLength(1)
        expect(report.regressions[0]!.reason).toBe('new-on-touched-path')
    })

    test('a new finding on an untouched path is NOT a regression', () => {
        const after = [finding({ id: 'a', path: 'src/other.ts' })]
        const report = checkRegression({
            before: [],
            after,
            touchedPaths: ['src/a.ts'],
        })
        expect(report.regressions).toHaveLength(0)
        expect(report.newButUntouched).toHaveLength(1)
    })

    test('flags severity escalation on the same finding', () => {
        const before = [finding({ id: 'a', severity: 'nit' })]
        const after = [finding({ id: 'a', severity: 'must-fix' })]
        const report = checkRegression({
            before,
            after,
            touchedPaths: ['src/a.ts'],
        })
        expect(report.regressions).toHaveLength(1)
        expect(report.regressions[0]!.reason).toBe('severity-escalated')
    })

    test('reports resolved findings (present before, gone after)', () => {
        const before = [finding({ id: 'a', summary: 'fixed me' })]
        const report = checkRegression({
            before,
            after: [],
            touchedPaths: [],
        })
        expect(report.resolved).toHaveLength(1)
    })

    test('reports unchanged findings (present in both, same severity)', () => {
        const before = [finding({ id: 'a' })]
        const after = [finding({ id: 'a' })]
        const report = checkRegression({
            before,
            after,
            touchedPaths: ['src/a.ts'],
        })
        expect(report.unchanged).toHaveLength(1)
        expect(report.regressions).toHaveLength(0)
    })
})
