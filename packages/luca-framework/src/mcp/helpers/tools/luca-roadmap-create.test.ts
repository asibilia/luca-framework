import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lucaRoadmapCreateTool } from './luca-roadmap-create.ts'

async function readState(cwd: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(cwd, '.luca/state.json'), 'utf-8'))
}

describe('luca_roadmap_create', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-roadmap-create-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('replaces the roadmap array and updates totalPhases', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                pipelineStep: 'triage',
                currentPhase: 0,
                roadmap: [],
            }),
        )

        const parsed = lucaRoadmapCreateTool.inputSchema.parse({
            phases: [
                { name: 'auth-rewrite' },
                { name: 'ws-reconnect', deps: ['auth-rewrite'] },
                { name: 'profile-page' },
            ],
        })
        const r = await lucaRoadmapCreateTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const state = await readState(cwd)
        const roadmap = state.roadmap as Array<{
            name: string
            status: string
            deps: string[]
        }>
        expect(roadmap).toHaveLength(3)
        expect(roadmap[0]!.name).toBe('auth-rewrite')
        expect(roadmap[0]!.status).toBe('pending')
        expect(roadmap[1]!.deps).toEqual(['auth-rewrite'])
        expect(state.totalPhases).toBe(3)
        expect(state.currentPhase).toBe(0)
    })

    test('preserves unrelated state fields', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                pipelineStep: 'triage',
                currentPhase: 0,
                roadmap: [],
                sessionId: 'sess-123',
                oversight: 'checkpoint',
                checksFixIteration: 0,
            }),
        )

        const parsed = lucaRoadmapCreateTool.inputSchema.parse({
            phases: [{ name: 'auth' }],
        })
        await lucaRoadmapCreateTool.handler(parsed, { cwd })

        const state = await readState(cwd)
        expect(state.sessionId).toBe('sess-123')
        expect(state.oversight).toBe('checkpoint')
    })

    test('rejects empty phases array', () => {
        const r = lucaRoadmapCreateTool.inputSchema.safeParse({ phases: [] })
        expect(r.success).toBe(false)
    })

    test('rejects entries with missing name', () => {
        const r = lucaRoadmapCreateTool.inputSchema.safeParse({
            phases: [{ deps: [] } as never],
        })
        expect(r.success).toBe(false)
    })

    test('declares allowedPhases: [idle, triage]', () => {
        expect(lucaRoadmapCreateTool.allowedPhases).toEqual(['idle', 'triage'])
    })
})
