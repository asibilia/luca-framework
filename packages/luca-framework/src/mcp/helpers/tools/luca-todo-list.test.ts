import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaTodoListTool } from './luca-todo-list.ts'

describe('luca_todo_list', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-todo-list-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns muninn_recall instruction with todo: prefix context', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({ muninn: { vault: 'my-project' } })
        )

        const parsed = lucaTodoListTool.inputSchema.parse({})
        const r = await lucaTodoListTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const instruction = JSON.parse((r.content[0] as { text: string }).text)
        expect(instruction.tool).toBe('mcp__muninn__muninn_recall')
        const args = JSON.parse(instruction.argsJson)
        expect(args.vault).toBe('my-project')
        expect(args.context).toEqual(['todo:'])
        expect(args.mode).toBe('balanced')
    })

    test('includes a status filter hint when status is supplied', async () => {
        const parsed = lucaTodoListTool.inputSchema.parse({
            status: 'pending',
        })
        const r = await lucaTodoListTool.handler(parsed, { cwd })

        const instruction = JSON.parse((r.content[0] as { text: string }).text)
        // The filter is part of the instruction text (the agent applies
        // it post-recall because muninn doesn't filter by content
        // metadata).
        expect(instruction.instructionForAgent).toContain(
            'status === "pending"'
        )
        // Args themselves don't include status — recall doesn't filter on it.
        const args = JSON.parse(instruction.argsJson)
        expect(args.status).toBeUndefined()
    })

    test('respects limit override', async () => {
        const parsed = lucaTodoListTool.inputSchema.parse({ limit: 25 })
        const r = await lucaTodoListTool.handler(parsed, { cwd })
        const args = JSON.parse(
            JSON.parse((r.content[0] as { text: string }).text).argsJson
        )
        expect(args.limit).toBe(25)
    })

    test('default limit is 50', async () => {
        const parsed = lucaTodoListTool.inputSchema.parse({})
        const r = await lucaTodoListTool.handler(parsed, { cwd })
        const args = JSON.parse(
            JSON.parse((r.content[0] as { text: string }).text).argsJson
        )
        expect(args.limit).toBe(50)
    })

    test('rejects limit outside [1, 200]', () => {
        expect(
            lucaTodoListTool.inputSchema.safeParse({ limit: 0 }).success
        ).toBe(false)
        expect(
            lucaTodoListTool.inputSchema.safeParse({ limit: 201 }).success
        ).toBe(false)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaTodoListTool.allowedPhases).toBeUndefined()
    })
})
