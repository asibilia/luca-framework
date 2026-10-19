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

/**
 * A restart that goes wrong: a run that dies at every start, a failed check
 * with `luca-run --unfinished`, no engine to ask, and a restart that fails
 * to spawn. The helpers are in `engine-restart-helpers.ts`; the other topics
 * are in the `engine-restart-*.test.ts` files beside this one.
 */

afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

describe('restarts: a run whose engine is gone', () => {
    test('a run that dies at every start is restarted 3 times, then shows engine stopped', async () => {
        const registry_dir = await registryDir()
        const [run] = await startRuns({ registry_dir, runs: [{ args: '10' }] })
        const run_id = run?.run_id ?? ''
        const restarted = await plugin({ registry_dir })
        restarted.setCommandResult({
            result: unfinishedResult({ runs: [listed({ run_id })] }),
        })

        for (const _ of [1, 2, 3]) {
            expect(await restarted.board.checkEngines()).toEqual({
                restarted: [run_id],
                stopped: [],
            })
        }
        const last = await restarted.board.checkEngines()

        expect(last).toEqual({ restarted: [], stopped: [run_id] })
        expect(restarted.spawns).toHaveLength(3)
        expect(eventTexts({ harness: restarted })).toEqual([
            'The engine was gone, so Paseo restarted the run from its journal (restart 1 of 3).',
            'The engine was gone, so Paseo restarted the run from its journal (restart 2 of 3).',
            'The engine was gone, so Paseo restarted the run from its journal (restart 3 of 3).',
        ])
        const ended = (await runOf({ harness: restarted, run_id })).engine_ended
        expect(ended?.message).toContain('after 3 automatic restarts')
        expect(ended?.message).toContain(`/tmp/${run_id}.log`)
        expect(await registryEntry({ registry_dir, run_id })).toMatchObject({
            restarts: 3,
            ended: { ok: false },
        })
    })

    test.each([
        {
            why: 'exits with an error',
            result: { exit_code: 1, stdout: '', stderr: 'bad flag\n' },
            words: 'bad flag',
        },
        {
            why: 'prints something that is not the list',
            result: { exit_code: 0, stdout: 'hello', stderr: '' },
            words: 'not the list',
        },
        {
            why: 'times out',
            result: { exit_code: null, stdout: '', stderr: '' },
            words: 'did not finish',
        },
    ])(
        'when luca-run --unfinished $why, the run shows engine stopped with how to resume by hand',
        async ({ result, words }) => {
            const registry_dir = await registryDir()
            const [run] = await startRuns({
                registry_dir,
                runs: [{ args: '10' }],
            })
            const run_id = run?.run_id ?? ''
            const restarted = await plugin({ registry_dir })
            restarted.setCommandResult({ result })

            const summary = await restarted.board.checkEngines()

            expect(summary).toEqual({ restarted: [], stopped: [run_id] })
            expect(restarted.spawns).toEqual([])
            const ended = (await runOf({ harness: restarted, run_id }))
                .engine_ended
            expect(ended?.message).toContain(
                "Paseo couldn't check whether the run can go on"
            )
            expect(ended?.message).toContain(words)
            expect(ended?.message).toContain(`/luca-run resume ${run_id}`)
            expect(restarted.logs.join('\n')).toContain(words)
        }
    )

    test('with no engine to ask, the run shows engine stopped with what to set', async () => {
        const registry_dir = await registryDir()
        const [run] = await startRuns({ registry_dir, runs: [{ args: '10' }] })
        const run_id = run?.run_id ?? ''
        const restarted = await plugin({ registry_dir, files: [BUN_PATH] })

        const summary = await restarted.board.checkEngines()

        expect(summary).toEqual({ restarted: [], stopped: [run_id] })
        expect(restarted.commands).toEqual([])
        expect(
            (await runOf({ harness: restarted, run_id })).engine_ended?.message
        ).toContain(`${ENGINE_PATH} doesn't exist`)
    })

    test('a restart that fails to spawn shows engine stopped', async () => {
        const registry_dir = await registryDir()
        const [run] = await startRuns({ registry_dir, runs: [{ args: '10' }] })
        const run_id = run?.run_id ?? ''
        const restarted = await plugin({
            registry_dir,
            spawn_throws: 'spawn ENOENT',
        })
        restarted.setCommandResult({
            result: unfinishedResult({ runs: [listed({ run_id })] }),
        })

        const summary = await restarted.board.checkEngines()

        expect(summary).toEqual({ restarted: [], stopped: [run_id] })
        expect(
            (await runOf({ harness: restarted, run_id })).engine_ended?.message
        ).toContain("couldn't restart the engine: spawn ENOENT")
    })
})
