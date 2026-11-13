import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFakeHost } from './testing/fake-host'
import { createPretendGitHub, type PretendPull } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { createWalkApp } from './walk-app'

import { savePrivateStory } from '../../engine/src/story/story-store'
import { story } from '../../engine/src/story/testing/story-fixtures'

/**
 * The list of review-ready pull requests (#755): `Open a review-ready pull
 * request` joins the search's results and the private stories of open pull
 * requests into one quick pick.
 */

let dir = ''
let stories_dir = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-list-')))
    stories_dir = join(dir, 'stories')
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const pull = (fields: Partial<PretendPull>): PretendPull => ({
    repo: 'octocat/hello-world',
    number: 12,
    title: 'Add retries',
    author: 'octocat',
    base_ref: 'main',
    head_sha: 'a'.repeat(40),
    state: 'OPEN',
    labels: [],
    comments: [],
    ...fields,
})

const keepStory = ({
    repo,
    pr_number,
    title,
}: {
    repo: string
    pr_number: number
    title: string
}) =>
    savePrivateStory({
        stories_dir,
        story: {
            ...story(),
            repo,
            pr_number,
            title,
            pr_url: `https://github.com/${repo}/pull/${pr_number}`,
        },
    })

const setUp = ({ pulls }: { pulls: PretendPull[] }) => {
    const github = createPretendGitHub({ login: 'octocat', pulls })
    const host = createFakeHost({ workspace_folder: null })
    const app = createWalkApp({
        host,
        gh: github.gh,
        git: testGit,
        walk_dir: join(dir, 'walk'),
        stories_dir,
        remote_url: () => join(dir, 'no-origin'),
    })
    const list = async () => {
        await app.run({ command: 'lucaWalk.openFromList', args: [] })
        return host.picks[0] ?? []
    }
    return { host, github, list }
}

describe('the list of review-ready pull requests (#755)', () => {
    test("the search's pull request 12 is offered as '#12 Add retries' in octocat/hello-world", async () => {
        const { list } = setUp({ pulls: [pull({ labels: ['review-ready'] })] })

        expect(await list()).toEqual([
            { label: '#12 Add retries', description: 'octocat/hello-world' },
        ])
    })

    test("an open pull request with only a private story is offered as '#7 Fix the footer' with ' · private story'", async () => {
        await keepStory({
            repo: 'some-org/site',
            pr_number: 7,
            title: 'Fix the footer',
        })
        const { list } = setUp({
            pulls: [
                pull({
                    repo: 'some-org/site',
                    number: 7,
                    title: 'Fix the footer',
                }),
            ],
        })

        expect(await list()).toEqual([
            {
                label: '#7 Fix the footer',
                description: 'some-org/site · private story',
            },
        ])
    })

    test('a private story for a closed pull request is not offered', async () => {
        await keepStory({
            repo: 'some-org/site',
            pr_number: 7,
            title: 'Fix the footer',
        })
        const { host, list } = setUp({
            pulls: [
                pull({
                    repo: 'some-org/site',
                    number: 7,
                    title: 'Fix the footer',
                    state: 'CLOSED',
                }),
            ],
        })

        expect(await list()).toEqual([])
        expect(host.messages).toContainEqual({
            kind: 'info',
            text: 'No open pull requests are ready to review.',
        })
    })

    test('a pull request found by the search that also has a private story is offered once', async () => {
        await keepStory({
            repo: 'octocat/hello-world',
            pr_number: 12,
            title: 'Add retries',
        })
        const { list } = setUp({ pulls: [pull({ labels: ['review-ready'] })] })

        const items = await list()

        expect(items.map(({ label }) => label)).toEqual(['#12 Add retries'])
    })

    test('with nothing found either way the app shows that no pull request is ready', async () => {
        const { host, list } = setUp({ pulls: [] })

        await list()

        expect(host.messages).toEqual([
            {
                kind: 'info',
                text: 'No open pull requests are ready to review.',
            },
        ])
    })

    test('the search call holds --state open --label review-ready --involves @me', async () => {
        const { github, list } = setUp({ pulls: [] })

        await list()

        const search = github.state.calls.find((call) =>
            call.startsWith('search prs')
        )
        const words = (search ?? '').split(' ')
        expect(words).toEqual(
            expect.arrayContaining([
                '--state',
                'open',
                '--label',
                'review-ready',
                '--involves',
                '@me',
            ])
        )
        expect(words.indexOf('open')).toBe(words.indexOf('--state') + 1)
        expect(words.indexOf('review-ready')).toBe(words.indexOf('--label') + 1)
        expect(words.indexOf('@me')).toBe(words.indexOf('--involves') + 1)
    })
})
