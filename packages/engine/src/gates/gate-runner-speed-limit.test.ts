import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { runGates, runSlowTests } from './gate-runner'

import { EngineConfigSchema } from '../config/engine-config'

/** The fast test speed limit in the gates (#580). */

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
