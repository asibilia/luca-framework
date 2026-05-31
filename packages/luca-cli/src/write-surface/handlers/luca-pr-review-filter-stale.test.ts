import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaPrReviewFilterStaleTool } from './luca-pr-review-filter-stale.ts'

import type { PrReviewComment } from '@alecsibilia/luca-core/review-analysis'

const FIXTURE_PATH = 'src/sample.ts'
const FIXTURE_CONTENT = [
    'export function greet(name: string): string {',
    '    return `hello ${name}`',
    '}',
].join('\n')

function comment(over: Partial<PrReviewComment>): PrReviewComment {
    return {
        id: 1,
        path: FIXTURE_PATH,
        line: 1,
        original_line: 1,
        commit_id: '',
        original_commit_id: '',
        diff_hunk: '',
        body: 'test',
        in_reply_to_id: null,
        ...over,
    }
}

describe('luca_pr_review_filter_stale', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-filter-stale-'))
        await Bun.write(join(cwd, FIXTURE_PATH), FIXTURE_CONTENT)
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('partitions comments into actionable / stale / unknown / replies', async () => {
        const matching = [
            '@@ -1,2 +1,2 @@',
            '+export function greet(name: string): string {',
        ].join('\n')
        const r = await lucaPrReviewFilterStaleTool.handler(
            {
                comments: [
                    comment({ id: 1, diff_hunk: '' }),
                    comment({ id: 2, diff_hunk: matching }),
                    comment({ id: 4, in_reply_to_id: 2 }),
                ],
            },
            { cwd }
        )

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.actionable.map((c: { id: number }) => c.id)).toEqual([2])
        expect(parsed.unknown.map((c: { id: number }) => c.id)).toEqual([1])
        expect(parsed.replies.map((c: { id: number }) => c.id)).toEqual([4])
    })

    test('handles an empty comment list', async () => {
        const r = await lucaPrReviewFilterStaleTool.handler(
            { comments: [] },
            { cwd }
        )
        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.actionable).toEqual([])
        expect(parsed.stale).toEqual([])
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaPrReviewFilterStaleTool.allowedPhases).toBeUndefined()
    })
})
