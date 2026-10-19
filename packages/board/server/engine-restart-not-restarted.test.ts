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
} from './engine-restart-helpers'
import { unfinishedResult } from './testing/board-harness'
import { runStarted } from './testing/journal-fixtures'

import { ROW_KIND } from '../shared/board-rows'

/**
 * Runs the plugin does not restart after it starts: a launcher or billing
 * stop, a run with nothing to pick up, a demo run, and a run that ended. The
 * helpers are in `engine-restart-helpers.ts`; the other topics are in the
 * `engine-restart-*.test.ts` files beside this one.
 */

afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

describe('restarts: a run whose engine is gone', () => {
    test('a launcher stop and a billing stop are not restarted, and show engine stopped with why', async () => {
        const registry_dir = await registryDir()
        const [launcher, billing] = await startRuns({
            registry_dir,
            runs: [{ args: '10' }, { args: '11' }],
        })
        const launcher_id = launcher?.run_id ?? ''
        const billing_id = billing?.run_id ?? ''
        const restarted = await plugin({ registry_dir })
        restarted.setCommandResult({
            result: unfinishedResult({
                runs: [
                    listed({
                        run_id: launcher_id,
                        restart: false,
                        reason: 'launcher_stopped',
                        message: 'the wrong Claude login',
                    }),
                    listed({
                        run_id: billing_id,
                        restart: false,
                        reason: 'billing_stopped',
                        message: 'overage in use',
                    }),
                ],
            }),
        })

        const summary = await restarted.board.checkEngines()

        expect(summary).toEqual({
            restarted: [],
            stopped: [launcher_id, billing_id],
        })
        expect(restarted.spawns).toEqual([])
        const launcherRun = await runOf({
            harness: restarted,
            run_id: launcher_id,
        })
        expect(launcherRun.status).toBe('ended_with_error')
        expect(launcherRun.engine_ended?.ok).toBe(false)
        expect(launcherRun.engine_ended?.message).toContain(
            'The run stopped: the wrong Claude login.'
        )
        expect(launcherRun.engine_ended?.message).toContain(
            "isn't restarted automatically"
        )
        expect(launcherRun.engine_ended?.message).toContain(
            `/luca-run resume ${launcher_id}`
        )
        const billingRun = await runOf({
            harness: restarted,
            run_id: billing_id,
        })
        expect(billingRun.engine_ended?.message).toContain(
            'The run stopped for billing: overage in use.'
        )
        expect(billingRun.engine_ended?.message).toContain(
            'start a new run once per-token billing is off'
        )
        // The header rows show it too.
        const headers = restarted
            .latestRows()
            .flatMap(({ row }) => (row.kind === ROW_KIND.run ? [row.data] : []))
        expect(
            headers.map(({ run_id, engine_ended }) => ({
                run_id,
                ok: engine_ended?.ok,
            }))
        ).toEqual([
            { run_id: launcher_id, ok: false },
            { run_id: billing_id, ok: false },
        ])
        // It is kept, so the next plugin shows it and never checks it again.
        expect(
            await registryEntry({ registry_dir, run_id: billing_id })
        ).toMatchObject({ ended: { ok: false } })
        const again = await plugin({ registry_dir })
        expect(
            (await runOf({ harness: again, run_id: billing_id })).engine_ended
        ).toEqual(billingRun.engine_ended)
        expect(await again.board.checkEngines()).toEqual({
            restarted: [],
            stopped: [],
        })
        expect(again.commands).toEqual([])
    })

    test('a run with nothing to pick up again (the engine died before its journal) shows engine stopped, not starting', async () => {
        const registry_dir = await registryDir()
        const first = await plugin({ registry_dir })
        // The engine crashed at startup: it never sent a record.
        const { run_id } = await first.start({ args: '10' })
        expect((await runOf({ harness: first, run_id })).status).toBe(
            'starting'
        )

        const summary = await first.board.checkEngines()

        expect(summary).toEqual({ restarted: [], stopped: [run_id] })
        const run = await runOf({ harness: first, run_id })
        expect(run.status).toBe('ended_with_error')
        expect(run.engine_ended?.message).toContain(
            'its journal has nothing to pick up again'
        )
        expect(run.engine_ended?.message).toContain(`/tmp/${run_id}.log`)
        expect(first.spawns).toHaveLength(1)
    })

    test('a demo run is never restarted, and needs no check of the journal', async () => {
        const registry_dir = await registryDir()
        const first = await plugin({ registry_dir })
        const { run_id } = await first.start({ args: 'demo' })
        first.setCommandResult({
            result: unfinishedResult({ runs: [listed({ run_id })] }),
        })

        const summary = await first.board.checkEngines()

        expect(summary).toEqual({ restarted: [], stopped: [run_id] })
        expect(first.commands).toEqual([])
        expect(first.spawns).toHaveLength(1)
        const run = await runOf({ harness: first, run_id })
        expect(run.engine_ended?.message).toContain("a demo can't be picked up")
        expect(run.engine_ended?.message).toContain('/luca-run demo')
        expect(run.engine_ended?.message).toContain(`/tmp/${run_id}.log`)
    })

    test('a run that ended is kept as ended after a plugin restart, and never checked or restarted', async () => {
        const registry_dir = await registryDir()
        const first = await plugin({ registry_dir })
        const { run_id, token } = await first.start({ args: '10' })
        await first.send({
            run_id,
            token,
            entries: [runStarted({ spec: 10 })],
            ended: { ok: false, message: 'Intake refused the run.' },
        })

        const restarted = await plugin({ registry_dir })
        restarted.setCommandResult({
            result: unfinishedResult({ runs: [listed({ run_id })] }),
        })
        const summary = await restarted.board.checkEngines()

        expect(summary).toEqual({ restarted: [], stopped: [] })
        expect(restarted.commands).toEqual([])
        expect(restarted.spawns).toEqual([])
        expect(await runOf({ harness: restarted, run_id })).toMatchObject({
            status: 'ended_with_error',
            engine_ended: { ok: false, message: 'Intake refused the run.' },
        })
    })
})
