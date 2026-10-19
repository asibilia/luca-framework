import { rm } from 'node:fs/promises'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    harnesses,
    dirs,
    plugin,
    registryDir,
    startRuns,
    listed,
    registryEntry,
    runOf,
    eventTexts,
} from './engine-restart-helpers'
import {
    BUN_PATH,
    ENGINE_PATH,
    unfinishedResult,
} from './testing/board-harness'
import { runStarted } from './testing/journal-fixtures'

/**
 * When the plugin starts, it checks each run whose engine is gone, using
 * `ps`: a live engine is left alone, a dead one is restarted from its
 * journal. The helpers are in `engine-restart-helpers.ts`; the other topics
 * are in the `engine-restart-*.test.ts` files beside this one.
 */

/** The args from the engine path on, past any flags Bun gets first. */
const fromEngine = ({ args = [] }: { args?: string[] }) =>
    args.slice(args.indexOf(ENGINE_PATH))

afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

describe('restarts: a run whose engine is gone', () => {
    test('plugin start finds it and restarts it from its journal with its token', async () => {
        const registry_dir = await registryDir()
        const [run] = await startRuns({
            registry_dir,
            runs: [{ args: '42', cwd: '/Users/me/repo' }],
        })
        const run_id = run?.run_id ?? ''

        const restarted = await plugin({ registry_dir })
        restarted.setCommandResult({
            result: unfinishedResult({ runs: [listed({ run_id })] }),
        })
        const summary = await restarted.board.checkEngines()

        expect(summary).toEqual({ restarted: [run_id], stopped: [] })
        expect(restarted.commands).toEqual([
            expect.objectContaining({
                command: BUN_PATH,
                timeout_ms: 20_000,
            }),
        ])
        expect(fromEngine({ args: restarted.commands[0]?.args })).toEqual([
            ENGINE_PATH,
            '--unfinished',
        ])
        expect(restarted.spawns).toHaveLength(1)
        expect(fromEngine({ args: restarted.spawns[0]?.args })).toEqual([
            ENGINE_PATH,
            '--resume',
            run_id,
            '--repo',
            '/Users/me/repo',
            '--board-plugin',
            'luca-board',
        ])
        expect(restarted.spawns[0]).toMatchObject({
            command: BUN_PATH,
            cwd: '/Users/me/repo',
            log_path: `/tmp/${run_id}.log`,
            env: { PATH: '/usr/bin', LUCA_BOARD_TOKEN: run?.token },
        })
        expect(eventTexts({ harness: restarted })).toEqual([
            'The engine was gone, so Paseo restarted the run from its journal (restart 1 of 3).',
        ])
        expect(await runOf({ harness: restarted, run_id })).toMatchObject({
            engine_ended: null,
        })
        expect(await registryEntry({ registry_dir, run_id })).toMatchObject({
            restarts: 1,
            ended: null,
        })

        // The resumed engine resends its journal with the same token.
        const resent = await restarted.send({
            run_id,
            token: run?.token ?? '',
            entries: [runStarted({ spec: 42 })],
        })
        expect(resent).toMatchObject({ ok: true, next_seq: 2 })
    })

    test('a live engine is left alone; ids match whole tokens only', async () => {
        const registry_dir = await registryDir()
        const [live, dead] = await startRuns({
            registry_dir,
            runs: [{ args: '10' }, { args: '11' }],
        })
        const restarted = await plugin({ registry_dir })
        restarted.engineRunning({ run_id: live?.run_id ?? '' })
        restarted.processes.push(
            `${BUN_PATH} ${ENGINE_PATH} --resume ${dead?.run_id}-old --board-plugin luca-board`
        )
        restarted.setCommandResult({
            result: unfinishedResult({
                runs: [
                    listed({ run_id: live?.run_id ?? '' }),
                    listed({ run_id: dead?.run_id ?? '' }),
                ],
            }),
        })

        const summary = await restarted.board.checkEngines()

        expect(summary).toEqual({
            restarted: [dead?.run_id ?? ''],
            stopped: [],
        })
        expect(
            restarted.spawns.map(({ args }) => fromEngine({ args })[2])
        ).toEqual([dead?.run_id])
    })

    test('a resumed engine seen in ps is live too', async () => {
        const registry_dir = await registryDir()
        const [run] = await startRuns({ registry_dir, runs: [{ args: '10' }] })
        const restarted = await plugin({ registry_dir })
        restarted.processes.push(
            `/home/me/.bun/bin/luca-run --resume ${run?.run_id} --repo /repo --board-plugin luca-board`
        )

        const summary = await restarted.board.checkEngines()

        expect(summary).toEqual({ restarted: [], stopped: [] })
        expect(restarted.commands).toEqual([])
    })

    test('when ps fails, nothing is restarted or marked', async () => {
        const registry_dir = await registryDir()
        const [run] = await startRuns({ registry_dir, runs: [{ args: '10' }] })
        const restarted = await plugin({
            registry_dir,
            ps_error: 'ps: not found',
        })

        const summary = await restarted.board.checkEngines()

        expect(summary).toEqual({ restarted: [], stopped: [] })
        expect(restarted.commands).toEqual([])
        expect(restarted.spawns).toEqual([])
        expect(restarted.logs.join('\n')).toContain('ps: not found')
        expect(
            (await runOf({ harness: restarted, run_id: run?.run_id ?? '' }))
                .engine_ended
        ).toBeNull()
    })

    test('only one check runs at a time', async () => {
        const registry_dir = await registryDir()
        await startRuns({ registry_dir, runs: [{ args: '10' }] })
        const restarted = await plugin({ registry_dir })

        const first = restarted.board.checkEngines()
        const second = restarted.board.checkEngines()

        expect(second).toBe(first)
        await first
        expect(restarted.commands).toHaveLength(1)
    })
})
