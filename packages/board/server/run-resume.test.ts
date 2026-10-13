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
} from './testing/board-harness'
import { nothingToDo, runStarted } from './testing/journal-fixtures'

import { ROW_KIND } from '../shared/board-rows'

/**
 * `/luca-run resume <run id>` (#493): the owner picks a run the board
 * started back up after its engine ended (a crash, a launcher stop, or the
 * automatic restarts used up), with the board attached again: a new token,
 * no `ended`, a fresh restart count, and the run's own chat and repo.
 */

/** The args from the engine path on, past any flags Bun gets first. */
const fromEngine = ({ args = [] }: { args?: string[] }) =>
    args.slice(args.indexOf(ENGINE_PATH))

const harnesses: Harness[] = []
const dirs: string[] = []

afterEach(async () => {
    for (const harness of harnesses.splice(0)) await harness.cleanup()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

/** A plugin on a registry kept in `registry_dir`, so it can be restarted. */
const plugin = async (
    options: Parameters<typeof createHarness>[0] & { registry_dir: string }
) => {
    const harness = await createHarness(options)
    harnesses.push(harness)
    return harness
}

const registryDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-board-resume-'))
    dirs.push(dir)
    return dir
}

type Entry = {
    run_id: string
    token: string
    agent_id: string
    workspace_id: string
    repo: string
    restarts: number
    ended: unknown
}

const registryEntry = async ({
    registry_dir,
    run_id,
}: {
    registry_dir: string
    run_id: string
}): Promise<Entry | undefined> => {
    const file = JSON.parse(
        await Bun.file(join(registry_dir, 'runs.json')).text()
    ) as { runs: Entry[] }
    return file.runs.find((entry) => entry.run_id === run_id)
}

const CRASH = {
    ok: false,
    message: 'The engine crashed: Directories cannot be read like files',
}

/**
 * A run started from chat `agent-1` in `/Users/me/repo`, whose engine sent
 * `run_started` and then crashed, seen by a restarted plugin.
 */
const crashedRun = async ({
    registry_dir,
    ps_error = null,
}: {
    registry_dir: string
    ps_error?: string | null
}) => {
    const first = await plugin({ registry_dir })
    const started = await first.start({ args: '133', cwd: '/Users/me/repo' })
    await first.send({
        run_id: started.run_id,
        token: started.token,
        entries: [runStarted({ spec: 133 })],
        ended: CRASH,
    })
    const board = await plugin({ registry_dir, ps_error })
    return { ...started, board }
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

describe('/luca-run resume <run id>', () => {
    test('an ended run is resumed with --resume, a new token, no ended, and its own chat and repo', async () => {
        const registry_dir = await registryDir()
        const {
            run_id,
            token: old_token,
            board,
        } = await crashedRun({
            registry_dir,
        })

        // Typed in another chat of the workspace.
        const { output } = await board.start({
            args: `resume ${run_id}`,
            agent_id: 'agent-2',
            cwd: '/somewhere/else',
        })

        expect(output.ok).toBe(true)
        expect(output.run_id).toBe(run_id)
        expect(output.message).toContain(`/tmp/${run_id}.log`)
        expect(board.spawns).toHaveLength(1)
        const spawn = board.spawns[0]
        expect(fromEngine({ args: spawn?.args })).toEqual([
            ENGINE_PATH,
            '--resume',
            run_id,
            '--repo',
            '/Users/me/repo',
            '--board-plugin',
            'luca-board',
        ])
        expect(spawn).toMatchObject({
            command: BUN_PATH,
            cwd: '/Users/me/repo',
            log_path: `/tmp/${run_id}.log`,
        })
        const new_token = spawn?.env.LUCA_BOARD_TOKEN ?? ''
        expect(new_token.length).toBeGreaterThanOrEqual(32)
        expect(new_token).not.toBe(old_token)

        const entry = await registryEntry({ registry_dir, run_id })
        expect(entry).toMatchObject({
            token: new_token,
            agent_id: 'agent-1',
            repo: '/Users/me/repo',
            ended: null,
            restarts: 0,
        })
        expect(await runOf({ harness: board, run_id })).toMatchObject({
            engine_ended: null,
        })

        // The chat it started in gets a row saying so, and the header.
        expect(board.rows.map(({ agent_id }) => agent_id)).toEqual([
            'agent-1',
            'agent-1',
        ])
        const texts = board.rows.flatMap(({ row }) =>
            row.kind === ROW_KIND.event ? [row.data.text] : []
        )
        expect(texts).toEqual([
            'The run was resumed from its journal with /luca-run resume.',
        ])

        // The new engine's sends are accepted; the old token is refused.
        const refused = await board.send({
            run_id,
            token: old_token,
            entries: [runStarted({ spec: 133 })],
        })
        expect(refused.ok).toBe(false)
        const resent = await board.send({
            run_id,
            token: new_token,
            entries: [runStarted({ spec: 133 })],
        })
        expect(resent).toMatchObject({ ok: true, next_seq: 2 })
    })

    test('a run whose automatic restarts were used up gets a fresh restart count', async () => {
        const registry_dir = await registryDir()
        const first = await plugin({ registry_dir })
        const { run_id, token } = await first.start({ args: '10' })
        await first.send({
            run_id,
            token,
            entries: [runStarted({ spec: 10 })],
        })
        first.setCommandResult({
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
        for (const _ of [1, 2, 3, 4]) await first.board.checkEngines()
        expect(await registryEntry({ registry_dir, run_id })).toMatchObject({
            restarts: 3,
            ended: { ok: false },
        })
        expect(
            (await runOf({ harness: first, run_id })).engine_ended?.message
        ).toContain(`/luca-run resume ${run_id}`)

        const { output } = await first.start({ args: `resume ${run_id}` })

        expect(output.ok).toBe(true)
        expect(await registryEntry({ registry_dir, run_id })).toMatchObject({
            restarts: 0,
            ended: null,
        })
        expect(fromEngine({ args: first.spawns.at(-1)?.args })).toEqual([
            ENGINE_PATH,
            '--resume',
            run_id,
            '--repo',
            '/repo',
            '--board-plugin',
            'luca-board',
        ])
    })

    test('an unknown run is refused with a clear message, and nothing starts', async () => {
        const registry_dir = await registryDir()
        const board = await plugin({ registry_dir })

        const { output } = await board.start({
            args: 'resume luca-20260101-000000-zzzz',
        })

        expect(output.ok).toBe(false)
        expect(output.run_id).toBeNull()
        expect(output.message).toContain(
            "The board doesn't know run luca-20260101-000000-zzzz"
        )
        expect(output.message).toContain(
            'luca-run --resume luca-20260101-000000-zzzz'
        )
        expect(board.spawns).toEqual([])
    })

    test('a run whose engine is still running is refused, and nothing starts', async () => {
        const registry_dir = await registryDir()
        const board = await plugin({ registry_dir })
        const { run_id } = await board.start({ args: '10' })
        board.engineRunning({ run_id })

        const { output } = await board.start({ args: `resume ${run_id}` })

        expect(output.ok).toBe(false)
        expect(output.message).toContain(`Run ${run_id} is still running`)
        expect(board.spawns).toHaveLength(1)
    })

    test('when ps fails, the resume is refused: two engines on one run would be far worse', async () => {
        const registry_dir = await registryDir()
        const { run_id, board } = await crashedRun({
            registry_dir,
            ps_error: 'ps: not found',
        })

        const { output } = await board.start({ args: `resume ${run_id}` })

        expect(output.ok).toBe(false)
        expect(output.message).toContain('ps: not found')
        expect(board.spawns).toEqual([])
        expect(await registryEntry({ registry_dir, run_id })).toMatchObject({
            ended: CRASH,
        })
    })

    test('a demo run is refused: it can not be picked up again', async () => {
        const registry_dir = await registryDir()
        const board = await plugin({ registry_dir })
        const { run_id, token } = await board.start({ args: 'demo' })
        await board.send({ run_id, token, ended: CRASH })

        const { output } = await board.start({ args: `resume ${run_id}` })

        expect(output.ok).toBe(false)
        expect(output.message).toContain('/luca-run demo')
        expect(board.spawns).toHaveLength(1)
    })

    test('a run that is over is refused: there is nothing to resume', async () => {
        const registry_dir = await registryDir()
        const board = await plugin({ registry_dir })
        const { run_id, token } = await board.start({ args: '10' })
        await board.send({
            run_id,
            token,
            entries: [runStarted({ spec: 10 }), nothingToDo()],
            ended: { ok: true, message: 'Nothing to do.' },
        })

        const { output } = await board.start({ args: `resume ${run_id}` })

        expect(output.ok).toBe(false)
        expect(output.message).toContain(`Run ${run_id} is over`)
        expect(board.spawns).toHaveLength(1)
    })

    test.each(['resume', 'resume a b', 'resume --demo'])(
        '"%s" is refused with the usage',
        async (args) => {
            const registry_dir = await registryDir()
            const board = await plugin({ registry_dir })

            const { output } = await board.start({ args })

            expect(output.ok).toBe(false)
            expect(output.message).toContain('resume <run id>')
            expect(board.spawns).toEqual([])
        }
    )
})
