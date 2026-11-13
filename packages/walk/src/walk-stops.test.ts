import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFakeHost, type FakeHost } from './testing/fake-host'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import {
    commitSymlink,
    makeCheckoutRepo,
    storyOf,
    type FileAt,
    type StopAt,
} from './testing/walk-story'
import { createWalkApp } from './walk-app'

import { savePrivateStory } from '../../engine/src/story/story-store'

/**
 * The walk (#756, spec #752 section 6): the Stops view, going to a stop
 * as a full-file diff, Next and Back through stops and changes, and the
 * place in the walk kept in the drafts file.
 */

const REPO = 'octocat/hello-world'
const BASE_RUN = 'export const run = () => "base"\n'

const BASE_FILES = {
    'src/cli.ts': 'cli base\n',
    'src/core/run.ts': BASE_RUN,
    'src/core/kept.ts': 'kept base\n',
    'src/old.ts': 'old\n',
    'src/before.ts': 'moved\n',
    'src/types.ts': 'types base\n',
    'package.json': '{}\n',
}

const HEAD_FILES = {
    'src/cli.ts': 'cli head\n',
    'src/core/run.ts': 'export const run = () => "head"\n',
    'src/core/kept.ts': 'kept head\n',
    'src/new.ts': 'new\n',
    'src/after.ts': 'moved\n',
    'src/types.ts': 'types head\n',
    'package.json': '{ "name": "x" }\n',
}

let dir = ''
let walk_dir = ''
let checkout = ''
let base_sha = ''
let head_sha = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-stops-')))
    walk_dir = join(dir, 'walk')
    checkout = join(walk_dir, 'checkouts', 'octocat', 'hello-world', 'pr-12')
    const made = await makeCheckoutRepo({
        folder: checkout,
        base: BASE_FILES,
        head: HEAD_FILES,
    })
    base_sha = made.base_sha
    head_sha = made.head_sha
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const fileUri = (path: string) => pathToFileURL(join(checkout, path)).href

/** Three stops; the run loop's changes are on `run_lines`. */
const threeStops = ({
    run_lines = [44, 80],
}: { run_lines?: number[] } = {}): StopAt[] => [
    {
        id: 's1',
        title: 'Start in the CLI',
        changes: [{ id: 'c1', path: 'src/cli.ts', line: 5 }],
    },
    {
        id: 's2',
        title: 'The run loop',
        changes: run_lines.map((line, at) => ({
            id: `c2-${at}`,
            path: 'src/core/run.ts',
            line,
        })),
    },
    {
        id: 's3',
        title: 'Loose ends',
        loose_ends: true,
        changes: [
            { id: 'c3-0', path: 'package.json', line: 3 },
            { id: 'c3-1', path: 'src/types.ts', line: 7 },
        ],
    },
]

const KIND_STOPS: StopAt[] = [
    {
        id: 'k1',
        title: 'An added file',
        changes: [{ id: 'k1-0', path: 'src/new.ts', line: 1 }],
    },
    {
        id: 'k2',
        title: 'A deleted file',
        changes: [{ id: 'k2-0', path: 'src/old.ts', line: 7, side: 'base' }],
    },
    {
        id: 'k3',
        title: 'A renamed file',
        changes: [{ id: 'k3-0', path: 'src/after.ts', line: 20 }],
    },
    {
        id: 'k4',
        title: 'A change on the base side',
        changes: [
            { id: 'k4-0', path: 'src/core/kept.ts', line: 30, side: 'base' },
        ],
    },
]

const KIND_FILES: FileAt[] = [
    { path: 'src/new.ts', status: 'added' },
    { path: 'src/old.ts', status: 'deleted' },
    { path: 'src/after.ts', status: 'renamed', previous_path: 'src/before.ts' },
]

/** An app on the checkout of #12 whose story has `stops`, activated. */
const openWalk = async ({
    stops = threeStops(),
    files = [],
    save = true,
}: { stops?: StopAt[]; files?: FileAt[]; save?: boolean } = {}) => {
    if (save) {
        await savePrivateStory({
            stories_dir: join(dir, 'stories'),
            story: storyOf({ repo: REPO, base_sha, head_sha, stops, files }),
        })
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
        stories_dir: join(dir, 'stories'),
        remote_url: () => join(dir, 'no-origin'),
    })
    await app.activated()
    const run = (command: string) => app.run({ command, args: [] })
    const pick = (at: number) =>
        app.stopPicked({ stop_id: host.stops[at]?.stop_id ?? '' })
    return { app, host, run, pick }
}

const descriptions = (host: FakeHost) =>
    host.stops.map(({ description }) => description)

const lastDiff = (host: FakeHost) => host.diffs.at(-1)

describe('walking the stops (#756)', () => {
    test('Start the walk lists every stop numbered, the first one current', async () => {
        const { host, run } = await openWalk()

        await run('lucaWalk.startWalk')

        expect(host.stops.map(({ label }) => label)).toEqual([
            '1. Start in the CLI',
            '2. The run loop',
            '3. Loose ends',
        ])
        expect(descriptions(host)).toEqual(['current', '', ''])
    })

    test("the Summary panel's Start the walk button goes to the first stop", async () => {
        const { app, host } = await openWalk()

        await app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'start_walk' },
        })

        expect(descriptions(host)).toEqual(['current', '', ''])
        expect(lastDiff(host)?.title).toBe('src/cli.ts (#12)')
    })

    test('a stop on a modified file opens its base and checkout sides at its first change', async () => {
        const { host, run } = await openWalk()
        await run('lucaWalk.startWalk')

        await run('lucaWalk.nextStop')

        expect(lastDiff(host)).toEqual({
            title: 'src/core/run.ts (#12)',
            base_uri: `luca-walk-base:/src/core/run.ts?sha=${base_sha}`,
            head_uri: fileUri('src/core/run.ts'),
            reveal_line: 44,
            reveal_side: 'head',
        })
    })

    test("the base document's text is the file at the base commit", async () => {
        const { app } = await openWalk()

        const text = await app.baseDocumentText({
            uri: `luca-walk-base:/src/core/run.ts?sha=${base_sha}`,
        })

        expect(text).toBe(BASE_RUN)
    })

    test("the base document's text is read from VS Code's encoded query too", async () => {
        const { app } = await openWalk()

        const text = await app.baseDocumentText({
            uri: `luca-walk-base:/src/core/run.ts?sha%3D${base_sha}`,
        })

        expect(text).toBe(BASE_RUN)
    })

    test("an added file's base side is the empty document", async () => {
        const { app, host, run } = await openWalk({
            stops: KIND_STOPS,
            files: KIND_FILES,
        })

        await run('lucaWalk.startWalk')
        const empty = await app.baseDocumentText({
            uri: 'luca-walk-base:/src/new.ts?sha=empty',
        })

        expect(lastDiff(host)?.base_uri).toBe(
            'luca-walk-base:/src/new.ts?sha=empty'
        )
        expect(empty).toBe('')
    })

    test("a deleted file's head side is the empty document", async () => {
        const { host, run, pick } = await openWalk({
            stops: KIND_STOPS,
            files: KIND_FILES,
        })
        await run('lucaWalk.startWalk')

        await pick(1)

        expect(lastDiff(host)?.head_uri).toBe(
            'luca-walk-base:/src/old.ts?sha=empty'
        )
    })

    test("a renamed file's base side is its previous path, its head side the new one", async () => {
        const { host, run, pick } = await openWalk({
            stops: KIND_STOPS,
            files: KIND_FILES,
        })
        await run('lucaWalk.startWalk')

        await pick(2)

        expect(lastDiff(host)?.base_uri).toBe(
            `luca-walk-base:/src/before.ts?sha=${base_sha}`
        )
        expect(lastDiff(host)?.head_uri).toBe(fileUri('src/after.ts'))
    })

    test('a first change on the base side reveals its line on the base side', async () => {
        const { host, run, pick } = await openWalk({
            stops: KIND_STOPS,
            files: KIND_FILES,
        })
        await run('lucaWalk.startWalk')

        await pick(3)

        expect(lastDiff(host)?.reveal_side).toBe('base')
        expect(lastDiff(host)?.reveal_line).toBe(30)
    })

    test('Next stop goes to stop 2: stop 1 is done and stop 2 current', async () => {
        const { host, run } = await openWalk()
        await run('lucaWalk.startWalk')

        await run('lucaWalk.nextStop')

        expect(lastDiff(host)?.title).toBe('src/core/run.ts (#12)')
        expect(descriptions(host)).toEqual(['done', 'current', ''])
    })

    test('Previous stop from stop 2 goes back to stop 1, which is current again', async () => {
        const { host, run } = await openWalk()
        await run('lucaWalk.startWalk')
        await run('lucaWalk.nextStop')

        await run('lucaWalk.previousStop')

        expect(lastDiff(host)?.title).toBe('src/cli.ts (#12)')
        expect(descriptions(host)[0]).toBe('current')
    })

    test('Previous stop on the first stop opens nothing', async () => {
        const { host, run } = await openWalk()
        await run('lucaWalk.startWalk')

        await run('lucaWalk.previousStop')

        expect(host.diffs.map(({ title }) => title)).toEqual([
            'src/cli.ts (#12)',
        ])
        expect(descriptions(host)).toEqual(['current', '', ''])
    })

    test('Next stop on the last stop opens nothing and says it was the last stop', async () => {
        const { host, run, pick } = await openWalk()
        await run('lucaWalk.startWalk')
        await pick(2)
        const opened = host.diffs.length

        await run('lucaWalk.nextStop')

        expect(host.diffs).toHaveLength(opened)
        expect(host.messages.map(({ text }) => text)).toContain(
            "That was the last stop. Send the review when you're ready."
        )
    })

    test('Next and Previous change move between the changes on lines 10 and 80 of the file', async () => {
        const { app, host, run } = await openWalk({
            stops: threeStops({ run_lines: [10, 80] }),
        })
        const uri = fileUri('src/core/run.ts')
        await run('lucaWalk.startWalk')
        await run('lucaWalk.nextStop')
        host.active_editor = { uri, start_line: 12, end_line: 12 }
        await app.cursorMoved({ uri, line: 12 })

        await run('lucaWalk.nextChange')
        const next = lastDiff(host)
        host.active_editor = { uri, start_line: 80, end_line: 80 }
        await app.cursorMoved({ uri, line: 80 })
        await run('lucaWalk.previousChange')
        const previous = lastDiff(host)

        expect(next?.head_uri).toBe(uri)
        expect(next?.reveal_line).toBe(80)
        expect(previous?.head_uri).toBe(uri)
        expect(previous?.reveal_line).toBe(10)
    })

    test("in the loose ends, Next change opens the next change's own file", async () => {
        const { app, host, run, pick } = await openWalk()
        await run('lucaWalk.startWalk')
        await pick(2)
        const uri = fileUri('package.json')
        host.active_editor = { uri, start_line: 3, end_line: 3 }
        await app.cursorMoved({ uri, line: 3 })

        await run('lucaWalk.nextChange')

        expect(lastDiff(host)?.head_uri).toBe(fileUri('src/types.ts'))
    })

    test('Back to the walk reopens the current stop at the change the owner was last on', async () => {
        const { app, host, run } = await openWalk()
        const uri = fileUri('src/core/run.ts')
        await run('lucaWalk.startWalk')
        await run('lucaWalk.nextStop')
        host.active_editor = { uri, start_line: 45, end_line: 45 }
        await app.cursorMoved({ uri, line: 45 })
        await run('lucaWalk.nextChange')
        const elsewhere = fileUri('src/elsewhere.ts')
        host.active_editor = { uri: elsewhere, start_line: 5, end_line: 5 }
        await app.cursorMoved({ uri: elsewhere, line: 5 })

        await run('lucaWalk.backToWalk')

        expect(lastDiff(host)?.head_uri).toBe(uri)
        expect(lastDiff(host)?.reveal_line).toBe(80)
    })

    test('picking stop 3 in the Stops view goes to stop 3', async () => {
        const { host, run, pick } = await openWalk()
        await run('lucaWalk.startWalk')

        await pick(2)

        expect(lastDiff(host)?.head_uri).toBe(fileUri('package.json'))
        expect(descriptions(host)[2]).toBe('current')
    })

    test('a new app on the same walk_dir comes back to stop 2, with stop 1 done', async () => {
        const first = await openWalk()
        await first.run('lucaWalk.startWalk')
        await first.run('lucaWalk.nextStop')

        const again = await openWalk({ save: false })
        const path = join(walk_dir, 'drafts', 'octocat', 'hello-world')
        const drafts = JSON.parse(
            await readFile(join(path, 'pr-12.json'), 'utf8')
        )

        expect(descriptions(again.host)).toEqual(['done', 'current', ''])
        expect(drafts.walk).toEqual({
            current_stop_id: 's2',
            done_stop_ids: ['s1'],
            last_change_id: 'c2-0',
        })
    })
})

describe('a stop whose file is outside the checkout (#752)', () => {
    const refused = (path: string) =>
        `The story's stop "Out" names ${path}, which is outside the checkout of #12, so Luca Walk will not open it.`

    test('a path with .. is refused, never opened', async () => {
        const { host, run } = await openWalk({
            stops: [
                {
                    id: 'o1',
                    title: 'Out',
                    changes: [{ id: 'o1-0', path: '../../secret.ts', line: 1 }],
                },
            ],
        })

        await run('lucaWalk.startWalk')

        expect(host.diffs).toEqual([])
        expect(host.messages).toContainEqual({
            kind: 'error',
            text: refused('../../secret.ts'),
        })
    })

    test('a symlink that leads out of the checkout is refused, never opened', async () => {
        const outside = join(dir, 'secret.ts')
        await writeFile(outside, 'secret\n')
        head_sha = await commitSymlink({
            folder: checkout,
            path: 'src/link.ts',
            target: outside,
        })
        const { host, run } = await openWalk({
            stops: [
                {
                    id: 'o1',
                    title: 'Out',
                    changes: [{ id: 'o1-0', path: 'src/link.ts', line: 1 }],
                },
            ],
        })

        await run('lucaWalk.startWalk')

        expect(host.diffs).toEqual([])
        expect(host.messages).toContainEqual({
            kind: 'error',
            text: refused('src/link.ts'),
        })
    })
})
