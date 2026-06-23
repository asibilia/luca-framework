import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaBrainRecallRootTool } from './luca-brain-recall-root.ts'

const ROOT_ULID = '01KVEGY63GTYVVXK38AP9C90HC'

function textFrom(r: { content: { type: string; text?: string }[] }) {
    return (r.content[0] as { text: string }).text
}

async function writeConfig(cwd: string, config: unknown): Promise<void> {
    await writeFile(join(cwd, '.luca/config.json'), JSON.stringify(config))
}

describe('luca_brain_recall_root', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-brain-recall-root-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('cached root → single recall_tree procedure with the real ULID (no concept)', async () => {
        await writeConfig(cwd, {
            muninn: {
                vault: 'my-project',
                brainRoots: {
                    'brain:project-identity': {
                        vault: 'my-project',
                        rootId: ROOT_ULID,
                    },
                },
            },
        })

        const parsed = lucaBrainRecallRootTool.inputSchema.parse({
            concept: 'brain:project-identity',
        })
        const r = await lucaBrainRecallRootTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const proc = JSON.parse(textFrom(r))
        expect(proc.kind).toBe('procedure')
        expect(proc.steps).toHaveLength(1)
        expect(proc.steps[0].tool).toBe('mcp__muninn__muninn_recall_tree')
        const args = JSON.parse(proc.steps[0].argsJson)
        expect(args.vault).toBe('my-project')
        // The real ULID is baked in — never a concept passed as root_id.
        expect(args.root_id).toBe(ROOT_ULID)
        // Reader is told recall_tree omits content.
        expect(proc.instructionForAgent).toContain('muninn_read')
    })

    test('uninitialized (no cached root) → plain notice, not a query', async () => {
        await writeConfig(cwd, { muninn: { vault: 'my-project' } })
        const parsed = lucaBrainRecallRootTool.inputSchema.parse({
            concept: 'brain:project-identity',
        })
        const r = await lucaBrainRecallRootTool.handler(parsed, { cwd })
        const text = textFrom(r)
        expect(text).not.toContain('"kind"')
        expect(text).toContain('not initialized')
        expect(text).toContain('brain:project-identity')
    })

    test('cached root recorded under a different vault is ignored', async () => {
        await writeConfig(cwd, {
            muninn: {
                vault: 'my-project',
                brainRoots: {
                    'brain:project-identity': {
                        vault: 'other-vault',
                        rootId: ROOT_ULID,
                    },
                },
            },
        })
        const parsed = lucaBrainRecallRootTool.inputSchema.parse({
            concept: 'brain:project-identity',
        })
        const r = await lucaBrainRecallRootTool.handler(parsed, { cwd })
        expect(textFrom(r)).toContain('not initialized')
    })

    test('rejects a non-brain concept', () => {
        expect(
            lucaBrainRecallRootTool.inputSchema.safeParse({ concept: 'todo:x' })
                .success
        ).toBe(false)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaBrainRecallRootTool.allowedPhases).toBeUndefined()
    })
})
