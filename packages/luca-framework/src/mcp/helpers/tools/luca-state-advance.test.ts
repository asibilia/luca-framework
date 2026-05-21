import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaStateAdvanceTool } from './luca-state-advance.ts'

describe('luca_state_advance', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-advance-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'plan' })
        )
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('advances legally and writes the new step', async () => {
        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'plan-review' },
            { cwd }
        )

        expect(result.isError).toBeFalsy()
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan-review')
    })

    test('rejects illegal jumps with isError', async () => {
        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'milestone' },
            { cwd }
        )

        expect(result.isError).toBe(true)
        const text = (result.content[0] as { text: string }).text
        expect(text).toContain('illegal')

        // state.json unchanged
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan')
    })

    test('allows loop-back (plan-review → plan)', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'plan-review' })
        )

        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'plan' },
            { cwd }
        )

        expect(result.isError).toBeFalsy()
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan')
    })

    test('preserves other state fields on transition', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                pipelineStep: 'plan',
                currentPhase: 3,
                branchName: 'feat/x',
            })
        )

        await lucaStateAdvanceTool.handler({ toStep: 'plan-review' }, { cwd })

        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('plan-review')
        expect(state.currentPhase).toBe(3)
        expect(state.branchName).toBe('feat/x')
    })

    test('creates state.json from defaults when missing (idle → triage)', async () => {
        // Remove pre-existing state
        await rm(join(cwd, '.luca/state.json'), { force: true })

        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'triage' },
            { cwd }
        )

        expect(result.isError).toBeFalsy()
        const state = JSON.parse(
            await readFile(join(cwd, '.luca/state.json'), 'utf-8')
        )
        expect(state.pipelineStep).toBe('triage')
    })

    test('returns from + to in result text', async () => {
        const result = await lucaStateAdvanceTool.handler(
            { toStep: 'plan-review' },
            { cwd }
        )
        const text = (result.content[0] as { text: string }).text
        expect(text).toContain('plan')
        expect(text).toContain('plan-review')
    })
})
