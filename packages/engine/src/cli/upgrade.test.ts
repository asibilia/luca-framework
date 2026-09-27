import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runUpgrade } from './upgrade'

import { startRun } from '../core/execute'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

/**
 * `luca upgrade` end to end (seam 4): a throwaway home folder with Luca's
 * install folder in it, run state (journals and a board registry) in temp
 * folders, and fakes behind the adapters for npm's registry lookups,
 * `bun add -g`, and Paseo's plugins and their settings. The Bun and Paseo
 * fakes write what they did to one event list, in order.
 */

const PACKAGE = '@alecsibilia/luca'

/** The board plugin's id in Paseo. */
const BOARD_ID = 'luca-board'

let home = ''
let runs_dir = ''
let registry_path = ''
/** Luca's install folder, as `bun add -g` leaves it. */
let luca_dir = ''
/** The board folder inside Luca's install folder. */
let board_dir = ''
/** The real path of the installed `luca-run`. */
let engine_path = ''
/** Bun's own path. */
const bun_path = realpathSync(process.execPath)
/** What the fake Bun and the fake Paseo were asked to do, in order. */
const events: string[] = []
const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

beforeEach(async () => {
    home = realpathSync(await mkdtemp(join(tmpdir(), 'luca-upgrade-home-')))
    runs_dir = join(home, '.local', 'state', 'luca', 'runs')
    registry_path = join(home, 'board-state', 'runs.json')
    luca_dir = join(
        home,
        '.bun',
        'install',
        'global',
        'node_modules',
        '@alecsibilia',
        'luca'
    )
    board_dir = join(luca_dir, 'board')
    engine_path = join(luca_dir, 'engine', 'cli', 'luca-run.ts')
    await mkdir(board_dir, { recursive: true })
    await Bun.write(
        join(board_dir, 'paseo-plugin.json'),
        JSON.stringify({ id: BOARD_ID })
    )
    await mkdir(join(luca_dir, 'engine', 'cli'), { recursive: true })
    await Bun.write(engine_path, '#!/usr/bin/env bun\n')
    events.length = 0
    logs.length = 0
})

afterEach(async () => {
    await rm(home, { recursive: true, force: true })
})

/**
 * A fake npm registry for `@alecsibilia/luca`: its dist-tags, and every
 * version published.
 */
const fakeNpm = ({
    dist_tags,
    versions = [],
}: {
    dist_tags: Record<string, string>
    versions?: string[]
}) => ({
    distTags: async () => ({ ...dist_tags }),
    versions: async () => [
        ...new Set([...versions, ...Object.values(dist_tags)]),
    ],
})

/** A fake `bun add -g`: keeps every package spec it was asked to install. */
const fakeBun = () => {
    const specs: string[] = []
    return {
        bun: {
            addGlobal: async ({ spec }: { spec: string }) => {
                events.push(`bun add -g ${spec}`)
                specs.push(spec)
            },
        },
        /** Every package spec installed, in order. */
        installed: () => [...specs],
    }
}

/** One installed Paseo plugin: its id and the folder it was installed from. */
type Plugin = { id: string; path: string }

type Settings = Record<string, unknown>

/**
 * A fake Paseo: its plugins, whether plugins are on, and each plugin's
 * settings. As in the real one, installing an id that is already there
 * fails, removing a plugin wipes its settings, and a new install starts
 * with none.
 */
const fakePaseo = ({
    plugins = [],
    settings = {},
}: {
    plugins?: Plugin[]
    settings?: Record<string, Settings>
} = {}) => {
    const store: Plugin[] = plugins.map((plugin) => ({ ...plugin }))
    const saved = new Map<string, Settings>(
        Object.entries(settings).map(([id, values]) => [id, { ...values }])
    )
    const at = (id: string) => store.findIndex((plugin) => plugin.id === id)
    const mustExist = (id: string) => {
        if (at(id) === -1) throw new Error(`No plugin ${id} is installed`)
    }
    return {
        paseo: {
            pluginsEnabled: async () => true,
            enablePlugins: async () => {
                events.push('paseo enable plugins')
            },
            listPlugins: async () => store.map((plugin) => ({ ...plugin })),
            installPlugin: async ({
                path,
                id,
            }: {
                path: string
                id: string
            }) => {
                events.push(`paseo install ${id} ${path}`)
                if (at(id) !== -1) {
                    throw new Error(`Plugin ${id} is already installed`)
                }
                store.push({ id, path })
                saved.set(id, {})
            },
            reloadPlugin: async ({ id }: { id: string }) => {
                events.push(`paseo reload ${id}`)
                mustExist(id)
            },
            removePlugin: async ({ id }: { id: string }) => {
                events.push(`paseo remove ${id}`)
                mustExist(id)
                store.splice(at(id), 1)
                saved.delete(id)
            },
            readSettings: async ({
                plugin_id,
            }: {
                plugin_id: string
            }): Promise<Settings> => {
                events.push(`paseo read settings ${plugin_id}`)
                mustExist(plugin_id)
                return { ...(saved.get(plugin_id) ?? {}) }
            },
            writeSettings: async ({
                plugin_id,
                values,
            }: {
                plugin_id: string
                values: Settings
            }) => {
                events.push(`paseo write settings ${plugin_id}`)
                mustExist(plugin_id)
                saved.set(plugin_id, { ...values })
            },
        },
        /** Every installed plugin now. */
        plugins: () => store.map((plugin) => ({ ...plugin })),
        /** A plugin's settings now, or `null` when it has none. */
        settings: (id: string): Settings | null => {
            const values = saved.get(id)
            return values === undefined ? null : { ...values }
        },
    }
}

/** The settings a user tuned on the board: its usage lines. */
const TUNED_LINES = { weekly_line: 55, five_hour_line: 65 }

/** The board as `luca init` left it: from the install folder, tuned. */
const installedBoard = () =>
    fakePaseo({
        plugins: [{ id: BOARD_ID, path: board_dir }],
        settings: {
            [BOARD_ID]: { engine_path, bun_path, ...TUNED_LINES },
        },
    })

type Fakes = {
    npm: ReturnType<typeof fakeNpm>
    bun: ReturnType<typeof fakeBun>
    paseo: ReturnType<typeof fakePaseo>
}

const upgrade = ({
    fakes,
    installed_version,
    to = null,
}: {
    fakes: Fakes
    /** The version of Luca installed now. */
    installed_version: string
    /** `--to <version>`, or `null` without it. */
    to?: string | null
}) =>
    runUpgrade({
        to,
        installed_version,
        runs_dir,
        registry_path,
        npm: fakes.npm,
        bun: fakes.bun.bun,
        paseo: fakes.paseo.paseo,
        board_dir,
        engine_path,
        bun_path,
        log,
    })

/** Everything the command printed, its end message included. */
const printed = (end: { message: string }): string =>
    [...logs, end.message].join('\n')

/** The `bun add -g` calls, in order. */
const bunAdds = (): string[] =>
    events.filter((event) => event.startsWith('bun add -g '))

/** What the fake Paseo was asked to change, leaving out reads. */
const paseoChanges = (): string[] =>
    events.filter(
        (event) =>
            event.startsWith('paseo ') && !event.startsWith('paseo read ')
    )

/** A run journal that started spec `spec_number` in `run_repo`, then got `entries`. */
const writeRun = ({
    run_id,
    spec_number,
    run_repo,
    entries = [],
}: {
    run_id: string
    spec_number: number
    run_repo: string
    entries?: JournalEntry[]
}) => {
    const journal = createJournal({
        file: runJournalPath({ runs_dir, run_id }),
    })
    startRun({
        journal,
        spec_number,
        config: PRACTICE_ENGINE_CONFIG,
        repo: run_repo,
    })
    for (const entry of entries) journal.append(entry)
}

/** A run that is waiting out a plan limit. */
const LIMIT_WAIT: JournalEntry = {
    kind: 'limit_wait_started',
    ticket: null,
    role: null,
    content: {
        resets_at: '2026-09-26T15:00:00.000Z',
        until: '2026-09-26T15:01:00.000Z',
        rate_limit_type: 'five_hour',
        hit_ticket: 11,
        hit_role: 'implementer',
    },
}

/** A stuck ticket, reported, so its run waits for a reply. */
const STUCK: JournalEntry[] = [
    {
        kind: 'ticket_stuck',
        ticket: 21,
        role: null,
        content: { reason: 'gates_failed', detail: 'lint failed' },
    },
    {
        kind: 'stuck_reported',
        ticket: 21,
        role: null,
        content: { comment_id: 5, body: 'Ticket #21 is stuck.' },
    },
]

/** A board registry entry; `ended` is `null` while its run may still go. */
const registryEntry = ({
    run_id,
    spec,
    run_repo,
    ended,
}: {
    run_id: string
    spec: number
    run_repo: string
    ended: { ok: boolean; message: string } | null
}) => ({
    run_id,
    token: 'secret',
    agent_id: 'agent-1',
    workspace_id: 'workspace-1',
    repo: run_repo,
    spec,
    demo: false,
    started_at: '2026-09-26T10:00:00.000Z',
    log_path: `/tmp/${run_id}.log`,
    ended,
    restarts: 0,
})

const writeRegistry = async ({ runs }: { runs: object[] }) => {
    await Bun.write(
        registry_path,
        JSON.stringify({ version: 1, runs }, null, 2)
    )
}

/** An alpha channel ahead of a `latest` still on v13, as before the `tmnb` gate. */
const ALPHA_TAGS = { latest: '13.0.1', alpha: '14.0.0-alpha.5' }

const freshFakes = ({
    dist_tags = ALPHA_TAGS,
    versions = [],
}: {
    dist_tags?: Record<string, string>
    versions?: string[]
} = {}): Fakes => ({
    npm: fakeNpm({ dist_tags, versions }),
    bun: fakeBun(),
    paseo: installedBoard(),
})

describe('luca upgrade refuses while a run is going', () => {
    test('a going run, a run in a limit wait, a stuck run, and a board run are listed by spec and repo, and nothing is installed', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-going',
            spec_number: 5,
            run_repo: '/code/busy',
        })
        writeRun({
            run_id: 'run-limit',
            spec_number: 10,
            run_repo: '/code/app',
            entries: [LIMIT_WAIT],
        })
        writeRun({
            run_id: 'run-stuck',
            spec_number: 20,
            run_repo: '/code/other',
            entries: STUCK,
        })
        await writeRegistry({
            runs: [
                registryEntry({
                    run_id: 'run-board',
                    spec: 42,
                    run_repo: '/code/tmnb',
                    ended: null,
                }),
            ],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(false)
        const text = printed(end)
        for (const shown of [
            '#5',
            '/code/busy',
            '#10',
            '/code/app',
            '#20',
            '/code/other',
            '#42',
            '/code/tmnb',
        ]) {
            expect(text).toContain(shown)
        }
        expect(bunAdds()).toEqual([])
        expect(fakes.bun.installed()).toEqual([])
        expect(paseoChanges()).toEqual([])
    })

    test('a run in a limit wait alone is enough to refuse, and is listed by spec and repo', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-limit',
            spec_number: 10,
            run_repo: '/code/app',
            entries: [LIMIT_WAIT],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(false)
        expect(printed(end)).toContain('#10')
        expect(printed(end)).toContain('/code/app')
        expect(bunAdds()).toEqual([])
        expect(paseoChanges()).toEqual([])
    })

    test('a stuck run waiting for a reply alone is enough to refuse, and is listed by spec and repo', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-stuck',
            spec_number: 20,
            run_repo: '/code/other',
            entries: STUCK,
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(false)
        expect(printed(end)).toContain('#20')
        expect(printed(end)).toContain('/code/other')
        expect(bunAdds()).toEqual([])
        expect(paseoChanges()).toEqual([])
    })

    test('a run paused at the usage line alone is enough to refuse, and is listed by spec and repo', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-usage-line',
            spec_number: 30,
            run_repo: '/code/paused',
            entries: [
                {
                    kind: 'usage_line_wait_started',
                    ticket: null,
                    role: null,
                    content: {
                        window: 'seven_day',
                        line: 80,
                        percent: 81,
                        resets_at: '2026-09-28T12:00:00.000Z',
                        until: '2026-09-28T12:01:00.000Z',
                    },
                },
            ],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(false)
        expect(printed(end)).toContain('#30')
        expect(printed(end)).toContain('/code/paused')
        expect(bunAdds()).toEqual([])
        expect(fakes.bun.installed()).toEqual([])
        expect(paseoChanges()).toEqual([])
    })

    test('a run stuck on its run budget, waiting for a reply, alone is enough to refuse, and is listed by spec and repo', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-budget',
            spec_number: 40,
            run_repo: '/code/spent',
            entries: [
                {
                    kind: 'run_stuck',
                    ticket: null,
                    role: null,
                    content: {
                        reason: 'run_budget',
                        detail: 'The run used 50,000 tokens of its 50,000 budget.',
                    },
                },
                {
                    kind: 'stuck_reported',
                    ticket: null,
                    role: null,
                    content: { comment_id: 7, body: 'The run is stuck.' },
                },
            ],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(false)
        expect(printed(end)).toContain('#40')
        expect(printed(end)).toContain('/code/spent')
        expect(bunAdds()).toEqual([])
        expect(fakes.bun.installed()).toEqual([])
        expect(paseoChanges()).toEqual([])
    })

    test('a going run also stops upgrade --to', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-going',
            spec_number: 5,
            run_repo: '/code/busy',
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
            to: '14.0.0-alpha.1',
        })

        expect(end.ok).toBe(false)
        expect(printed(end)).toContain('#5')
        expect(printed(end)).toContain('/code/busy')
        expect(bunAdds()).toEqual([])
        expect(paseoChanges()).toEqual([])
    })

    test('finished runs, in journals or the board registry, do not stop an upgrade', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-done',
            spec_number: 10,
            run_repo: '/code/app',
            entries: [
                {
                    kind: 'nothing_to_do',
                    ticket: null,
                    role: null,
                    content: { closed_tickets: [] },
                },
            ],
        })
        await writeRegistry({
            runs: [
                registryEntry({
                    run_id: 'run-done',
                    spec: 10,
                    run_repo: '/code/app',
                    ended: { ok: true, message: 'Nothing to do.' },
                }),
            ],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(true)
        expect(bunAdds()).toEqual([`bun add -g ${PACKAGE}@14.0.0-alpha.5`])
    })
})

describe('luca upgrade stays on the installed version channel', () => {
    test('an alpha install upgrades to the newest alpha, even when latest is 13.x', async () => {
        const fakes = freshFakes({
            dist_tags: { latest: '13.0.1', alpha: '14.0.0-alpha.5' },
            versions: ['13.0.0', '13.0.1', '14.0.0-alpha.3', '14.0.0-alpha.4'],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(true)
        expect(fakes.bun.installed()).toEqual([`${PACKAGE}@14.0.0-alpha.5`])
    })

    test('an alpha install upgrades to the alpha tag even when latest is a newer v14', async () => {
        const fakes = freshFakes({
            dist_tags: { latest: '14.1.0', alpha: '14.2.0-alpha.0' },
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.1.0-alpha.2',
        })

        expect(end.ok).toBe(true)
        expect(fakes.bun.installed()).toEqual([`${PACKAGE}@14.2.0-alpha.0`])
    })

    test('a non-alpha install upgrades to latest, not to a newer alpha', async () => {
        const fakes = freshFakes({
            dist_tags: { latest: '14.1.0', alpha: '14.2.0-alpha.1' },
            versions: ['14.0.0', '14.1.0'],
        })

        const end = await upgrade({ fakes, installed_version: '14.0.0' })

        expect(end.ok).toBe(true)
        expect(fakes.bun.installed()).toEqual([`${PACKAGE}@14.1.0`])
    })

    test('without --to, a v14 install never gets 13.x when latest is 13.x', async () => {
        const fakes = freshFakes({
            dist_tags: { latest: '13.0.1', alpha: '14.0.0-alpha.5' },
        })

        await upgrade({ fakes, installed_version: '14.0.0' })

        for (const spec of fakes.bun.installed()) {
            expect(spec).not.toStartWith(`${PACKAGE}@13.`)
        }
        for (const event of bunAdds()) {
            expect(event).not.toContain('@13.')
        }
    })

    test('without --to, an alpha install with no alpha tag never falls back to a 13.x latest', async () => {
        const fakes = freshFakes({ dist_tags: { latest: '13.0.1' } })

        await upgrade({ fakes, installed_version: '14.0.0-alpha.3' })

        for (const spec of fakes.bun.installed()) {
            expect(spec).not.toStartWith(`${PACKAGE}@13.`)
        }
        for (const event of bunAdds()) {
            expect(event).not.toContain('@13.')
        }
    })
})

describe('luca upgrade --to', () => {
    test('installs an exact older alpha', async () => {
        const fakes = freshFakes({
            versions: ['14.0.0-alpha.1', '14.0.0-alpha.2', '14.0.0-alpha.3'],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
            to: '14.0.0-alpha.1',
        })

        expect(end.ok).toBe(true)
        expect(fakes.bun.installed()).toEqual([`${PACKAGE}@14.0.0-alpha.1`])
    })

    test('installs an exact older stable version, off the installed channel', async () => {
        const fakes = freshFakes({
            dist_tags: { latest: '14.2.0', alpha: '14.3.0-alpha.0' },
            versions: ['14.0.0', '14.1.0', '14.2.0'],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.3.0-alpha.0',
            to: '14.1.0',
        })

        expect(end.ok).toBe(true)
        expect(fakes.bun.installed()).toEqual([`${PACKAGE}@14.1.0`])
    })

    test('installs 13.x when asked for it exactly', async () => {
        const fakes = freshFakes({ versions: ['13.0.0', '13.0.1'] })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
            to: '13.0.1',
        })

        expect(end.ok).toBe(true)
        expect(fakes.bun.installed()).toEqual([`${PACKAGE}@13.0.1`])
    })
})

describe('luca upgrade reloads the board', () => {
    test('after bun add -g, the board is reloaded from the Luca install folder, not removed or installed again', async () => {
        const fakes = freshFakes()

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(true)
        const added = events.indexOf(`bun add -g ${PACKAGE}@14.0.0-alpha.5`)
        const reloaded = events.indexOf(`paseo reload ${BOARD_ID}`)
        expect(added).not.toBe(-1)
        expect(reloaded).not.toBe(-1)
        expect(added).toBeLessThan(reloaded)
        expect(events).not.toContain(`paseo remove ${BOARD_ID}`)
        expect(
            events.filter((event) => event.startsWith('paseo install '))
        ).toEqual([])
        expect(fakes.paseo.plugins()).toEqual([
            { id: BOARD_ID, path: board_dir },
        ])
    })

    test('the board settings, usage lines included, are kept, and its engine and Bun paths are rewritten after the install', async () => {
        const paseo = fakePaseo({
            plugins: [{ id: BOARD_ID, path: board_dir }],
            settings: {
                [BOARD_ID]: {
                    engine_path: '/old/luca-run.ts',
                    bun_path: '/old/bun',
                    ...TUNED_LINES,
                },
            },
        })
        const fakes = { ...freshFakes(), paseo }

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(true)
        expect(paseo.settings(BOARD_ID)).toEqual({
            engine_path,
            bun_path,
            ...TUNED_LINES,
        })
        expect(
            events.indexOf(`bun add -g ${PACKAGE}@14.0.0-alpha.5`)
        ).toBeLessThan(events.lastIndexOf(`paseo write settings ${BOARD_ID}`))
    })

    test('upgrade --to also reloads the board with its settings kept and paths rewritten', async () => {
        const paseo = fakePaseo({
            plugins: [{ id: BOARD_ID, path: board_dir }],
            settings: {
                [BOARD_ID]: {
                    engine_path: '/old/luca-run.ts',
                    bun_path: '/old/bun',
                    ...TUNED_LINES,
                },
            },
        })
        const fakes = { ...freshFakes(), paseo }

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
            to: '14.0.0-alpha.1',
        })

        expect(end.ok).toBe(true)
        expect(events).toContain(`paseo reload ${BOARD_ID}`)
        expect(events).not.toContain(`paseo remove ${BOARD_ID}`)
        expect(paseo.settings(BOARD_ID)).toEqual({
            engine_path,
            bun_path,
            ...TUNED_LINES,
        })
    })
})
