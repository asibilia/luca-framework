import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { runGates } from './gate-runner'

import { EngineConfigSchema } from '../config/engine-config'

/** A ticket's own slow test files in the gates (#564). */

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

    test("the gates' test cases are those of the fast runs and the own-files run, with their expect() counts (#581)", async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-own-slow-'))
        try {
            await Bun.write(join(folder, 'fast.test.ts'), PASSING)
            await Bun.write(
                join(folder, 'own.e2e.test.ts'),
                "import { test } from 'bun:test'; test('own', () => {})"
            )
            const ran = await runGates({
                cwd: folder,
                config,
                install: null,
                test_files: ['fast.test.ts', 'own.e2e.test.ts'],
                report_file: join(folder, 'report.xml'),
                own_test_files: ['own.e2e.test.ts'],
            })

            expect(ran.ok).toBe(true)
            expect(
                ran.cases.map(({ file, full_name, status, assertions }) => ({
                    file,
                    full_name,
                    status,
                    assertions,
                }))
            ).toEqual([
                {
                    file: 'fast.test.ts',
                    full_name: 'fast',
                    status: 'passed',
                    assertions: 1,
                },
                {
                    file: 'own.e2e.test.ts',
                    full_name: 'own',
                    status: 'passed',
                    assertions: 0,
                },
            ])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('with a junit command in the config, a changed .swift test file is never passed to bun test (#668)', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-own-slow-'))
        try {
            const swift = 'Tests/CalcTests/AddingTests.swift'
            await Bun.write(join(folder, 'fast.test.ts'), PASSING)
            await Bun.write(
                join(folder, swift),
                'import Testing\n\n@Test func addsTwoNumbers() { #expect(true) }\n'
            )
            // A stand-in for swift test: it writes a JUnit file with no cases.
            await Bun.write(
                join(folder, 'junit.sh'),
                "mkdir -p out\nprintf '<testsuites></testsuites>' > out/core.xml\n"
            )
            const ran = await runGates({
                cwd: folder,
                config: EngineConfigSchema.parse({
                    checks: {
                        test: [
                            "bun test --path-ignore-patterns='**/*.e2e.test.ts'",
                            {
                                run: 'sh junit.sh',
                                results: 'junit',
                                junit_path: 'out/core.xml',
                            },
                        ],
                        slow_test: 'bun test .e2e.test',
                    },
                }),
                install: null,
                test_files: ['fast.test.ts', swift],
                report_file: join(folder, 'report.xml'),
                own_test_files: [swift],
            })

            expect(ran.checks[0]?.ok).toBe(true)
            expect(
                ran.checks.filter(({ command }) => command.includes('.swift'))
            ).toEqual([])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)

    test('a pass_fail command, and gates that stop at a failed install, give no cases', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-own-slow-'))
        try {
            const passFail = await runGates({
                cwd: folder,
                config: EngineConfigSchema.parse({ checks: { test: 'true' } }),
                install: null,
                test_files: [],
                report_file: join(folder, 'report.xml'),
            })
            expect(passFail.cases).toEqual([])

            const noInstall = await runGates({
                cwd: folder,
                config,
                install: 'false',
                test_files: [],
                report_file: join(folder, 'report.xml'),
            })
            expect(noInstall.ok).toBe(false)
            expect(noInstall.cases).toEqual([])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)
})
