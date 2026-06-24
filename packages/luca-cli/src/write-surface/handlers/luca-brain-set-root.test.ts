import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaBrainSetRootTool } from './luca-brain-set-root.ts'

const ULID_A = '01KVEGY63GTYVVXK38AP9C90HC'
const ULID_B = '01KVEN4ZWFVDT3ZPGKBAJ2YPMB'

async function readConfig(cwd: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readFile(join(cwd, '.luca/config.json'), 'utf-8'))
}

describe('luca_brain_set_root', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-brain-set-root-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('writes muninn.brainRoots[concept] = { vault, rootId }, preserving other keys', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({
                muninn: { vault: 'my-project' },
                preferences: { schemaVersion: 1 },
            })
        )

        const parsed = lucaBrainSetRootTool.inputSchema.parse({
            concept: 'brain:project-identity',
            id: ULID_A,
        })
        const r = await lucaBrainSetRootTool.handler(parsed, { cwd })

        expect(r.isError).toBeFalsy()
        const muninn = (await readConfig(cwd)).muninn as Record<string, unknown>
        expect(muninn.vault).toBe('my-project')
        expect(muninn.brainRoots).toEqual({
            'brain:project-identity': {
                vault: 'my-project',
                rootId: ULID_A,
            },
        })
        expect((await readConfig(cwd)).preferences).toEqual({
            schemaVersion: 1,
        })
    })

    test('keeps multiple brain trees side by side (identity + requirements)', async () => {
        await writeFile(
            join(cwd, '.luca/config.json'),
            JSON.stringify({ muninn: { vault: 'v' } })
        )
        await lucaBrainSetRootTool.handler(
            lucaBrainSetRootTool.inputSchema.parse({
                concept: 'brain:project-identity',
                id: ULID_A,
            }),
            { cwd }
        )
        await lucaBrainSetRootTool.handler(
            lucaBrainSetRootTool.inputSchema.parse({
                concept: 'brain:project-requirements',
                id: ULID_B,
            }),
            { cwd }
        )
        const brainRoots = (
            (await readConfig(cwd)).muninn as Record<string, unknown>
        ).brainRoots as Record<string, unknown>
        expect(brainRoots['brain:project-identity']).toEqual({
            vault: 'v',
            rootId: ULID_A,
        })
        expect(brainRoots['brain:project-requirements']).toEqual({
            vault: 'v',
            rootId: ULID_B,
        })
    })

    test('rejects a non-brain concept and a non-ULID id', () => {
        expect(
            lucaBrainSetRootTool.inputSchema.safeParse({
                concept: 'todo:x',
                id: ULID_A,
            }).success
        ).toBe(false)
        expect(
            lucaBrainSetRootTool.inputSchema.safeParse({
                concept: 'brain:project-identity',
                id: 'not-a-ulid',
            }).success
        ).toBe(false)
    })

    test('has no allowedPhases (callable in any pipelineStep)', () => {
        expect(lucaBrainSetRootTool.allowedPhases).toBeUndefined()
    })
})
