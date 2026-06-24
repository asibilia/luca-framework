import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaTodoListTool } from './luca-todo-list.ts'

const ROOT_ULID = '01KVEGY63GTYVVXK38AP9C90HC'

function textFrom(r: { content: { type: string; text?: string }[] }) {
    return (r.content[0] as { text: string }).text
}

async function writeConfigWithRoot(
    cwd: string,
    vault = 'my-project'
): Promise<void> {
    await writeFile(
        join(cwd, '.luca/config.json'),
        JSON.stringify({
            muninn: { vault, todoBacklog: { vault, rootId: ROOT_ULID } },
        })
    )
}

describe('luca_todo_list', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-todo-list-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('cached root → single deterministic recall_tree (no semantic recall)', async () => {
        await writeConfigWithRoot(cwd)

        const parsed = lucaTodoListTool.inputSchema.parse({})
        const r = await lucaTodoListTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const proc = JSON.parse(textFrom(r))
        expect(proc.kind).toBe('procedure')
        expect(proc.steps).toHaveLength(1)
        expect(proc.steps[0].tool).toBe('mcp__muninn__muninn_recall_tree')

        const treeArgs = JSON.parse(proc.steps[0].argsJson)
        expect(treeArgs.vault).toBe('my-project')
        // Real root id baked in — no resolution step, no semantic recall.
        expect(treeArgs.root_id).toBe(ROOT_ULID)
        expect(treeArgs.include_completed).toBe(true)
        // The agent is told to read each non-deleted child for content.
        expect(proc.instructionForAgent).toContain('muninn_read')
        expect(proc.instructionForAgent.toLowerCase()).toContain('deleted')
    })

    test('no cached root → plain "not initialized" message, NOT a doomed query', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({ muninn: { vault: 'my-project' } })
        )
        const parsed = lucaTodoListTool.inputSchema.parse({})
        const r = await lucaTodoListTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const text = textFrom(r)
        // Not a procedure — a human-readable empty/uninitialized notice.
        expect(text).not.toContain('"kind"')
        expect(text).toContain('not initialized')
        expect(text).toContain('my-project')
    })

    test('default limit is 0 (no cap — complete enumeration)', async () => {
        await writeConfigWithRoot(cwd)
        const parsed = lucaTodoListTool.inputSchema.parse({})
        const r = await lucaTodoListTool.handler(parsed, { cwd })
        const treeArgs = JSON.parse(JSON.parse(textFrom(r)).steps[0].argsJson)
        expect(treeArgs.limit).toBe(0)
    })

    test('respects an explicit positive limit (deliberate truncation)', async () => {
        await writeConfigWithRoot(cwd)
        const parsed = lucaTodoListTool.inputSchema.parse({ limit: 25 })
        const r = await lucaTodoListTool.handler(parsed, { cwd })
        const treeArgs = JSON.parse(JSON.parse(textFrom(r)).steps[0].argsJson)
        expect(treeArgs.limit).toBe(25)
    })

    test('includes a status filter hint when status is supplied', async () => {
        await writeConfigWithRoot(cwd)
        const parsed = lucaTodoListTool.inputSchema.parse({ status: 'pending' })
        const r = await lucaTodoListTool.handler(parsed, { cwd })
        expect(JSON.parse(textFrom(r)).instructionForAgent).toContain(
            'status === "pending"'
        )
    })

    test('rejects limit outside [0, 200]', () => {
        expect(
            lucaTodoListTool.inputSchema.safeParse({ limit: -1 }).success
        ).toBe(false)
        expect(
            lucaTodoListTool.inputSchema.safeParse({ limit: 201 }).success
        ).toBe(false)
        expect(
            lucaTodoListTool.inputSchema.safeParse({ limit: 0 }).success
        ).toBe(true)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaTodoListTool.allowedPhases).toBeUndefined()
    })
})
