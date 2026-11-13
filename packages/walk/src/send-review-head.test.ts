import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    makeSendRepo,
    openSendApp,
    readSaved,
    type SendRepo,
} from './testing/send-review-setup'
import { testGit } from './testing/test-git'

/**
 * Sending against the right commit (#752, sections 11 and 12): a review
 * never goes out on a head GitHub has moved past, and a line comment
 * written at an older head is never posted at line numbers that may have
 * moved. Every draft is kept.
 */

let repo: SendRepo

beforeEach(async () => {
    repo = await makeSendRepo()
})

afterEach(async () => {
    await rm(repo.dir, { recursive: true, force: true })
})

/** Commits a change to `src/elsewhere.ts` in the checkout; answers the new head. */
const commitOnTop = async (): Promise<string> => {
    const cwd = repo.checkout
    await writeFile(join(cwd, 'src/elsewhere.ts'), 'one\ntwo\nfour\n')
    await testGit({ args: ['commit', '-q', '-am', 'more'], cwd })
    return (await testGit({ args: ['rev-parse', 'HEAD'], cwd })).stdout.trim()
}

describe('sending against the right commit (#752)', () => {
    test('a head that moved on GitHub since loading stops the send and keeps every draft', async () => {
        const made = await openSendApp(repo)
        await made.lineDraft(10, 10, 'Name this')
        made.github.pull({ repo: 'octocat/hello-world', number: 12 }).head_sha =
            'd'.repeat(40)

        await made.send('Signed off')

        expect(made.reviews_now()).toEqual([])
        expect(made.labels_now()).toEqual([])
        expect((await readSaved(repo)).comments).toHaveLength(1)
        expect(made.host.messages.at(-1)).toEqual({
            kind: 'error',
            text: '#12 has new commits on GitHub since you opened it. Reload the pull request, check your comments, then send again. Your comments are still saved.',
        })
    })

    test('a line comment written at an older head is not sent until it is checked again', async () => {
        const first = await openSendApp(repo)
        await first.lineDraft(10, 10, 'Name this')
        await first.prDraft('Looks right')
        expect((await readSaved(repo)).comments[0]?.commit).toBe(repo.head_sha)
        repo.head_sha = await commitOnTop()
        const made = await openSendApp(repo)

        await made.send('Just comments')

        expect(made.reviews_now()).toEqual([])
        expect((await readSaved(repo)).comments).toHaveLength(2)
        expect(made.host.messages.at(-1)).toEqual({
            kind: 'error',
            text: '#12 has new commits since you wrote 1 of your comments, so its lines may have moved. Check it where it is shown now and edit or delete it, then send again. Your comments are still saved.',
        })

        const line = (await readSaved(repo)).comments[0]
        await made.app.draftEdited({
            draft_id: line?.id ?? '',
            body: 'Name it',
        })
        await made.send('Just comments')

        expect(made.submitted()).toHaveLength(1)
        expect(made.submitted()[0]?.commit_id).toBe(repo.head_sha)
        expect((await readSaved(repo)).comments).toEqual([])
    })
})
