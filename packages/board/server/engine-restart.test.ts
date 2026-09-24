import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    BUN_PATH,
    createHarness,
    ENGINE_PATH,
    unfinishedResult,
    type Harness,
    type UnfinishedRun,
} from './testing/board-harness'
import { runStarted } from './testing/journal-fixtures'

import { ROW_KIND } from '../shared/board-rows'

const harnesses: Harness[] = []
const dirs: string[] = []

afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** A plugin on a registry kept in `registry_dir`, so it can be restarted. */
const plugin = async ({
    registry_dir,
    ...options
}: {
    registry_dir: string
} & Omit<Parameters<typeof createHarness>[0] & object, 'registry_dir'>) => {
    const harness = await createHarness({ registry_dir, ...options })
    harnesses.push(harness)
    return harness
}

const registryDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-board-restart-'))
    dirs.push(dir)
    return dir
}

/** Runs started by a first plugin, whose engines sent `run_started`. */
const startRuns = async ({
    registry_dir,
    runs,
}: {
    registry_dir: string
    runs: { args: string; cwd?: string }[]
}) => {
    const first = await plugin({ registry_dir })
    const started = []
    for (const { args, cwd } of runs) {
        const run = await first.start({ args, cwd })
        await first.send({
            run_id: run.run_id,
            token: run.token,
            entries: [runStarted({ spec: 10 })],
        })
        started.push(run)
    }
    return started
}

const listed = ({
    run_id,
    restart = true,
    reason = 'resumable',
    message = null,
}: Partial<UnfinishedRun> & { run_id: string }): UnfinishedRun => ({
    run_id,
    restart,
    reason,
    message,
})

const registryEntry = async ({
    registry_dir,
    run_id,
}: {
    registry_dir: string
    run_id: string
}) => {
    const file = JSON.parse(
        await Bun.file(join(registry_dir, 'runs.json')).text()
    ) as { runs: { run_id: string; restarts: number; ended: unknown }[] }
    return file.runs.find((entry) => entry.run_id === run_id)
}

const runOf = async ({
    harness,
    run_id,
}: {
    harness: Harness
    run_id: string
}) => {
    const { selected } = await harness.read({ run_id })
    if (!selected) throw new Error(`no run ${run_id}`)
    return selected.run
}

const eventTexts = ({ harness }: { harness: Harness }) =>
    harness.rows.flatMap(({ row }) =>
        row.kind === ROW_KIND.event ? [row.data.text] : []
    )

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
                args: [ENGINE_PATH, '--unfinished'],
                timeout_ms: 20_000,
            }),
        ])
        expect(restarted.spawns).toHaveLength(1)
        expect(restarted.spawns[0]).toMatchObject({
            command: BUN_PATH,
            args: [
                ENGINE_PATH,
                '--resume',
                run_id,
                '--repo',
                '/Users/me/repo',
                '--board-plugin',
                'luca-board',
            ],
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
        expect(restarted.spawns.map(({ args }) => args[2])).toEqual([
            dead?.run_id,
        ])
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
            `luca-run --resume ${launcher_id}`
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
            expect(ended?.message).toContain(`luca-run --resume ${run_id}`)
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
