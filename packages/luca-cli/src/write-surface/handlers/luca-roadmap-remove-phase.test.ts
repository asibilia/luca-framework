import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaRoadmapRemovePhaseTool } from './luca-roadmap-remove-phase.ts'

async function readState(cwd: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(cwd, '.luca/state.json'), 'utf-8'))
}

async function seedState(
    cwd: string,
    overrides: Record<string, unknown> = {}
): Promise<void> {
    await writeFile(
        join(cwd, '.luca/state.json'),
        JSON.stringify({
            pipelineStep: 'plan',
            currentPhase: 1,
            totalPhases: 3,
            roadmap: [
                { name: 'fix auth', deps: [], status: 'in-progress' },
                { name: 'ws reconnect', deps: [], status: 'pending' },
                { name: 'profile page', deps: ['ws reconnect'], status: 'pending' },
            ],
            ...overrides,
        })
    )
}

function payloadOf(r: { content: Array<{ text: string }> }): {
    removed: { nn: string; slug: string; name: string }
    totalPhases: number
    currentPhase: number
    renamed: Array<{ from: string; to: string }>
    removedDir: string | null
} {
    return JSON.parse(r.content[0]!.text)
}

describe('luca_roadmap_remove_phase', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-roadmap-remove-phase-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('removes a future phase, RENUMBERS the tail, and renames its directory', async () => {
        await seedState(cwd)
        await mkdir(join(cwd, '.luca/phases/02-ws-reconnect'), {
            recursive: true,
        })
        await mkdir(join(cwd, '.luca/phases/03-profile-page'), {
            recursive: true,
        })
        await writeFile(
            join(cwd, '.luca/phases/03-profile-page/plan.md'),
            '# plan\n'
        )

        const parsed = lucaRoadmapRemovePhaseTool.inputSchema.parse({ nn: 2 })
        const r = await lucaRoadmapRemovePhaseTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const payload = payloadOf(r)
        expect(payload.removed.slug).toBe('02-ws-reconnect')
        expect(payload.renamed).toEqual([
            { from: '03-profile-page', to: '02-profile-page' },
        ])

        const state = await readState(cwd)
        expect(
            (state.roadmap as Array<{ name: string }>).map((p) => p.name)
        ).toEqual(['fix auth', 'profile page'])
        expect(state.totalPhases).toBe(2)
        expect(state.currentPhase).toBe(1)

        expect(existsSync(join(cwd, '.luca/phases/02-profile-page'))).toBe(true)
        expect(existsSync(join(cwd, '.luca/phases/03-profile-page'))).toBe(
            false
        )
        expect(
            await readFile(
                join(cwd, '.luca/phases/02-profile-page/plan.md'),
                'utf-8'
            )
        ).toBe('# plan\n')

        const md = await readFile(join(cwd, '.luca/roadmap.md'), 'utf-8')
        expect(md).not.toContain('ws-reconnect')
        expect(md).toContain('02-profile-page')
    })

    test('refuses to remove the active phase or any phase before it', async () => {
        await seedState(cwd, { currentPhase: 2 })

        for (const nn of [1, 2]) {
            const parsed = lucaRoadmapRemovePhaseTool.inputSchema.parse({ nn })
            const r = await lucaRoadmapRemovePhaseTool.handler(parsed, { cwd })
            expect(r.isError).toBe(true)
        }

        const state = await readState(cwd)
        expect((state.roadmap as unknown[]).length).toBe(3)
    })

    test('refuses an out-of-range nn', async () => {
        await seedState(cwd)
        const parsed = lucaRoadmapRemovePhaseTool.inputSchema.parse({ nn: 9 })
        const r = await lucaRoadmapRemovePhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBe(true)
    })

    test('deletes an EMPTY phase directory but preserves one with content', async () => {
        await seedState(cwd)
        await mkdir(join(cwd, '.luca/phases/02-ws-reconnect'), {
            recursive: true,
        })

        const parsed = lucaRoadmapRemovePhaseTool.inputSchema.parse({ nn: 2 })
        const r = await lucaRoadmapRemovePhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBeFalsy()
        expect(payloadOf(r).removedDir).toBe('.luca/phases/02-ws-reconnect')
        expect(existsSync(join(cwd, '.luca/phases/02-ws-reconnect'))).toBe(
            false
        )
    })

    test('preserves a non-empty phase directory and reports it', async () => {
        await seedState(cwd)
        await mkdir(join(cwd, '.luca/phases/02-ws-reconnect'), {
            recursive: true,
        })
        await writeFile(
            join(cwd, '.luca/phases/02-ws-reconnect/research.md'),
            '# research\n'
        )

        const parsed = lucaRoadmapRemovePhaseTool.inputSchema.parse({ nn: 2 })
        const r = await lucaRoadmapRemovePhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBeFalsy()
        expect(payloadOf(r).removedDir).toBeNull()
        // Directory kept in place under its OLD number — nothing is destroyed.
        expect(existsSync(join(cwd, '.luca/phases/02-ws-reconnect'))).toBe(true)
    })

    test('is phase-agnostic (no allowedPhases) and runs from a non-idle step', async () => {
        expect(lucaRoadmapRemovePhaseTool.allowedPhases).toBeUndefined()

        await seedState(cwd, { pipelineStep: 'execute' })
        const parsed = lucaRoadmapRemovePhaseTool.inputSchema.parse({ nn: 3 })
        const r = await lucaRoadmapRemovePhaseTool.handler(parsed, { cwd })
        expect(r.isError).toBeFalsy()
        expect((await readState(cwd)).pipelineStep).toBe('execute')
    })
})
