import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFakeHost } from './testing/fake-host'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { makeCheckoutRepo, storyOf } from './testing/walk-story'
import { createWalkApp } from './walk-app'

import type { Story } from '../../engine/src/story/story-schema'
import {
    privateStoryPath,
    savePrivateStory,
} from '../../engine/src/story/story-store'
import { groupedStory } from '../../engine/src/story/testing/grouped-story'

/**
 * Status bar quick actions (#803, spec #776 section 5): live progress and
 * one-click actions during a story walk or plain-diff browse, hidden when no
 * session is active.
 */

const REPO = 'octocat/hello-world'

let dir = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-status-bar-')))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const groupedFiles = ({ story }: { story: Story }): Record<string, string> => {
    const files: Record<string, string> = {}
    for (const file of story.map.files) {
        files[file.path] = 'line 1\nline 2\n'
    }
    return files
}

const openApp = async ({
    mode,
    reviewed_at_head = false,
}: {
    mode: 'grouped' | 'one_stop' | 'no_story'
    reviewed_at_head?: boolean
}) => {
    const walk_dir = join(dir, 'walk')
    const stories_dir = join(dir, 'stories')
    const checkout = join(
        walk_dir,
        'checkouts',
        'octocat',
        'hello-world',
        'pr-12'
    )
    const template = groupedStory()
    const head_files =
        mode === 'grouped'
            ? groupedFiles({ story: template })
            : { 'src/only.ts': 'after\n' }
    const base_files: Record<string, string> =
        mode === 'grouped'
            ? { 'README.md': 'base\n' }
            : { 'src/only.ts': 'before\n' }
    const { base_sha, head_sha } = await makeCheckoutRepo({
        folder: checkout,
        base: base_files,
        head: head_files,
    })
    await testGit({
        args: ['update-ref', 'refs/remotes/origin/main', base_sha],
        cwd: checkout,
    })
    if (mode === 'grouped') {
        await savePrivateStory({
            stories_dir,
            story: {
                ...template,
                repo: REPO,
                pr_number: 12,
                pr_url: `https://github.com/${REPO}/pull/12`,
                base_sha,
                head_sha,
            },
        })
    } else if (mode === 'one_stop') {
        await savePrivateStory({
            stories_dir,
            story: storyOf({
                repo: REPO,
                base_sha,
                head_sha,
                stops: [
                    {
                        id: 's1',
                        title: 'Only stop',
                        changes: [{ id: 'c1', path: 'src/only.ts', line: 1 }],
                    },
                ],
            }),
        })
    }
    if (reviewed_at_head) {
        const record_path = join(
            walk_dir,
            'reviewed',
            'octocat',
            'hello-world',
            'pr-12.json'
        )
        await mkdir(join(record_path, '..'), { recursive: true })
        await writeFile(
            record_path,
            JSON.stringify({
                schema_version: 1,
                commit: head_sha,
                approved_files: [],
            })
        )
    }
    const github = createPretendGitHub({
        login: 'octocat',
        pulls: [
            {
                repo: REPO,
                number: 12,
                title: 'Status bar quick actions',
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
    return { app, host, stories_dir }
}

describe('status bar quick actions (#803)', () => {
    test('with no story and browse not started, host.status_actions is empty', async () => {
        const { app, host, stories_dir } = await openApp({ mode: 'one_stop' })
        expect(host.status_actions).toHaveLength(4)

        await rm(privateStoryPath({ stories_dir, repo: REPO, pr_number: 12 }))
        await app.run({ command: 'lucaWalk.reloadStory', args: [] })

        expect(host.status_actions).toEqual([])
    })

    test('loading groupedStory before the walk starts shows 4 status bar actions with Walk: 24 stops', async () => {
        const { host } = await openApp({ mode: 'grouped' })

        expect(host.status_actions).toEqual([
            {
                id: 'progress',
                text: 'Walk: 24 stops',
                tooltip: 'Show the map',
                command: 'lucaWalk.showMap',
            },
            {
                id: 'next_stop',
                text: '$(arrow-right) Next stop',
                tooltip: 'Go to the next stop',
                command: 'lucaWalk.nextStop',
            },
            {
                id: 'looks_good',
                text: '$(check) This stop looks good',
                tooltip: 'Mark every file in the current stop as looking good',
                command: 'lucaWalk.markStopLooksGood',
            },
            {
                id: 'send_review',
                text: '$(comment-discussion) Send the review',
                tooltip: 'Send your review to GitHub',
                command: 'lucaWalk.sendReview',
            },
        ])
    })

    test('moving to stop s6 updates progress to Stop 6 of 24', async () => {
        const { app, host } = await openApp({ mode: 'grouped' })

        await app.stopPicked({ stop_id: 's6' })

        expect(host.status_actions[0]).toEqual({
            id: 'progress',
            text: 'Stop 6 of 24',
            tooltip: 'Show the map',
            command: 'lucaWalk.showMap',
        })
    })

    test('pressing Next on the last stop s24 updates progress to All 24 stops walked', async () => {
        const { app, host } = await openApp({ mode: 'grouped' })

        await app.run({ command: 'lucaWalk.startWalk', args: [] })
        for (let step = 0; step < 24; step += 1) {
            await app.run({ command: 'lucaWalk.nextStop', args: [] })
        }

        expect(host.status_actions[0]).toEqual({
            id: 'progress',
            text: 'All 24 stops walked',
            tooltip: 'Show the map',
            command: 'lucaWalk.showMap',
        })
    })

    test('on a second visit with zero stops to walk, progress shows Nothing new to walk', async () => {
        const { host } = await openApp({
            mode: 'grouped',
            reviewed_at_head: true,
        })

        expect(host.status_actions[0]).toEqual({
            id: 'progress',
            text: 'Nothing new to walk',
            tooltip: 'Show the map',
            command: 'lucaWalk.showMap',
        })
    })

    test('in plain-diff browse mode, progress uses lucaWalk.backToWalk and singular counts use stop', async () => {
        const single_story = await openApp({ mode: 'one_stop' })
        expect(single_story.host.status_actions[0]).toEqual({
            id: 'progress',
            text: 'Walk: 1 stop',
            tooltip: 'Show the map',
            command: 'lucaWalk.showMap',
        })

        const { app, host } = await openApp({ mode: 'no_story' })
        await app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'browse_diff' },
        })
        expect(host.status_actions[0]).toEqual({
            id: 'progress',
            text: 'Stop 1 of 1',
            tooltip: 'Back to the walk',
            command: 'lucaWalk.backToWalk',
        })

        await app.run({ command: 'lucaWalk.nextStop', args: [] })
        expect(host.status_actions[0]).toEqual({
            id: 'progress',
            text: 'All 1 stop walked',
            tooltip: 'Back to the walk',
            command: 'lucaWalk.backToWalk',
        })
    })
})
