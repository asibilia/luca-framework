import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { prepareCheck, runGates, shellCheck } from './gate-runner'
import { runBunTests } from './test-runner'

import { EngineConfigSchema } from '../config/engine-config'

/**
 * The prepare command's time limit (#485): `prepare_timeout_ms` from the
 * config reaches the command, and a prepare that runs out of time says so.
 */

describe('prepareCheck', () => {
    test("stops the prepare command at the config's time limit and says how to raise it", async () => {
        const config = EngineConfigSchema.parse({
            prepare: 'sleep 20',
            prepare_timeout_ms: 300,
        })
        const started = Date.now()

        const check = await prepareCheck({ config, cwd: tmpdir() })

        expect(Date.now() - started).toBeLessThan(5_000)
        expect(check).toMatchObject({
            name: 'prepare',
            command: 'sleep 20',
            ok: false,
            exit_code: null,
        })
        expect(check?.output).toContain('Timed out after 0.3 seconds')
        expect(check?.output).toContain('`prepare_timeout_ms`')
        expect(check?.output).toContain('`.luca/config.json`')
    }, 20_000)

    test('a prepare that finishes in time passes with no output', async () => {
        const config = EngineConfigSchema.parse({ prepare: 'echo built' })

        const check = await prepareCheck({ config, cwd: tmpdir() })

        expect(check).toEqual({
            name: 'prepare',
            command: 'echo built',
            ok: true,
            exit_code: 0,
            output: '',
        })
    })
})

describe('prepareCheck: one at a time (#492)', () => {
    test('with a cap of 1, two prepare runs never overlap, and waiting for a turn does not count toward the time limit', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-prepare-slots-'))
        try {
            const log = join(folder, 'log')
            // Each run takes 0.6 seconds of a 1-second limit; the second
            // waits 0.6 seconds first, 1.2 seconds in all.
            const config = EngineConfigSchema.parse({
                prepare: `echo start >> ${log}; sleep 0.6; echo end >> ${log}`,
                prepare_timeout_ms: 1_000,
                prepare_concurrency: 1,
            })

            const checks = await Promise.all([
                prepareCheck({ config, cwd: folder }),
                prepareCheck({ config, cwd: folder }),
            ])

            expect(checks.map((check) => check?.ok)).toEqual([true, true])
            expect((await Bun.file(log).text()).split('\n')).toEqual([
                'start',
                'end',
                'start',
                'end',
                '',
            ])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)
})

describe('shellCheck', () => {
    test('a check that times out says so, with no hint about prepare', async () => {
        const check = await shellCheck({
            name: 'lint',
            command: 'echo started; sleep 20',
            cwd: tmpdir(),
            timeout_ms: 300,
        })

        expect(check.ok).toBe(false)
        expect(check.exit_code).toBeNull()
        expect(check.output).toContain('Timed out after 0.3 seconds')
        expect(check.output).toContain('started')
        expect(check.output).not.toContain('prepare_timeout_ms')
    }, 20_000)
})

/**
 * The test commands' time limit (#542): `test_timeout_ms` from the config
 * reaches every test command, both kinds, and one that runs out of time
 * says how to raise it. Types and lint keep the engine's default.
 */

describe('runGates: the test time limit (#542)', () => {
    const gates = async ({ config }: { config: object }) => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-test-timeout-'))
        try {
            return await runGates({
                cwd: folder,
                config: EngineConfigSchema.parse(config),
                test_files: [],
                report_file: join(folder, 'report.xml'),
                install: null,
            })
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }

    test("stops a pass_fail test command at the config's time limit and says how to raise it", async () => {
        const started = Date.now()

        const { ok, checks } = await gates({
            config: {
                checks: { test: [{ run: 'sleep 5', results: 'pass_fail' }] },
                test_timeout_ms: 300,
            },
        })

        expect(Date.now() - started).toBeLessThan(3_000)
        expect(ok).toBe(false)
        expect(checks[0]).toMatchObject({
            name: 'test',
            command: 'sleep 5',
            ok: false,
            exit_code: null,
        })
        expect(checks[0]?.output).toContain('Timed out after 0.3 seconds')
        expect(checks[0]?.output).toContain(
            'raise `test_timeout_ms` in `.luca/config.json`'
        )
    }, 20_000)

    test("stops a bun test command at the config's time limit and says how to raise it", async () => {
        const started = Date.now()

        const { ok, checks } = await gates({
            config: {
                checks: {
                    test: [{ run: 'sleep 5; bun test', results: 'bun' }],
                },
                test_timeout_ms: 300,
            },
        })

        expect(Date.now() - started).toBeLessThan(3_000)
        expect(ok).toBe(false)
        expect(checks[0]).toMatchObject({
            name: 'test',
            ok: false,
            exit_code: null,
        })
        expect(checks[0]?.output).toContain('Timed out after 0.3 seconds')
        expect(checks[0]?.output).toContain(
            'raise `test_timeout_ms` in `.luca/config.json`'
        )
    }, 20_000)

    test('types and lint keep the default limit, not the test one', async () => {
        const { ok, checks } = await gates({
            config: {
                checks: {
                    test: [{ run: 'true', results: 'pass_fail' }],
                    types: 'sleep 0.6',
                    lint: 'sleep 0.6',
                },
                test_timeout_ms: 300,
            },
        })

        expect(ok).toBe(true)
        expect(checks.map(({ name, ok }) => [name, ok])).toEqual([
            ['test', true],
            ['types', true],
            ['lint', true],
        ])
    }, 20_000)
})

describe('runBunTests: the test time limit (#542)', () => {
    test('stops each command at the limit given and says how to raise it', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-test-timeout-'))
        try {
            const started = Date.now()

            const run = await runBunTests({
                cwd: folder,
                commands: ['sleep 5; bun test'],
                test_files: [],
                report_file: join(folder, 'report.xml'),
                timeout_ms: 300,
            })

            expect(Date.now() - started).toBeLessThan(3_000)
            expect(run.ok).toBe(false)
            expect(run.exit_code).toBeNull()
            expect(run.output).toStartWith('Timed out after 0.3 seconds')
            expect(run.output).toContain('`test_timeout_ms`')
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)
})
