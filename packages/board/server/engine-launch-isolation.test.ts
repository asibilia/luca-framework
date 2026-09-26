import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    BUN_PATH,
    createHarness,
    ENGINE_PATH,
    unfinishedResult,
    type Harness,
} from './testing/board-harness'
import { runStarted } from './testing/journal-fixtures'

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
