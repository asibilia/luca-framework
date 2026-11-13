import { rm } from 'node:fs/promises'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { REVIEW_RECORD_MARKER } from './review-record'
import {
    makeSendRepo,
    openSendApp,
    pendingReview,
    readSaved,
    type SendRepo,
} from './testing/send-review-setup'

/**
 * After a send, and when it fails (#761, spec #752 section 11): what the
 * drafts file and the messages say, and a pending review left on GitHub.
 */

let repo: SendRepo

beforeEach(async () => {
    repo = await makeSendRepo()
})

afterEach(async () => {
    await rm(repo.dir, { recursive: true, force: true })
})

describe('after a send, and when it fails (#761)', () => {
    test('a send clears the comment drafts, keeps the approved files and says so', async () => {
        const made = await openSendApp(repo)
        await made.approveA()
        await made.lineDraft(10, 10, 'Name this')

        await made.send('Just comments')

        const saved = await readSaved(repo)
        expect(saved.comments).toEqual([])
        expect(saved.approved_files).toEqual(['src/a.ts'])
        expect(made.host.messages).toContainEqual({
            kind: 'info',
            text: 'Review sent to #12.',
        })
    })

    test('two comments outside the diff are counted in the message', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(120, 120, 'This is wrong too')
        await made.elsewhereDraft('Move this too')

        await made.send('Just comments')

        expect(made.host.messages).toContainEqual({
            kind: 'info',
            text: 'Review sent to #12. 2 comments were outside the diff, so they were posted as quoted text.',
        })
    })

    test('one comment outside the diff is counted in the singular', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(120, 120, 'This is wrong too')
        await made.lineDraft(10, 10, 'Name this')

        await made.send('Just comments')

        expect(made.host.messages).toContainEqual({
            kind: 'info',
            text: 'Review sent to #12. 1 comment was outside the diff, so it was posted as quoted text.',
        })
    })

    test('a failed submit leaves no pending review and keeps every draft', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(10, 10, 'Name this')
        await made.fileDraft('Split this file')
        made.github.failNext({
            step: 'submit_review',
            error: 'HTTP 502: Bad Gateway',
        })

        await made.send('Signed off')

        const pending = made
            .reviews_now()
            .filter(
                (review) =>
                    review.state === 'PENDING' && review.author === 'octocat'
            )
        expect(pending).toEqual([])
        expect((await readSaved(repo)).comments).toHaveLength(2)
        expect(made.host.messages).toContainEqual({
            kind: 'error',
            text: 'The review was not sent: HTTP 502: Bad Gateway. Your comments are still saved.',
        })
    })

    test('a failed label change after the review was taken clears the drafts and says so', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(10, 10, 'Name this')
        made.github.failNext({
            step: 'change_labels',
            error: 'HTTP 403: Resource not accessible',
        })

        await made.send('Signed off')

        expect(made.submitted()).toHaveLength(1)
        expect((await readSaved(repo)).comments).toEqual([])
        expect(made.host.messages).toContainEqual({
            kind: 'error',
            text: 'The review was sent, but the labels were not changed: HTTP 403: Resource not accessible.',
        })
    })

    test('a pending review holding the review record is deleted and one review is sent', async () => {
        const made = await openSendApp(repo, {
            reviews: [
                pendingReview(
                    `Left by a failed send\n${REVIEW_RECORD_MARKER}{} -->`
                ),
            ],
        })
        await made.prDraft('Looks right')

        await made.send('Just comments')

        expect(made.reviews_now().map(({ id }) => id)).not.toContain(77)
        expect(made.reviews_now()).toHaveLength(1)
        expect(made.submitted()).toHaveLength(1)
    })

    test('a pending review started on GitHub stops the send and keeps everything', async () => {
        const made = await openSendApp(repo, {
            reviews: [pendingReview('Half done on the website')],
        })
        await made.prDraft('Looks right')
        await made.lineDraft(10, 10, 'Name this')

        await made.send('Signed off')

        expect(made.reviews_now()).toEqual([
            pendingReview('Half done on the website'),
        ])
        expect(made.labels_now()).toEqual([])
        expect((await readSaved(repo)).comments).toHaveLength(2)
        expect(made.host.messages).toContainEqual({
            kind: 'error',
            text: 'You have a review on #12 that you started on GitHub and did not send. Send or delete it on GitHub, then try again.',
        })
    })
})
