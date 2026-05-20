import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lucaChecksRunTool } from './luca-checks-run.ts'

interface RunResult {
    passed: boolean
    summary: Array<{
        label: string
        argv: string[]
        ok: boolean
        exitCode: number | null
        timedOut: boolean
        stdout: string
        stderr: string
    }>
}

describe('luca_checks_run', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-checks-run-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('runs a passing command and reports passed=true', async () => {
        const r = await lucaChecksRunTool.handler(
            {
                commands: [
                    { argv: ['true'], label: 'noop' },
                ],
                timeout_ms: 5000,
            },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse(
            (r.content[0] as { text: string }).text,
        ) as RunResult
        expect(parsed.passed).toBe(true)
        expect(parsed.summary[0]!.ok).toBe(true)
        expect(parsed.summary[0]!.exitCode).toBe(0)
        expect(parsed.summary[0]!.label).toBe('noop')
    })

    test('captures stderr and marks failed when exit code nonzero', async () => {
        const r = await lucaChecksRunTool.handler(
            {
                commands: [
                    {
                        argv: ['sh', '-c', 'echo bad >&2; exit 1'],
                        label: 'fail-cmd',
                    },
                ],
                timeout_ms: 5000,
            },
            { cwd },
        )

        expect(r.isError).toBe(true)
        const parsed = JSON.parse(
            (r.content[0] as { text: string }).text,
        ) as RunResult
        expect(parsed.passed).toBe(false)
        expect(parsed.summary[0]!.ok).toBe(false)
        expect(parsed.summary[0]!.exitCode).toBe(1)
        expect(parsed.summary[0]!.stderr).toContain('bad')
    })

    test('times out a hanging command and kills the process', async () => {
        const start = Date.now()
        const r = await lucaChecksRunTool.handler(
            {
                commands: [
                    { argv: ['sleep', '30'], label: 'hang' },
                ],
                timeout_ms: 250,
            },
            { cwd },
        )
        const elapsed = Date.now() - start

        // Must return well before the 30s sleep completes.
        expect(elapsed).toBeLessThan(5000)
        expect(r.isError).toBe(true)
        const parsed = JSON.parse(
            (r.content[0] as { text: string }).text,
        ) as RunResult
        expect(parsed.summary[0]!.timedOut).toBe(true)
        expect(parsed.summary[0]!.ok).toBe(false)
    })

    test('runs multiple commands sequentially and aggregates', async () => {
        const r = await lucaChecksRunTool.handler(
            {
                commands: [
                    { argv: ['true'], label: 'first' },
                    { argv: ['true'], label: 'second' },
                ],
                timeout_ms: 5000,
            },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse(
            (r.content[0] as { text: string }).text,
        ) as RunResult
        expect(parsed.passed).toBe(true)
        expect(parsed.summary).toHaveLength(2)
        expect(parsed.summary.map((s) => s.label)).toEqual([
            'first',
            'second',
        ])
    })

    test('marks overall failed when any command fails', async () => {
        const r = await lucaChecksRunTool.handler(
            {
                commands: [
                    { argv: ['true'], label: 'ok' },
                    {
                        argv: ['sh', '-c', 'exit 2'],
                        label: 'bad',
                    },
                ],
                timeout_ms: 5000,
            },
            { cwd },
        )

        expect(r.isError).toBe(true)
        const parsed = JSON.parse(
            (r.content[0] as { text: string }).text,
        ) as RunResult
        expect(parsed.passed).toBe(false)
        expect(parsed.summary[0]!.ok).toBe(true)
        expect(parsed.summary[1]!.ok).toBe(false)
    })

    test('rejects timeout_ms outside [100, 600000]', () => {
        const r1 = lucaChecksRunTool.inputSchema.safeParse({
            commands: [{ argv: ['true'] }],
            timeout_ms: 50,
        })
        expect(r1.success).toBe(false)
        const r2 = lucaChecksRunTool.inputSchema.safeParse({
            commands: [{ argv: ['true'] }],
            timeout_ms: 600001,
        })
        expect(r2.success).toBe(false)
    })

    test('rejects empty argv', () => {
        const r = lucaChecksRunTool.inputSchema.safeParse({
            commands: [{ argv: [] }],
        })
        expect(r.success).toBe(false)
    })

    test('declares allowedPhases: [execute, checks]', () => {
        expect(lucaChecksRunTool.allowedPhases).toEqual(['execute', 'checks'])
    })
})
