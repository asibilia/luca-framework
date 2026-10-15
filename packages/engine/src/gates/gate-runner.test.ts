import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { prepareCheck, runGates, runSlowTests, shellCheck } from './gate-runner'
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

        expect(check).toMatchObject({
            name: 'prepare',
            command: 'echo built',
            ok: true,
            exit_code: 0,
            output: '',
        })
    })

    test('every check says how long it ran, and a prepare how long it waited for a slot (#518)', async () => {
        const config = EngineConfigSchema.parse({
            prepare: 'sleep 0.3',
            prepare_concurrency: 1,
        })
        const [first, second] = await Promise.all([
            prepareCheck({ config, cwd: tmpdir() }),
            prepareCheck({ config, cwd: tmpdir() }),
        ])
        expect(first?.duration_ms).toBeGreaterThanOrEqual(250)
        expect(second?.duration_ms).toBeGreaterThanOrEqual(250)
        const waits = [first?.wait_ms ?? -1, second?.wait_ms ?? -1].toSorted(
            (a, b) => a - b
        )
        expect(waits[0]).toBeLessThan(100)
        expect(waits[1]).toBeGreaterThanOrEqual(250)
    }, 20_000)
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

    test('each gate check carries duration_ms (#518)', async () => {
        const { checks } = await gates({
            config: EngineConfigSchema.parse({
                checks: { test: 'true', types: 'true' },
            }),
        })
        for (const check of checks)
            expect(check.duration_ms).toBeGreaterThanOrEqual(0)
    })
})

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

describe("a ticket's own slow test files in the gates (#564)", () => {
    const config = EngineConfigSchema.parse({
        checks: {
            test: "bun test --path-ignore-patterns='**/*.e2e.test.ts'",
            slow_test: 'bun test .e2e.test',
        },
    })
    const PASSING =
        "import { test, expect } from 'bun:test'; test('fast', () => expect(1).toBe(1))"
    const FAILING =
        "import { test, expect } from 'bun:test'; test('own', () => expect(1).toBe(2))"

    test('the changed test files the fast run left out run on their own, as one more test check', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-own-slow-'))
        try {
            await Bun.write(join(folder, 'fast.test.ts'), PASSING)
            await Bun.write(join(folder, 'own.e2e.test.ts'), FAILING)
            const gates = ({ own_test_files }: { own_test_files: string[] }) =>
                runGates({
                    cwd: folder,
                    config,
                    install: null,
                    test_files: ['fast.test.ts', 'own.e2e.test.ts'],
                    report_file: join(folder, 'report.xml'),
                    own_test_files,
                })

            const withOwn = await gates({ own_test_files: ['own.e2e.test.ts'] })
            expect(withOwn.ok).toBe(false)
            expect(withOwn.checks.map(({ name }) => name)).toEqual([
                'test',
                'test',
            ])
            expect(withOwn.checks[0]?.ok).toBe(true)
            expect(withOwn.checks[1]).toMatchObject({
                name: 'test',
                command: "bun test './own.e2e.test.ts'",
                ok: false,
            })
            expect(withOwn.checks[1]?.output).toContain('own')
            expect(withOwn.checks[1]?.duration_ms).toBeGreaterThanOrEqual(0)

            const without = await gates({ own_test_files: [] })
            expect(without.ok).toBe(true)
            expect(without.checks.map(({ command }) => command)).toEqual([
                config.checks.test as string,
            ])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('an own run that gives no results adds its check only when no fast run failed', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-own-slow-'))
        try {
            // A changed slow file that can't load: its own run has no cases.
            await Bun.write(
                join(folder, 'own.e2e.test.ts'),
                "import { test } from 'bun:test'; import './missing'; test('own', () => {})"
            )
            const gates = async ({ fast }: { fast: string }) => {
                await Bun.write(join(folder, 'fast.test.ts'), fast)
                return runGates({
                    cwd: folder,
                    config,
                    install: null,
                    test_files: ['fast.test.ts', 'own.e2e.test.ts'],
                    report_file: join(folder, 'report.xml'),
                    own_test_files: ['own.e2e.test.ts'],
                })
            }

            // A fast failure already fails the gate; the slow file's load
            // error shows on the next run, once that is fixed.
            const fastFailed = await gates({ fast: FAILING })
            expect(fastFailed.ok).toBe(false)
            expect(fastFailed.checks.map(({ command }) => command)).toEqual([
                config.checks.test as string,
            ])

            // With every fast run passing, a slow file that can't load is a
            // real failure of its own.
            const fastPassed = await gates({ fast: PASSING })
            expect(fastPassed.ok).toBe(false)
            expect(
                fastPassed.checks.map(({ command, ok }) => [command, ok])
            ).toEqual([
                [config.checks.test as string, true],
                ["bun test './own.e2e.test.ts'", false],
            ])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('a file a fast run gave results for, or one with no fast bun run at all, is never run again', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-own-slow-'))
        try {
            await Bun.write(join(folder, 'fast.test.ts'), PASSING)
            const ran = await runGates({
                cwd: folder,
                config,
                install: null,
                test_files: ['fast.test.ts'],
                report_file: join(folder, 'report.xml'),
                own_test_files: ['fast.test.ts'],
            })
            expect(ran.checks.map(({ command }) => command)).toEqual([
                config.checks.test as string,
            ])

            const passFail = await runGates({
                cwd: folder,
                config: EngineConfigSchema.parse({
                    checks: { test: 'true', slow_test: 'true' },
                }),
                install: null,
                test_files: ['fast.test.ts'],
                report_file: join(folder, 'report.xml'),
                own_test_files: ['fast.test.ts'],
            })
            expect(passFail.checks.map(({ command }) => command)).toEqual([
                'true',
            ])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)
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

describe('the fast test speed limit in the gates (#580)', () => {
    const SLOW_TEST = `import { test, expect } from 'bun:test'
test('slow one', async () => { await Bun.sleep(400); expect(1).toBe(1) }, 20_000)
`
    const setUp = async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-limit-'))
        await Bun.write(join(folder, 'slow.test.ts'), SLOW_TEST)
        return folder
    }
    const config = EngineConfigSchema.parse({
        checks: { test: 'bun test' },
        test_case_timeout_ms: 200,
    })

    test("a test in the ticket's changed files over the limit fails the gate, even with its own longer timeout", async () => {
        const folder = await setUp()
        try {
            const { ok, checks } = await runGates({
                cwd: folder,
                config,
                install: null,
                test_files: ['slow.test.ts'],
                report_file: join(folder, 'r.xml'),
                measured_files: ['slow.test.ts'],
            })

            expect(ok).toBe(false)
            const check = checks.find(({ name }) => name === 'test')
            expect(check?.command).toBe('bun test --timeout=200')
            expect(check?.output).toContain('slow.test.ts > slow one')
            expect(check?.output).toContain(
                'A fast test may take at most 200 ms (`test_case_timeout_ms`). Make it faster, or move it to the slow tests.'
            )
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('the same test in a file the ticket did not change passes the gate', async () => {
        const folder = await setUp()
        try {
            const { ok } = await runGates({
                cwd: folder,
                config,
                install: null,
                test_files: ['slow.test.ts'],
                report_file: join(folder, 'r.xml'),
                measured_files: [],
            })

            expect(ok).toBe(true)
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('without measured files (a join or the final review), a slow test passes too', async () => {
        const folder = await setUp()
        try {
            const { ok } = await runGates({
                cwd: folder,
                config,
                install: null,
                test_files: ['slow.test.ts'],
                report_file: join(folder, 'r.xml'),
            })

            expect(ok).toBe(true)
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('a test that runs out of the --timeout fails with the hint, whatever file it is in', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-limit-'))
        try {
            await Bun.write(
                join(folder, 'hang.test.ts'),
                `import { test } from 'bun:test'
test('hangs', async () => { await Bun.sleep(1500) })
`
            )

            const { ok, checks } = await runGates({
                cwd: folder,
                config,
                install: null,
                test_files: ['hang.test.ts'],
                report_file: join(folder, 'r.xml'),
            })

            expect(ok).toBe(false)
            expect(
                checks.find(({ name }) => name === 'test')?.output
            ).toContain(
                'A fast test may take at most 200 ms (`test_case_timeout_ms`).'
            )
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('left out, the command runs exactly as written and a slow test passes', async () => {
        const folder = await setUp()
        try {
            const { ok, checks } = await runGates({
                cwd: folder,
                config: EngineConfigSchema.parse({
                    checks: { test: 'bun test' },
                }),
                install: null,
                test_files: ['slow.test.ts'],
                report_file: join(folder, 'r.xml'),
                measured_files: ['slow.test.ts'],
            })

            expect(ok).toBe(true)
            expect(checks.map(({ command }) => command)).toEqual(['bun test'])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('slow and pass_fail commands never get --timeout', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-limit-'))
        try {
            const both = EngineConfigSchema.parse({
                checks: {
                    test: ['bun test --path-ignore-patterns=x', 'echo pf'],
                    slow_test: 'echo slow',
                },
                test_case_timeout_ms: 200,
            })

            const { checks } = await runGates({
                cwd: folder,
                config: both,
                install: null,
                test_files: [],
                report_file: join(folder, 'r.xml'),
                with_slow_tests: true,
            })

            expect(checks.map(({ command }) => command)).toEqual([
                'bun test --path-ignore-patterns=x --timeout=200',
                'echo pf',
                'echo slow',
            ])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test("the final review's slow tests never get --timeout", async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-limit-'))
        try {
            const slow = EngineConfigSchema.parse({
                checks: {
                    test: 'true',
                    slow_test: 'bun test --path-ignore-patterns=x',
                },
                test_case_timeout_ms: 200,
            })

            const { checks } = await runSlowTests({
                cwd: folder,
                config: slow,
                test_files: [],
                report_file: join(folder, 'r.xml'),
            })

            expect(checks.map(({ command }) => command)).toEqual([
                'bun test --path-ignore-patterns=x',
            ])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)
})
