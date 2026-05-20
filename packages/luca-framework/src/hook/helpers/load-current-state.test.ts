import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadCurrentState } from './load-current-state.ts'

describe('loadCurrentState', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-loadstate-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns pipelineStep idle when .luca/ does not exist', async () => {
        const state = await loadCurrentState({ cwd })
        expect(state.pipelineStep).toBe('idle')
    })

    test('returns pipelineStep idle when state.json does not exist', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        const state = await loadCurrentState({ cwd })
        expect(state.pipelineStep).toBe('idle')
    })

    test('returns pipelineStep idle when state.json is malformed', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(join(cwd, '.luca/state.json'), '{not valid json')
        const state = await loadCurrentState({ cwd })
        expect(state.pipelineStep).toBe('idle')
    })

    test('returns the parsed pipelineStep when state.json is valid', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'execute', currentPhase: 1 }),
        )
        const state = await loadCurrentState({ cwd })
        expect(state.pipelineStep).toBe('execute')
        expect(state.currentPhase).toBe(1)
    })

    test('tolerates legacy mastracode fields (profile, workflowVersion)', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                pipelineStep: 'plan',
                profile: 'balanced', // legacy
                workflowVersion: 'v2', // legacy
            }),
        )
        const state = await loadCurrentState({ cwd })
        expect(state.pipelineStep).toBe('plan')
    })

    test('maps legacy pipelineStep values (e.g. classify → triage)', async () => {
        await mkdir(join(cwd, '.luca'), { recursive: true })
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'classify' }),
        )
        const state = await loadCurrentState({ cwd })
        expect(state.pipelineStep).toBe('triage')
    })
})
