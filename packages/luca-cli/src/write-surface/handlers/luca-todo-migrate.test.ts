import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaTodoMigrateTool } from './luca-todo-migrate.ts'

const ROOT_ULID = '01KVEGY63GTYVVXK38AP9C90HC'

function procedureFrom(r: { content: { type: string; text?: string }[] }) {
    return JSON.parse((r.content[0] as { text: string }).text)
}

describe('luca_todo_migrate', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-todo-migrate-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('cached root → recall_tree (dedupe) + recall (flat), re-add via add_child/forget', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({
                muninn: {
                    vault: 'my-project',
                    todoBacklog: { vault: 'my-project', rootId: ROOT_ULID },
                },
            })
        )

        const parsed = lucaTodoMigrateTool.inputSchema.parse({})
        const r = await lucaTodoMigrateTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const proc = procedureFrom(r)
        expect(proc.steps.map((s: { tool: string }) => s.tool)).toEqual([
            'mcp__muninn__muninn_recall_tree',
            'mcp__muninn__muninn_recall',
        ])
        // recall_tree dedupe source uses the real cached root id.
        expect(JSON.parse(proc.steps[0].argsJson).root_id).toBe(ROOT_ULID)
        // The flat-recall pass targets the legacy todo: prefix.
        const recallArgs = JSON.parse(proc.steps[1].argsJson)
        expect(recallArgs.context).toEqual(['todo:'])
        expect(recallArgs.limit).toBe(200)
        // The loop re-homes via add_child + forget (not link).
        expect(proc.instructionForAgent).toContain('muninn_add_child')
        expect(proc.instructionForAgent).toContain('muninn_forget')
    })

    test('no cached root → bootstrap (remember_tree + recall), set-root instruction', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({ muninn: { vault: 'my-project' } })
        )
        const parsed = lucaTodoMigrateTool.inputSchema.parse({})
        const r = await lucaTodoMigrateTool.handler(parsed, { cwd })
        const proc = procedureFrom(r)
        expect(proc.steps.map((s: { tool: string }) => s.tool)).toEqual([
            'mcp__muninn__muninn_remember_tree',
            'mcp__muninn__muninn_recall',
        ])
        expect(proc.instructionForAgent).toContain('luca todo set-root')
    })

    test('is explicit that legacy enumeration is best-effort', async () => {
        const parsed = lucaTodoMigrateTool.inputSchema.parse({})
        const r = await lucaTodoMigrateTool.handler(parsed, { cwd })
        expect(procedureFrom(r).instructionForAgent.toLowerCase()).toContain(
            'best-effort'
        )
    })

    test('rejects limit outside [1, 200]', () => {
        expect(
            lucaTodoMigrateTool.inputSchema.safeParse({ limit: 0 }).success
        ).toBe(false)
        expect(
            lucaTodoMigrateTool.inputSchema.safeParse({ limit: 201 }).success
        ).toBe(false)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaTodoMigrateTool.allowedPhases).toBeUndefined()
    })
})
