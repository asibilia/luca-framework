import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFakeHost } from './testing/fake-host'
import { htmlText } from './testing/html-text'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { makeCheckoutRepo, storyOf } from './testing/walk-story'
import { createWalkApp } from './walk-app'

import {
    privateStoryPath,
    savePrivateStory,
} from '../../engine/src/story/story-store'

/**
 * Browsing a pull request without a story as a plain diff (#759, spec #752
 * section 9): one stop per changed file, from `git diff --name-status -M`
 * between the merge base of `origin/main` and the head.
 */

const REPO = 'octocat/hello-world'
const lines = (count: number, tag: string) =>
    Array.from({ length: count }, (_, at) => `${tag} ${at + 1}\n`)

const BASE_README = lines(12, 'readme').join('')
const HEAD_README = lines(12, 'readme')
    .map((line, at) => (at === 6 ? 'readme seven changed\n' : line))
    .join('')

const BASE_FILES = {
    'README.md': BASE_README,
    'src/c.ts': 'deleted file\n',
    'src/kept.ts': 'kept\n',
}
const HEAD_FILES = {
    'README.md': HEAD_README,
    'src/a.ts': 'added file\n',
    'src/kept.ts': 'kept\n',
}

let dir = ''
let walk_dir = ''
let checkout = ''
let base_sha = ''
let head_sha = ''
let main_tip = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-browse-')))
    walk_dir = join(dir, 'walk')
    checkout = join(walk_dir, 'checkouts', 'octocat', 'hello-world', 'pr-12')
    const made = await makeCheckoutRepo({
        folder: checkout,
        base: BASE_FILES,
        head: HEAD_FILES,
    })
    base_sha = made.base_sha
    head_sha = made.head_sha
    // origin/main moved on past the merge base, so the two differ.
    await testGit({
        args: ['checkout', '-q', '-b', 'side', base_sha],
        cwd: checkout,
    })
    await writeFile(join(checkout, 'moved-on.txt'), 'main moved on\n')
    await testGit({ args: ['add', '-A'], cwd: checkout })
    await testGit({
        args: ['commit', '-q', '-m', 'main moved on'],
        cwd: checkout,
    })
    main_tip = (
        await testGit({ args: ['rev-parse', 'HEAD'], cwd: checkout })
    ).stdout.trim()
    await testGit({
        args: ['update-ref', 'refs/remotes/origin/main', main_tip],
        cwd: checkout,
    })
    await testGit({
        args: ['checkout', '-q', '--detach', head_sha],
        cwd: checkout,
    })
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** An app on the checkout of #12, activated, with no story unless given. */
const openBrowse = async ({
    story_head,
    version_two = false,
}: { story_head?: string; version_two?: boolean } = {}) => {
    const stories_dir = join(dir, 'stories')
    if (story_head !== undefined) {
        const kept = storyOf({
            repo: REPO,
            base_sha,
            head_sha: story_head,
            stops: [
                {
                    id: 's1',
                    title: 'One',
                    changes: [{ id: 'c1', path: 'src/kept.ts', line: 1 }],
                },
            ],
        })
        if (version_two) {
            const path = privateStoryPath({
                stories_dir,
                repo: REPO,
                pr_number: 12,
            })
            await mkdir(join(path, '..'), { recursive: true })
            await writeFile(
                path,
                JSON.stringify({ ...kept, schema_version: 2 })
            )
        } else {
            await savePrivateStory({ stories_dir, story: kept })
        }
    }
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
        stories_dir,
        remote_url: () => join(dir, 'no-origin'),
    })
    await app.activated()
    const browse = () =>
        app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'browse_diff' },
        })
    const pick = (at: number) =>
        app.stopPicked({ stop_id: host.stops[at]?.stop_id ?? '' })
    return { app, host, browse, pick }
}

describe('browsing a pull request without a story (#759)', () => {
    test('Browse the diff makes one stop per changed file, in path order', async () => {
        const { host, browse } = await openBrowse()

        await browse()

        expect(host.stops.map(({ label }) => label)).toEqual([
            '1. README.md',
            '2. src/a.ts',
            '3. src/c.ts',
        ])
    })

    test("a modified file's stop opens at the file's first diff hunk on the head side", async () => {
        const { host, browse, pick } = await openBrowse()
        await browse()

        await pick(0)

        expect(host.diffs.at(-1)?.title).toBe('README.md (#12)')
        expect(host.diffs.at(-1)?.reveal_line).toBe(7)
        expect(host.diffs.at(-1)?.reveal_side).toBe('head')
    })

    test("a deleted file's stop has the empty document as its head side", async () => {
        const { host, browse, pick } = await openBrowse()
        await browse()

        await pick(2)

        expect(host.diffs.at(-1)?.head_uri).toBe(
            'luca-walk-base:/src/c.ts?sha=empty'
        )
    })

    test("every diff's base side is at the merge base of origin/main and the head", async () => {
        const { host, browse, pick } = await openBrowse()
        await browse()

        await pick(0)
        await pick(1)
        await pick(2)

        expect(main_tip).not.toBe(base_sha)
        expect(host.diffs.length).toBeGreaterThanOrEqual(3)
        for (const { base_uri } of host.diffs) {
            expect(base_uri).toContain(`sha=${base_sha}`)
        }
    })

    test('the Context view says there is no story', async () => {
        const { host, browse, pick } = await openBrowse()
        await browse()

        await pick(0)

        expect(htmlText({ html: host.context_html })).toContain(
            'No story: this is the plain diff. Use "Write the story" for a guided walk.'
        )
    })

    test('Next stop goes from stop 1 to stop 2', async () => {
        const { app, host, browse, pick } = await openBrowse()
        await browse()
        await pick(0)

        await app.run({ command: 'lucaWalk.nextStop', args: [] })

        expect(host.diffs.at(-1)?.title).toBe('src/a.ts (#12)')
        expect(host.stops.map(({ description }) => description)).toEqual([
            'done',
            'current',
            '',
        ])
    })

    test('Browse the diff works for a stale story and for a story of schema version 2', async () => {
        const stale = await openBrowse({ story_head: 'a'.repeat(40) })
        await stale.browse()
        const newer = await openBrowse({
            story_head: head_sha,
            version_two: true,
        })
        await newer.browse()

        const labels = ['1. README.md', '2. src/a.ts', '3. src/c.ts']
        expect(stale.host.stops.map(({ label }) => label)).toEqual(labels)
        expect(newer.host.stops.map(({ label }) => label)).toEqual(labels)
    })
})
