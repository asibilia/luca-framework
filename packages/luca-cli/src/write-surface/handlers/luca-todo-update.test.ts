import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { TODO_ENGRAM_ID_PLACEHOLDER } from '../helpers/build-muninn-instruction.ts'
import { lucaTodoUpdateTool } from './luca-todo-update.ts'

const ROOT_ULID = '01KVEGY63GTYVVXK38AP9C90HC'

const baseState = {
    currentPhase: 1,
    pipelineStep: 'review',
    roadmap: [{ name: 'auth-rewrite', deps: [], status: 'in-progress' }],
}

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
    opts: { verify?: unknown; vault?: string; rootId?: string } = {}
): Promise<void> {
    await mkdir(join(cwd, '.luca/phases/01-auth-rewrite'), { recursive: true })
    await writeFile(join(cwd, '.luca/state.json'), JSON.stringify(baseState))
    if (opts.vault) {
        const muninn: Record<string, unknown> = { vault: opts.vault }
        if (opts.rootId) {
            muninn.todoBacklog = { vault: opts.vault, rootId: opts.rootId }
        }
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({ muninn })
        )
    }
    if (opts.verify) {
        await writeFile(
            join(cwd, '.luca/phases/01-auth-rewrite/verify.json'),
            JSON.stringify(opts.verify)
        )
    }
}

function procedureFrom(r: { content: { type: string; text?: string }[] }) {
    return JSON.parse((r.content[0] as { text: string }).text)
}

function stepArgs(
    proc: { steps: { tool: string; argsJson: string }[] },
    tool: string
): Record<string, unknown> {
    const step = proc.steps.find((s) => s.tool === tool)
    if (!step) throw new Error(`no ${tool} step`)
    return JSON.parse(step.argsJson)
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

    test('cached root: REPLACE via recall_tree + add_child + forget (never evolve)', async () => {
        await setupProject(cwd, { vault: 'my-project', rootId: ROOT_ULID })

        const parsed = lucaTodoUpdateTool.inputSchema.parse({
            id: 'auth-rewrite',
            title: 'Rewrite the auth middleware',
            status: 'backlog',
        })
        const r = await lucaTodoUpdateTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const proc = procedureFrom(r)
        const tools = proc.steps.map((s: { tool: string }) => s.tool)
        // Locate → add fresh child → forget old. No evolve (orphans the node),
        // no remember (dedups by content → duplicates).
        expect(tools).toEqual([
            'mcp__muninn__muninn_recall_tree',
            'mcp__muninn__muninn_add_child',
            'mcp__muninn__muninn_forget',
        ])
        expect(tools).not.toContain('mcp__muninn__muninn_evolve')
        expect(tools).not.toContain('mcp__muninn__muninn_remember')

        const addArgs = stepArgs(proc, 'mcp__muninn__muninn_add_child')
        expect(addArgs.parent_id).toBe(ROOT_ULID)
        expect(addArgs.concept).toBe('todo:auth-rewrite')
        expect(JSON.parse(addArgs.content as string).status).toBe('backlog')

        const forgetArgs = stepArgs(proc, 'mcp__muninn__muninn_forget')
        expect(forgetArgs.id).toBe(TODO_ENGRAM_ID_PLACEHOLDER)
    })

    test('no cached root → bootstrap (remember_tree + add_child, set-root instruction)', async () => {
        await setupProject(cwd, { vault: 'my-project' })

        const parsed = lucaTodoUpdateTool.inputSchema.parse({
            id: 'auth-rewrite',
            title: 'x',
            status: 'backlog',
        })
        const r = await lucaTodoUpdateTool.handler(parsed, { cwd })
        const proc = procedureFrom(r)
        expect(proc.steps.map((s: { tool: string }) => s.tool)).toEqual([
            'mcp__muninn__muninn_remember_tree',
            'mcp__muninn__muninn_add_child',
        ])
        expect(proc.instructionForAgent).toContain('luca todo set-root')
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
            vault: 'my-project',
            rootId: ROOT_ULID,
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
        const addArgs = stepArgs(
            procedureFrom(r),
            'mcp__muninn__muninn_add_child'
        )
        const todo = JSON.parse(addArgs.content as string)
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
