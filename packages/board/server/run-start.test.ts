import { afterEach, describe, expect, test } from 'bun:test'

import {
    BUN_PATH,
    createHarness,
    ENGINE_PATH,
    type Harness,
} from './testing/board-harness'

let harness: Harness

afterEach(async () => {
    await harness.cleanup()
})

const RUN_ID = /^luca-\d{8}-\d{6}-[a-z0-9]{4}$/

describe('run.start: the args', () => {
    test.each(['', 'soon', '12a', '#', '0', '-3', 'demo please'])(
        '"%s" is refused with the usage, and nothing starts',
        async (args) => {
            harness = await createHarness()

            const { output } = await harness.start({ args })

            expect(output.ok).toBe(false)
            expect(output.run_id).toBeNull()
            expect(output.message).toContain('/luca-run <spec number> | demo')
            expect(harness.spawns).toEqual([])
            expect(harness.rows).toEqual([])
            expect((await harness.read()).runs).toEqual([])
        }
    )

    test.each([
        ['123', ['--spec', '123']],
        ['#123', ['--spec', '123']],
        ['  #7 ', ['--spec', '7']],
        ['demo', ['--demo']],
        ['DEMO', ['--demo']],
    ])('"%s" becomes %j', async (args, target) => {
        harness = await createHarness()

        const { output } = await harness.start({ args })

        expect(output.ok).toBe(true)
        expect(harness.spawns[0]?.args.slice(1, 1 + target.length)).toEqual(
            target
        )
    })
})

describe('run.start: finding the engine', () => {
    test('no engine path and no installed command asks for the setting', async () => {
        harness = await createHarness({
            settings: { engine_path: '', bun_path: '' },
            files: [BUN_PATH],
        })

        const { output } = await harness.start()

        expect(output.ok).toBe(false)
        expect(output.message).toContain(
            'Set the engine path in Settings → Plugins → luca-board'
        )
        expect(harness.spawns).toEqual([])
    })

    test('an engine path that does not exist is named in the error', async () => {
        harness = await createHarness({ files: [BUN_PATH] })

        const { output } = await harness.start()

        expect(output.ok).toBe(false)
        expect(output.message).toContain(`${ENGINE_PATH} doesn't exist`)
    })

    test('the settings path wins over an installed luca-run command', async () => {
        harness = await createHarness({
            files: [ENGINE_PATH, BUN_PATH, '/usr/local/bin/luca-run'],
        })

        await harness.start()

        expect(harness.spawns[0]?.command).toBe(BUN_PATH)
        expect(harness.spawns[0]?.args[0]).toBe(ENGINE_PATH)
    })

    test('with no setting, an installed luca-run runs directly', async () => {
        harness = await createHarness({
            settings: { engine_path: '', bun_path: '' },
            files: ['/opt/homebrew/bin/luca-run'],
        })

        await harness.start()

        expect(harness.spawns[0]?.command).toBe('/opt/homebrew/bin/luca-run')
        expect(harness.spawns[0]?.args[0]).toBe('--spec')
    })

    test('the bun path setting wins over the usual places', async () => {
        harness = await createHarness({
            settings: { engine_path: ENGINE_PATH, bun_path: '/custom/bun' },
            files: [ENGINE_PATH, BUN_PATH, '/custom/bun'],
        })

        await harness.start()

        expect(harness.spawns[0]?.command).toBe('/custom/bun')
    })

    test('no Bun anywhere is a clear error', async () => {
        harness = await createHarness({ files: [ENGINE_PATH] })

        const { output } = await harness.start()

        expect(output.ok).toBe(false)
        expect(output.message).toContain("Couldn't find Bun")
    })
})

describe('run.start: launching', () => {
    test('spawns the engine detached by absolute paths and returns quickly with the run id', async () => {
        harness = await createHarness()

        const started = performance.now()
        const { output, run_id, token } = await harness.start({
            args: '#42',
            cwd: '/Users/me/repo',
        })
        const took = performance.now() - started

        expect(took).toBeLessThan(1000)
        expect(output.ok).toBe(true)
        expect(run_id).toMatch(RUN_ID)
        expect(output.message).toContain(`/tmp/${run_id}.log`)
        expect(harness.spawns).toHaveLength(1)
        const spawn = harness.spawns[0]
        expect(spawn).toMatchObject({
            command: BUN_PATH,
            args: [
                ENGINE_PATH,
                '--spec',
                '42',
                '--repo',
                '/Users/me/repo',
                '--run-id',
                run_id,
                '--board-plugin',
                'luca-board',
            ],
            cwd: '/Users/me/repo',
            log_path: `/tmp/${run_id}.log`,
        })
        expect(spawn?.env).toEqual({
            PATH: '/usr/bin',
            LUCA_BOARD_TOKEN: token,
        })
        expect(token.length).toBeGreaterThanOrEqual(32)
    })

    test('each launch gets its own run id and token', async () => {
        harness = await createHarness()

        const first = await harness.start()
        const second = await harness.start()

        expect(first.run_id).not.toBe(second.run_id)
        expect(first.token).not.toBe(second.token)
    })

    test('a spawn that throws is an error and leaves no run behind', async () => {
        harness = await createHarness({ spawn_throws: 'spawn ENOENT' })

        const { output } = await harness.start()

        expect(output).toEqual({
            ok: false,
            message: "Couldn't start the engine: spawn ENOENT",
            run_id: null,
        })
        expect((await harness.read()).runs).toEqual([])
        expect(harness.rows).toEqual([])
    })

    test('an engine that fails to start shows as ended with an error', async () => {
        harness = await createHarness()
        const { run_id } = await harness.start()

        harness.spawns[0]?.on_error(new Error('spawn EACCES'))
        await harness.board.idle()

        const { selected } = await harness.read({ run_id })
        expect(selected?.run).toMatchObject({
            status: 'ended_with_error',
            engine_ended: {
                ok: false,
                message: "The engine couldn't start: spawn EACCES",
            },
        })
    })
})
