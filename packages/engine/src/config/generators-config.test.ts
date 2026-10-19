import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { configChanges, FROZEN_FIELDS, RELOADED_FIELDS } from './config-reload'
import { EngineConfigSchema, loadEngineConfig } from './engine-config'

/**
 * The config's `generators` (#618): names a writer may ask the engine to run,
 * each with its command. Frozen on resume; left out, nothing changes.
 */

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-generators-config-'))
})

afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
})

const writeConfig = async ({ config }: { config: object }) => {
    await mkdir(join(repoRoot, '.luca'), { recursive: true })
    await writeFile(
        join(repoRoot, '.luca', 'config.json'),
        JSON.stringify(config)
    )
}

describe('the generators setting (#618)', () => {
    test('a map of names to commands is kept, and left out there is none', async () => {
        await writeConfig({
            config: {
                checks: { test: 'bun test' },
                generators: { parser: 'bun run gen:parser', docs: 'make docs' },
            },
        })
        const named = await loadEngineConfig({ repo_root: repoRoot })
        expect(named.ok && named.config).toMatchObject({
            generators: { parser: 'bun run gen:parser', docs: 'make docs' },
        })

        await writeConfig({ config: { checks: { test: 'bun test' } } })
        const none = await loadEngineConfig({ repo_root: repoRoot })
        expect(none.ok && 'generators' in none.config).toBe(false)
    })

    test('a generators value that is not a map of names to commands is an error naming the field', async () => {
        for (const generators of [
            'bun run gen',
            ['bun run gen'],
            { parser: '' },
            { parser: 42 },
        ]) {
            await writeConfig({
                config: { checks: { test: 'bun test' }, generators },
            })

            const result = await loadEngineConfig({ repo_root: repoRoot })

            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error).toContain('generators')
        }
    })

    test('generators is frozen: a resume keeps the generators the run started with', () => {
        const frozen: string[] = [...FROZEN_FIELDS]
        const reloaded: string[] = [...RELOADED_FIELDS]
        expect(frozen).toContain('generators')
        expect(reloaded).not.toContain('generators')
        const current = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            generators: { parser: 'bun run gen:parser' },
        })
        const next = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            generators: { parser: 'bun run gen:parser --fast' },
        })
        expect(configChanges({ current, next })).toEqual([])
    })
})
