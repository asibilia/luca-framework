import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { loadEngineConfig } from './engine-config'

/**
 * A prepare command (#481): an optional `prepare` in `.luca/config.json`
 * that the engine runs in a checkout before every test run there, for
 * repos whose tests need build outputs (HeartGold: `bun run build:rom`).
 */

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-prepare-command-'))
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

describe('engine config: a prepare command', () => {
    test('a config with a prepare command keeps it, and one without still loads with none', async () => {
        await writeConfig({
            config: {
                checks: { test: 'bun test' },
                prepare: 'bun run build:rom',
            },
        })
        const withPrepare = await loadEngineConfig({ repo_root: repoRoot })
        if (!withPrepare.ok) throw new Error(withPrepare.error)

        expect(withPrepare.config.prepare).toBe('bun run build:rom')

        await writeConfig({ config: { checks: { test: 'bun test' } } })
        const without = await loadEngineConfig({ repo_root: repoRoot })
        if (!without.ok) throw new Error(without.error)

        expect(without.config.prepare).toBeUndefined()
        expect(without.config.checks).toEqual({ test: 'bun test' })
    })

    test('a prepare that is not a command is an error naming prepare', async () => {
        await writeConfig({
            config: { checks: { test: 'bun test' }, prepare: 42 },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('prepare')
    })
})

describe('the engine README', () => {
    test('documents the prepare command with the HeartGold example', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toMatch(/`prepare`|"prepare"/)
        expect(text).toContain('bun run build:rom')
    })
})
