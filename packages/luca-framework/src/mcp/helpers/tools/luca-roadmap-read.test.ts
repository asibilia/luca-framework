import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaRoadmapReadTool } from './luca-roadmap-read.ts'

describe('luca_roadmap_read', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-roadmap-read-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns empty array when state.json is missing', async () => {
        const r = await lucaRoadmapReadTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.roadmap).toEqual([])
        expect(parsed.currentPhase).toBe(0)
        expect(parsed.totalPhases).toBe(0)
    })

    test('returns roadmap entries with their statuses', async () => {
        await writeFile(
            join(cwd, '.luca/state.json'),
            JSON.stringify({
                currentPhase: 2,
                roadmap: [
                    {
                        name: 'auth-rewrite',
                        deps: [],
                        status: 'complete',
                    },
                    {
                        name: 'ws-reconnect',
                        deps: ['auth-rewrite'],
                        status: 'in-progress',
                    },
                    {
                        name: 'profile-page',
                        deps: ['ws-reconnect'],
                        status: 'pending',
                    },
                ],
            })
        )

        const r = await lucaRoadmapReadTool.handler({}, { cwd })

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.roadmap).toHaveLength(3)
        expect(parsed.roadmap[1].name).toBe('ws-reconnect')
        expect(parsed.roadmap[1].deps).toEqual(['auth-rewrite'])
        expect(parsed.currentPhase).toBe(2)
        expect(parsed.totalPhases).toBe(3)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaRoadmapReadTool.allowedPhases).toBeUndefined()
    })
})
