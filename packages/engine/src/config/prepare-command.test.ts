import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    DEFAULT_PREPARE_CONCURRENCY,
    DEFAULT_PREPARE_TIMEOUT_MS,
    EngineConfigSchema,
    loadEngineConfig,
    prepareConcurrencyOf,
    prepareTimeoutOf,
} from './engine-config'

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

describe('engine config: the prepare time limit (#485)', () => {
    test('prepare_timeout_ms is kept as written', async () => {
        await writeConfig({
            config: {
                checks: { test: 'bun test' },
                prepare: 'bun run build:rom',
                prepare_timeout_ms: 3_600_000,
            },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(result.config.prepare_timeout_ms).toBe(3_600_000)
        expect(prepareTimeoutOf({ config: result.config })).toBe(3_600_000)
    })

    test('left out, prepare gets 30 minutes', async () => {
        await writeConfig({
            config: { checks: { test: 'bun test' }, prepare: 'make' },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(DEFAULT_PREPARE_TIMEOUT_MS).toBe(30 * 60 * 1000)
        expect(prepareTimeoutOf({ config: result.config })).toBe(
            DEFAULT_PREPARE_TIMEOUT_MS
        )
    })

    test.each([0, -1, 1.5, '30m', null])(
        'prepare_timeout_ms of %p is an error naming it',
        async (value) => {
            await writeConfig({
                config: {
                    checks: { test: 'bun test' },
                    prepare: 'make',
                    prepare_timeout_ms: value,
                },
            })
            const result = await loadEngineConfig({ repo_root: repoRoot })

            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error).toContain('prepare_timeout_ms')
            expect(
                EngineConfigSchema.safeParse({ prepare_timeout_ms: value })
                    .success
            ).toBe(false)
        }
    )
})

describe('engine config: how many prepare runs go at once (#492)', () => {
    test('prepare_concurrency is kept as written', async () => {
        await writeConfig({
            config: {
                checks: { test: 'bun test' },
                prepare: 'make',
                prepare_concurrency: 2,
            },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(result.config.prepare_concurrency).toBe(2)
        expect(prepareConcurrencyOf({ config: result.config })).toBe(2)
    })

    test('left out, one prepare runs at a time', async () => {
        await writeConfig({
            config: { checks: { test: 'bun test' }, prepare: 'make' },
        })
        const result = await loadEngineConfig({ repo_root: repoRoot })
        if (!result.ok) throw new Error(result.error)

        expect(DEFAULT_PREPARE_CONCURRENCY).toBe(1)
        expect(prepareConcurrencyOf({ config: result.config })).toBe(1)
    })

    test.each([0, -1, 1.5, 'two', null])(
        'prepare_concurrency of %p is an error naming it',
        async (value) => {
            await writeConfig({
                config: {
                    checks: { test: 'bun test' },
                    prepare: 'make',
                    prepare_concurrency: value,
                },
            })
            const result = await loadEngineConfig({ repo_root: repoRoot })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error).toContain('prepare_concurrency')
            }
        }
    )
})

describe('the engine README', () => {
    test('documents the prepare command with the HeartGold example', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toMatch(/`prepare`|"prepare"/)
        expect(text).toContain('bun run build:rom')
    })

    test('documents the prepare time limit and how to raise it', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toContain('prepare_timeout_ms')
        expect(text).toContain('30 minutes')
    })

    test('documents how many prepare runs go at once and how to change it', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toContain('prepare_concurrency')
    })
})
