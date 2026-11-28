import {
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    stat,
    utimes,
    writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createBrowseSession } from './browse-session'
import { DraftsSchema, type Drafts } from './drafts-file'
import { createFakeHost, type FakeMessage } from './testing/fake-host'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { makeCheckoutRepo } from './testing/walk-story'
import { createWalkApp } from './walk-app'
import { createWalkSession } from './walk-session'

import { savePrivateStory } from '../../engine/src/story/story-store'
import { groupedStory } from '../../engine/src/story/testing/grouped-story'

/**
 * Looks good per stop, stop_action webview messages, last-stop completion,
 * and onPlaceChanged (#799, spec #776 section 3 and "The last stop").
 */

const REPO = 'octocat/hello-world'
const REF = { repo: REPO, number: 12 }
const LAST_STOP = "That was the last stop. Send the review when you're ready."

const GROUPED = groupedStory()
const S24_FILES =
    GROUPED.stops
        .find(({ id }) => id === 's24')
        ?.changes.map(({ path }) => path) ?? []

const NOISE_PATHS = [
    'bun.lock',
    'src/generated/schema.gen.ts',
    'data/sample-players.json',
    'test/fixtures/players.json',
]

const GROUPED_HEAD_FILES: Record<string, string> = Object.fromEntries(
    GROUPED.map.files.map(({ path }) => [path, `// ${path}\n`])
)

let dir = ''
let walk_dir = ''
let checkout = ''
let base_sha = ''
let head_sha = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-stop-act-')))
    walk_dir = join(dir, 'walk')
    checkout = join(walk_dir, 'checkouts', 'octocat', 'hello-world', 'pr-12')
    const made = await makeCheckoutRepo({
        folder: checkout,
        base: { 'README.md': 'base\n' },
        head: { 'README.md': 'base\n', ...GROUPED_HEAD_FILES },
    })
    base_sha = made.base_sha
    head_sha = made.head_sha
    await testGit({
        args: ['update-ref', 'refs/remotes/origin/main', base_sha],
        cwd: checkout,
    })
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const draftsFile = () => join(walk_dir, 'drafts/octocat/hello-world/pr-12.json')

const readSaved = async (): Promise<Drafts> =>
    DraftsSchema.parse(JSON.parse(await readFile(draftsFile(), 'utf8')))

const groupedForHead = ({ head }: { head: string }) => ({
    ...groupedStory(),
    repo: REPO,
    pr_url: `https://github.com/${REPO}/pull/12`,
    base_sha,
    head_sha: head,
})

const openApp = async ({
    with_story = true,
    save_story = true,
    head = head_sha,
}: {
    with_story?: boolean
    save_story?: boolean
    head?: string
} = {}) => {
    const stories_dir = join(dir, 'stories')
    if (with_story && save_story) {
        await savePrivateStory({
            stories_dir,
            story: groupedForHead({ head }),
        })
    }
    const github = createPretendGitHub({
        login: 'octocat',
        pulls: [
            {
                repo: REPO,
                number: 12,
                title: 'Grouped flow',
                author: 'octocat',
                base_ref: 'main',
                head_sha: head,
                state: 'OPEN',
                labels: [],
                comments: [],
            },
        ],
    })
    const host = createFakeHost({ workspace_folder: checkout })
    let stops_shown = 0
    const showStopsBase = host.showStops
    host.showStops = async (view) => {
        stops_shown += 1
        await showStopsBase(view)
    }
    const app = createWalkApp({
        host,
        gh: github.gh,
        git: testGit,
        walk_dir,
        stories_dir,
        remote_url: () => join(dir, 'no-origin'),
    })
    await app.activated()
    stops_shown = 0
    return {
        app,
        host,
        stopsShown: () => stops_shown,
        resetStopsShown: () => {
            stops_shown = 0
        },
    }
}

describe('This stop looks good (#799)', () => {
    test('marks all 24 files of s24 including noise files before the walk starts and calls onApprovedChanged once', async () => {
        const { app, host, stopsShown } = await openApp()

        await app.run({
            command: 'lucaWalk.markStopLooksGood',
            args: [{ stop_id: 's24' }],
        })

        const saved = await readSaved()
        expect(saved.approved_files).toHaveLength(24)
        expect(saved.approved_files.toSorted()).toEqual(S24_FILES.toSorted())
        for (const noise of NOISE_PATHS) {
            expect(saved.approved_files).toContain(noise)
        }
        expect(stopsShown()).toBe(1)
        expect(host.messages).toEqual([])
    })

    test('a second press on s24 shows the already-good info message, saves nothing, and does not call onApprovedChanged', async () => {
        const { app, host, stopsShown, resetStopsShown } = await openApp()
        await app.run({
            command: 'lucaWalk.markStopLooksGood',
            args: [{ stop_id: 's24' }],
        })
        const past = new Date(Date.now() - 60_000)
        await utimes(draftsFile(), past, past)
        const before_mtime = (await stat(draftsFile())).mtimeMs
        resetStopsShown()

        await app.run({
            command: 'lucaWalk.markStopLooksGood',
            args: [{ stop_id: 's24' }],
        })

        expect(host.messages).toEqual([
            {
                kind: 'info',
                text: 'Every file in this stop already looks good.',
            },
        ])
        expect((await stat(draftsFile())).mtimeMs).toBe(before_mtime)
        expect(stopsShown()).toBe(0)
    })

    test('with the walk on s3 and no argument, marks src/g1/s3.ts', async () => {
        const { app, host } = await openApp()
        await app.stopPicked({ stop_id: 's3' })

        await app.run({ command: 'lucaWalk.markStopLooksGood', args: [] })

        const saved = await readSaved()
        expect(saved.approved_files).toEqual(['src/g1/s3.ts'])
        expect(host.messages).toEqual([])
    })

    test('with a pull request open but no walk or browse started and no argument, shows Start the walk first', async () => {
        const with_story = await openApp()
        await with_story.app.run({
            command: 'lucaWalk.markStopLooksGood',
            args: [],
        })

        const without_story = await openApp({ with_story: false })
        await without_story.app.run({
            command: 'lucaWalk.markStopLooksGood',
            args: [],
        })

        expect(with_story.host.messages).toEqual([
            { kind: 'info', text: 'Start the walk first.' },
        ])
        expect(without_story.host.messages).toEqual([
            { kind: 'info', text: 'Start the walk first.' },
        ])
    })

    test('with an unknown stop_id s99, changes nothing and shows no message', async () => {
        const { app, host, stopsShown, resetStopsShown } = await openApp()
        await app.run({
            command: 'lucaWalk.markStopLooksGood',
            args: [{ stop_id: 's3' }],
        })
        expect((await readSaved()).approved_files).toEqual(['src/g1/s3.ts'])
        resetStopsShown()

        await app.run({
            command: 'lucaWalk.markStopLooksGood',
            args: [{ stop_id: 's99' }],
        })

        expect(host.messages).toEqual([])
        expect(stopsShown()).toBe(0)
        expect((await readSaved()).approved_files).toEqual(['src/g1/s3.ts'])
    })

    test('in the plain-diff browse, marks the current stop file as looking good', async () => {
        const { app, host } = await openApp({ with_story: false })
        await app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'browse_diff' },
        })
        const first_file = host.stops[0]?.stop_id ?? ''

        await app.run({ command: 'lucaWalk.markStopLooksGood', args: [] })

        const saved = await readSaved()
        expect(first_file).not.toBe('')
        expect(saved.approved_files).toEqual([first_file])
        expect(host.stops[0]?.description).toContain('looks good')
    })

    test('on a second visit after marking s24 where only src/loose/file-01.ts changed, only that file loses its mark', async () => {
        const first = await openApp()
        await first.app.run({
            command: 'lucaWalk.markStopLooksGood',
            args: [{ stop_id: 's24' }],
        })
        const first_saved = await readSaved()
        const reviewed_dir = join(walk_dir, 'reviewed/octocat/hello-world')
        await mkdir(reviewed_dir, { recursive: true })
        await writeFile(
            join(reviewed_dir, 'pr-12.json'),
            JSON.stringify({
                schema_version: 1,
                commit: head_sha,
                approved_files: first_saved.approved_files,
            })
        )
        await writeFile(
            join(checkout, 'src/loose/file-01.ts'),
            '// updated in c2\n'
        )
        await testGit({ args: ['add', 'src/loose/file-01.ts'], cwd: checkout })
        await testGit({ args: ['commit', '-q', '-m', 'c2'], cwd: checkout })
        const c2 = (
            await testGit({ args: ['rev-parse', 'HEAD'], cwd: checkout })
        ).stdout.trim()

        await openApp({ head: c2 })

        const after = await readSaved()
        expect(after.approved_files).not.toContain('src/loose/file-01.ts')
        expect(after.approved_files).toHaveLength(23)
        expect(after.approved_files.toSorted()).toEqual(
            S24_FILES.filter(
                (path) => path !== 'src/loose/file-01.ts'
            ).toSorted()
        )
    })
})

describe('WalkSession.filesOf and onPlaceChanged (#799)', () => {
    test('filesOf returns null for s99 and the stop files for s3', async () => {
        const host = createFakeHost({ workspace_folder: checkout })
        const session = await createWalkSession({
            host,
            walk_dir,
            ref: REF,
            checkout,
            story: groupedForHead({ head: head_sha }),
            looksGood: () => false,
        })

        expect(session.filesOf({ stop_id: 's99' })).toBeNull()
        expect(session.filesOf({ stop_id: 's3' })).toEqual(['src/g1/s3.ts'])
    })

    test('onPlaceChanged fires once after entering a stop, Next, Back, Back on the first stop, and Next on the last stop', async () => {
        const host = createFakeHost({ workspace_folder: checkout })
        const full = groupedForHead({ head: head_sha })
        const two_stops = {
            ...full,
            stops: full.stops.slice(0, 2),
        }
        let calls = 0
        const session = await createWalkSession({
            host,
            walk_dir,
            ref: REF,
            checkout,
            story: two_stops,
            looksGood: () => false,
            onPlaceChanged: async () => {
                calls += 1
            },
        })

        await session.start()
        expect(calls).toBe(1)

        await session.nextStop()
        expect(calls).toBe(2)

        await session.previousStop()
        expect(calls).toBe(3)

        await session.previousStop()
        expect(calls).toBe(4)

        await session.nextStop()
        expect(calls).toBe(5)

        await session.nextStop()
        expect(calls).toBe(6)
    })

    test('browse session onPlaceChanged fires once after entering a stop, Next, Back, Back on the first stop, and Next on the last stop', async () => {
        const browse_checkout = join(dir, 'browse-checkout')
        const made = await makeCheckoutRepo({
            folder: browse_checkout,
            base: { 'src/a.ts': 'a0\n', 'src/b.ts': 'b0\n' },
            head: { 'src/a.ts': 'a1\n', 'src/b.ts': 'b1\n' },
        })
        const host = createFakeHost({ workspace_folder: browse_checkout })
        let calls = 0
        const session = await createBrowseSession({
            host,
            git: testGit,
            walk_dir,
            ref: REF,
            checkout: browse_checkout,
            base_sha: made.base_sha,
            head_sha: made.head_sha,
            looksGood: () => false,
            onPlaceChanged: async () => {
                calls += 1
            },
        })
        expect(session).not.toBeNull()
        if (session === null) return

        await session.start()
        expect(calls).toBe(1)

        await session.nextStop()
        expect(calls).toBe(2)

        await session.previousStop()
        expect(calls).toBe(3)

        await session.previousStop()
        expect(calls).toBe(4)

        await session.nextStop()
        expect(calls).toBe(5)

        await session.nextStop()
        expect(calls).toBe(6)
    })
})

describe('stop_action panel messages (#799)', () => {
    test('open on s5 opens change c5', async () => {
        const { app, host } = await openApp()

        await app.panelMessage({
            panel: 'map',
            message: { type: 'stop_action', action: 'open', stop_id: 's5' },
        })

        const saved = await readSaved()
        expect(host.diffs.at(-1)?.title).toBe('src/g1/s5.ts (#12)')
        expect(saved.walk.current_stop_id).toBe('s5')
        expect(saved.walk.last_change_id).toBe('c5')
    })

    test('mark_looks_good on s3 adds src/g1/s3.ts to approved_files', async () => {
        const { app } = await openApp()

        await app.panelMessage({
            panel: 'map',
            message: {
                type: 'stop_action',
                action: 'mark_looks_good',
                stop_id: 's3',
            },
        })

        const saved = await readSaved()
        expect(saved.approved_files).toEqual(['src/g1/s3.ts'])
    })

    test('walk_next on s23 makes s24 the current stop', async () => {
        const { app, host } = await openApp()

        await app.panelMessage({
            panel: 'map',
            message: {
                type: 'stop_action',
                action: 'walk_next',
                stop_id: 's23',
            },
        })

        const saved = await readSaved()
        expect(saved.walk.current_stop_id).toBe('s24')
        expect(saved.walk.done_stop_ids).toContain('s23')
        expect(
            host.stops.find(({ stop_id }) => stop_id === 's24')?.description
        ).toBe('current')
    })

    test('walk_next on s24 shows the last-stop message and leaves s24 in done_stop_ids', async () => {
        const { app, host } = await openApp()

        await app.panelMessage({
            panel: 'map',
            message: {
                type: 'stop_action',
                action: 'walk_next',
                stop_id: 's24',
            },
        })

        const saved = await readSaved()
        expect(host.messages).toContainEqual({ kind: 'info', text: LAST_STOP })
        expect(saved.walk.done_stop_ids).toContain('s24')
    })

    test('stop_action with unknown stop_id s99 changes nothing', async () => {
        const { app, host } = await openApp()
        await app.panelMessage({
            panel: 'map',
            message: { type: 'stop_action', action: 'open', stop_id: 's1' },
        })
        expect((await readSaved()).walk.current_stop_id).toBe('s1')
        const opened = host.diffs.length
        const actions: ('open' | 'mark_looks_good' | 'walk_next')[] = [
            'open',
            'mark_looks_good',
            'walk_next',
        ]

        for (const action of actions) {
            await app.panelMessage({
                panel: 'map',
                message: { type: 'stop_action', action, stop_id: 's99' },
            })
        }

        const saved = await readSaved()
        expect(host.diffs).toHaveLength(opened)
        expect(host.messages).toEqual([])
        expect(saved.walk.current_stop_id).toBe('s1')
        expect(saved.approved_files).toEqual([])
    })
})

describe('Next on the last stop (#799)', () => {
    test('Next on the last stop to walk adds it to done_stop_ids before the last-stop message and keeps it after reopen', async () => {
        const { app, host } = await openApp()
        await app.stopPicked({ stop_id: 's24' })
        let done_before_message: string[] | null = null
        const showMessageBase = host.showMessage
        host.showMessage = async (message: FakeMessage) => {
            if (message.text === LAST_STOP) {
                done_before_message = (await readSaved()).walk.done_stop_ids
            }
            await showMessageBase(message)
        }

        await app.run({ command: 'lucaWalk.nextStop', args: [] })

        expect(host.messages).toContainEqual({ kind: 'info', text: LAST_STOP })
        expect(done_before_message).toContain('s24')

        await openApp({ save_story: false })
        expect((await readSaved()).walk.done_stop_ids).toContain('s24')
    })

    test('Next on the browse last stop adds it to done_stop_ids before the last-stop message and keeps it after reopen', async () => {
        const { app, host } = await openApp({ with_story: false })
        await app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'browse_diff' },
        })
        const last_stop_id = host.stops.at(-1)?.stop_id ?? ''
        expect(last_stop_id).not.toBe('')
        await app.stopPicked({ stop_id: last_stop_id })
        let done_before_message: string[] | null = null
        const showMessageBase = host.showMessage
        host.showMessage = async (message: FakeMessage) => {
            if (message.text === LAST_STOP) {
                done_before_message = (await readSaved()).walk.done_stop_ids
            }
            await showMessageBase(message)
        }

        await app.run({ command: 'lucaWalk.nextStop', args: [] })

        expect(host.messages).toContainEqual({ kind: 'info', text: LAST_STOP })
        expect(done_before_message).toContain(last_stop_id)

        const reopened = await openApp({ with_story: false })
        await reopened.app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'browse_diff' },
        })
        expect((await readSaved()).walk.done_stop_ids).toContain(last_stop_id)
    })
})
