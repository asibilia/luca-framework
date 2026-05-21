import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lucaPrReviewDetectConvergenceTool } from './luca-pr-review-detect-convergence.ts'

describe('luca_pr_review_detect_convergence', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-convergence-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('promotes severity when 2+ perspectives flag the same line', async () => {
        const r = await lucaPrReviewDetectConvergenceTool.handler(
            {
                findings: [
                    {
                        id: 'a',
                        perspective: 'copilot',
                        path: 'src/a.ts',
                        line: 10,
                        severity: 'should-fix',
                        summary: 'x',
                    },
                    {
                        id: 'b',
                        perspective: 'reviewer',
                        path: 'src/a.ts',
                        line: 10,
                        severity: 'nit',
                        summary: 'y',
                    },
                ],
            },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.report.convergentGroups).toHaveLength(1)
        expect(parsed.report.promotions).toHaveLength(2)
        expect(parsed.counts.promotions).toBe(2)
    })

    test('no promotions when findings do not converge', async () => {
        const r = await lucaPrReviewDetectConvergenceTool.handler(
            {
                findings: [
                    {
                        id: 'a',
                        perspective: 'copilot',
                        path: 'src/a.ts',
                        line: 10,
                        severity: 'nit',
                        summary: 'x',
                    },
                ],
            },
            { cwd },
        )

        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.report.promotions).toHaveLength(0)
    })

    test('handles an empty findings list', async () => {
        const r = await lucaPrReviewDetectConvergenceTool.handler(
            { findings: [] },
            { cwd },
        )
        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.report.groups).toEqual([])
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(
            lucaPrReviewDetectConvergenceTool.allowedPhases,
        ).toBeUndefined()
    })
})
