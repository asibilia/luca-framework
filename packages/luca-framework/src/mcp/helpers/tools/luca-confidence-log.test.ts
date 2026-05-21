import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaConfidenceLogTool } from './luca-confidence-log.ts'

async function setupProject(
    cwd: string,
    state: Record<string, unknown>
): Promise<void> {
    await mkdir(join(cwd, '.luca'), { recursive: true })
    await writeFile(join(cwd, '.luca/state.json'), JSON.stringify(state))
}

const baseState = {
    currentPhase: 1,
    pipelineStep: 'execute',
    roadmap: [{ name: 'auth-rewrite', deps: [], status: 'in-progress' }],
}

describe('luca_confidence_log', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-confidence-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('appends a single JSONL line to confidence.jsonl', async () => {
        await setupProject(cwd, baseState)

        const r = await lucaConfidenceLogTool.handler(
            {
                score: 0.85,
                stage: 'verify',
                rationale: 'all tests green, no regressions',
            },
            { cwd }
        )

        expect(r.isError).toBeFalsy()
        const content = await readFile(
            join(cwd, '.luca/phases/01-auth-rewrite/confidence.jsonl'),
            'utf-8'
        )
        const lines = content.trim().split('\n')
        expect(lines).toHaveLength(1)
        const entry = JSON.parse(lines[0]!)
        expect(entry.score).toBe(0.85)
        expect(entry.stage).toBe('verify')
        expect(entry.rationale).toBe('all tests green, no regressions')
        expect(typeof entry.timestamp).toBe('string')
    })

    test('appends multiple entries preserving order', async () => {
        await setupProject(cwd, baseState)

        await lucaConfidenceLogTool.handler(
            { score: 0.5, stage: 'plan', rationale: 'initial estimate' },
            { cwd }
        )
        await lucaConfidenceLogTool.handler(
            { score: 0.7, stage: 'execute', rationale: 'wave 1 done' },
            { cwd }
        )
        await lucaConfidenceLogTool.handler(
            { score: 0.9, stage: 'verify', rationale: 'all green' },
            { cwd }
        )

        const content = await readFile(
            join(cwd, '.luca/phases/01-auth-rewrite/confidence.jsonl'),
            'utf-8'
        )
        const entries = content
            .trim()
            .split('\n')
            .map((l) => JSON.parse(l))
        expect(entries.map((e) => e.score)).toEqual([0.5, 0.7, 0.9])
        expect(entries.map((e) => e.stage)).toEqual([
            'plan',
            'execute',
            'verify',
        ])
    })

    test('rejects score outside 0–1', () => {
        const r1 = lucaConfidenceLogTool.inputSchema.safeParse({
            score: 1.1,
            stage: 'verify',
            rationale: 'x',
        })
        expect(r1.success).toBe(false)
        const r2 = lucaConfidenceLogTool.inputSchema.safeParse({
            score: -0.1,
            stage: 'verify',
            rationale: 'x',
        })
        expect(r2.success).toBe(false)
    })

    test('errors when no active phase (currentPhase=0)', async () => {
        await setupProject(cwd, { ...baseState, currentPhase: 0 })

        const r = await lucaConfidenceLogTool.handler(
            { score: 0.5, stage: 'plan', rationale: 'x' },
            { cwd }
        )

        expect(r.isError).toBe(true)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaConfidenceLogTool.allowedPhases).toBeUndefined()
    })
})
