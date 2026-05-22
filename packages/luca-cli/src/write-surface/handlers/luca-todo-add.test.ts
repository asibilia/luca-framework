import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaTodoAddTool } from './luca-todo-add.ts'

describe('luca_todo_add', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-todo-add-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('returns a muninn_remember instruction for the new todo', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({ muninn: { vault: 'my-project' } })
        )

        const parsed = lucaTodoAddTool.inputSchema.parse({
            title: 'Rewrite the auth middleware',
            body: 'Context body',
            source: 'gh-issue-#42',
        })
        const r = await lucaTodoAddTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const instruction = JSON.parse((r.content[0] as { text: string }).text)
        expect(instruction.tool).toBe('mcp__muninn__muninn_remember')

        const args = JSON.parse(instruction.argsJson)
        expect(args.vault).toBe('my-project')
        expect(args.concept).toBe('todo:rewrite-the-auth-middleware')
        // Content is the JSON-stringified Todo body.
        const todo = JSON.parse(args.content)
        expect(todo.schemaVersion).toBe(1)
        expect(todo.id).toBe('rewrite-the-auth-middleware')
        expect(todo.title).toBe('Rewrite the auth middleware')
        expect(todo.status).toBe('pending')
        expect(todo.source).toBe('gh-issue-#42')
        expect(typeof todo.updatedAt).toBe('string')
    })

    test('honors an explicit id when supplied', async () => {
        const parsed = lucaTodoAddTool.inputSchema.parse({
            title: 'whatever',
            id: 'custom-slug',
        })
        const r = await lucaTodoAddTool.handler(parsed, { cwd })
        const args = JSON.parse(
            JSON.parse((r.content[0] as { text: string }).text).argsJson
        )
        expect(args.concept).toBe('todo:custom-slug')
        const todo = JSON.parse(args.content)
        expect(todo.id).toBe('custom-slug')
    })

    test('falls back to "default" vault when config.json is missing', async () => {
        const parsed = lucaTodoAddTool.inputSchema.parse({
            title: 'a todo',
        })
        const r = await lucaTodoAddTool.handler(parsed, { cwd })
        const args = JSON.parse(
            JSON.parse((r.content[0] as { text: string }).text).argsJson
        )
        expect(args.vault).toBe('default')
    })

    test('rejects a title that yields an empty slug', async () => {
        const parsed = lucaTodoAddTool.inputSchema.parse({ title: '!!!' })
        const r = await lucaTodoAddTool.handler(parsed, { cwd })
        expect(r.isError).toBe(true)
    })

    test('does not allow setting status=done at create time', () => {
        // status is constrained at the schema level to pending|backlog.
        // done requires going through luca_todo_update with a
        // verificationRef.
        const r = lucaTodoAddTool.inputSchema.safeParse({
            title: 'x',
            status: 'done',
        })
        expect(r.success).toBe(false)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaTodoAddTool.allowedPhases).toBeUndefined()
    })
})
