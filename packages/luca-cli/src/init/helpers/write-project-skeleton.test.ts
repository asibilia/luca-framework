import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { writeProjectSkeleton } from './write-project-skeleton.ts'

describe('writeProjectSkeleton', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-skeleton-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('creates .luca/ directory and writes state.json with pipelineStep idle', async () => {
        await writeProjectSkeleton({ cwd })

        expect(existsSync(join(cwd, '.luca/state.json'))).toBe(true)
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('idle')
    })

    test('state.json parses cleanly with the canonical lucaStateSchema', async () => {
        // The skeleton must be a valid LucaState — defaults applied,
        // schema-strict-parseable.
        await writeProjectSkeleton({ cwd })

        const { lucaStateSchema } = await import('@alecsibilia/luca-core')
        const raw = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        const result = lucaStateSchema.safeParse(raw)
        expect(result.success).toBe(true)
    })

    test('writes config.json with lucaVersion and default oversight', async () => {
        await writeProjectSkeleton({ cwd })

        expect(existsSync(join(cwd, '.luca/config.json'))).toBe(true)
        const config = JSON.parse(
            await readFile(join(cwd, '.luca/config.json'), 'utf-8')
        )
        expect(typeof config.lucaVersion).toBe('string')
        expect(config.lucaVersion.length).toBeGreaterThan(0)
        expect(config.oversight).toBe('full-auto')
    })

    test('is idempotent: existing files are preserved on re-run', async () => {
        await writeProjectSkeleton({ cwd })

        // Mutate the state file as if a workflow has progressed
        const { writeFile } = await import('node:fs/promises')
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'plan', currentPhase: 3 }, null, 2)
        )

        // Second run should NOT clobber
        await writeProjectSkeleton({ cwd })

        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan')
        expect(state.currentPhase).toBe(3)
    })

    test('with force=true, overwrites existing files', async () => {
        await writeProjectSkeleton({ cwd })

        const { writeFile } = await import('node:fs/promises')
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'idle', sessionId: 'custom-session-id' }, null, 2)
        )

        // Without force=true, should NOT overwrite
        await writeProjectSkeleton({ cwd })
        let state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.sessionId).toBe('custom-session-id')

        // With force=true, should overwrite (since it is inactive state)
        await writeProjectSkeleton({ cwd, force: true })

        state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.sessionId).not.toBe('custom-session-id')
        expect(state.pipelineStep).toBe('idle')
    })
})
