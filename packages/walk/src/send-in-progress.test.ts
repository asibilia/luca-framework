import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { draftFingerprint } from './already-sent'
import { REVIEW_RECORD_MARKER } from './review-record'
import {
    makeSendRepo,
    openSendApp,
    pendingReview,
    readSaved,
    type SendRepo,
} from './testing/send-review-setup'

/**
 * Never posting twice in a repo that isn't yours (#766, after #767): the
 * review's text holds no record line there, so the send in progress is
 * kept on this computer (`sending/` under Luca Walk's folder) from the
 * moment the pending review is made until the send is done.
 */

let repo: SendRepo

beforeEach(async () => {
    repo = await makeSendRepo({ repo_name: 'acme/site' })
})

afterEach(async () => {
    await rm(repo.dir, { recursive: true, force: true })
})

const sendingDir = () => join(repo.walk_dir, 'sending/acme/site')

const BAD_GATEWAY = 'HTTP 502: Bad Gateway'

const ALREADY = {
    kind: 'info' as const,
    text: 'This review was already sent to #12. Your drafts are cleared.',
}

describe('a send GitHub took though gh failed, in a repo that is not yours (#766)', () => {
    test('the retry posts nothing again, clears the drafts, says so, and forgets the send in progress', async () => {
        const made = await openSendApp(repo, { author: 'hubot' })
        await made.lineDraft(10, 10, 'Name this')
        await made.prDraft('Looks right')
        made.github.failNext({
            step: 'submit_review',
            error: BAD_GATEWAY,
            taken: true,
        })
        await made.send('Just comments')
        expect(made.submitted()[0]?.body).not.toContain(REVIEW_RECORD_MARKER)
        expect((await readSaved(repo)).comments).toHaveLength(2)

        await made.send('Just comments')

        expect(made.submitted()).toHaveLength(1)
        expect(made.reviews_now()).toHaveLength(1)
        expect((await readSaved(repo)).comments).toEqual([])
        expect(made.host.messages.at(-1)).toEqual(ALREADY)
        expect(await readdir(sendingDir())).toEqual([])
    })

    test('a comment added or edited after it stays saved, and the next send posts it', async () => {
        const made = await openSendApp(repo, { author: 'hubot' })
        await made.lineDraft(10, 10, 'Name this')
        await made.prDraft('Looks right')
        made.github.failNext({
            step: 'submit_review',
            error: BAD_GATEWAY,
            taken: true,
        })
        await made.send('Just comments')
        const pr_draft = (await readSaved(repo)).comments[1]
        await made.app.draftEdited({
            draft_id: pr_draft?.id ?? '',
            body: 'Looks right, after all',
        })
        await made.fileDraft('Split this file')

        await made.send('Just comments')

        expect(made.submitted()).toHaveLength(1)
        expect(
            (await readSaved(repo)).comments.map(({ body }) => body)
        ).toEqual(['Looks right, after all', 'Split this file'])

        await made.send('Just comments')

        expect(made.submitted()).toHaveLength(2)
        expect(made.submitted()[1]?.body).toBe('Looks right, after all')
        expect((await readSaved(repo)).comments).toEqual([])
    })
})

describe("the app's own pending review in a repo that is not yours (#766)", () => {
    test('a pending review the send in progress names is deleted, not taken for one started on GitHub, and one review is sent', async () => {
        const made = await openSendApp(repo, {
            author: 'hubot',
            reviews: [pendingReview('')],
        })
        await made.prDraft('Looks right')
        await mkdir(sendingDir(), { recursive: true })
        await writeFile(
            join(sendingDir(), 'pr-12.json'),
            JSON.stringify({
                schema_version: 1,
                review_id: 77,
                commit: repo.head_sha,
                sent_drafts: ['0123456789abcdef'],
            })
        )

        await made.send('Just comments')

        expect(made.reviews_now().map(({ id }) => id)).not.toContain(77)
        expect(made.submitted()).toHaveLength(1)
        expect((await readSaved(repo)).comments).toEqual([])
    })

    test('a send in progress whose review is gone is ignored, and the review is sent', async () => {
        const made = await openSendApp(repo, { author: 'hubot' })
        await made.prDraft('Looks right')
        const [draft] = (await readSaved(repo)).comments
        await mkdir(sendingDir(), { recursive: true })
        await writeFile(
            join(sendingDir(), 'pr-12.json'),
            JSON.stringify({
                schema_version: 1,
                review_id: 404,
                commit: repo.head_sha,
                sent_drafts:
                    draft === undefined
                        ? []
                        : [draftFingerprint({ comment: draft })],
            })
        )

        await made.send('Just comments')

        expect(made.submitted()).toHaveLength(1)
        expect(made.host.messages.at(-1)).toEqual({
            kind: 'info',
            text: 'Review sent to #12.',
        })
    })
})

describe('a send stopped between making the pending review and keeping its id (#766)', () => {
    test('after a crash there, the pending review left on GitHub stops the next send: nothing is posted twice', async () => {
        // What a crash right after GitHub made the pending review leaves:
        // the review, with no record line, and no send in progress.
        const made = await openSendApp(repo, {
            author: 'hubot',
            reviews: [pendingReview('')],
        })
        await made.prDraft('Looks right')

        await made.send('Just comments')

        expect(made.reviews_now()).toEqual([pendingReview('')])
        expect((await readSaved(repo)).comments).toHaveLength(1)
        expect(made.host.messages.at(-1)).toEqual({
            kind: 'error',
            text: 'You have a review on #12 that you started on GitHub and did not send. Send or delete it on GitHub, then try again.',
        })
    })

    test('when the send in progress cannot be written, the pending review is deleted and nothing is submitted', async () => {
        const made = await openSendApp(repo, { author: 'hubot' })
        await made.prDraft('Looks right')
        await mkdir(join(repo.walk_dir, 'sending/acme'), { recursive: true })
        await writeFile(sendingDir(), 'a file where the folder should be')

        await made.send('Just comments')

        expect(made.reviews_now()).toEqual([])
        expect((await readSaved(repo)).comments).toHaveLength(1)
        expect(made.host.messages.at(-1)?.kind).toBe('error')
    })
})
