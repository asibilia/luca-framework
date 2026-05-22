import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaPhaseWriteLearnTool } from './luca-phase-write-learn.ts'
import { lucaPhaseWritePlanReviewTool } from './luca-phase-write-plan-review.ts'
import { lucaPhaseWriteSummaryTool } from './luca-phase-write-summary.ts'
import { lucaPhaseWriteVerifyTool } from './luca-phase-write-verify.ts'
import { lucaPhaseWriteWaveTool } from './luca-phase-write-wave.ts'

async function setupProject(
    cwd: string,
    state: Record<string, unknown>
): Promise<void> {
    await mkdir(join(cwd, '.luca'), { recursive: true })
    await writeFile(join(cwd, '.luca/state.json'), JSON.stringify(state))
}

const baseState = {
    currentPhase: 1,
    roadmap: [{ name: 'auth-rewrite', deps: [], status: 'in-progress' }],
}

describe('luca_phase_write_summary', () => {
    let cwd: string
    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-summary-'))
    })
    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes execute/summary.md when pipelineStep is execute', async () => {
        await setupProject(cwd, { ...baseState, pipelineStep: 'execute' })
        const r = await lucaPhaseWriteSummaryTool.handler(
            { content: '## Summary\n\nDone.' },
            { cwd }
        )
        expect(r.isError).toBeFalsy()
        const content = await readFile(
            join(cwd, '.luca/phases/01-auth-rewrite/execute/summary.md'),
            'utf-8'
        )
        expect(content).toContain('Done')
    })

    test('declares allowedPhases: [execute]', () => {
        expect(lucaPhaseWriteSummaryTool.allowedPhases).toEqual(['execute'])
    })
})

describe('luca_phase_write_wave', () => {
    let cwd: string
    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-wave-'))
    })
    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes execute/waves/NN.md with zero-padded wave number', async () => {
        await setupProject(cwd, { ...baseState, pipelineStep: 'execute' })
        const r = await lucaPhaseWriteWaveTool.handler(
            { waveNumber: 3, content: '## Wave 3' },
            { cwd }
        )
        expect(r.isError).toBeFalsy()
        expect(
            existsSync(
                join(cwd, '.luca/phases/01-auth-rewrite/execute/waves/03.md')
            )
        ).toBe(true)
    })

    test('rejects wave number > 99', () => {
        const result = lucaPhaseWriteWaveTool.inputSchema.safeParse({
            waveNumber: 100,
            content: 'x',
        })
        expect(result.success).toBe(false)
    })

    test('declares allowedPhases: [execute]', () => {
        expect(lucaPhaseWriteWaveTool.allowedPhases).toEqual(['execute'])
    })
})

describe('luca_phase_write_verify', () => {
    let cwd: string
    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-verify-'))
    })
    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes verify.json with structured result object', async () => {
        await setupProject(cwd, { ...baseState, pipelineStep: 'verify' })
        const r = await lucaPhaseWriteVerifyTool.handler(
            {
                result: {
                    status: 'pass',
                    typecheck: true,
                    tests: { passed: 105, failed: 0 },
                },
            },
            { cwd }
        )
        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse(
            await readFile(
                join(cwd, '.luca/phases/01-auth-rewrite/verify.json'),
                'utf-8'
            )
        )
        expect(parsed.status).toBe('pass')
        expect(parsed.tests.passed).toBe(105)
    })

    test('declares allowedPhases: [verify]', () => {
        expect(lucaPhaseWriteVerifyTool.allowedPhases).toEqual(['verify'])
    })
})

describe('luca_phase_write_learn', () => {
    let cwd: string
    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-learn-'))
    })
    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes learn.md when pipelineStep is learn', async () => {
        await setupProject(cwd, { ...baseState, pipelineStep: 'learn' })
        const r = await lucaPhaseWriteLearnTool.handler(
            { content: '## Learnings\n\n- pattern: ...' },
            { cwd }
        )
        expect(r.isError).toBeFalsy()
        const content = await readFile(
            join(cwd, '.luca/phases/01-auth-rewrite/learn.md'),
            'utf-8'
        )
        expect(content).toContain('Learnings')
    })

    test('declares allowedPhases: [learn]', () => {
        expect(lucaPhaseWriteLearnTool.allowedPhases).toEqual(['learn'])
    })
})

describe('luca_phase_write_plan_review', () => {
    let cwd: string
    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-plan-review-'))
    })
    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes plan-review.md when pipelineStep is plan-review', async () => {
        await setupProject(cwd, {
            ...baseState,
            pipelineStep: 'plan-review',
        })
        const r = await lucaPhaseWritePlanReviewTool.handler(
            { content: '## Plan review\n\nApproved.' },
            { cwd }
        )
        expect(r.isError).toBeFalsy()
        const content = await readFile(
            join(cwd, '.luca/phases/01-auth-rewrite/plan-review.md'),
            'utf-8'
        )
        expect(content).toContain('Approved')
    })

    test('declares allowedPhases: [plan-review]', () => {
        expect(lucaPhaseWritePlanReviewTool.allowedPhases).toEqual([
            'plan-review',
        ])
    })
})

describe('phase write tools — common contract', () => {
    test('all 5 tools error when no active phase (currentPhase=0)', async () => {
        const cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-no-phase-'))
        await setupProject(cwd, { currentPhase: 0, pipelineStep: 'execute' })

        const r = await lucaPhaseWriteSummaryTool.handler(
            { content: 'x' },
            { cwd }
        )
        expect(r.isError).toBe(true)

        await rm(cwd, { recursive: true, force: true })
    })
})
