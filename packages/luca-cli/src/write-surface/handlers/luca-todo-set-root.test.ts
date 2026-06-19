import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaTodoSetRootTool } from './luca-todo-set-root.ts'

const ROOT_ULID = '01KVEGY63GTYVVXK38AP9C90HC'

async function readConfig(cwd: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(cwd, '.luca/config.json'), 'utf-8'))
}

describe('luca_todo_set_root', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-todo-set-root-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes muninn.todoBacklog = { vault, rootId } and preserves other keys', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({
                muninn: { vault: 'my-project' },
                preferences: { schemaVersion: 1 },
            })
        )

        const parsed = lucaTodoSetRootTool.inputSchema.parse({ id: ROOT_ULID })
        const r = await lucaTodoSetRootTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const config = await readConfig(cwd)
        const muninn = config.muninn as Record<string, unknown>
        expect(muninn.vault).toBe('my-project')
        expect(muninn.todoBacklog).toEqual({
            vault: 'my-project',
            rootId: ROOT_ULID,
        })
        // Unrelated sections are preserved verbatim.
        expect(config.preferences).toEqual({ schemaVersion: 1 })
    })

    test('records the resolved vault (defaults when config has none)', async () => {
        const parsed = lucaTodoSetRootTool.inputSchema.parse({ id: ROOT_ULID })
        const r = await lucaTodoSetRootTool.handler(parsed, { cwd })
        expect(r.isError).toBeFalsy()
        const muninn = (await readConfig(cwd)).muninn as Record<string, unknown>
        expect(muninn.todoBacklog).toEqual({
            vault: 'default',
            rootId: ROOT_ULID,
        })
    })

    test('rejects a non-ULID id at the schema level', () => {
        expect(
            lucaTodoSetRootTool.inputSchema.safeParse({ id: 'not-a-ulid' })
                .success
        ).toBe(false)
        expect(
            lucaTodoSetRootTool.inputSchema.safeParse({ id: '' }).success
        ).toBe(false)
        expect(
            lucaTodoSetRootTool.inputSchema.safeParse({ id: ROOT_ULID }).success
        ).toBe(true)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaTodoSetRootTool.allowedPhases).toBeUndefined()
    })
})
