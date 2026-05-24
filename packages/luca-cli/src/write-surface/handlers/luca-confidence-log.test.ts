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

// Canonical ConfidenceEntrySchema payload — F1 fix: writer/reader round-trip.
function canonicalPayload(overrides: Partial<{
    phase: string
    wave: number
    task: string
    confidence: 'high' | 'medium' | 'low'
    category:
        | 'plan-gap'
        | 'design-choice'
        | 'convention-unclear'
        | 'requirement-ambiguous'
        | 'dependency-unknown'
        | 'scope-creep'
    decision: string
    alternatives: string[]
    reasoning: string
    risk: string
    files: string[]
    reviewHint?: string
}> = {}): {
    phase: string
    wave: number
    task: string
    confidence: 'high' | 'medium' | 'low'
    category:
        | 'plan-gap'
        | 'design-choice'
        | 'convention-unclear'
        | 'requirement-ambiguous'
        | 'dependency-unknown'
        | 'scope-creep'
    decision: string
    alternatives: string[]
    reasoning: string
    risk: string
    files: string[]
    reviewHint?: string
} {
    return {
        phase: 'auth-rewrite',
        wave: 1,
        task: 'task-1',
        confidence: 'high',
        category: 'plan-gap',
        decision: 'use bcrypt for password hashing',
        alternatives: ['scrypt', 'argon2'],
        reasoning: 'bcrypt is widely supported and the plan was vague',
        risk: 'argon2 might be required for compliance',
        files: ['src/auth.ts'],
        ...overrides,
    }
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
            canonicalPayload({
                confidence: 'high',
                category: 'plan-gap',
                task: 'verify-task',
            }),
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
        expect(entry.confidence).toBe('high')
        expect(entry.category).toBe('plan-gap')
        expect(entry.task).toBe('verify-task')
        expect(entry.alternatives).toEqual(['scrypt', 'argon2'])
        expect(typeof entry.timestamp).toBe('string')
    })

    test('appends multiple entries preserving order', async () => {
        await setupProject(cwd, baseState)

        await lucaConfidenceLogTool.handler(
            canonicalPayload({ task: 'task-a', confidence: 'low' }),
            { cwd }
        )
        await lucaConfidenceLogTool.handler(
            canonicalPayload({ task: 'task-b', confidence: 'medium' }),
            { cwd }
        )
        await lucaConfidenceLogTool.handler(
            canonicalPayload({ task: 'task-c', confidence: 'high' }),
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
        expect(entries.map((e) => e.task)).toEqual([
            'task-a',
            'task-b',
            'task-c',
        ])
        expect(entries.map((e) => e.confidence)).toEqual([
            'low',
            'medium',
            'high',
        ])
    })

    test('rejects payloads missing canonical fields', () => {
        // Missing required fields: phase, wave, task, decision, etc.
        const r1 = lucaConfidenceLogTool.inputSchema.safeParse({
            confidence: 'high',
        })
        expect(r1.success).toBe(false)
    })

    test('rejects invalid `confidence` enum value', () => {
        const payload = canonicalPayload()
        const r = lucaConfidenceLogTool.inputSchema.safeParse({
            ...payload,
            confidence: 'not-a-valid-level',
        })
        expect(r.success).toBe(false)
    })

    test('rejects invalid `category` enum value', () => {
        const payload = canonicalPayload()
        const r = lucaConfidenceLogTool.inputSchema.safeParse({
            ...payload,
            category: 'not-a-valid-category',
        })
        expect(r.success).toBe(false)
    })

    test('accepts optional reviewHint', async () => {
        await setupProject(cwd, baseState)

        const r = await lucaConfidenceLogTool.handler(
            canonicalPayload({
                reviewHint: 'double-check bcrypt cost factor',
            }),
            { cwd }
        )
        expect(r.isError).toBeFalsy()

        const content = await readFile(
            join(cwd, '.luca/phases/01-auth-rewrite/confidence.jsonl'),
            'utf-8'
        )
        const entry = JSON.parse(content.trim())
        expect(entry.reviewHint).toBe('double-check bcrypt cost factor')
    })

    test('errors when no active phase (currentPhase=0)', async () => {
        await setupProject(cwd, { ...baseState, currentPhase: 0 })

        const r = await lucaConfidenceLogTool.handler(canonicalPayload(), {
            cwd,
        })

        expect(r.isError).toBe(true)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaConfidenceLogTool.allowedPhases).toBeUndefined()
    })
})
