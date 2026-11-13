import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFakeHost } from './testing/fake-host'
import { htmlLines } from './testing/html-text'
import {
    createPretendGitHub,
    type PretendComment,
    type PretendThread,
} from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { makeCheckoutRepo, storyOf } from './testing/walk-story'
import { createWalkApp } from './walk-app'

import {
    REPLY_MARKER,
    SUMMARY_MARKER,
} from '../../engine/skills/luca-pr-address/scripts/pr-findings'
import { savePrivateStory } from '../../engine/src/story/story-store'

/**
 * The conversation already on the pull request (#763, spec #752 section
 * 13): review threads shown read-only in the files, and
 * `/luca-pr-address`'s replies shown as the agent's.
 */

const REPO = 'octocat/hello-world'
const REPLIES = 'Replies from /luca-pr-address:'

let dir = ''
let walk_dir = ''
let checkout = ''
let base_sha = ''
let head_sha = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-threads-')))
    walk_dir = join(dir, 'walk')
    checkout = join(walk_dir, 'checkouts', 'octocat', 'hello-world', 'pr-12')
    const made = await makeCheckoutRepo({
        folder: checkout,
        base: { 'src/a.ts': 'old\n' },
        head: { 'src/a.ts': 'line 1\nline 2\nconst a = 1\n' },
    })
    base_sha = made.base_sha
    head_sha = made.head_sha
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const aUri = () => pathToFileURL(join(checkout, 'src/a.ts')).href

const lineThread = (comments: PretendThread['comments']): PretendThread => ({
    path: 'src/a.ts',
    subject_type: 'LINE',
    line: 44,
    side: 'RIGHT',
    comments,
})

/** An app activated on the checkout of #12, with a story and the given conversation. */
const openApp = async ({
    threads = [],
    comments = [],
}: {
    threads?: PretendThread[]
    comments?: PretendComment[]
}) => {
    const stories_dir = join(dir, 'stories')
    await savePrivateStory({
        stories_dir,
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
                comments,
                threads,
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
    return { app, host }
}

const summaryComment = (id: number, text: string): PretendComment => ({
    id,
    body: `${SUMMARY_MARKER} iteration=${id} head=${head_sha} -->\n${text}`,
})

describe('review threads already on the pull request (#763)', () => {
    test('a review thread on line 44 shows on the checkout file, labelled On GitHub, with its author and body', async () => {
        const { host } = await openApp({
            threads: [lineThread([{ author: 'octocat', body: 'Why two?' }])],
        })

        expect(host.threads).toHaveLength(1)
        expect(host.threads[0]).toMatchObject({
            uri: aUri(),
            start_line: 44,
            label: 'On GitHub',
            comments: [{ author: 'octocat', body: 'Why two?' }],
        })
    })

    test('a reply that holds the reply marker shows as luca-pr-address, without the marker', async () => {
        const { host } = await openApp({
            threads: [
                lineThread([
                    { author: 'octocat', body: 'Why two?' },
                    {
                        author: 'octocat',
                        body: `Fixed in abc1234.\n${REPLY_MARKER}`,
                    },
                ]),
            ],
        })

        expect(host.threads[0]?.comments).toEqual([
            { author: 'octocat', body: 'Why two?' },
            { author: 'luca-pr-address', body: 'Fixed in abc1234.' },
        ])
    })

    test('a file thread shows on line 1 of the checkout file', async () => {
        const { host } = await openApp({
            threads: [
                {
                    path: 'src/a.ts',
                    subject_type: 'FILE',
                    line: null,
                    side: 'RIGHT',
                    comments: [{ author: 'octocat', body: 'Split this file' }],
                },
            ],
        })

        expect(host.threads).toHaveLength(1)
        expect(host.threads[0]).toMatchObject({
            uri: aUri(),
            start_line: 1,
            label: 'On GitHub',
        })
    })

    test('On GitHub threads are read-only and Draft threads are not', async () => {
        const { app, host } = await openApp({
            threads: [lineThread([{ author: 'octocat', body: 'Why two?' }])],
        })

        await app.draftCommentAdded({
            uri: aUri(),
            start_line: 3,
            end_line: 3,
            body: 'Mine',
        })

        const read_only = (label: string) =>
            host.threads
                .filter((thread) => thread.label === label)
                .map((thread) => thread.read_only)
        expect(read_only('On GitHub')).toEqual([true])
        expect(read_only('Draft')).toEqual([false])
    })
})

describe("/luca-pr-address's summaries on the Summary panel (#763)", () => {
    test('a summary comment is listed under Replies from /luca-pr-address: without its marker line', async () => {
        const { host } = await openApp({
            comments: [summaryComment(1, 'Fixed 3 of 4.')],
        })
        const lines = htmlLines({ html: host.panels.summary?.html ?? '' })
        const at = lines.indexOf(REPLIES)

        expect(at).toBeGreaterThanOrEqual(0)
        expect(lines.slice(at + 1)).toContain('Fixed 3 of 4.')
        expect(lines.some((line) => line.includes(SUMMARY_MARKER))).toBe(false)
    })

    test('with two summary comments, the newer one is listed first', async () => {
        const { host } = await openApp({
            comments: [
                summaryComment(1, 'Fixed 3 of 4.'),
                summaryComment(2, 'Fixed 4 of 4.'),
            ],
        })
        const lines = htmlLines({ html: host.panels.summary?.html ?? '' })

        expect(lines.indexOf('Fixed 4 of 4.')).toBeGreaterThan(
            lines.indexOf(REPLIES)
        )
        expect(lines.indexOf('Fixed 4 of 4.')).toBeLessThan(
            lines.indexOf('Fixed 3 of 4.')
        )
    })

    test('an issue comment without the summary marker is not listed', async () => {
        const { host } = await openApp({
            comments: [
                { id: 1, body: 'Looks fine to me.' },
                summaryComment(2, 'Fixed 3 of 4.'),
            ],
        })
        const lines = htmlLines({ html: host.panels.summary?.html ?? '' })

        expect(lines).toContain('Fixed 3 of 4.')
        expect(lines.join('\n')).not.toContain('Looks fine to me.')
    })
})
