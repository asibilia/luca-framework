import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    extractHunkAnchorLines,
    filterStaleComments,
    type PrReviewComment,
} from './stale-filter.ts'

const FIXTURE_PATH = 'src/sample.ts'
const FIXTURE_CONTENT = [
    'export function greet(name: string): string {',
    '    return `hello ${name}`',
    '}',
    '',
    'export const VERSION = 1',
].join('\n')

function makeComment(over: Partial<PrReviewComment>): PrReviewComment {
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

describe('extractHunkAnchorLines', () => {
    test('keeps context and added lines, drops removed lines and headers', () => {
        const hunk = [
            '@@ -1,3 +1,3 @@ context',
            ' unchanged line',
            '-removed line',
            '+added line',
        ].join('\n')
        expect(extractHunkAnchorLines(hunk)).toEqual([
            'unchanged line',
            'added line',
        ])
    })
})

describe('filterStaleComments — bucket routing', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-stale-filter-'))
        await Bun.write(join(cwd, FIXTURE_PATH), FIXTURE_CONTENT)
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('empty diff_hunk routes to the unknown bucket', () => {
        const result = filterStaleComments(
            [makeComment({ id: 100, diff_hunk: '' })],
            { repoRoot: cwd }
        )
        expect(result.unknown.map((c) => c.id)).toEqual([100])
        expect(result.actionable).toHaveLength(0)
        expect(result.stale).toHaveLength(0)
        expect(result.verdicts[100]!.reason).toBe('empty-diff-hunk')
    })

    test('matching anchor routes to the actionable bucket', () => {
        const hunk = [
            '@@ -1,2 +1,2 @@',
            '+export function greet(name: string): string {',
            '+    return `hello ${name}`',
        ].join('\n')
        const result = filterStaleComments(
            [makeComment({ id: 200, diff_hunk: hunk, line: 1 })],
            { repoRoot: cwd }
        )
        expect(result.actionable.map((c) => c.id)).toEqual([200])
        expect(result.stale).toHaveLength(0)
    })

    test('non-matching anchor routes to the stale bucket', () => {
        const hunk = [
            '@@ -1,3 +1,3 @@',
            '+this content does not exist anywhere qwertyuiop',
            '+nor does this second fake line asdfghjkl',
            '+and certainly not this third one zxcvbnm',
        ].join('\n')
        const result = filterStaleComments(
            [makeComment({ id: 300, diff_hunk: hunk, line: 1 })],
            { repoRoot: cwd }
        )
        expect(result.stale.map((s) => s.comment.id)).toEqual([300])
        expect(result.actionable).toHaveLength(0)
    })

    test('missing file routes to stale with file-missing reason', () => {
        const result = filterStaleComments(
            [
                makeComment({
                    id: 350,
                    path: 'src/does-not-exist.ts',
                    diff_hunk: '@@ -1 +1 @@\n+x',
                }),
            ],
            { repoRoot: cwd }
        )
        expect(result.stale).toHaveLength(1)
        expect(result.stale[0]!.verdict.reason).toBe('file-missing')
    })

    test('reply routes to the replies bucket and is not verdict-evaluated', () => {
        const result = filterStaleComments(
            [makeComment({ id: 400, in_reply_to_id: 399 })],
            { repoRoot: cwd }
        )
        expect(result.replies.map((c) => c.id)).toEqual([400])
        expect(result.verdicts[400]).toBeUndefined()
    })

    test('mixed input populates all four buckets', () => {
        const matching = [
            '@@ -1,2 +1,2 @@',
            '+export function greet(name: string): string {',
        ].join('\n')
        const nonMatching = [
            '@@ -1,3 +1,3 @@',
            '+fake anchor alpha qwertyuiop',
            '+fake anchor beta asdfghjkl',
            '+fake anchor gamma zxcvbnm',
        ].join('\n')
        const result = filterStaleComments(
            [
                makeComment({ id: 1, diff_hunk: '' }),
                makeComment({ id: 2, diff_hunk: matching }),
                makeComment({ id: 3, diff_hunk: nonMatching }),
                makeComment({ id: 4, in_reply_to_id: 2 }),
            ],
            { repoRoot: cwd }
        )
        expect(result.unknown.map((c) => c.id)).toEqual([1])
        expect(result.actionable.map((c) => c.id)).toEqual([2])
        expect(result.stale.map((s) => s.comment.id)).toEqual([3])
        expect(result.replies.map((c) => c.id)).toEqual([4])
    })
})
