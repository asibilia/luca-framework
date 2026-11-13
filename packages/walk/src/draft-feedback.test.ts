import {
    mkdtemp,
    readdir,
    readFile,
    realpath,
    rm,
    writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { DraftsSchema, type Drafts } from './drafts-file'
import { createFakeHost } from './testing/fake-host'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { commitSymlink, makeCheckoutRepo, storyOf } from './testing/walk-story'
import { createWalkApp } from './walk-app'

import { savePrivateStory } from '../../engine/src/story/story-store'

/**
 * Feedback kept until it is sent (#760, spec #752 section 10): drafts on
 * lines, files and the pull request, "looks good" marks, all saved at once.
 */

const REPO = 'octocat/hello-world'
const A_TEXT = 'line 1\nline 2\nconst a = 1\nconst b = 2\nline 5\n'
const FENCE = '```'

let dir = ''
let walk_dir = ''
let checkout = ''
let base_sha = ''
let head_sha = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-draft-')))
    walk_dir = join(dir, 'walk')
    checkout = join(walk_dir, 'checkouts', 'octocat', 'hello-world', 'pr-12')
    const made = await makeCheckoutRepo({
        folder: checkout,
        base: { 'src/a.ts': 'old\n', 'src/b.ts': 'old b\n' },
        head: { 'src/a.ts': A_TEXT, 'src/b.ts': 'new b\n' },
    })
    base_sha = made.base_sha
    head_sha = made.head_sha
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const aUri = () => pathToFileURL(join(checkout, 'src/a.ts')).href
const baseUri = () => `luca-walk-base:/src/a.ts?sha=${base_sha}`
const draftsFile = () => join(walk_dir, 'drafts/octocat/hello-world/pr-12.json')

/** The drafts file, parsed with its own schema, so a drifted shape fails. */
const readSaved = async (): Promise<Drafts> =>
    DraftsSchema.parse(JSON.parse(await readFile(draftsFile(), 'utf8')))

/** A new app on the checkout of #12, activated. */
const openApp = async () => {
    await savePrivateStory({
        stories_dir: join(dir, 'stories'),
        story: storyOf({
            repo: REPO,
            base_sha,
            head_sha,
            stops: [
                {
                    id: 's1',
                    title: 'The a file',
                    changes: [{ id: 'c1', path: 'src/a.ts', line: 3 }],
                },
                {
                    id: 's2',
                    title: 'The b file',
                    changes: [{ id: 'c2', path: 'src/b.ts', line: 1 }],
                },
            ],
        }),
    })
    const github = createPretendGitHub({
        login: 'octocat',
        pulls: [
            {
                repo: REPO,
                number: 12,
                title: 'Retry stuck tickets',
                author: 'octocat',
                base_ref: 'main',
                head_sha,
                state: 'OPEN',
                labels: [],
                comments: [],
            },
        ],
    })
    const host = createFakeHost({ workspace_folder: checkout })
    const app = createWalkApp({
        host,
        gh: github.gh,
        git: testGit,
        walk_dir,
        stories_dir: join(dir, 'stories'),
        remote_url: () => join(dir, 'no-origin'),
    })
    await app.activated()
    const run = (command: string) => app.run({ command, args: [] })
    return { app, host, run }
}

describe('feedback kept until it is sent (#760)', () => {
    test('a draft on lines 10 to 12 of a file shows as a Draft thread', async () => {
        const { app, host } = await openApp()

        await app.draftCommentAdded({
            uri: aUri(),
            start_line: 10,
            end_line: 12,
            body: 'Rename this',
        })

        expect(host.threads).toHaveLength(1)
        expect(host.threads[0]).toMatchObject({
            uri: aUri(),
            start_line: 10,
            end_line: 12,
            label: 'Draft',
            read_only: false,
        })
        expect(host.threads[0]?.comments.map(({ body }) => body)).toEqual([
            'Rename this',
        ])
    })

    test('that draft is saved on the head side with its lines', async () => {
        const { app } = await openApp()

        await app.draftCommentAdded({
            uri: aUri(),
            start_line: 10,
            end_line: 12,
            body: 'Rename this',
        })

        const saved = await readSaved()
        expect(saved.comments).toHaveLength(1)
        expect(saved.comments[0]).toMatchObject({
            kind: 'line',
            path: 'src/a.ts',
            side: 'head',
            start_line: 10,
            end_line: 12,
            body: 'Rename this',
        })
    })

    test('a draft on a base document is saved on the base side', async () => {
        const { app } = await openApp()

        await app.draftCommentAdded({
            uri: baseUri(),
            start_line: 7,
            end_line: 7,
            body: 'Why was this here?',
        })

        const saved = await readSaved()
        expect(saved.comments[0]).toMatchObject({
            path: 'src/a.ts',
            side: 'base',
            start_line: 7,
        })
    })

    test('Suggest a change starts a draft holding the selected lines as a suggestion', async () => {
        const { host, run } = await openApp()
        host.active_editor = { uri: aUri(), start_line: 3, end_line: 4 }

        await run('lucaWalk.suggestChange')

        const body = `${FENCE}suggestion\nconst a = 1\nconst b = 2\n${FENCE}`
        const started = host.threads.flatMap(({ comments }) =>
            comments.map((comment) => comment.body)
        )
        expect(started).toEqual([body])
    })

    test("Suggest a change on a symlink that leads out of the checkout never copies the linked file's lines", async () => {
        const token = 'gho_not_a_real_token'
        const outside = join(dir, 'hosts.yml')
        await writeFile(outside, `github.com:\n    oauth_token: ${token}\n`)
        head_sha = await commitSymlink({
            folder: checkout,
            path: 'fixtures/hosts.yml',
            target: outside,
        })
        const link = join(checkout, 'fixtures/hosts.yml')
        expect(await readFile(link, 'utf8')).toContain(token)
        const { host, run } = await openApp()
        host.active_editor = {
            uri: pathToFileURL(link).href,
            start_line: 1,
            end_line: 2,
        }

        await run('lucaWalk.suggestChange')

        const started = host.threads.flatMap(({ comments }) =>
            comments.map((comment) => comment.body)
        )
        expect(started).toHaveLength(1)
        expect(started[0]).not.toContain(token)
        expect(JSON.stringify(await readSaved())).not.toContain(token)
    })

    test('Suggest a change on a base document starts no draft and shows an error', async () => {
        const { host, run } = await openApp()
        host.active_editor = { uri: baseUri(), start_line: 1, end_line: 1 }

        await run('lucaWalk.suggestChange')

        expect(host.messages).toContainEqual({
            kind: 'error',
            text: 'Suggestions go on the new side of the diff.',
        })
        expect(host.threads).toEqual([])
    })

    test('Comment on this file asks for the file and keeps a file comment', async () => {
        const { host, run } = await openApp()
        host.active_editor = { uri: aUri(), start_line: 1, end_line: 1 }
        host.answers.push('Split this file')

        await run('lucaWalk.commentOnFile')

        expect(host.prompts).toContain('Comment on src/a.ts')
        const saved = await readSaved()
        expect(saved.comments).toHaveLength(1)
        expect(saved.comments[0]).toMatchObject({
            kind: 'file',
            path: 'src/a.ts',
            side: null,
            start_line: null,
            end_line: null,
            body: 'Split this file',
        })
    })

    test('Comment on the pull request asks for #12 and keeps a pull request comment', async () => {
        const { host, run } = await openApp()
        host.answers.push('Good direction')

        await run('lucaWalk.commentOnPullRequest')

        expect(host.prompts).toContain('Comment on #12')
        const saved = await readSaved()
        expect(saved.comments).toHaveLength(1)
        expect(saved.comments[0]).toMatchObject({
            kind: 'pull_request',
            path: null,
            side: null,
            body: 'Good direction',
        })
    })

    test('cancelling the file and pull request prompts keeps nothing', async () => {
        const { host, run } = await openApp()
        host.active_editor = { uri: aUri(), start_line: 1, end_line: 1 }
        host.answers.push(null, null)

        await run('lucaWalk.commentOnFile')
        await run('lucaWalk.commentOnPullRequest')

        expect(host.prompts).toContain('Comment on src/a.ts')
        expect(host.prompts).toContain('Comment on #12')
        const saved = await readSaved().catch(() => null)
        expect(saved?.comments ?? []).toEqual([])
        expect(host.threads).toEqual([])
    })

    test('This file looks good marks the file and its stop, and running it again clears both', async () => {
        const { host, run } = await openApp()
        await run('lucaWalk.startWalk')
        host.active_editor = { uri: aUri(), start_line: 1, end_line: 1 }

        await run('lucaWalk.toggleLooksGood')

        expect((await readSaved()).approved_files).toEqual(['src/a.ts'])
        expect(host.stops[0]?.description.endsWith(' · looks good')).toBe(true)

        await run('lucaWalk.toggleLooksGood')

        expect((await readSaved()).approved_files).toEqual([])
        expect(host.stops[0]?.description.endsWith('looks good')).toBe(false)
    })

    test('editing a draft saves the new body and deleting it removes it', async () => {
        const { app, host } = await openApp()
        await app.draftCommentAdded({
            uri: aUri(),
            start_line: 10,
            end_line: 12,
            body: 'Rename this',
        })
        const draft_id = (await readSaved()).comments[0]?.id ?? ''

        await app.draftEdited({ draft_id, body: 'Rename this to retryCount' })

        expect((await readSaved()).comments[0]?.body).toBe(
            'Rename this to retryCount'
        )

        await app.draftDeleted({ draft_id })

        expect((await readSaved()).comments).toEqual([])
        expect(host.threads).toEqual([])
    })

    test('a new app on the same folder shows the same drafts and approved files', async () => {
        const first = await openApp()
        await first.run('lucaWalk.startWalk')
        await first.app.draftCommentAdded({
            uri: aUri(),
            start_line: 10,
            end_line: 12,
            body: 'Rename this',
        })
        first.host.active_editor = { uri: aUri(), start_line: 1, end_line: 1 }
        await first.run('lucaWalk.toggleLooksGood')

        const second = await openApp()
        await second.run('lucaWalk.startWalk')

        expect(second.host.threads).toHaveLength(1)
        expect(second.host.threads[0]).toMatchObject({
            uri: aUri(),
            start_line: 10,
            end_line: 12,
            label: 'Draft',
        })
        expect(second.host.threads[0]?.comments[0]?.body).toBe('Rename this')
        expect(
            second.host.stops[0]?.description.endsWith(' · looks good')
        ).toBe(true)
    })

    test('a drafts file that cannot be read is moved aside, never written over, and the owner is told where', async () => {
        const first = await openApp()
        await first.app.draftCommentAdded({
            uri: aUri(),
            start_line: 3,
            end_line: 3,
            body: 'Keep me',
        })
        const broken = (await readFile(draftsFile(), 'utf8')).slice(0, -20)
        await writeFile(draftsFile(), broken)

        const second = await openApp()
        await second.app.draftCommentAdded({
            uri: aUri(),
            start_line: 4,
            end_line: 4,
            body: 'A new one',
        })

        const folder = join(walk_dir, 'drafts/octocat/hello-world')
        const aside = (await readdir(folder)).filter((name) =>
            /^pr-12\.corrupt-.+\.json$/.test(name)
        )
        expect(aside).toHaveLength(1)
        const moved = join(folder, aside[0] ?? '')
        expect(await readFile(moved, 'utf8')).toBe(broken)
        expect(second.host.messages).toContainEqual({
            kind: 'error',
            text: `The drafts file of #12 could not be read, so it was moved to ${moved}. Luca Walk started a new one.`,
        })
        expect((await readSaved()).comments.map(({ body }) => body)).toEqual([
            'A new one',
        ])
    })
})
