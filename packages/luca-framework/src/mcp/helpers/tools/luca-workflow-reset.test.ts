import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lucaWorkflowResetTool } from './luca-workflow-reset.ts'

describe('luca_workflow_reset', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-workflow-reset-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('rewrites state.json to defaults when confirm=true', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                pipelineStep: 'execute',
                currentPhase: 3,
                roadmap: [{ name: 'old-thing', deps: [], status: 'complete' }],
                checksFixIteration: 2,
            }),
        )

        const r = await lucaWorkflowResetTool.handler(
            { confirm: true },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8'),
        )
        expect(parsed.pipelineStep).toBe('idle')
        expect(parsed.currentPhase).toBe(0)
        expect(parsed.roadmap).toEqual([])
        expect(parsed.checksFixIteration).toBe(0)
    })

    test('removes the pipeline lock if present', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'execute', currentPhase: 1 }),
        )
        await writeFile(
            join(cwd, '.luca/lock.json'),
            JSON.stringify({ pid: 12345, acquired_at: '2026-01-01T00:00:00Z' }),
        )

        const r = await lucaWorkflowResetTool.handler(
            { confirm: true },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        expect(existsSync(join(cwd, '.luca/lock.json'))).toBe(false)
    })

    test('refuses to reset when confirm is false (default)', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'execute', currentPhase: 3 }),
        )

        const r = await lucaWorkflowResetTool.handler(
            { confirm: false },
            { cwd },
        )

        expect(r.isError).toBe(true)
        const parsed = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8'),
        )
        // State must NOT have been touched.
        expect(parsed.pipelineStep).toBe('execute')
        expect(parsed.currentPhase).toBe(3)
    })

    test('creates state.json from defaults if file did not exist', async () => {
        const r = await lucaWorkflowResetTool.handler(
            { confirm: true },
            { cwd },
        )

        expect(r.isError).toBeFalsy()
        expect(existsSync(join(cwd, '.luca/state.json'))).toBe(true)
        const parsed = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8'),
        )
        expect(parsed.pipelineStep).toBe('idle')
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaWorkflowResetTool.allowedPhases).toBeUndefined()
    })
})
