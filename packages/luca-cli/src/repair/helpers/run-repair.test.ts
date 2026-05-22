import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runRepair } from './run-repair.ts'

describe('runRepair', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-repair-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns no-op result when .luca/ does not exist', async () => {
        const result = await runRepair({ cwd })
        expect(result.actions).toEqual([])
        expect(result.errors).toEqual([])
    })

    test('clears a stale lock (PID not running)', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        // PID 999999 is overwhelmingly likely to not be a running process.
        await writeFile(
            join(cwd, '.luca/lock.json'),
            JSON.stringify({
                pid: 999999,
                acquired_at: new Date().toISOString(),
            })
        )

        const result = await runRepair({ cwd })

        expect(existsSync(join(cwd, '.luca/lock.json'))).toBe(false)
        expect(
            result.actions.some((a) => a.includes('cleared stale lock'))
        ).toBe(true)
    })

    test('preserves a lock held by a running PID', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/lock.json'),
            JSON.stringify({
                pid: process.pid,
                acquired_at: new Date().toISOString(),
            })
        )

        const result = await runRepair({ cwd })

        expect(existsSync(join(cwd, '.luca/lock.json'))).toBe(true)
        // "held by running PID" is informational — it belongs in `notes`,
        // not `actions` (no repair was applied).
        expect(result.notes.some((a) => a.includes('held by'))).toBe(true)
        expect(result.actions).toEqual([])
    })

    test('reports state.json validation errors without auto-fixing', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        // Invalid: pipelineStep is not a valid enum value.
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'NOT_A_REAL_STEP' })
        )

        const result = await runRepair({ cwd })

        // The file is NOT overwritten — repair only diagnoses.
        const content = await Bun.file(join(cwd, '.luca/state.json')).text()
        expect(content).toContain('NOT_A_REAL_STEP')

        // But the error IS reported.
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors.join(' ')).toContain('state.json')
    })

    test('reports a valid state.json without complaint', async () => {
        const { lucaStateSchema } = await import('@alecsibilia/luca-core')
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify(lucaStateSchema.parse({}))
        )

        const result = await runRepair({ cwd })

        expect(result.errors).toEqual([])
    })
})
