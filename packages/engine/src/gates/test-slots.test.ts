import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runGates, runSlowTests } from './gate-runner'
import { createSlots } from './prepare-slots'
import { runBunTests } from './test-runner'

import { EngineConfigSchema } from '../config/engine-config'

/**
 * The test slots (#544): with `test_concurrency` in the config, at most
 * that many test runs go at once across the engine, whichever step runs
 * them (the baseline and red check through `runBunTests`, the gates and the
 * final review's slow tests through `runGates` and `runSlowTests`). Waiting
 * for a slot is journaled as `wait_ms` and never counts toward the time
 * limit. Left out, nothing waits.
 */

let folder = ''

beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'luca-test-slots-'))
})

afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
})

/** A command that logs its start and end, `seconds` apart. */
const logged = ({ seconds }: { seconds: number }): string => {
    const log = join(folder, 'log')
    return `echo start >> '${log}'; sleep ${seconds}; echo end >> '${log}'`
}

const logLines = async (): Promise<string[]> =>
    (await Bun.file(join(folder, 'log')).text()).trim().split('\n')

const gates = ({ config }: { config: object }) =>
    runGates({
        cwd: folder,
        config: EngineConfigSchema.parse(config),
        test_files: [],
        report_file: join(folder, `gates-${crypto.randomUUID()}.xml`),
        install: null,
    })

describe('test slots: test_concurrency (#544)', () => {
    test('with test_concurrency: 1, a red check run, a gate and a slow test run never overlap', async () => {
        const command = logged({ seconds: 0.4 })

        const [bun, gate, slow] = await Promise.all([
            runBunTests({
                cwd: folder,
                commands: [`${command}; true`],
                test_files: [],
                report_file: join(folder, 'red.xml'),
                timeout_ms: 10_000,
                test_concurrency: 1,
            }),
            gates({
                config: {
                    checks: { test: [{ run: command, results: 'pass_fail' }] },
                    test_concurrency: 1,
                },
            }),
            runSlowTests({
                cwd: folder,
                config: EngineConfigSchema.parse({
                    checks: {
                        test: 'true',
                        slow_test: [{ run: command, results: 'pass_fail' }],
                    },
                    test_concurrency: 1,
                }),
                test_files: [],
                report_file: join(folder, 'slow.xml'),
            }),
        ])

        expect([bun.ok, gate.ok, slow.ok]).toEqual([true, true, true])
        expect(await logLines()).toEqual([
            'start',
            'end',
            'start',
            'end',
            'start',
            'end',
        ])
    }, 20_000)

    test('the gate check that waited records wait_ms, and its duration_ms and time limit start after the wait', async () => {
        // Each run takes 0.6 seconds of a 1-second limit; the second waits
        // 0.6 seconds first, 1.2 seconds in all.
        const config = {
            checks: { test: [{ run: 'sleep 0.6', results: 'pass_fail' }] },
            test_timeout_ms: 1_000,
            test_concurrency: 1,
        }

        const results = await Promise.all([
            gates({ config }),
            gates({ config }),
        ])

        expect(results.map(({ ok }) => ok)).toEqual([true, true])
        const checks = results
            .map(({ checks }) => checks[0])
            .toSorted((a, b) => (a?.wait_ms ?? 0) - (b?.wait_ms ?? 0))
        const waited = checks[1]
        expect(checks[0]?.wait_ms ?? 0).toBeLessThan(300)
        expect(waited?.wait_ms).toBeGreaterThanOrEqual(500)
        expect(waited?.duration_ms).toBeGreaterThanOrEqual(500)
        expect(waited?.duration_ms).toBeLessThan(1_000)
    }, 20_000)

    test('the bun test run that waited records wait_ms, and its time limit starts after the wait', async () => {
        const run = (name: string) =>
            runBunTests({
                cwd: folder,
                commands: ['sleep 0.6; true'],
                test_files: [],
                report_file: join(folder, `${name}.xml`),
                timeout_ms: 1_000,
                test_concurrency: 1,
            })

        const runs = await Promise.all([run('a'), run('b')])

        expect(runs.map(({ ok }) => ok)).toEqual([true, true])
        const waits = runs
            .map(({ wait_ms }) => wait_ms ?? 0)
            .toSorted((a, b) => a - b)
        expect(waits[0]).toBeLessThan(300)
        expect(waits[1]).toBeGreaterThanOrEqual(500)
    }, 20_000)

    test('left out, test runs overlap with no wait_ms, where a capped run of the same command records one', async () => {
        const command = logged({ seconds: 0.4 })
        const checks = { test: [{ run: command, results: 'pass_fail' }] }

        const [gate, bun] = await Promise.all([
            gates({ config: { checks } }),
            runBunTests({
                cwd: folder,
                commands: [`${command}; true`],
                test_files: [],
                report_file: join(folder, 'red.xml'),
                timeout_ms: 10_000,
            }),
        ])

        expect(await logLines()).toEqual(['start', 'start', 'end', 'end'])
        expect(gate.checks).toHaveLength(1)
        expect(gate.checks[0]?.command).toBe(command)
        expect(gate.checks[0]).not.toHaveProperty('wait_ms')
        expect(bun.command).toBe(`${command}; true`)
        expect(bun).not.toHaveProperty('wait_ms')

        // With a cap it doesn't reach, the command is the same, and the
        // check says it waited for a slot (no time at all).
        const capped = await gates({ config: { checks, test_concurrency: 4 } })
        expect(capped.checks.map(({ command }) => command)).toEqual([command])
        expect(capped.checks[0]?.wait_ms).toBeGreaterThanOrEqual(0)
    }, 20_000)
})

/** Work that logs its start and end, and ends when told to. */
const gatedWork = ({ log, name }: { log: string[]; name: string }) => {
    let finish = () => {}
    const finished = new Promise<void>((resolve) => {
        finish = resolve
    })
    return {
        work: async () => {
            log.push(`start ${name}`)
            await finished
            log.push(`end ${name}`)
            return name
        },
        finish: () => finish(),
    }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('test slots: an exclusive take (#544)', () => {
    test('waits for every running holder, then blocks new ones until it is done', async () => {
        const slots = createSlots()
        const log: string[] = []
        const [a, b, x, c, d] = ['a', 'b', 'x', 'c', 'd'].map((name) =>
            gatedWork({ log, name })
        )
        if (!a || !b || !x || !c || !d) throw new Error('no work')

        const held = [a, b].map(({ work }) => slots.run({ limit: 2, work }))
        const alone = slots.run({ limit: 2, exclusive: true, work: x.work })
        // Queued while the exclusive take waits.
        const queued = slots.run({ limit: 2, work: c.work })
        await tick()
        expect(log).toEqual(['start a', 'start b'])

        a.finish()
        await tick()
        // A slot is free, but b still runs: neither x nor c starts.
        expect(log).toEqual(['start a', 'start b', 'end a'])

        b.finish()
        await tick()
        expect(log).toEqual(['start a', 'start b', 'end a', 'end b', 'start x'])

        // Asked for while the exclusive take holds every slot.
        const later = slots.run({ limit: 2, work: d.work })
        await tick()
        expect(log.at(-1)).toBe('start x')

        x.finish()
        await tick()
        expect(log.slice(5)).toEqual(['end x', 'start c', 'start d'])

        c.finish()
        d.finish()
        expect(await Promise.all([...held, alone, queued, later])).toEqual([
            'a',
            'b',
            'x',
            'c',
            'd',
        ])
        expect(slots.busy()).toBe(0)
    })
})
