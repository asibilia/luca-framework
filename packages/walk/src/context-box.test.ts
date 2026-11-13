import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFakeHost } from './testing/fake-host'
import { htmlText } from './testing/html-text'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { makeCheckoutRepo, storyOf, type StopAt } from './testing/walk-story'
import { createWalkApp } from './walk-app'

import type { StoryChange } from '../../engine/src/story/story-parts'
import type { Story } from '../../engine/src/story/story-schema'
import { savePrivateStory } from '../../engine/src/story/story-store'

/**
 * The context box (#757, spec #752 section 7): on every `cursorMoved`, the
 * Context view shows the story's context for the change under the cursor,
 * the stop's changes when the cursor is on none, or that the file is not
 * part of the walk.
 */

const REPO = 'octocat/hello-world'
const RUN = 'src/core/run.ts'

const FILES = {
    'src/cli.ts': 'cli\n',
    'src/core/run.ts': 'run\n',
    'src/core/kept.ts': 'kept\n',
    'src/types.ts': 'types\n',
    'package.json': '{}\n',
}

const STOPS: StopAt[] = [
    {
        id: 's1',
        title: 'Start in the CLI',
        changes: [{ id: 'c1', path: 'src/cli.ts', line: 5 }],
    },
    {
        id: 's2',
        title: 'The run loop',
        changes: [
            { id: 'c2', path: RUN, line: 10 },
            { id: 'c3', path: RUN, line: 44 },
        ],
    },
    {
        id: 's3',
        title: 'What is kept',
        changes: [{ id: 'c4', path: 'src/core/kept.ts', line: 3 }],
    },
    {
        id: 's4',
        title: 'The types',
        changes: [{ id: 'c5', path: 'src/types.ts', line: 3 }],
    },
    {
        id: 's5',
        title: 'The package',
        changes: [{ id: 'c6', path: 'package.json', line: 1 }],
    },
]

const C1_TITLE = 'Read the retry flag'
const C2_TITLE = 'Count the tries'
const C3_TITLE = 'Retry a stuck ticket twice'
const ISSUE_URL = 'https://github.com/octocat/hello-world/issues/705'

const dependent = (path: string, line: number, in_pr: boolean) => ({
    path,
    line,
    in_pr,
})

/** c3: lines 44 to 46 of run.ts, with everything the box can show. */
const C3: Partial<StoryChange> = {
    title: C3_TITLE,
    how_we_got_here: {
        from_change_id: 'c1',
        text: 'The CLI calls run for every ticket.',
    },
    why_needed: 'A stuck ticket used to stop the whole run.',
    architecture_note: 'None: the retry stays inside core.',
    check_this: 'Is two retries the right budget?',
    proof: {
        covered: true,
        tests: [
            {
                path: 'src/core/run.test.ts',
                line: 12,
                name: 'retries a stuck ticket',
            },
        ],
        note: 'One test covers the retry path.',
    },
    serves: {
        found: true,
        refs: [
            {
                label: '#705',
                url: ISSUE_URL,
                quote: 'Retry a routine stuck once.',
            },
        ],
        note: 'The linked issue asks for it.',
    },
    blast_radius: {
        dependents_total: 7,
        dependents_outside_pr: 2,
        dependents: [
            dependent('src/a.ts', 44, true),
            dependent('src/b.ts', 3, true),
            dependent('src/c.ts', 4, true),
            dependent('src/d.ts', 5, true),
            dependent('src/e.ts', 6, true),
            dependent('src/f.ts', 7, false),
            dependent('src/g.ts', 8, false),
        ],
        note: 'Counted with a search for run( in src.',
    },
    flags: [
        {
            kind: 'convention',
            rule: 'No classes',
            rule_source: 'AGENTS.md',
            path: RUN,
            line: 45,
            message: 'Adds a class; the repo uses factory functions.',
        },
    ],
}

/** c2: lines 10 to 12 of run.ts, untested, serving nothing, no flags. */
const C2: Partial<StoryChange> = {
    title: C2_TITLE,
    proof: {
        covered: false,
        tests: [],
        note: 'Nothing tests the count.',
    },
    serves: {
        found: false,
        refs: [],
        note: 'It serves nothing the tickets asked for.',
    },
    flags: [],
}

let dir = ''
let checkout = ''
let base_sha = ''
let head_sha = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-context-')))
    checkout = join(dir, 'walk', 'checkouts', 'octocat', 'hello-world', 'pr-12')
    const made = await makeCheckoutRepo({
        folder: checkout,
        base: FILES,
        head: { ...FILES, 'src/core/run.ts': 'run head\n' },
    })
    base_sha = made.base_sha
    head_sha = made.head_sha
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const fileUri = (path: string) => pathToFileURL(join(checkout, path)).href

const edited = (
    story: Story,
    edits: Record<string, Partial<StoryChange>>
): Story => ({
    ...story,
    stops: story.stops.map((stop) => ({
        ...stop,
        changes: stop.changes.map((change) => ({
            ...change,
            ...edits[change.id],
        })),
    })),
})

/**
 * An app on the checkout of #12, activated, whose story is `STOPS` with
 * c1, c2 and c3 filled in; `c2` bends c2 further.
 */
const openContext = async ({ c2 = {} }: { c2?: Partial<StoryChange> } = {}) => {
    const story = edited(
        storyOf({ repo: REPO, base_sha, head_sha, stops: STOPS }),
        { c1: { title: C1_TITLE }, c2: { ...C2, ...c2 }, c3: C3 }
    )
    await savePrivateStory({ stories_dir: join(dir, 'stories'), story })
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
        walk_dir: join(dir, 'walk'),
        stories_dir: join(dir, 'stories'),
        remote_url: () => join(dir, 'no-origin'),
    })
    await app.activated()
    /** The Context view's visible text after the cursor moved there. */
    const cursorOn = async (uri: string, line: number) => {
        await app.cursorMoved({ uri, line })
        return htmlText({ html: host.context_html })
    }
    return { app, host, cursorOn }
}

describe('the context box (#757)', () => {
    test('on line 45 of run.ts it shows where the change sits and its title', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 45)

        expect(text).toContain('Stop 2 of 5 · change 2 of 2 in this file')
        expect(text).toContain(C3_TITLE)
    })

    test('it shows how we got here, and the title of the change it comes from', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 45)

        expect(text).toContain(
            'How we got here: The CLI calls run for every ticket.'
        )
        expect(text).toContain(`Comes from: ${C1_TITLE}`)
    })

    test('it shows why, the architecture and the one thing to check', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 45)

        expect(text).toContain(
            'Why: A stuck ticket used to stop the whole run.'
        )
        expect(text).toContain(
            'Architecture: None: the retry stays inside core.'
        )
        expect(text).toContain('Check this: Is two retries the right budget?')
    })

    test('it shows the proof note and each test that covers the change', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 45)

        expect(text).toContain('Proof: One test covers the retry path.')
        expect(text).toContain(
            'src/core/run.test.ts line 12: retries a stuck ticket'
        )
    })

    test('a change no test covers says so', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 11)

        expect(text).toContain('No test covers this.')
    })

    test('it shows the ask the change serves: its label, its quote in quotation marks and a link to it', async () => {
        const { host, cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 45)

        expect(text).toContain('Serves:')
        expect(text).toContain('#705')
        expect(text).toContain('"Retry a routine stuck once."')
        expect(host.context_html).toContain(ISSUE_URL)
    })

    test('a change that serves nothing found shows the serves note', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 11)

        expect(text).toContain('It serves nothing the tickets asked for.')
    })

    test('it counts the blast radius and marks the dependents in this pull request', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 45)

        expect(text).toContain(
            'Blast radius: 7 places depend on this, 2 outside this pull request.'
        )
        expect(text).toContain('src/a.ts line 44 (in this pull request)')
    })

    test("a change with a flag shows Flags: and the flag's rule", async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 45)

        expect(text).toContain('Flags:')
        expect(text).toContain('No classes')
    })

    test('a change with no flags shows no Flags:', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 11)

        expect(text).toContain(C2_TITLE)
        expect(text).not.toContain('Flags:')
    })

    test('a base side change is shown on the base document, not on the same line of the checkout file', async () => {
        const { cursorOn } = await openContext({
            c2: { side: 'base', start_line: 44, end_line: 46 },
        })

        const base = await cursorOn(
            `luca-walk-base:/${RUN}?sha=${base_sha}`,
            45
        )
        const head = await cursorOn(fileUri(RUN), 45)

        expect(base).toContain(C2_TITLE)
        expect(base).not.toContain(C3_TITLE)
        expect(head).toContain(C3_TITLE)
        expect(head).not.toContain(C2_TITLE)
    })

    test("outside every change of a stop's file it shows why the stop is here and the file's changes", async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri(RUN), 30)

        expect(text).toContain('Why The run loop is here.')
        expect(text).toContain('Changes in this file:')
        expect(text).toContain(`line 44: ${C3_TITLE}`)
    })

    test('in a file no story change is in, it says the file is not part of the walk', async () => {
        const { cursorOn } = await openContext()

        const text = await cursorOn(fileUri('src/elsewhere.ts'), 5)

        expect(text).toContain(
            'This file is not part of the walk. Use "Back to the walk" to return.'
        )
    })

    test("a script tag in a change's why is shown escaped", async () => {
        const { host, cursorOn } = await openContext({
            c2: { why_needed: 'It ran <script>alert(1)</script> before.' },
        })

        await cursorOn(fileUri(RUN), 11)

        expect(host.context_html).toContain('&lt;script&gt;alert(1)')
        expect(host.context_html).not.toContain('<script>alert(1)')
    })

    test('a link clicked in the Context view opens in the browser', async () => {
        const { app, host } = await openContext()

        await app.panelMessage({
            panel: 'context',
            message: { type: 'open_link', url: ISSUE_URL },
        })

        expect(host.opened_urls).toEqual([ISSUE_URL])
    })
})
