import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { lucaPhaseWriteAuditTool } from './luca-phase-write-audit.ts'
import { lucaPhaseWriteContextTool } from './luca-phase-write-context.ts'
import { lucaPhaseWritePlanTool } from './luca-phase-write-plan.ts'
import { lucaPhaseWriteResearchTool } from './luca-phase-write-research.ts'

async function setupProject(
    cwd: string,
    state: Record<string, unknown>,
): Promise<void> {
    await mkdir(join(cwd, '.luca'), { recursive: true })
    await writeFile(join(cwd, '.luca/state.json'), JSON.stringify(state))
}

describe('luca_phase_write_plan', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-write-plan-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes .luca/phases/<slug>/plan.md with the supplied content', async () => {
        await setupProject(cwd, {
            pipelineStep: 'plan',
            currentPhase: 1,
            roadmap: [{ name: 'auth-rewrite', deps: [], status: 'pending' }],
        })

        const result = await lucaPhaseWritePlanTool.handler(
            { content: '# Plan\n\nSteps...' },
            { cwd },
        )

        expect(result.isError).toBeFalsy()
        const target = join(cwd, '.luca/phases/01-auth-rewrite/plan.md')
        expect(existsSync(target)).toBe(true)
        const content = await readFile(target, 'utf-8')
        expect(content).toBe('# Plan\n\nSteps...')
    })

    test('errors when no active phase (currentPhase=0)', async () => {
        await setupProject(cwd, {
            pipelineStep: 'plan',
            currentPhase: 0,
        })

        const result = await lucaPhaseWritePlanTool.handler(
            { content: 'x' },
            { cwd },
        )
        expect(result.isError).toBe(true)
    })

    test('declares allowedPhases: [plan]', () => {
        expect(lucaPhaseWritePlanTool.allowedPhases).toEqual(['plan'])
    })
})

describe('luca_phase_write_research', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-write-research-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes .luca/phases/<slug>/research.md', async () => {
        await setupProject(cwd, {
            pipelineStep: 'research',
            currentPhase: 1,
            roadmap: [{ name: 'auth-rewrite', deps: [], status: 'pending' }],
        })

        const result = await lucaPhaseWriteResearchTool.handler(
            { content: '## Findings' },
            { cwd },
        )

        expect(result.isError).toBeFalsy()
        const content = await readFile(
            join(cwd, '.luca/phases/01-auth-rewrite/research.md'),
            'utf-8',
        )
        expect(content).toBe('## Findings')
    })

    test('declares allowedPhases: [research]', () => {
        expect(lucaPhaseWriteResearchTool.allowedPhases).toEqual(['research'])
    })
})

describe('luca_phase_write_context', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-write-context-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes .luca/phases/<slug>/context.md', async () => {
        await setupProject(cwd, {
            pipelineStep: 'discuss',
            currentPhase: 1,
            roadmap: [{ name: 'auth', deps: [], status: 'pending' }],
        })

        const result = await lucaPhaseWriteContextTool.handler(
            { content: 'User said yes' },
            { cwd },
        )

        expect(result.isError).toBeFalsy()
        const content = await readFile(
            join(cwd, '.luca/phases/01-auth/context.md'),
            'utf-8',
        )
        expect(content).toBe('User said yes')
    })

    test('declares allowedPhases: [discuss]', () => {
        expect(lucaPhaseWriteContextTool.allowedPhases).toEqual(['discuss'])
    })
})

describe('luca_phase_write_audit', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-write-audit-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes .luca/phases/<slug>/audits/<reviewer>.md', async () => {
        await setupProject(cwd, {
            pipelineStep: 'review',
            currentPhase: 1,
            roadmap: [{ name: 'auth', deps: [], status: 'in-progress' }],
        })

        const result = await lucaPhaseWriteAuditTool.handler(
            { reviewer: 'code-review', content: '## Findings\n\nLooks good.' },
            { cwd },
        )

        expect(result.isError).toBeFalsy()
        const content = await readFile(
            join(cwd, '.luca/phases/01-auth/audits/code-review.md'),
            'utf-8',
        )
        expect(content).toContain('Findings')
    })

    test('declares allowedPhases: [review]', () => {
        expect(lucaPhaseWriteAuditTool.allowedPhases).toEqual(['review'])
    })

    test('input schema rejects invalid reviewer name (uppercase)', async () => {
        await setupProject(cwd, {
            pipelineStep: 'review',
            currentPhase: 1,
            roadmap: [{ name: 'auth', deps: [], status: 'pending' }],
        })

        const parseResult = lucaPhaseWriteAuditTool.inputSchema.safeParse({
            reviewer: 'CodeReview',
            content: 'x',
        })
        expect(parseResult.success).toBe(false)
    })
})
