import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { REVIEW_RECORD_MARKER } from './review-record'
import {
    CHANGES_WANTED,
    makeSendRepo,
    moveMainOn,
    openSendApp,
    outsideStart,
    readSaved,
    REPO,
    SIGNED_OFF,
    type SendRepo,
} from './testing/send-review-setup'
import { commitSymlink } from './testing/walk-story'

import { REPLY_MARKER } from '../../engine/skills/luca-pr-address/scripts/pr-findings'

/**
 * Sending one review (#761, spec #752 section 11): the verdict, the
 * labels, and what goes in the review. The setup's `src/a.ts` changes only
 * line 10 (one hunk, lines 7 to 13); `src/elsewhere.ts` is not in the diff.
 */

let repo: SendRepo

/** A gh call that reads or changes labels: `gh label`, `--add-label`, `--remove-label`, or a labels API. */
const LABEL_CALL = /^label |--add-label|--remove-label|\/labels\b/

/** The gh calls the app made that touch labels. */
const labelCalls = (made: { github: { state: { calls: string[] } } }) =>
    made.github.state.calls.filter((call) => LABEL_CALL.test(call))

beforeEach(async () => {
    repo = await makeSendRepo()
})

afterEach(async () => {
    await rm(repo.dir, { recursive: true, force: true })
})

describe('the verdict and the labels (#761)', () => {
    test('Signed off on my own pull request submits COMMENT and sets signed-off, taking off changes-wanted', async () => {
        const made = await openSendApp(repo, { labels: [CHANGES_WANTED] })
        await made.prDraft('Looks right')

        await made.send('Signed off')

        expect(made.host.picks.at(-1)?.map(({ label }) => label)).toEqual([
            'Signed off',
            'Changes wanted',
            'Just comments',
        ])
        expect(made.reviews_now()).toHaveLength(1)
        expect(made.submitted()[0]?.event).toBe('COMMENT')
        expect(made.labels_now()).toContain(SIGNED_OFF)
        expect(made.labels_now()).not.toContain(CHANGES_WANTED)
        expect(labelCalls(made)).not.toEqual([])
    })

    test('Changes wanted on my own pull request labelled signed-off swaps the label', async () => {
        const made = await openSendApp(repo, { labels: [SIGNED_OFF] })
        await made.prDraft('Rename the helper')

        await made.send('Changes wanted')

        expect(made.labels_now()).toContain(CHANGES_WANTED)
        expect(made.labels_now()).not.toContain(SIGNED_OFF)
    })

    test('Signed off on a pull request by hubot submits APPROVE and changes no label', async () => {
        const made = await openSendApp(repo, {
            author: 'hubot',
            labels: ['review-ready'],
        })
        await made.prDraft('Thanks')

        await made.send('Signed off')

        expect(made.submitted().map(({ event }) => event)).toEqual(['APPROVE'])
        expect(made.labels_now()).toEqual(['review-ready'])
        expect(labelCalls(made)).toEqual([])
    })

    test('Changes wanted on a pull request by hubot submits REQUEST_CHANGES and changes no label', async () => {
        const made = await openSendApp(repo, {
            author: 'hubot',
            labels: ['review-ready'],
        })
        await made.prDraft('Not yet')

        await made.send('Changes wanted')

        expect(made.submitted().map(({ event }) => event)).toEqual([
            'REQUEST_CHANGES',
        ])
        expect(made.labels_now()).toEqual(['review-ready'])
        expect(labelCalls(made)).toEqual([])
    })

    test('Just comments submits COMMENT and changes no label', async () => {
        const made = await openSendApp(repo, { labels: ['review-ready'] })
        await made.prDraft('A thought')

        await made.send('Just comments')

        expect(made.submitted().map(({ event }) => event)).toEqual(['COMMENT'])
        expect(made.labels_now()).toEqual(['review-ready'])
    })

    test('Signed off on a repo with no signed-off label creates the label and adds it', async () => {
        const made = await openSendApp(repo, { repo_labels: [] })
        await made.prDraft('Looks right')

        await made.send('Signed off')

        expect(made.repo_labels_now()).toContain(SIGNED_OFF)
        expect(made.labels_now()).toContain(SIGNED_OFF)
    })

    test('cancelling the verdict sends nothing and keeps every draft', async () => {
        const made = await openSendApp(repo)
        await made.prDraft('Looks right')
        await made.lineDraft(10, 10, 'Name this')

        await made.send(null)

        expect(made.reviews_now()).toEqual([])
        expect((await readSaved(repo)).comments).toHaveLength(2)
    })
})

describe('what goes in the review (#761)', () => {
    test('line, range, file and pull request drafts send as one review', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(10, 10, 'Name this')
        await made.lineDraft(9, 11, 'Fold these')
        await made.fileDraft('Split this file')
        await made.prDraft('Good direction')

        await made.send('Just comments')

        expect(made.reviews_now()).toHaveLength(1)
        const review = made.submitted()[0]
        expect(review?.comments).toHaveLength(2)
        expect(review?.comments).toContainEqual(
            expect.objectContaining({
                path: 'src/a.ts',
                line: 10,
                side: 'RIGHT',
                body: 'Name this',
            })
        )
        expect(review?.comments).toContainEqual(
            expect.objectContaining({
                path: 'src/a.ts',
                start_line: 9,
                line: 11,
                side: 'RIGHT',
                body: 'Fold these',
            })
        )
        expect(review?.file_threads).toEqual([
            { path: 'src/a.ts', body: 'Split this file' },
        ])
        expect(review?.body).toContain('Good direction')
    })

    test('a base side draft inside the hunk is sent on the LEFT side at its base line', async () => {
        const made = await openSendApp(repo)
        await made.app.draftCommentAdded({
            uri: `luca-walk-base:/src/a.ts?sha=${repo.base_sha}`,
            start_line: 10,
            end_line: 10,
            body: 'Why was this 10?',
        })

        await made.send('Just comments')

        expect(made.submitted()[0]?.comments).toEqual([
            expect.objectContaining({
                path: 'src/a.ts',
                line: 10,
                side: 'LEFT',
                body: 'Why was this 10?',
            }),
        ])
    })

    test('a draft on line 120, outside every hunk, is sent as a quoted file thread', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(120, 120, 'This is wrong too')

        await made.send('Just comments')

        const review = made.submitted()[0]
        expect(review?.comments).toEqual([])
        expect(review?.file_threads).toEqual([
            {
                path: 'src/a.ts',
                body: `${outsideStart(repo, '120', 'src/a.ts')}\n\n> const line120 = 120\n\nThis is wrong too`,
            },
        ])
    })

    test('a range draft on lines 120 to 124 outside every hunk names both ends', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(120, 124, 'All of these')

        await made.send('Just comments')

        const body = made.submitted()[0]?.file_threads[0]?.body ?? ''
        const first = body.split('\n')[0] ?? ''
        expect(first.startsWith('On lines 120 to 124 of src/a.ts')).toBe(true)
        expect(first.endsWith('#L120-L124')).toBe(true)
    })

    test("a draft outside the diff on a symlink that leads out of the checkout never quotes the linked file's lines", async () => {
        const token = 'gho_not_a_real_token'
        const outside = join(repo.dir, 'hosts.yml')
        await writeFile(outside, `github.com:\n    oauth_token: ${token}\n`)
        const head_sha = await commitSymlink({
            folder: repo.checkout,
            path: 'fixtures/hosts.yml',
            target: outside,
        })
        const link = join(repo.checkout, 'fixtures/hosts.yml')
        expect(await readFile(link, 'utf8')).toContain(token)
        const made = await openSendApp({ ...repo, head_sha })
        await made.app.draftCommentAdded({
            uri: made.uriOf('fixtures/hosts.yml'),
            start_line: 2,
            end_line: 2,
            body: "Don't commit tokens",
        })

        await made.send('Just comments')

        const review = made.submitted()[0]
        const sent = [
            review?.body ?? '',
            ...(review?.comments ?? []).map(({ body }) => body),
            ...(review?.file_threads ?? []).map(({ body }) => body),
        ].join('\n')
        expect(sent).toContain("Don't commit tokens")
        expect(sent).not.toContain(token)
    })

    test('a draft on a file not in the diff is quoted in the review text', async () => {
        const made = await openSendApp(repo)
        await made.elsewhereDraft('Move this too')

        await made.send('Just comments')

        const review = made.submitted()[0]
        expect(review?.comments).toEqual([])
        expect(review?.file_threads).toEqual([])
        expect(review?.body).toContain(
            `${outsideStart(repo, '3', 'src/elsewhere.ts')}\n\n> three\n\nMove this too`
        )
    })

    test('pull request comments come before quoted comments in the review text', async () => {
        const made = await openSendApp(repo)
        await made.elsewhereDraft('Move this too')
        await made.prDraft('Good direction')

        await made.send('Just comments')

        const body = made.submitted()[0]?.body ?? ''
        const pr_at = body.indexOf('Good direction')
        const quoted_at = body.indexOf(
            outsideStart(repo, '3', 'src/elsewhere.ts')
        )
        expect(pr_at).toBeGreaterThanOrEqual(0)
        expect(quoted_at).toBeGreaterThan(pr_at)
    })

    test('a 422 at the create step sends every line and range draft as quoted text', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(10, 10, 'Name this')
        await made.lineDraft(9, 11, 'Fold these')
        made.github.failNext({
            step: 'create_review',
            error: 'HTTP 422: Unprocessable Entity',
        })

        await made.send('Just comments')

        const review = made.submitted()[0]
        expect(made.reviews_now()).toHaveLength(1)
        expect(review?.comments).toEqual([])
        const quoted = review?.file_threads.map(({ body }) => body) ?? []
        expect(quoted).toHaveLength(2)
        const first = outsideStart(repo, '10', 'src/a.ts')
        expect(quoted[0]?.startsWith(first)).toBe(true)
        expect(quoted[0]?.endsWith('Name this')).toBe(true)
        expect(quoted[1]?.startsWith('On lines 9 to 11 of src/a.ts')).toBe(true)
        expect(made.host.messages).toContainEqual({
            kind: 'info',
            text: 'Review sent to #12. 2 comments were outside the diff, so they were posted as quoted text.',
        })
    })

    test('no copy of the reply marker is sent', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(
            10,
            10,
            `Fix ${REPLY_MARKER} this\n${REPLY_MARKER}`
        )
        await made.prDraft(`Overall ${REPLY_MARKER} fine ${REPLY_MARKER}`)

        await made.send('Just comments')

        const review = made.submitted()[0]
        expect(review?.comments).toHaveLength(1)
        expect(review?.comments[0]?.body).not.toContain(REPLY_MARKER)
        expect(review?.comments[0]?.body).toContain('Fix')
        expect(review?.body).not.toContain(REPLY_MARKER)
        expect(review?.body).toContain('Overall')
    })

    test('the last line of the review text is the review record', async () => {
        const made = await openSendApp(repo)
        await made.approveA()
        await made.prDraft('Looks right')

        await made.send('Just comments')

        const last = made.submitted()[0]?.body.split('\n').at(-1) ?? ''
        expect(last.startsWith(REVIEW_RECORD_MARKER)).toBe(true)
        expect(last.endsWith(' -->')).toBe(true)
        const record: unknown = JSON.parse(
            last.slice(REVIEW_RECORD_MARKER.length, -' -->'.length)
        )
        expect(record).toEqual({
            schema_version: 1,
            commit: repo.head_sha,
            approved_files: ['src/a.ts'],
        })
    })
})

describe('sending a review of the plain diff (#759, #761)', () => {
    type SendApp = Awaited<ReturnType<typeof openSendApp>>

    /**
     * Browses the plain diff and sends three drafts: one on head line 10
     * and one on base line 10, both in the merge base's one hunk, and one
     * on base line 100, which only main's tip changed.
     */
    const browseAndSend = async (made: SendApp) => {
        await made.app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'browse_diff' },
        })
        const baseDraft = (line: number, body: string) =>
            made.app.draftCommentAdded({
                uri: `luca-walk-base:/src/a.ts?sha=${repo.base_sha}`,
                start_line: line,
                end_line: line,
                body,
            })
        await made.lineDraft(10, 10, 'Name this')
        await baseDraft(10, 'Why was this 10?')
        await baseDraft(100, 'Why 100?')
        await made.send('Just comments')
    }

    /** The review the three drafts make when checked against the merge base. */
    const expectMergeBaseReview = (made: SendApp) => {
        expect(made.reviews_now()).toHaveLength(1)
        const review = made.submitted()[0]
        expect(review?.comments).toHaveLength(2)
        expect(review?.comments).toContainEqual(
            expect.objectContaining({
                path: 'src/a.ts',
                line: 10,
                side: 'RIGHT',
                body: 'Name this',
            })
        )
        expect(review?.comments).toContainEqual(
            expect.objectContaining({
                path: 'src/a.ts',
                line: 10,
                side: 'LEFT',
                body: 'Why was this 10?',
            })
        )
        expect(review?.file_threads).toEqual([
            {
                path: 'src/a.ts',
                body: `On line 100 of src/a.ts, outside this pull request's diff: https://github.com/${REPO}/blob/${repo.base_sha}/src/a.ts#L100\n\n> const line100 = 100\n\nWhy 100?`,
            },
        ])
    }

    test('with no story, both sides are sent as checked against the merge base of origin/main and the head', async () => {
        await moveMainOn(repo)
        const made = await openSendApp(repo, { story: null })

        await browseAndSend(made)

        expectMergeBaseReview(made)
    })

    test("with a stale story, both sides are sent as checked against the merge base, not the story's base", async () => {
        const main_tip = await moveMainOn(repo)
        const made = await openSendApp(repo, {
            story: { base_sha: main_tip, head_sha: 'a'.repeat(40) },
        })

        await browseAndSend(made)

        expectMergeBaseReview(made)
    })
})
