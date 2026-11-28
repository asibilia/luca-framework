import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { loadPullRequest } from './load-pull-request'
import { createFakeHost } from './testing/fake-host'
import { htmlText } from './testing/html-text'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { makeCheckoutRepo, storyOf, type StopAt } from './testing/walk-story'
import { createWalkApp } from './walk-app'
import type { WalkGit } from './walk-host'
import { checkoutFileUri } from './walk-uris'

import {
    privateStoryPath,
    savePrivateStory,
} from '../../engine/src/story/story-store'

/**
 * Live Map redraws and git numstat line counts (#800, spec #776 section 4).
 */

const REPO = 'octocat/hello-world'

const STOPS: StopAt[] = [
    {
        id: 's1',
        title: 'First stop',
        changes: [{ id: 'c1', path: 'src/a.ts', line: 1 }],
    },
    {
        id: 's2',
        title: 'Second stop',
        changes: [{ id: 'c2', path: 'src/b.ts', line: 1 }],
    },
]

let dir = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-map-redraw-')))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const setUpApp = async ({
    with_origin = false,
}: {
    with_origin?: boolean
} = {}) => {
    const walk_dir = join(dir, 'walk')
    const stories_dir = join(dir, 'stories')
    const checkout = join(
        walk_dir,
        'checkouts',
        'octocat',
        'hello-world',
        'pr-12'
    )
    const { base_sha, head_sha } = await makeCheckoutRepo({
        folder: checkout,
        base: { 'src/a.ts': 'a\n', 'src/b.ts': 'b\n' },
        head: { 'src/a.ts': 'a1\na2\n', 'src/b.ts': 'b1\nb2\n' },
    })
    let remote = join(dir, 'no-origin')
    if (with_origin) {
        await testGit({ args: ['branch', '-M', 'main'], cwd: checkout })
        await testGit({
            args: ['update-ref', 'refs/pull/12/head', 'HEAD'],
            cwd: checkout,
        })
        remote = checkout
    }
    const built = storyOf({
        repo: REPO,
        base_sha,
        head_sha,
        stops: STOPS,
    })
    await savePrivateStory({ stories_dir, story: built })
    const github = createPretendGitHub({
        login: 'octocat',
        pulls: [
            {
                repo: REPO,
                number: 12,
                title: 'Redraw the map',
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
        remote_url: () => remote,
    })
    await app.activated()
    return {
        app,
        host,
        checkout,
        stories_dir,
        walk_dir,
        github,
        base_sha,
        head_sha,
    }
}

describe('the flow map redraws and line counts (#800)', () => {
    test('with the map open, Next, This stop looks good, and adding a draft each refresh map once without calling showPanel', async () => {
        const { app, host, checkout } = await setUpApp()
        await app.run({ command: 'lucaWalk.showMap', args: [] })
        await app.run({ command: 'lucaWalk.startWalk', args: [] })
        host.refreshed.length = 0

        let show_panel_calls = 0
        const originalShowPanel = host.showPanel
        host.showPanel = async (panel) => {
            show_panel_calls += 1
            await originalShowPanel(panel)
        }

        await app.run({ command: 'lucaWalk.nextStop', args: [] })
        expect(host.refreshed).toHaveLength(1)
        expect(host.refreshed[0]?.id).toBe('map')

        await app.run({ command: 'lucaWalk.markStopLooksGood', args: [] })
        expect(host.refreshed).toHaveLength(2)
        expect(host.refreshed[1]?.id).toBe('map')

        await app.draftCommentAdded({
            uri: checkoutFileUri({ checkout, path: 'src/a.ts' }),
            start_line: 1,
            end_line: 1,
            body: 'Check this.',
        })
        expect(host.refreshed).toHaveLength(3)
        expect(host.refreshed[2]?.id).toBe('map')
        expect(show_panel_calls).toBe(0)
    })

    test('with the map closed, Next, This stop looks good, and adding a draft add nothing to refreshed and leave panels.map unset', async () => {
        const { app, host, checkout } = await setUpApp()
        await app.run({ command: 'lucaWalk.showMap', args: [] })
        await app.run({ command: 'lucaWalk.startWalk', args: [] })
        expect(host.refreshed).toHaveLength(1)

        delete host.panels.map
        host.refreshed.length = 0

        await app.run({ command: 'lucaWalk.nextStop', args: [] })
        await app.run({ command: 'lucaWalk.markStopLooksGood', args: [] })
        await app.draftCommentAdded({
            uri: checkoutFileUri({ checkout, path: 'src/a.ts' }),
            start_line: 1,
            end_line: 1,
            body: 'Check this.',
        })

        expect(host.refreshed).toEqual([])
        expect(host.panels.map).toBeUndefined()
    })

    test('with the map open, opening a pull request that has no story redraws the map to the no-story refusal text', async () => {
        const { app, host, stories_dir } = await setUpApp({ with_origin: true })
        await app.run({ command: 'lucaWalk.showMap', args: [] })
        host.refreshed.length = 0
        await rm(privateStoryPath({ stories_dir, repo: REPO, pr_number: 12 }))

        host.answers.push('https://github.com/octocat/hello-world/pull/12')
        await app.run({ command: 'lucaWalk.openPullRequest', args: [] })

        expect(host.refreshed.at(-1)?.id).toBe('map')
        expect(htmlText({ html: host.panels.map?.html ?? '' })).toContain(
            '#12 has no story, so it has no map. Use "Write the story" for a guided walk.'
        )
    })

    test('git diff --numstat marks binary files as { added: 0, removed: 0 }, and a failing git gives line_counts null', async () => {
        const walk_dir = join(dir, 'walk')
        const stories_dir = join(dir, 'stories')
        const checkout = join(
            walk_dir,
            'checkouts',
            'octocat',
            'hello-world',
            'pr-12'
        )
        const { base_sha } = await makeCheckoutRepo({
            folder: checkout,
            base: { 'src/a.ts': 'base\n' },
            head: { 'src/a.ts': 'line 1\nline 2\n' },
        })
        await writeFile(
            join(checkout, 'logo.bin'),
            Buffer.from([0, 1, 2, 3, 4])
        )
        await testGit({ args: ['add', 'logo.bin'], cwd: checkout })
        await testGit({
            args: ['commit', '-q', '--amend', '--no-edit'],
            cwd: checkout,
        })
        const head_sha = (
            await testGit({ args: ['rev-parse', 'HEAD'], cwd: checkout })
        ).stdout.trim()

        const built = storyOf({
            repo: REPO,
            base_sha,
            head_sha,
            stops: [
                {
                    id: 's1',
                    title: 'Code',
                    changes: [{ id: 'c1', path: 'src/a.ts', line: 1 }],
                },
                {
                    id: 's2',
                    title: 'Binary asset',
                    changes: [{ id: 'c2', path: 'logo.bin', line: 1 }],
                },
            ],
        })
        await savePrivateStory({ stories_dir, story: built })

        const github = createPretendGitHub({
            login: 'octocat',
            pulls: [
                {
                    repo: REPO,
                    number: 12,
                    title: 'Binary asset',
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
        const ref = { repo: REPO, number: 12 }

        const shown_ok = await loadPullRequest({
            host,
            gh: github.gh,
            git: testGit,
            walk_dir,
            stories_dir,
            remote_url: () => join(dir, 'no-origin'),
            ref,
        })

        expect(shown_ok.line_counts?.['logo.bin']).toEqual({
            added: 0,
            removed: 0,
        })
        expect(shown_ok.line_counts?.['src/a.ts']).toEqual({
            added: 2,
            removed: 1,
        })

        const failing_git: WalkGit = async (call) =>
            call.args[0] === 'diff' && call.args.includes('--numstat')
                ? { ok: false, stdout: '', stderr: 'numstat failed' }
                : testGit(call)

        const shown_failed = await loadPullRequest({
            host,
            gh: github.gh,
            git: failing_git,
            walk_dir,
            stories_dir,
            remote_url: () => join(dir, 'no-origin'),
            ref,
        })

        expect(shown_failed.line_counts).toBeNull()
    })
})
