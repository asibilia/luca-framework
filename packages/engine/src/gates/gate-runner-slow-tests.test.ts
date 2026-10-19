import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { runGates, runSlowTests } from './gate-runner'

import { EngineConfigSchema } from '../config/engine-config'

/** The slow test command in the gates, and the final review's slow tests (#563). */

describe('slow tests in the gates (#563)', () => {
    const config = EngineConfigSchema.parse({
        checks: { test: 'echo fast', slow_test: 'echo slow', types: 'true' },
    })
    const gates = async ({
        config,
        with_slow_tests,
    }: {
        config: ReturnType<typeof EngineConfigSchema.parse>
        with_slow_tests?: boolean
    }) => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-gates-'))
        try {
            return await runGates({
                cwd: folder,
                config,
                install: null,
                test_files: [],
                report_file: join(folder, 'report.xml'),
                with_slow_tests,
            })
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }

    test('without with_slow_tests, the gates never run the slow command', async () => {
        const { checks } = await gates({ config })
        expect(checks.map(({ name, command }) => `${name}:${command}`)).toEqual(
            ['test:echo fast', 'types:true']
        )
    })

    test('with_slow_tests runs it after the test commands, before types, as slow_test', async () => {
        const { checks } = await gates({ config, with_slow_tests: true })
        expect(checks.map(({ name, command }) => `${name}:${command}`)).toEqual(
            ['test:echo fast', 'slow_test:echo slow', 'types:true']
        )
    })

    test('a slow command past test_timeout_ms is stopped and says to raise it', async () => {
        const slow = EngineConfigSchema.parse({
            checks: { test: 'true', slow_test: 'sleep 5' },
            test_timeout_ms: 300,
        })
        const { checks } = await gates({ config: slow, with_slow_tests: true })
        const check = checks.find(({ name }) => name === 'slow_test')
        expect(check?.ok).toBe(false)
        expect(check?.output).toContain('raise `test_timeout_ms`')
    }, 20_000)

    test('a repo with no slow_test sees the same checks with the flag on', async () => {
        const plain = EngineConfigSchema.parse({
            checks: { test: 'echo fast', types: 'true' },
        })
        const { checks } = await gates({ config: plain, with_slow_tests: true })
        expect(checks.map(({ name }) => name)).toEqual(['test', 'types'])
    })
})

describe("runSlowTests: the final review's slow tests (#563)", () => {
    const slowTests = async ({
        config,
    }: {
        config: ReturnType<typeof EngineConfigSchema.parse>
    }) => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-slow-tests-'))
        try {
            return await runSlowTests({
                cwd: folder,
                config,
                test_files: [],
                report_file: join(folder, 'report.xml'),
            })
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }

    test('runs prepare, then only each slow command, as slow_test', async () => {
        const { ok, checks } = await slowTests({
            config: EngineConfigSchema.parse({
                checks: {
                    test: 'echo fast',
                    slow_test: [
                        'echo one',
                        { run: 'exit 1', results: 'pass_fail' },
                    ],
                    types: 'true',
                    lint: 'true',
                },
                prepare: 'true',
            }),
        })

        expect(ok).toBe(false)
        expect(
            checks.map(({ name, command, ok }) => `${name}:${command}:${ok}`)
        ).toEqual([
            'prepare:true:true',
            'slow_test:echo one:true',
            'slow_test:exit 1:false',
        ])
    })

    test('a failed prepare stops there', async () => {
        const { ok, checks } = await slowTests({
            config: EngineConfigSchema.parse({
                checks: { test: 'echo fast', slow_test: 'echo slow' },
                prepare: 'exit 3',
            }),
        })

        expect(ok).toBe(false)
        expect(checks.map(({ name }) => name)).toEqual(['prepare'])
    })

    test('a slow command past test_timeout_ms is stopped and says to raise it', async () => {
        const { ok, checks } = await slowTests({
            config: EngineConfigSchema.parse({
                checks: { test: 'true', slow_test: 'sleep 5' },
                test_timeout_ms: 300,
            }),
        })

        expect(ok).toBe(false)
        expect(checks).toHaveLength(1)
        expect(checks[0]?.output).toContain('raise `test_timeout_ms`')
    }, 20_000)
})
