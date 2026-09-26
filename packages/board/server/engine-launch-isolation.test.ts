import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    createBoardServer,
    type CommandRequest,
    type CommandResult,
    type SpawnRequest,
} from './board-server'
import {
    BUN_PATH,
    createHarness,
    ENGINE_PATH,
    unfinishedResult,
    type Harness,
} from './testing/board-harness'
import { runStarted, stamp } from './testing/journal-fixtures'

import { EngineSettingsSchema } from '../shared/engine-settings'

/** Luca's own bunfig, shipped next to the engine's `luca-run.ts`. */
const BUNFIG_PATH = join(dirname(ENGINE_PATH), 'bunfig.toml')

/** What goes before the engine's own args on every launch. */
const ISOLATED_LEAD = ['--no-env-file', `--config=${BUNFIG_PATH}`, ENGINE_PATH]

const harnesses: Harness[] = []
const dirs: string[] = []

afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

const harnessOn = async ({ registry_dir }: { registry_dir?: string } = {}) => {
    const harness = await createHarness({
        registry_dir,
        files: [ENGINE_PATH, BUN_PATH, BUNFIG_PATH],
    })
    harnesses.push(harness)
    return harness
}

/** A run started by a first plugin whose engine is gone, and a second plugin. */
const deadRun = async () => {
    const registry_dir = await mkdtemp(join(tmpdir(), 'luca-board-isolated-'))
    dirs.push(registry_dir)
    const first = await harnessOn({ registry_dir })
    const run = await first.start({ args: '42', cwd: '/Users/me/repo' })
    await first.send({
        run_id: run.run_id,
        token: run.token,
        entries: [runStarted({ spec: 42 })],
    })
    const restarted = await harnessOn({ registry_dir })
    return { run_id: run.run_id, restarted }
}

describe('engine launch: the repo’s .env and bunfig.toml stay out', () => {
    test('a new run starts Bun with --no-env-file and Luca’s own bunfig before the engine', async () => {
        const harness = await harnessOn()

        const { output } = await harness.start({
            args: '#42',
            cwd: '/Users/me/repo',
        })

        expect(output.ok).toBe(true)
        expect(harness.spawns).toHaveLength(1)
        expect(harness.spawns[0]?.command).toBe(BUN_PATH)
        expect(harness.spawns[0]?.args.slice(0, 3)).toEqual(ISOLATED_LEAD)
        expect(harness.spawns[0]?.args.slice(3, 5)).toEqual(['--spec', '42'])
    })

    test('a demo run starts with the same flags', async () => {
        const harness = await harnessOn()

        await harness.start({ args: 'demo' })

        expect(harness.spawns[0]?.args.slice(0, 4)).toEqual([
            ...ISOLATED_LEAD,
            '--demo',
        ])
    })

    test('the --unfinished check runs with --no-env-file and Luca’s own bunfig', async () => {
        const { restarted } = await deadRun()

        await restarted.board.checkEngines()

        expect(restarted.commands).toEqual([
            expect.objectContaining({
                command: BUN_PATH,
                args: [...ISOLATED_LEAD, '--unfinished'],
            }),
        ])
    })

    test('a --resume restart runs with --no-env-file and Luca’s own bunfig', async () => {
        const { run_id, restarted } = await deadRun()
        restarted.setCommandResult({
            result: unfinishedResult({
                runs: [
                    {
                        run_id,
                        restart: true,
                        reason: 'resumable',
                        message: null,
                    },
                ],
            }),
        })

        await restarted.board.checkEngines()

        expect(restarted.spawns).toHaveLength(1)
        expect(restarted.spawns[0]).toMatchObject({
            command: BUN_PATH,
            args: [
                ...ISOLATED_LEAD,
                '--resume',
                run_id,
                '--repo',
                '/Users/me/repo',
                '--board-plugin',
                'luca-board',
            ],
            cwd: '/Users/me/repo',
        })
    })

    test('the config is never the repo’s own bunfig.toml', async () => {
        const harness = await harnessOn()

        await harness.start({ cwd: '/Users/me/repo' })

        const config = harness.spawns[0]?.args.find((arg) =>
            arg.startsWith('--config=')
        )
        expect(config).toBe(`--config=${BUNFIG_PATH}`)
        expect(config).not.toContain('/Users/me/repo')
    })
})

/** The `luca-run` bin a global install puts on the PATH (a symlink). */
const INSTALLED_BIN = '/opt/homebrew/bin/luca-run'

/** Where the installed bin's symlink really points. */
const INSTALLED_ENTRY =
    '/home/me/.bun/install/global/node_modules/@alecsibilia/luca/engine/src/cli/luca-run.ts'

/** Luca's own bunfig beside the installed engine's entry. */
const INSTALLED_BUNFIG = join(dirname(INSTALLED_ENTRY), 'bunfig.toml')

const INSTALLED_LEAD = [
    '--no-env-file',
    `--config=${INSTALLED_BUNFIG}`,
    INSTALLED_ENTRY,
]

/**
 * A board with no engine path set, whose only engine is the installed
 * `luca-run` bin, and whose `real_path` follows that bin to its real entry.
 */
const installedBoard = async ({
    registry_dir,
    files = [INSTALLED_BIN, INSTALLED_ENTRY, INSTALLED_BUNFIG, BUN_PATH],
    command_result = unfinishedResult({ runs: [] }),
}: {
    registry_dir?: string
    files?: string[]
    command_result?: CommandResult
} = {}) => {
    const dir =
        registry_dir ?? (await mkdtemp(join(tmpdir(), 'luca-board-installed-')))
    if (!registry_dir) dirs.push(dir)
    const spawns: SpawnRequest[] = []
    const commands: CommandRequest[] = []
    const existing = new Set(files)
    let clock = Date.parse('2026-09-23T12:30:42.000Z')
    const board = createBoardServer({
        registry_path: join(dir, 'runs.json'),
        append_row: async () => {},
        spawn_engine: (request) => {
            spawns.push(request)
            return { pid: 4242 }
        },
        list_processes: async () => [],
        run_command: async (request) => {
            commands.push(request)
            return command_result
        },
        read_settings: async () =>
            EngineSettingsSchema.parse({ engine_path: '', bun_path: '' }),
        file_exists: ({ path }) => existing.has(path),
        real_path: ({ path }) =>
            path === INSTALLED_BIN ? INSTALLED_ENTRY : path,
        home_dir: '/home/me',
        env: { PATH: '/usr/bin', LUCA_BUN: undefined },
        log_dir: '/tmp',
        now: () => {
            clock += 1000
            return new Date(clock)
        },
        log: () => {},
    })
    const start = ({ args = '42', cwd = '/Users/me/repo' } = {}) =>
        board.startRun({
            agent_id: 'agent-1',
            workspace_id: 'ws-1',
            cwd,
            args,
        })
    return { board, spawns, commands, start }
}

/** A run the installed engine started, whose engine is gone, and a restarted board. */
const deadInstalledRun = async ({
    command_result,
}: { command_result?: (run_id: string) => CommandResult } = {}) => {
    const registry_dir = await mkdtemp(join(tmpdir(), 'luca-board-installed-'))
    dirs.push(registry_dir)
    const first = await installedBoard({ registry_dir })
    const output = await first.start()
    const run_id = output.run_id ?? ''
    await first.board.handleEngineEvent({
        run_id,
        token: first.spawns[0]?.env.LUCA_BOARD_TOKEN ?? '',
        records: stamp({ entries: [runStarted({ spec: 42 })], first_seq: 1 }),
        ended: null,
    })
    const restarted = await installedBoard({
        registry_dir,
        command_result: command_result?.(run_id),
    })
    return { run_id, restarted }
}

describe('engine launch from an installed luca-run: the repo’s .env and bunfig.toml stay out', () => {
    test('a new run follows the installed bin to its entry and starts Bun with --no-env-file and the bunfig beside it', async () => {
        const board = await installedBoard()

        const output = await board.start({ args: '#42' })

        expect(output.ok).toBe(true)
        expect(board.spawns).toHaveLength(1)
        expect(board.spawns[0]?.command).toBe(BUN_PATH)
        expect(board.spawns[0]?.args.slice(0, 3)).toEqual(INSTALLED_LEAD)
        expect(board.spawns[0]?.args.slice(3, 5)).toEqual(['--spec', '42'])
    })

    test('the --unfinished check through an installed luca-run runs with --no-env-file and the bunfig beside its entry', async () => {
        const { restarted } = await deadInstalledRun()

        await restarted.board.checkEngines()

        expect(restarted.commands).toEqual([
            expect.objectContaining({
                command: BUN_PATH,
                args: [...INSTALLED_LEAD, '--unfinished'],
            }),
        ])
    })

    test('a --resume restart through an installed luca-run runs with --no-env-file and the bunfig beside its entry', async () => {
        const { run_id, restarted } = await deadInstalledRun({
            command_result: (id) =>
                unfinishedResult({
                    runs: [
                        {
                            run_id: id,
                            restart: true,
                            reason: 'resumable',
                            message: null,
                        },
                    ],
                }),
        })

        await restarted.board.checkEngines()

        expect(restarted.spawns).toHaveLength(1)
        expect(restarted.spawns[0]).toMatchObject({
            command: BUN_PATH,
            args: [
                ...INSTALLED_LEAD,
                '--resume',
                run_id,
                '--repo',
                '/Users/me/repo',
                '--board-plugin',
                'luca-board',
            ],
            cwd: '/Users/me/repo',
        })
    })

    test('an installed luca-run with its bunfig but no Bun found says it couldn’t find Bun', async () => {
        const board = await installedBoard({
            files: [INSTALLED_BIN, INSTALLED_ENTRY, INSTALLED_BUNFIG],
        })

        const output = await board.start()

        expect(output.ok).toBe(false)
        expect(output.message).toContain("Couldn't find Bun")
        expect(board.spawns).toEqual([])
    })
})

describe('the board README', () => {
    test('it says the engine starts with --no-env-file and Luca’s own bunfig, and why', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', 'README.md')
        ).text()

        const mentions = [
            '--no-env-file',
            '--config=',
            '.env',
            'bunfig.toml',
            'preload',
        ].filter((words) => readme.includes(words))

        expect(mentions).toEqual([
            '--no-env-file',
            '--config=',
            '.env',
            'bunfig.toml',
            'preload',
        ])
    })

    test('its launch commands show the flags before the engine path', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', 'README.md')
        ).text()

        expect(readme.includes('<bun> <engine_path> --unfinished')).toBe(false)
        expect(readme.includes('<bun> <engine_path> --resume')).toBe(false)
        expect(
            /<bun> --no-env-file --config=\S+ <engine_path> --unfinished/.test(
                readme
            )
        ).toBe(true)
        expect(
            /<bun> --no-env-file --config=\S+ <engine_path> --resume <run id>/.test(
                readme
            )
        ).toBe(true)
    })
})
