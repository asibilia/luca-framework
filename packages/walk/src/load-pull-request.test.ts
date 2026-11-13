import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { contextHtml, notInWalkHtml } from './context-html'
import { mapHtml } from './map-html'
import { summaryHtml } from './summary-html'
import { createFakeHost } from './testing/fake-host'
import {
    htmlButtons,
    htmlLines,
    htmlText,
    scriptSources,
} from './testing/html-text'
import {
    createPretendGitHub,
    type PretendComment,
} from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { createWalkApp } from './walk-app'
import { page } from './webview-html'

import { packStory, unpackStory } from '../../engine/src/story/story-comments'
import type { Story } from '../../engine/src/story/story-schema'
import { readStory } from '../../engine/src/story/story-schema'
import {
    privateStoryPath,
    savePrivateStory,
} from '../../engine/src/story/story-store'
import { sha, story } from '../../engine/src/story/testing/story-fixtures'

/**
 * Loading a pull request in Luca Walk (#753): on `activated()` in a
 * checkout, the app finds the story in both homes and shows the Summary
 * panel for every case of spec #752's section 4.
 */

const REPO = 'octocat/hello-world'
const URL = 'https://github.com/octocat/hello-world/pull/12'
const HEAD = sha({ char: 'c' })
const BAD_GATEWAY = 'HTTP 502: Bad Gateway'

let dir = ''
let walk_dir = ''
let stories_dir = ''
let checkout = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-load-')))
    walk_dir = join(dir, 'walk')
    stories_dir = join(dir, 'stories')
    checkout = join(walk_dir, 'checkouts', 'octocat', 'hello-world', 'pr-12')
    await mkdir(checkout, { recursive: true })
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** The fixture story, for pull request 12 of octocat/hello-world at `HEAD`. */
const walkStory = (): Story => ({
    ...story(),
    repo: REPO,
    pr_url: URL,
    head_sha: HEAD,
})

/** Expects `html`'s CSP to let only scripts with a nonce run. */
const expectNonceOnly = ({ html }: { html: string }) => {
    const sources = scriptSources({ html }) ?? []
    expect(sources.length).toBeGreaterThan(0)
    for (const source of sources) {
        expect(source).toMatch(/^'nonce-[A-Za-z0-9+/=_-]+'$/)
    }
}

/** The fixture story with its summary changed. */
const withSummary = (summary: Partial<Story['summary']>): Story => {
    const base = walkStory()
    return { ...base, summary: { ...base.summary, ...summary } }
}

const keepPrivately = (kept: Story) =>
    savePrivateStory({ stories_dir, story: kept })

const forgetPrivateStory = () =>
    rm(privateStoryPath({ stories_dir, repo: REPO, pr_number: 12 }))

/** An app in a window on the checkout of #12, and its pretend GitHub. */
const setUp = ({
    head_sha = HEAD,
    title = story().title,
    comments = [],
}: {
    head_sha?: string
    title?: string
    comments?: PretendComment[]
} = {}) => {
    const github = createPretendGitHub({
        login: 'octocat',
        pulls: [
            {
                repo: REPO,
                number: 12,
                title,
                author: 'octocat',
                base_ref: 'main',
                head_sha,
                state: 'OPEN',
                labels: [],
                comments,
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
    return { app, host, github }
}

/** Activates an app on the checkout; answers it with the Summary panel's HTML. */
const activate = async (options: Parameters<typeof setUp>[0] = {}) => {
    const made = setUp(options)
    await made.app.activated()
    return { ...made, html: made.host.panels.summary?.html ?? '' }
}

/** An app whose read of the pull request's comments fails once. */
const activateWithBadGateway = async () => {
    const made = setUp()
    made.github.failNext({ step: 'read_comments', error: BAD_GATEWAY })
    await made.app.activated()
    return { ...made, html: made.host.panels.summary?.html ?? '' }
}

const asComments = (bodies: string[]): PretendComment[] =>
    bodies.map((body, at) => ({ id: at + 1, body }))

const sorted = (values: string[]) => values.toSorted()

const NOT_READ = "This pull request's story can't be read:"

describe('loading a pull request in its checkout (#753)', () => {
    test('activated() in the checkout of #12 opens the summary panel titled "Summary of #12"', async () => {
        const { host } = await activate()

        expect(host.panels.summary?.title).toBe('Summary of #12')
    })

    test("a private story written for the head shows '#12 <title>', what changed, Before: and After:", async () => {
        const kept = walkStory()
        await keepPrivately(kept)

        const { html } = await activate()
        const text = htmlText({ html })

        expect(text).toContain(`#12 ${kept.title}`)
        expect(text).toContain(kept.summary.what_changed)
        expect(text).toContain(`Before: ${kept.summary.before}`)
        expect(text).toContain(`After: ${kept.summary.after}`)
        expect(sorted(htmlButtons({ html }))).toEqual(
            sorted(['Start the walk', 'Show the map'])
        )
    })

    test("the feedback line names the author's ask, or what the story's writer was least sure about", async () => {
        const text = 'The retry budget.'
        await keepPrivately(
            withSummary({ feedback_wanted: { text, source: 'author' } })
        )
        const authored = htmlText(await activate())

        await keepPrivately(
            withSummary({ feedback_wanted: { text, source: 'guessed' } })
        )
        const guessed = htmlText(await activate())

        expect(authored).toContain(`The author wants feedback on: ${text}`)
        expect(authored).not.toContain("The story's writer was least sure")
        expect(guessed).toContain(
            `The story's writer was least sure about: ${text}`
        )
        expect(guessed).not.toContain('The author wants feedback on:')
    })

    test('the counts are one line: files added, changed, deleted · lines added, removed · minutes', async () => {
        await keepPrivately(
            withSummary({
                counts: {
                    files_added: 2,
                    files_changed: 3,
                    files_deleted: 1,
                    lines_added: 120,
                    lines_removed: 45,
                },
                review_minutes: 20,
            })
        )

        const { html } = await activate()

        expect(htmlLines({ html })).toContain(
            '2 files added, 3 changed, 1 deleted · 120 lines added, 45 removed · about 20 minutes'
        )
    })

    test('a summary flag is one line: rule (rule source), path line N: message', async () => {
        const message = 'Adds a class; the repo uses factory functions.'
        await keepPrivately(
            withSummary({
                flags: [
                    {
                        kind: 'convention',
                        rule: 'No classes',
                        rule_source: 'AGENTS.md',
                        path: 'src/a.ts',
                        line: 44,
                        message,
                    },
                ],
            })
        )

        const { html } = await activate()

        expect(htmlLines({ html })).toContain(
            `No classes (AGENTS.md), src/a.ts line 44: ${message}`
        )
    })

    test('a story found only in the pull request comments is shown the same way as a private one', async () => {
        const kept = walkStory()
        await keepPrivately(kept)
        const fromPrivate = htmlLines(await activate())
        await forgetPrivateStory()

        const fromShared = await activate({
            comments: asComments(packStory({ story: kept })),
        })

        expect(htmlText(fromShared)).toContain(kept.summary.what_changed)
        expect(htmlLines(fromShared)).toEqual(fromPrivate)
    })

    test('with no story anywhere, the panel says so and offers Write the story and Browse the diff', async () => {
        const { html } = await activate()

        expect(htmlLines({ html })).toContain(
            'This pull request has no story yet.'
        )
        expect(sorted(htmlButtons({ html }))).toEqual(
            sorted(['Write the story', 'Browse the diff'])
        )
    })

    test('a story written for another commit is stale: both commits as 7 characters, and Write the story and Browse the diff', async () => {
        await keepPrivately({ ...walkStory(), head_sha: sha({ char: 'a' }) })

        const { html } = await activate({ head_sha: sha({ char: 'b' }) })

        expect(htmlLines({ html })).toContain(
            'This story was written for aaaaaaa, but the pull request is now at bbbbbbb.'
        )
        expect(sorted(htmlButtons({ html }))).toEqual(
            sorted(['Write the story', 'Browse the diff'])
        )
    })

    test("a story comment that fails the schema shows can't be read, then each problem on its own line", async () => {
        const base = walkStory()
        const broken: Story = { ...base, stops: base.stops.slice(0, 1) }
        const read = readStory({ value: JSON.parse(JSON.stringify(broken)) })
        const problems = read.status === 'invalid' ? read.problems : []

        const { html } = await activate({
            comments: asComments(packStory({ story: broken })),
        })
        const lines = htmlLines({ html })

        expect(problems.length).toBeGreaterThan(0)
        expect(lines).toContain(NOT_READ)
        for (const problem of problems) expect(lines).toContain(problem)
    })

    test("story comments that don't add up show can't be read, then the reason on the next line", async () => {
        const bodies = packStory({ story: walkStory(), max_bytes: 3000 })
        const partial = bodies.slice(0, -1)
        const unpacked = unpackStory({ bodies: partial })
        const reason = unpacked.status === 'broken' ? unpacked.reason : ''

        const { html } = await activate({ comments: asComments(partial) })
        const lines = htmlLines({ html })
        const at = lines.indexOf(NOT_READ)

        expect(reason).not.toBe('')
        expect(at).toBeGreaterThanOrEqual(0)
        expect(lines[at + 1]).toBe(reason)
    })

    test('when the comments cannot be read and there is no private story, the panel says Luca Walk could not load #12, the error, and offers Reload the story only', async () => {
        const { html } = await activateWithBadGateway()
        const lines = htmlLines({ html })
        const at = lines.indexOf('Luca Walk could not load #12:')

        expect(at).toBeGreaterThanOrEqual(0)
        expect(lines[at + 1]).toContain(BAD_GATEWAY)
        expect(htmlButtons({ html })).toEqual(['Reload the story'])
    })

    test('a head from GitHub that is not a commit id is never passed to git: Luca Walk could not load #12, and why', async () => {
        const { html } = await activate({ head_sha: '--upload-pack=touch' })
        const lines = htmlLines({ html })
        const at = lines.indexOf('Luca Walk could not load #12:')

        expect(at).toBeGreaterThanOrEqual(0)
        expect(lines[at + 1]).toBe(
            'GitHub gave "--upload-pack=touch" as the head of #12, which is not a commit id.'
        )
    })

    test('a story of schema version 2 asks to update Luca Walk, and offers Browse the diff only', async () => {
        const path = privateStoryPath({
            stories_dir,
            repo: REPO,
            pr_number: 12,
        })
        await mkdir(join(path, '..'), { recursive: true })
        await writeFile(
            path,
            JSON.stringify({ ...walkStory(), schema_version: 2 })
        )

        const { html } = await activate()

        expect(htmlLines({ html })).toContain(
            'This story uses a newer story format (version 2). Update Luca Walk to read it.'
        )
        expect(htmlButtons({ html })).toEqual(['Browse the diff'])
    })

    test('the Write the story button starts one terminal in the checkout that runs /luca-pr-prep on the pull request', async () => {
        const { app, host } = await activate()

        await app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'write_story' },
        })

        expect(host.terminals).toEqual([
            {
                name: 'Luca: write the story',
                cwd: checkout,
                command: `claude "/luca-pr-prep ${URL}"`,
            },
        ])
    })

    test("after the story is saved, the Reload the story button shows the story's summary", async () => {
        const { app, host } = await activate()
        await app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'write_story' },
        })
        const offered = htmlButtons({ html: host.panels.summary?.html ?? '' })
        const kept = walkStory()
        await keepPrivately(kept)

        await app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'reload_story' },
        })
        const text = htmlText({ html: host.panels.summary?.html ?? '' })

        expect(offered).toContain('Reload the story')
        expect(text).toContain(`#12 ${kept.title}`)
        expect(text).toContain(kept.summary.what_changed)
        expect(text).not.toContain('This pull request has no story yet.')
    })

    test("a story's title is escaped: a script tag is shown as text, never as a tag", async () => {
        const title = '<script>alert(1)</script> & "quotes" \'too\''
        await keepPrivately({ ...walkStory(), title })

        const { html } = await activate({ title })

        expect(html).toContain('&lt;script&gt;alert(1)')
        expect(html).not.toMatch(/<script\b[^>]*>\s*alert\(1\)/i)
        expect(htmlText({ html })).toContain(`#12 ${title}`)
    })

    test('every webview HTML the app makes has a Content-Security-Policy whose script-src allows only a nonce', async () => {
        const none = await activate()
        await keepPrivately({ ...walkStory(), head_sha: sha({ char: 'a' }) })
        const stale = await activate()
        await keepPrivately(walkStory())
        const ok = await activate()
        await forgetPrivateStory()
        const failing = await activateWithBadGateway()

        const pages = [none, stale, ok, failing].flatMap(
            ({ host }) => host.all_html
        )

        expect(pages.length).toBeGreaterThanOrEqual(4)
        for (const html of pages) expectNonceOnly({ html })
    })

    test('the Map, the Context view, the browse page and a failed Summary have the same Content-Security-Policy', () => {
        const kept = walkStory()
        const pages = [
            mapHtml({ story: kept }),
            contextHtml({
                story: kept,
                cursor: {
                    path: 'src/core/run-ticket.ts',
                    side: 'head',
                    line: 45,
                },
            }),
            contextHtml({
                story: kept,
                cursor: {
                    path: 'src/core/run-ticket.ts',
                    side: 'head',
                    line: 1,
                },
            }),
            notInWalkHtml(),
            page({ title: 'Context', body: '' }),
            summaryHtml({
                pr_number: 12,
                loaded: { status: 'failed', message: BAD_GATEWAY },
                story_requested: false,
            }),
        ]

        for (const html of pages) expectNonceOnly({ html })
    })
})
