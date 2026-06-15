import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaTodoUpdateTool } from './luca-todo-update.ts'

const baseState = {
    currentPhase: 1,
    pipelineStep: 'review',
    roadmap: [{ name: 'auth-rewrite', deps: [], status: 'in-progress' }],
}

// A schema-complete verify.json wrapper. The handler `safeParse`s the whole
// VerificationResultSchema before the criterion lookup, so fixtures must carry
// every required field a real `writeVerificationResult` output has.
const verifyBase = {
    timestamp: '2026-06-15T12:00:00Z',
    wave: 1,
    mode: 'full',
    checks: [],
    convergence: 'resolved',
    errorFingerprints: [],
    recommendation: 'proceed',
}

async function setupProject(
    cwd: string,
    opts: { verify?: unknown; vault?: string } = {}
): Promise<void> {
    await mkdir(join(cwd, '.luca/phases/01-auth-rewrite'), {
        recursive: true,
    })
    await writeFile(join(cwd, '.luca/state.json'), JSON.stringify(baseState))
    if (opts.vault) {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({ muninn: { vault: opts.vault } })
        )
    }
    if (opts.verify) {
        await writeFile(
            join(cwd, '.luca/phases/01-auth-rewrite/verify.json'),
            JSON.stringify(opts.verify)
        )
    }
}

describe('luca_todo_update', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-todo-update-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('emits muninn_remember instruction for non-terminal status', async () => {
        await setupProject(cwd, { vault: 'my-project' })

        const parsed = lucaTodoUpdateTool.inputSchema.parse({
            id: 'auth-rewrite',
            title: 'Rewrite the auth middleware',
            status: 'backlog',
        })
        const r = await lucaTodoUpdateTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const instruction = JSON.parse((r.content[0] as { text: string }).text)
        expect(instruction.tool).toBe('mcp__muninn__muninn_remember')
        const args = JSON.parse(instruction.argsJson)
        expect(args.vault).toBe('my-project')
        expect(args.concept).toBe('todo:auth-rewrite')
        const todo = JSON.parse(args.content)
        expect(todo.status).toBe('backlog')
        expect(typeof todo.updatedAt).toBe('string')
    })

    test('rejects status=done without verificationRef', async () => {
        await setupProject(cwd)

        const parsed = lucaTodoUpdateTool.inputSchema.parse({
            id: 'auth-rewrite',
            title: 'x',
            status: 'done',
        })
        const r = await lucaTodoUpdateTool.handler(parsed, { cwd })

        expect(r.isError).toBe(true)
        expect((r.content[0] as { text: string }).text).toContain(
            'verificationRef'
        )
    })

    test('accepts status=done when verificationRef points at met PASS criterion', async () => {
        await setupProject(cwd, {
            verify: {
                ...verifyBase,
                status: 'PASS',
                criteria: [
                    {
                        criterionId: 'ac-01',
                        description: 'auth middleware rewritten',
                        met: true,
                        evidence: 'src/auth.ts:42',
                        blocking: true,
                    },
                ],
            },
        })

        const parsed = lucaTodoUpdateTool.inputSchema.parse({
            id: 'auth-rewrite',
            title: 'x',
            status: 'done',
            verificationRef: { criterionId: 'ac-01' },
        })
        const r = await lucaTodoUpdateTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const instruction = JSON.parse((r.content[0] as { text: string }).text)
        const todo = JSON.parse(JSON.parse(instruction.argsJson).content)
        expect(todo.status).toBe('done')
        expect(todo.verificationRef.criterionId).toBe('ac-01')
    })

    test('rejects status=done when criterion is unmet', async () => {
        await setupProject(cwd, {
            verify: {
                ...verifyBase,
                status: 'FAIL',
                recommendation: 'fix',
                criteria: [
                    {
                        criterionId: 'ac-01',
                        description: 'auth middleware rewritten',
                        met: false,
                        evidence: 'x',
                        blocking: true,
                    },
                ],
            },
        })

        const parsed = lucaTodoUpdateTool.inputSchema.parse({
            id: 'auth-rewrite',
            title: 'x',
            status: 'done',
            verificationRef: { criterionId: 'ac-01' },
        })
        const r = await lucaTodoUpdateTool.handler(parsed, { cwd })

        expect(r.isError).toBe(true)
        expect((r.content[0] as { text: string }).text).toContain(
            'CRITERION_UNMET'
        )
    })

    test('rejects status=done when verify.json is missing', async () => {
        await setupProject(cwd)

        const parsed = lucaTodoUpdateTool.inputSchema.parse({
            id: 'auth-rewrite',
            title: 'x',
            status: 'done',
            verificationRef: { criterionId: 'ac-01' },
        })
        const r = await lucaTodoUpdateTool.handler(parsed, { cwd })

        expect(r.isError).toBe(true)
        expect((r.content[0] as { text: string }).text).toContain(
            'VERIFY_FILE_MISSING'
        )
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaTodoUpdateTool.allowedPhases).toBeUndefined()
    })
})
