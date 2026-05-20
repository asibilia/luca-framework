/**
 * Tests for filterStaleComments — bucket routing and the empty-diff_hunk
 * unknown-bucket guarantee (Task 2.1.1 fix).
 *
 * The empty-diff_hunk path returns early in verdictFor before any git/fs
 * call, so it can be tested in isolation. Non-empty paths use this test
 * file itself as the cited path (it exists in the working tree).
 */
import { join } from 'node:path'

import { describe, test, expect } from 'bun:test'

import {
    filterStaleComments,
    type PrReviewComment,
} from '../review-analysis/stale-filter.js'

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..')
const SELF_PATH = 'packages/luca-mastracode/src/__tests__/stale-filter.test.ts'

function makeComment(overrides: Partial<PrReviewComment>): PrReviewComment {
    return {
        id: 1,
        path: SELF_PATH,
        line: 1,
        original_line: 1,
        commit_id: '',
        original_commit_id: '',
        diff_hunk: '',
        body: 'test',
        in_reply_to_id: null,
        ...overrides,
    }
}

describe('filterStaleComments — bucket routing', () => {
    test('empty diff_hunk routes to unknown bucket (not stale, not actionable)', () => {
        const comment = makeComment({ id: 100, diff_hunk: '' })
        const result = filterStaleComments([comment], { repoRoot: REPO_ROOT })
        expect(result.unknown).toHaveLength(1)
        expect(result.unknown[0]!.id).toBe(100)
        expect(result.actionable).toHaveLength(0)
        expect(result.stale).toHaveLength(0)
        expect(result.replies).toHaveLength(0)
    })

    test('verdict.reason === "empty-diff-hunk" is present on unknown verdicts', () => {
        const comment = makeComment({ id: 101, diff_hunk: '' })
        const result = filterStaleComments([comment], { repoRoot: REPO_ROOT })
        const verdict = result.verdicts[101]
        expect(verdict).toBeDefined()
        expect(verdict!.reason).toBe('empty-diff-hunk')
        expect(verdict!.stale).toBe(false)
    })

    test('non-empty diff_hunk with matching anchor routes to actionable bucket', () => {
        // Use a real anchor from THIS file — the comment header at line 1.
        const diffHunk = [
            '@@ -1,3 +1,3 @@',
            '+/**',
            '+ * Tests for filterStaleComments — bucket routing and the empty-diff_hunk',
            '+ * unknown-bucket guarantee (Task 2.1.1 fix).',
        ].join('\n')
        const comment = makeComment({
            id: 200,
            diff_hunk: diffHunk,
            line: 1,
            original_line: 1,
        })
        const result = filterStaleComments([comment], { repoRoot: REPO_ROOT })
        expect(result.actionable).toHaveLength(1)
        expect(result.actionable[0]!.id).toBe(200)
        expect(result.unknown).toHaveLength(0)
        expect(result.stale).toHaveLength(0)
    })

    test('non-empty diff_hunk with non-matching anchor routes to stale bucket', () => {
        const diffHunk = [
            '@@ -1,3 +1,3 @@',
            '+this content definitely does not appear anywhere in the file',
            '+nor does this second line of fake content xyzzy plugh',
            '+and certainly not this third line of impossible-to-find anchor',
        ].join('\n')
        const comment = makeComment({
            id: 300,
            diff_hunk: diffHunk,
            line: 1,
            original_line: 1,
        })
        const result = filterStaleComments([comment], { repoRoot: REPO_ROOT })
        expect(result.stale).toHaveLength(1)
        expect(result.stale[0]!.comment.id).toBe(300)
        expect(result.stale[0]!.verdict.stale).toBe(true)
        expect(result.actionable).toHaveLength(0)
    })

    test('reply (in_reply_to_id !== null) routes to replies bucket', () => {
        const reply = makeComment({
            id: 400,
            in_reply_to_id: 399,
            diff_hunk: '',
        })
        const result = filterStaleComments([reply], { repoRoot: REPO_ROOT })
        expect(result.replies).toHaveLength(1)
        expect(result.replies[0]!.id).toBe(400)
        expect(result.unknown).toHaveLength(0)
        expect(result.actionable).toHaveLength(0)
        expect(result.stale).toHaveLength(0)
        // Replies are NOT verdict-evaluated.
        expect(result.verdicts[400]).toBeUndefined()
    })

    test('mixed input populates all four buckets correctly', () => {
        const matchingHunk = [
            '@@ -1,3 +1,3 @@',
            '+/**',
            '+ * Tests for filterStaleComments — bucket routing and the empty-diff_hunk',
        ].join('\n')
        const nonMatchingHunk = [
            '@@ -1,3 +1,3 @@',
            '+nonexistent anchor line alpha qwertyuiop',
            '+nonexistent anchor line beta asdfghjkl',
            '+nonexistent anchor line gamma zxcvbnm',
        ].join('\n')
        const comments: PrReviewComment[] = [
            makeComment({ id: 1, diff_hunk: '' }), // unknown
            makeComment({ id: 2, diff_hunk: matchingHunk }), // actionable
            makeComment({ id: 3, diff_hunk: nonMatchingHunk }), // stale
            makeComment({ id: 4, in_reply_to_id: 2 }), // reply
        ]
        const result = filterStaleComments(comments, { repoRoot: REPO_ROOT })
        expect(result.unknown.map((c) => c.id)).toEqual([1])
        expect(result.actionable.map((c) => c.id)).toEqual([2])
        expect(result.stale.map((s) => s.comment.id)).toEqual([3])
        expect(result.replies.map((c) => c.id)).toEqual([4])
    })
})
