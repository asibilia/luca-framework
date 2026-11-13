import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { reviewRecordLine } from './review-record'
import { htmlButtons, htmlText } from './testing/html-text'
import type { PretendReview } from './testing/pretend-github'
import {
    makeSendRepo,
    openSendApp,
    type SendRepo,
} from './testing/send-review-setup'

/**
 * Opening a pull request in a repo that isn't yours (#766): the badge
 * that says so, a command to copy instead of `Write the story`, and the
 * review record kept on this computer. Signed in as `octocat`.
 */

const NOT_YOURS = 'acme/site'
const URL = 'https://github.com/acme/site/pull/12'
const COPY = 'Copy the command'

let repo: SendRepo | null = null

afterEach(async () => {
    if (repo !== null) await rm(repo.dir, { recursive: true, force: true })
    repo = null
})

const makeRepo = async (repo_name: string): Promise<SendRepo> => {
    const made = await makeSendRepo({ repo_name })
    repo = made
    return made
}

/** The command Luca Walk shows for writing the story of `made_repo`'s #12. */
const commandFor = (made_repo: SendRepo) =>
    `cd "$(mktemp -d)" && claude '/luca-pr-prep ${URL} --private Read the code with git -C ${made_repo.checkout}, which holds the commits of this pull request.'`

describe('the Not your repo badge (#766)', () => {
    test('a pull request in an organization repo shows the badge, saying what is different', async () => {
        const made = await openSendApp(await makeRepo(NOT_YOURS), {
            author: 'octocat',
        })

        expect(made.host.badge?.text).toBe('Not your repo')
        expect(made.host.badge?.tooltip).toBe(
            'acme/site is not your own repo, so Luca Walk changes no labels, keeps its review record on this computer only, and shows a command to copy instead of Write the story.'
        )
    })

    test("someone else's pull request in your own repo shows no badge", async () => {
        const made = await openSendApp(await makeRepo('octocat/hello-world'), {
            author: 'hubot',
        })

        expect(made.host.badge).toBeNull()
    })

    test('when gh cannot say who is signed in, your own repo counts as not yours', async () => {
        const made_repo = await makeRepo('octocat/hello-world')
        const made = await openSendApp(made_repo, {
            user_unreadable: true,
            story: null,
        })

        expect(made.host.badge?.tooltip).toBe(
            'Luca Walk could not read who is signed in to GitHub, so octocat/hello-world counts as not your own repo: Luca Walk changes no labels, keeps its review record on this computer only, and shows a command to copy instead of Write the story.'
        )
        expect(htmlButtons({ html: made.summary() })).toContain(COPY)
    })
})

describe('writing the story in a repo that is not yours (#766)', () => {
    test('the Summary panel shows the command and a Copy button instead of Write the story', async () => {
        const made_repo = await makeRepo(NOT_YOURS)
        const made = await openSendApp(made_repo, { story: null })

        const buttons = htmlButtons({ html: made.summary() })
        expect(buttons).toContain(COPY)
        expect(buttons).not.toContain('Write the story')
        expect(htmlText({ html: made.summary() })).toContain(
            commandFor(made_repo)
        )
    })

    test('Copy and the Write the story command copy it, start no terminal, and offer Reload', async () => {
        const made_repo = await makeRepo(NOT_YOURS)
        const made = await openSendApp(made_repo, { story: null })

        await made.press('copy_story_command')
        await made.run('lucaWalk.writeStory')

        expect(made.host.terminals).toEqual([])
        expect(made.host.clipboard).toBe(commandFor(made_repo))
        expect(made.host.messages.at(-1)).toEqual({
            kind: 'info',
            text: 'Copied the command that writes the story of #12. Run it in a terminal, then press Reload the story.',
        })
        expect(htmlButtons({ html: made.summary() })).toContain(
            'Reload the story'
        )
    })
})

describe('the review record in a repo that is not yours (#766)', () => {
    const recordReview = (commit: string): PretendReview => ({
        id: 51,
        node_id: 'PRR_51',
        author: 'octocat',
        state: 'COMMENTED',
        event: 'COMMENT',
        body: `Old review\n${reviewRecordLine({
            record: { schema_version: 1, commit, approved_files: [] },
        })}`,
        commit_id: commit,
        submitted_at: '2026-11-10T12:00:00Z',
        comments: [],
        file_threads: [],
    })

    test('the local record wins over an old record line on GitHub', async () => {
        const made_repo = await makeRepo(NOT_YOURS)
        const folder = join(made_repo.walk_dir, 'reviewed/acme/site')
        await mkdir(folder, { recursive: true })
        await writeFile(
            join(folder, 'pr-12.json'),
            JSON.stringify({
                schema_version: 1,
                commit: made_repo.head_sha,
                approved_files: [],
            })
        )
        const made = await openSendApp(made_repo, {
            reviews: [recordReview(made_repo.base_sha)],
        })

        expect(htmlText({ html: made.summary() })).toContain(
            `Nothing changed since your last review at ${made_repo.head_sha.slice(0, 7)}.`
        )
    })

    test("with no local record, an old record line in the signed-in user's own review is still read", async () => {
        const made_repo = await makeRepo(NOT_YOURS)
        const made = await openSendApp(made_repo, {
            reviews: [recordReview(made_repo.base_sha)],
        })

        expect(htmlText({ html: made.summary() })).toContain(
            `Since your last review at ${made_repo.base_sha.slice(0, 7)}, 1 file changed.`
        )
    })
})
