import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { REVIEW_RECORD_MARKER } from './review-record'
import {
    makeSendRepo,
    openSendApp,
    readSaved,
    SIGNED_OFF,
    type SendRepo,
} from './testing/send-review-setup'

/**
 * Sending on a repo or a pull request that isn't yours (#766): in a repo
 * that isn't the signed-in user's own (an organization's, `acme/site`),
 * no label is touched and no record line is posted; on someone else's
 * pull request, `Just comments` comes first and a real GitHub verdict is
 * confirmed. The setup is signed in as `octocat`.
 */

const NOT_YOURS = 'acme/site'

/** A gh call that reads or changes labels. */
const LABEL_CALL = /^label |--add-label|--remove-label|\/labels\b/

let repo: SendRepo | null = null

afterEach(async () => {
    if (repo !== null) await rm(repo.dir, { recursive: true, force: true })
    repo = null
})

/** A send app on #12 of `repo_name`, opened by `author`. */
const openOn = async ({
    repo_name,
    author,
}: {
    repo_name: string
    author: string
}) => {
    repo = await makeSendRepo({ repo_name })
    const made = await openSendApp(repo, { author })
    return { made, made_repo: repo }
}

const pickedLabels = (made: { host: { picks: { label: string }[][] } }) =>
    made.host.picks.at(-1)?.map(({ label }) => label)

const labelCalls = (made: { github: { state: { calls: string[] } } }) =>
    made.github.state.calls.filter((call) => LABEL_CALL.test(call))

const localRecord = async (made_repo: SendRepo) =>
    JSON.parse(
        await readFile(
            join(
                made_repo.walk_dir,
                'reviewed',
                made_repo.repo_name,
                'pr-12.json'
            ),
            'utf8'
        )
    )

describe('the four combinations (#766)', () => {
    test('own pull request in your repo: Signed off first, no question, COMMENT, the label and the record line, as before', async () => {
        const { made } = await openOn({
            repo_name: 'octocat/hello-world',
            author: 'octocat',
        })
        await made.prDraft('Looks right')

        await made.send('Signed off')

        expect(pickedLabels(made)).toEqual([
            'Signed off',
            'Changes wanted',
            'Just comments',
        ])
        expect(made.host.confirms).toEqual([])
        expect(made.submitted()[0]?.event).toBe('COMMENT')
        expect(made.submitted()[0]?.body).toContain(REVIEW_RECORD_MARKER)
        expect(made.labels_now()).toEqual([SIGNED_OFF])
        expect(made.host.badge).toBeNull()
    })

    test('own pull request in a repo that is not yours: a plain COMMENT, no label touched, no record line, the record kept on this computer', async () => {
        const { made, made_repo } = await openOn({
            repo_name: NOT_YOURS,
            author: 'octocat',
        })
        await made.approveA()
        await made.prDraft('Looks right')

        await made.send('Changes wanted')

        expect(made.host.confirms).toEqual([])
        expect(made.submitted()).toHaveLength(1)
        expect(made.submitted()[0]?.event).toBe('COMMENT')
        expect(made.submitted()[0]?.body).toBe('Looks right')
        expect(labelCalls(made)).toEqual([])
        expect(made.labels_now()).toEqual([])
        expect(await localRecord(made_repo)).toEqual({
            schema_version: 1,
            commit: made_repo.head_sha,
            approved_files: ['src/a.ts'],
        })
    })

    test("someone else's pull request in your repo: Just comments first, and Signed off asks before it approves", async () => {
        const { made } = await openOn({
            repo_name: 'octocat/hello-world',
            author: 'hubot',
        })
        await made.prDraft('Looks right')

        await made.send('Signed off', 'Approve')

        expect(pickedLabels(made)).toEqual([
            'Just comments',
            'Signed off',
            'Changes wanted',
        ])
        expect(made.host.confirms).toEqual([
            'Approve #12 in octocat/hello-world on GitHub?',
        ])
        expect(made.submitted()[0]?.event).toBe('APPROVE')
        expect(made.submitted()[0]?.body).toContain(REVIEW_RECORD_MARKER)
        expect(labelCalls(made)).toEqual([])
    })

    test("someone else's pull request in a repo that is not yours: Just comments first, Changes wanted asks, and no label or record line", async () => {
        const { made, made_repo } = await openOn({
            repo_name: NOT_YOURS,
            author: 'hubot',
        })
        await made.lineDraft(10, 10, 'Name this')

        await made.send('Changes wanted', 'Request changes')

        expect(pickedLabels(made)).toEqual([
            'Just comments',
            'Signed off',
            'Changes wanted',
        ])
        expect(made.host.confirms).toEqual([
            'Request changes on #12 in acme/site on GitHub?',
        ])
        expect(made.submitted()[0]?.event).toBe('REQUEST_CHANGES')
        expect(made.submitted()[0]?.body).not.toContain(REVIEW_RECORD_MARKER)
        expect(made.submitted()[0]?.comments).toHaveLength(1)
        expect(labelCalls(made)).toEqual([])
        expect((await localRecord(made_repo)).commit).toBe(made_repo.head_sha)
    })
})

describe("confirming a verdict on someone else's pull request (#766)", () => {
    test('cancelling the question sends nothing and keeps every draft', async () => {
        const { made, made_repo } = await openOn({
            repo_name: 'octocat/hello-world',
            author: 'hubot',
        })
        await made.lineDraft(10, 10, 'Name this')

        await made.send('Signed off', null)

        expect(made.reviews_now()).toEqual([])
        expect((await readSaved(made_repo)).comments).toHaveLength(1)
    })

    test('Just comments is sent without a question', async () => {
        const { made } = await openOn({ repo_name: NOT_YOURS, author: 'hubot' })
        await made.prDraft('Looks right')

        await made.send('Just comments')

        expect(made.host.confirms).toEqual([])
        expect(made.submitted()[0]?.event).toBe('COMMENT')
    })
})

describe('a verdict with nothing to post in a repo that is not yours (#766)', () => {
    test('Signed off on your own pull request with no comments sends nothing and changes no label', async () => {
        const { made } = await openOn({
            repo_name: NOT_YOURS,
            author: 'octocat',
        })

        await made.send('Signed off')

        expect(made.reviews_now()).toEqual([])
        expect(labelCalls(made)).toEqual([])
        expect(made.host.messages.at(-1)).toEqual({
            kind: 'info',
            text: 'There is nothing to send: you have no comments on #12.',
        })
    })
})
