import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaPhaseAdvanceTool } from './luca-phase-advance.ts'

describe('lucaPhaseAdvanceTool', () => {
    let cwd: string

    const base = (currentPhase: number) => ({
        pipelineStep: 'learn',
        currentPhase,
        totalPhases: 3,
        roadmap: [
            { name: 'a', deps: [], status: 'in-progress' },
            { name: 'b', deps: [], status: 'pending' },
            { name: 'c', deps: [], status: 'pending' },
        ],
    })

    const writeState = (s: unknown) =>
        writeFile(join(cwd, '.luca/state.json'), JSON.stringify(s))
    const readState = async () =>
        JSON.parse(await readFile(join(cwd, '.luca/state.json'), 'utf-8'))

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-advance-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })
    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('advances currentPhase and updates leaving/entering statuses', async () => {
        await writeState(base(1))
        const r = await lucaPhaseAdvanceTool.handler({}, { cwd })
        expect(r.isError).toBeUndefined()
        const s = await readState()
        expect(s.currentPhase).toBe(2)
        expect(s.roadmap[0].status).toBe('complete')
        expect(s.roadmap[1].status).toBe('in-progress')
    })

    test('errors when no active phase (currentPhase=0)', async () => {
        await writeState(base(0))
        const r = await lucaPhaseAdvanceTool.handler({}, { cwd })
        expect(r.isError).toBe(true)
    })

    test('errors at the final phase (nothing to advance to)', async () => {
        await writeState(base(3))
        const r = await lucaPhaseAdvanceTool.handler({}, { cwd })
        expect(r.isError).toBe(true)
    })
})
