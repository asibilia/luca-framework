import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFakeHost } from './testing/fake-host'
import { htmlText } from './testing/html-text'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import {
    makeCheckoutRepo,
    storyOf,
    type FileAt,
    type StopAt,
} from './testing/walk-story'
import { createWalkApp } from './walk-app'

import { savePrivateStory } from '../../engine/src/story/story-store'

/**
 * The map (#758, updated for #800 / spec #776 section 4): panel title,
 * link text formatting, Summary button wiring, legacy open_file routing,
 * and HTML escaping of rendered story fields.
 */

const REPO = 'octocat/hello-world'

const BASE_FILES = {
    'src/cli.ts': 'cli base\n',
    'src/core/run.ts': 'run base\n',
    'src/old.ts': 'old\n',
    'src/before.ts': 'moved\n',
    'src/types.ts': 'types base\n',
    'package.json': '{}\n',
}

const HEAD_FILES = {
    'src/cli.ts': 'cli head\n',
    'src/core/run.ts': 'run head\n',
    'src/new.ts': 'new\n',
    'src/after.ts': 'moved\n',
    'src/types.ts': 'types head\n',
    'package.json': '{ "name": "x" }\n',
}

const STOPS: StopAt[] = [
    {
        id: 's1',
        title: 'Start in the CLI',
        changes: [{ id: 'c1', path: 'src/cli.ts', line: 5 }],
    },
    {
        id: 's2',
        title: 'The new file',
        changes: [{ id: 'c2', path: 'src/new.ts', line: 1 }],
    },
    {
        id: 's3',
        title: 'The run loop',
        changes: [{ id: 'c3', path: 'src/core/run.ts', line: 44 }],
    },
    {
        id: 's4',
        title: 'Gone',
        changes: [{ id: 'c4-0', path: 'src/old.ts', line: 7, side: 'base' }],
    },
    {
        id: 's4b',
        title: 'Moved',
        changes: [{ id: 'c4-1', path: 'src/after.ts', line: 2 }],
    },
    {
        id: 's5',
        title: 'Loose ends',
        loose_ends: true,
        changes: [{ id: 'c5', path: 'package.json', line: 3 }],
    },
]

const FILES: FileAt[] = [
    { path: 'src/new.ts', status: 'added' },
    { path: 'src/old.ts', status: 'deleted' },
    { path: 'src/after.ts', status: 'renamed', previous_path: 'src/before.ts' },
]

let dir = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-map-')))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

const openMap = async ({
    escape_tags = false,
}: {
    escape_tags?: boolean
} = {}) => {
    const walk_dir = join(dir, 'walk')
    const checkout = join(
        walk_dir,
        'checkouts',
        'octocat',
        'hello-world',
        'pr-12'
    )
    const { base_sha, head_sha } = await makeCheckoutRepo({
        folder: checkout,
        base: BASE_FILES,
        head: HEAD_FILES,
    })
    const built = storyOf({
        repo: REPO,
        base_sha,
        head_sha,
        stops: STOPS,
        files: FILES,
    })
    const story = {
        ...built,
        summary: escape_tags
            ? {
                  ...built.summary,
                  feedback_wanted: {
                      ...built.summary.feedback_wanted,
                      text: '<script>alert(1)</script>',
                  },
              }
            : built.summary,
        stops: escape_tags
            ? built.stops.map((stop) => {
                  if (stop.kind === 'loose_ends') return stop
                  return {
                      ...stop,
                      group_id: 'g1',
                      ...(stop.id === 's1'
                          ? {
                                title: '<script>alert(4)</script>',
                                why_here: '<script>alert(5)</script>',
                            }
                          : {}),
                  }
              })
            : built.stops,
        map: {
            ...built.map,
            ...(escape_tags
                ? {
                      groups: [
                          {
                              id: 'g1',
                              title: '<script>alert(2)</script>',
                              note: '<script>alert(3)</script>',
                          },
                      ],
                  }
                : {}),
            links: [
                {
                    from_path: 'src/cli.ts',
                    to_path: 'src/core/run.ts',
                    kind: 'calls' as const,
                    note: escape_tags
                        ? '<script>alert(6)</script>'
                        : 'on every ticket',
                },
                {
                    from_path: 'src/core/run.ts',
                    to_path: 'src/types.ts',
                    kind: 'imports' as const,
                    note: null,
                },
            ],
        },
    }
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
        walk_dir,
        stories_dir: join(dir, 'stories'),
        remote_url: () => join(dir, 'no-origin'),
    })
    await app.activated()
    return { app, host }
}

const mapText = (html: string | undefined) => htmlText({ html: html ?? '' })

describe('the map (#758)', () => {
    test('Show the map opens the Map panel titled with the pull request', async () => {
        const { app, host } = await openMap()

        await app.run({ command: 'lucaWalk.showMap', args: [] })

        expect(host.panels['map']?.title).toBe('Map of #12')
    })

    test('a link shows as from calls to, with its note after a dash', async () => {
        const { app, host } = await openMap()

        await app.run({ command: 'lucaWalk.showMap', args: [] })

        expect(mapText(host.panels['map']?.html)).toMatch(
            /src\/cli\.ts calls src\/core\/run\.ts\s*[-–—]\s*on every ticket/
        )
    })

    test('a link with no note has no dash after it', async () => {
        const { app, host } = await openMap()

        await app.run({ command: 'lucaWalk.showMap', args: [] })

        const text = mapText(host.panels['map']?.html)
        expect(text).toContain('src/core/run.ts imports src/types.ts')
        expect(text).not.toMatch(
            /src\/core\/run\.ts imports src\/types\.ts\s*[-–—]/
        )
    })

    test("clicking a file's box goes to the first stop with a change in that file", async () => {
        const { app, host } = await openMap()
        await app.run({ command: 'lucaWalk.showMap', args: [] })

        await app.panelMessage({
            panel: 'map',
            message: { type: 'open_file', path: 'src/core/run.ts' },
        })

        expect(host.diffs.at(-1)?.title).toBe('src/core/run.ts (#12)')
        expect(host.stops.map(({ description }) => description)[2]).toBe(
            'current'
        )
    })

    test('clicking a file that is only in the loose ends goes to the loose ends stop', async () => {
        const { app, host } = await openMap()
        await app.run({ command: 'lucaWalk.showMap', args: [] })

        await app.panelMessage({
            panel: 'map',
            message: { type: 'open_file', path: 'package.json' },
        })

        expect(host.diffs.at(-1)?.title).toBe('package.json (#12)')
        expect(host.stops.at(-1)?.description).toBe('current')
    })

    test("the Summary panel's Show the map button opens the Map panel", async () => {
        const { app, host } = await openMap()

        await app.panelMessage({
            panel: 'summary',
            message: { type: 'button', id: 'show_map' },
        })

        expect(host.panels['map']?.title).toBe('Map of #12')
    })

    test('rendered story fields with script tags are shown escaped', async () => {
        const { app, host } = await openMap({ escape_tags: true })

        await app.run({ command: 'lucaWalk.showMap', args: [] })

        const html = host.panels['map']?.html ?? ''
        for (const n of [1, 2, 3, 4, 5, 6]) {
            expect(html).toContain(`&lt;script&gt;alert(${n})&lt;/script&gt;`)
            expect(html).not.toContain(`<script>alert(${n})</script>`)
        }
    })
})
