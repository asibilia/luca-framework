import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lucaPhaseCurrentTool } from './luca-phase-current.ts'

describe('luca_phase_current', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-phase-current-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('reports active:false when currentPhase is 0', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ pipelineStep: 'plan', currentPhase: 0 }),
        )

        const r = await lucaPhaseCurrentTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.active).toBe(false)
    })

    test('computes slug + NN + dir for an active phase', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                pipelineStep: 'plan',
                currentPhase: 1,
                roadmap: [
                    {
                        name: 'auth-rewrite',
                        deps: [],
                        status: 'in-progress',
                    },
                ],
            }),
        )

        const r = await lucaPhaseCurrentTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.active).toBe(true)
        expect(parsed.NN).toBe('01')
        expect(parsed.slug).toBe('01-auth-rewrite')
        expect(parsed.dir).toBe('.luca/phases/01-auth-rewrite')
    })

    test('zero-pads two-digit phase numbers', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                currentPhase: 12,
                roadmap: Array(12)
                    .fill(null)
                    .map((_, i) => ({
                        name: `phase-${i + 1}`,
                        deps: [],
                        status: 'pending',
                    })),
            }),
        )

        const r = await lucaPhaseCurrentTool.handler({}, { cwd })
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.NN).toBe('12')
        expect(parsed.slug).toBe('12-phase-12')
    })

    test('kebab-cases roadmap names with whitespace or capitals', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                currentPhase: 1,
                roadmap: [
                    { name: 'Auth Rewrite', deps: [], status: 'pending' },
                ],
            }),
        )

        const r = await lucaPhaseCurrentTool.handler({}, { cwd })
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.slug).toBe('01-auth-rewrite')
    })

    test('errors when currentPhase > 99 (out of slug range)', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ currentPhase: 100 }),
        )

        const r = await lucaPhaseCurrentTool.handler({}, { cwd })
        expect(r.isError).toBe(true)
    })

    test('errors when currentPhase has no matching roadmap entry', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({ currentPhase: 1, roadmap: [] }),
        )

        const r = await lucaPhaseCurrentTool.handler({}, { cwd })
        expect(r.isError).toBe(true)
    })
})
