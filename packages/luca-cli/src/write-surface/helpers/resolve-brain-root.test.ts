import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { resolveBrainRoot } from './resolve-brain-root.ts'

const ROOT_ULID = '01KVEGY63GTYVVXK38AP9C90HC'
const CONCEPT = 'brain:project-identity'

describe('resolveBrainRoot', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-resolve-brain-'))
        await mkdir(join(cwd, '.luca'), { recursive: true })
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    async function writeConfig(config: unknown): Promise<void> {
        await writeFile(join(cwd, '.luca/config.json'), JSON.stringify(config))
    }

    test('returns the cached rootId when the recorded vault matches', async () => {
        await writeConfig({
            muninn: {
                vault: 'my-project',
                brainRoots: {
                    [CONCEPT]: { vault: 'my-project', rootId: ROOT_ULID },
                },
            },
        })
        expect(await resolveBrainRoot({ cwd, concept: CONCEPT })).toEqual({
            vault: 'my-project',
            rootId: ROOT_ULID,
        })
    })

    test('ignores a cached rootId recorded under a different vault', async () => {
        await writeConfig({
            muninn: {
                vault: 'my-project',
                brainRoots: {
                    [CONCEPT]: { vault: 'old-vault', rootId: ROOT_ULID },
                },
            },
        })
        expect(await resolveBrainRoot({ cwd, concept: CONCEPT })).toEqual({
            vault: 'my-project',
            rootId: null,
        })
    })

    test('returns null for a concept not in the cache', async () => {
        await writeConfig({
            muninn: {
                vault: 'my-project',
                brainRoots: {
                    [CONCEPT]: { vault: 'my-project', rootId: ROOT_ULID },
                },
            },
        })
        expect(
            await resolveBrainRoot({
                cwd,
                concept: 'brain:project-requirements',
            })
        ).toEqual({ vault: 'my-project', rootId: null })
    })

    test('falls back to default vault with null root when config is missing', async () => {
        expect(await resolveBrainRoot({ cwd, concept: CONCEPT })).toEqual({
            vault: 'default',
            rootId: null,
        })
    })
})
