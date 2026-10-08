import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { skillDrift } from './luca-skills'
import { runUpgrade, type NewInstall } from './upgrade'
import { finishUpgrade } from './upgrade-finish'

import { startRun } from '../core/execute'
import { createJournal, runJournalPath } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

/**
 * `luca upgrade` end to end (seam 4): a throwaway home folder with Luca's
 * install folder in it, run state (journals and a board registry) in temp
 * folders, and fakes behind the adapters for npm's registry lookups,
 * `bun add -g`, Paseo's plugins and their settings, and the new install
 * that finishes the upgrade (#529). The Bun, Paseo, and new-install fakes
 * write what they did to one event list, in order.
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
/** The skills folder inside Luca's install folder. */
let skills_dir = ''
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
/** Every process's command line, as `ps` would list them. */
const processes: string[] = []
/** When set, listing the processes fails with this message. */
let ps_error: string | null = null

/** A live engine for `run_id`, as `ps` shows the board's launch of it. */
const engineRunning = ({
    run_id,
    flag = '--run-id',
}: {
    run_id: string
    flag?: '--run-id' | '--resume'
}) => {
    processes.push(
        `/home/me/.bun/bin/bun --no-env-file ${engine_path} ${flag} ${run_id} --repo /code --board-plugin luca-board`
    )
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
    skills_dir = join(luca_dir, 'skills')
    engine_path = join(luca_dir, 'engine', 'cli', 'luca-run.ts')
    await Bun.write(
        join(skills_dir, 'luca-unstick', 'SKILL.md'),
        '---\nname: luca-unstick\n---\nOld text.\n'
    )
    await Bun.write(
        join(skills_dir, 'luca-retro', 'SKILL.md'),
        '---\nname: luca-retro\n---\nOld text.\n'
    )
    await mkdir(board_dir, { recursive: true })
    await Bun.write(
        join(board_dir, 'paseo-plugin.json'),
        JSON.stringify({ id: BOARD_ID })
    )
    await mkdir(join(luca_dir, 'engine', 'cli'), { recursive: true })
    await Bun.write(engine_path, '#!/usr/bin/env bun\n')
    events.length = 0
    logs.length = 0
    processes.length = 0
    ps_error = null
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

/**
 * A fake new install that can finish an upgrade, as `luca upgrade --finish`
 * does in its own process: it runs the last steps with the same fakes, and
 * exits 0 when they went well.
 */
const handsOff = ({ fakes }: { fakes: Fakes }): NewInstall => ({
    finish: async ({ version, board_before }) => {
        events.push(`hand off to ${version}`)
        const end = await finishUpgrade({
            version,
            board_before,
            home,
            paseo: fakes.paseo.paseo,
            board_dir,
            skills_dir,
            engine_path,
            bun_path,
            log,
        })
        return { handed_off: true, exit_code: end.ok ? 0 : 1 }
    },
})

/** A fake new install that can't finish an upgrade, such as one from before #529. */
const cantHandOff = ({ why }: { why: string }): NewInstall => ({
    finish: async ({ version }) => {
        events.push(`hand off to ${version}`)
        return { handed_off: false, why }
    },
})

const upgrade = ({
    fakes,
    installed_version,
    to = null,
    new_install = handsOff({ fakes }),
}: {
    fakes: Fakes
    /** The version of Luca installed now. */
    installed_version: string
    /** `--to <version>`, or `null` without it. */
    to?: string | null
    /** The new install; by default one that finishes the upgrade. */
    new_install?: NewInstall
}) =>
    runUpgrade({
        to,
        home,
        installed_version,
        runs_dir,
        registry_path,
        npm: fakes.npm,
        bun: fakes.bun.bun,
        paseo: fakes.paseo.paseo,
        board_dir,
        skills_dir,
        engine_path,
        bun_path,
        new_install,
        list_processes: async () => {
            if (ps_error !== null) throw new Error(ps_error)
            return [...processes]
        },
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
    restarts = 0,
    demo = false,
}: {
    run_id: string
    spec: number
    run_repo: string
    ended: { ok: boolean; message: string } | null
    restarts?: number
    demo?: boolean
}) => ({
    run_id,
    token: 'secret',
    agent_id: 'agent-1',
    workspace_id: 'workspace-1',
    repo: run_repo,
    spec,
    demo,
    started_at: '2026-09-26T10:00:00.000Z',
    log_path: `/tmp/${run_id}.log`,
    ended,
    restarts,
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
    test('a going run, a run in a limit wait, a stuck run, and a board run, each with a live engine, are listed by spec and repo, and nothing is installed', async () => {
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
        for (const run_id of ['run-going', 'run-limit', 'run-stuck']) {
            engineRunning({ run_id })
        }
        // A restarted engine names its run with --resume.
        engineRunning({ run_id: 'run-board', flag: '--resume' })

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
        engineRunning({ run_id: 'run-limit' })

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
        engineRunning({ run_id: 'run-stuck' })

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
        engineRunning({ run_id: 'run-usage-line' })

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
        engineRunning({ run_id: 'run-budget' })

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
        engineRunning({ run_id: 'run-going' })

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

describe('luca upgrade and runs whose engine is gone (#491)', () => {
    test('a crashed run with no engine does not stop the upgrade, and the upgrade says how to resume it on the new version', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-crashed',
            spec_number: 7,
            run_repo: '/code/app',
        })
        // Another run's engine, whose id only starts the same way.
        engineRunning({ run_id: 'run-crashed-2', flag: '--resume' })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(true)
        expect(bunAdds()).toEqual([`bun add -g ${PACKAGE}@14.0.0-alpha.5`])
        const text = printed(end)
        expect(text).toContain('#7')
        expect(text).toContain('/code/app')
        expect(text).toContain('luca-run --resume run-crashed')
        expect(text).toContain('new version')
    })

    test('a board run that crashed (ended in the registry) does not stop the upgrade, and says to resume it with /luca-run resume', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'luca-20260928-124805-69hp',
            spec_number: 133,
            run_repo: '/code/heartgold',
        })
        await writeRegistry({
            runs: [
                registryEntry({
                    run_id: 'luca-20260928-124805-69hp',
                    spec: 133,
                    run_repo: '/code/heartgold',
                    ended: {
                        ok: false,
                        message:
                            'The engine crashed: Directories cannot be read like files',
                    },
                }),
            ],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(true)
        expect(bunAdds()).toEqual([`bun add -g ${PACKAGE}@14.0.0-alpha.5`])
        expect(printed(end)).toContain(
            '/luca-run resume luca-20260928-124805-69hp'
        )
    })

    test('a board run whose engine is gone but that the board will restart stops the upgrade', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-board',
            spec_number: 42,
            run_repo: '/code/tmnb',
        })
        await writeRegistry({
            runs: [
                registryEntry({
                    run_id: 'run-board',
                    spec: 42,
                    run_repo: '/code/tmnb',
                    ended: null,
                    restarts: 1,
                }),
            ],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(false)
        expect(printed(end)).toContain('#42')
        expect(printed(end)).toContain('the board will restart it')
        expect(bunAdds()).toEqual([])
    })

    test('a board run whose automatic restarts are used up does not stop the upgrade', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-board',
            spec_number: 42,
            run_repo: '/code/tmnb',
        })
        await writeRegistry({
            runs: [
                registryEntry({
                    run_id: 'run-board',
                    spec: 42,
                    run_repo: '/code/tmnb',
                    ended: null,
                    restarts: 3,
                }),
            ],
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(true)
        expect(printed(end)).toContain('/luca-run resume run-board')
    })

    test('when ps fails, every unfinished run counts as going, and the upgrade is refused', async () => {
        const fakes = freshFakes()
        writeRun({
            run_id: 'run-crashed',
            spec_number: 7,
            run_repo: '/code/app',
        })
        ps_error = 'ps: not found'

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(false)
        const text = printed(end)
        expect(text).toContain('#7')
        expect(text).toContain('ps: not found')
        expect(bunAdds()).toEqual([])
        expect(paseoChanges()).toEqual([])
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

describe("luca upgrade copies Luca's own skills (#504)", () => {
    const installedSkill = (file: string) =>
        Bun.file(join(home, '.claude', 'skills', 'luca-unstick', file))

    test("after bun add -g, the new install's /luca-unstick replaces the old copy, and other skills stay", async () => {
        await Bun.write(installedSkill('SKILL.md'), 'An old copy.\n')
        const other = join(home, '.claude', 'skills', 'to-spec', 'SKILL.md')
        await Bun.write(other, 'Mine.\n')
        const fakes = freshFakes()
        // `bun add -g` puts the new version's files in the install folder.
        const new_text = '---\nname: luca-unstick\n---\nNew text.\n'
        fakes.bun.bun.addGlobal = async ({ spec }: { spec: string }) => {
            events.push(`bun add -g ${spec}`)
            await Bun.write(
                join(skills_dir, 'luca-unstick', 'SKILL.md'),
                new_text
            )
        }

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(true)
        expect(await installedSkill('SKILL.md').text()).toBe(new_text)
        expect(await Bun.file(other).text()).toBe('Mine.\n')
        expect(logs.join('\n')).toContain(
            "[luca upgrade] Luca's skills: installed /luca-retro, /luca-unstick"
        )
    })

    test('a refused upgrade copies nothing', async () => {
        const fakes = freshFakes()
        engineRunning({ run_id: 'run-going' })
        writeRun({
            run_id: 'run-going',
            spec_number: 7,
            run_repo: '/code/app',
        })

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end.ok).toBe(false)
        expect(await installedSkill('SKILL.md').exists()).toBe(false)
    })
})

describe('luca upgrade finishes on the version it installed (#529)', () => {
    /** `bun add -g` that ships a skill the running Luca has never heard of. */
    const shipsNewSkill = (fakes: Fakes) => {
        fakes.bun.bun.addGlobal = async ({ spec }: { spec: string }) => {
            events.push(`bun add -g ${spec}`)
            await Bun.write(
                join(skills_dir, 'luca-new', 'SKILL.md'),
                '---\nname: luca-new\n---\nNew in this release.\n'
            )
        }
    }
    const installedNewSkill = () =>
        Bun.file(join(home, '.claude', 'skills', 'luca-new', 'SKILL.md'))

    test('after bun add -g, the new install does the last steps, so a skill new in the release is installed and checked', async () => {
        const fakes = freshFakes()
        shipsNewSkill(fakes)

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
        })

        expect(end).toEqual({
            ok: true,
            message: 'Luca 14.0.0-alpha.5 is installed.',
        })
        expect(
            events.filter(
                (event) =>
                    event.startsWith('bun add -g ') ||
                    event.startsWith('hand off ') ||
                    event.startsWith('paseo reload ')
            )
        ).toEqual([
            `bun add -g ${PACKAGE}@14.0.0-alpha.5`,
            'hand off to 14.0.0-alpha.5',
            // Once, by the new install: the old one didn't reload it too.
            `paseo reload ${BOARD_ID}`,
        ])
        expect(await installedNewSkill().exists()).toBe(true)
        expect(logs.join('\n')).toContain(
            "[luca upgrade] Luca's skills: installed /luca-new"
        )
        // What `luca doctor` checks: every skill the install ships.
        const drift = await skillDrift({ home, skills_dir })
        expect(drift.map(({ skill }) => skill).toSorted()).toEqual([
            'luca-new',
            'luca-retro',
            'luca-unstick',
        ])
        expect(
            drift.filter(
                ({ missing, changed }) => missing.length + changed.length > 0
            )
        ).toEqual([])
    })

    test("a skill new in the release is installed even when the running Luca does the last steps: the list is the install's skills folder", async () => {
        const fakes = freshFakes()
        shipsNewSkill(fakes)

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
            new_install: cantHandOff({
                why: "Luca 14.0.0-alpha.5 can't finish an upgrade itself",
            }),
        })

        expect(end.ok).toBe(true)
        expect(await installedNewSkill().exists()).toBe(true)
    })

    test('a downgrade to a version without the hand-off still finishes, with the running Luca doing the last steps', async () => {
        const fakes = freshFakes()

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
            to: '14.0.0-alpha.1',
            new_install: cantHandOff({
                why: "Luca 14.0.0-alpha.1 can't finish an upgrade itself",
            }),
        })

        expect(end).toEqual({
            ok: true,
            message: 'Luca 14.0.0-alpha.1 is installed.',
        })
        expect(bunAdds()).toEqual([`bun add -g ${PACKAGE}@14.0.0-alpha.1`])
        expect(events).toContain(`paseo reload ${BOARD_ID}`)
        expect(logs).toContain(
            "[luca upgrade] Luca 14.0.0-alpha.1 can't finish an upgrade itself, so Luca 14.0.0-alpha.3 does the last steps."
        )
        expect(logs.at(-1)).toBe(
            '[luca upgrade] Luca 14.0.0-alpha.1 is installed.'
        )
    })

    test('a hand-off that fails to start is reported, with the package still installed and nothing done twice', async () => {
        const fakes = freshFakes()

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
            new_install: {
                finish: async () => {
                    throw new Error('spawn ENOENT')
                },
            },
        })

        expect(end.ok).toBe(false)
        expect(end.message).toBe(
            "Luca 14.0.0-alpha.5 is installed, but Luca couldn't start it to finish the upgrade (spawn ENOENT). Run luca init to finish: it reloads the board and copies Luca's skills."
        )
        expect(logs.at(-1)).toBe(`[luca upgrade] ${end.message}`)
        expect(bunAdds()).toEqual([`bun add -g ${PACKAGE}@14.0.0-alpha.5`])
        expect(paseoChanges()).toEqual([])
    })

    test('a hand-off that exits non-zero is reported with its exit code, and the upgrade fails', async () => {
        const fakes = freshFakes()

        const end = await upgrade({
            fakes,
            installed_version: '14.0.0-alpha.3',
            new_install: {
                finish: async () => ({ handed_off: true, exit_code: 3 }),
            },
        })

        expect(end.ok).toBe(false)
        expect(end.message).toBe(
            'Luca 14.0.0-alpha.5 is installed, but its last steps failed (exit 3). See above for what to fix.'
        )
        expect(bunAdds()).toEqual([`bun add -g ${PACKAGE}@14.0.0-alpha.5`])
        expect(paseoChanges()).toEqual([])
    })

    test("the new install says to /reload-skills only when the board's files changed in the install", async () => {
        const fakes = freshFakes()

        await upgrade({ fakes, installed_version: '14.0.0-alpha.3' })

        expect(logs.join('\n')).not.toContain('/reload-skills')

        logs.length = 0
        const changed = freshFakes()
        changed.bun.bun.addGlobal = async ({ spec }: { spec: string }) => {
            events.push(`bun add -g ${spec}`)
            await Bun.write(join(board_dir, 'index.server.ts'), 'new\n')
        }
        await upgrade({ fakes: changed, installed_version: '14.0.0-alpha.3' })

        expect(logs.join('\n')).toContain('/reload-skills')
    })
})
