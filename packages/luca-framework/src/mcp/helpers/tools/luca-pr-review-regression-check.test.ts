import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaPrReviewRegressionCheckTool } from './luca-pr-review-regression-check.ts'

import type { ReviewFinding } from '../review-analysis/index.ts'

function finding(over: Partial<ReviewFinding>): ReviewFinding {
    return {
        id: 'f1',
        perspective: 'reviewer',
        path: 'src/a.ts',
        line: 10,
        severity: 'should-fix',
        summary: 'something is wrong',
        ...over,
    }
}

describe('luca_pr_review_regression_check', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-regression-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns isError when a regression is detected on a touched path', async () => {
        const r = await lucaPrReviewRegressionCheckTool.handler(
            {
                before: [],
                after: [finding({ id: 'a', path: 'src/a.ts' })],
                touched_paths: ['src/a.ts'],
            },
            { cwd }
        )

        expect(r.isError).toBe(true)
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.report.regressions).toHaveLength(1)
        expect(parsed.counts.regressions).toBe(1)
    })

    test('succeeds when the iteration only resolves findings', async () => {
        const r = await lucaPrReviewRegressionCheckTool.handler(
            {
                before: [finding({ id: 'a', summary: 'fixed' })],
                after: [],
                touched_paths: ['src/a.ts'],
            },
            { cwd }
        )

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.report.resolved).toHaveLength(1)
        expect(parsed.report.regressions).toHaveLength(0)
    })

    test('new finding on an untouched path is not a regression', async () => {
        const r = await lucaPrReviewRegressionCheckTool.handler(
            {
                before: [],
                after: [finding({ id: 'a', path: 'src/other.ts' })],
                touched_paths: ['src/a.ts'],
            },
            { cwd }
        )

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.report.newButUntouched).toHaveLength(1)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaPrReviewRegressionCheckTool.allowedPhases).toBeUndefined()
    })
})
