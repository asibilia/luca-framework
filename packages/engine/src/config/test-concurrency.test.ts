import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    ConfigChangeSchema,
    configChanges,
    FROZEN_FIELDS,
    RELOADED_FIELDS,
    withConfigChanges,
} from './config-reload'
import { loadEngineConfig, type EngineConfig } from './engine-config'

/**
 * How many test runs go at once (#544): an optional `test_concurrency` in
 * `.luca/config.json`, a positive whole number, that a resume reloads.
 */

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-test-concurrency-'))
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

const STARTED: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

describe('engine config: test_concurrency (#544)', () => {
    test('test_concurrency is kept as written, and a bad value is an error naming it', async () => {
        await writeConfig({
            config: { checks: { test: 'bun test' }, test_concurrency: 1 },
        })
        const kept = await loadEngineConfig({ repo_root: repoRoot })
        if (!kept.ok) throw new Error(kept.error)

        expect(kept.config.test_concurrency).toBe(1)

        for (const value of [0, -1, 1.5, 'one', null]) {
            await writeConfig({
                config: {
                    checks: { test: 'bun test' },
                    test_concurrency: value,
                },
            })
            const result = await loadEngineConfig({ repo_root: repoRoot })

            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error).toContain('test_concurrency')
        }
    })

    test('a resume reloads test_concurrency: a new, changed or removed value is a change, and is set on the config', () => {
        expect(RELOADED_FIELDS).toContain('test_concurrency')
        expect(FROZEN_FIELDS).not.toContain('test_concurrency')

        expect(
            configChanges({
                current: STARTED,
                next: { ...STARTED, test_concurrency: 1 },
            })
        ).toEqual([{ field: 'test_concurrency', from: null, to: 1 }])
        expect(
            ConfigChangeSchema.safeParse({
                field: 'test_concurrency',
                from: 2,
                to: 0,
            }).success
        ).toBe(false)

        const lowered = withConfigChanges({
            config: { ...STARTED, test_concurrency: 4 },
            changes: [{ field: 'test_concurrency', from: 4, to: 1 }],
        })
        expect(lowered).toEqual({ ...STARTED, test_concurrency: 1 })

        const removed = withConfigChanges({
            config: lowered,
            changes: [{ field: 'test_concurrency', from: 1, to: null }],
        })
        expect(removed).toEqual(STARTED)
        expect('test_concurrency' in removed).toBe(false)
    })
})

const ROOT = join(import.meta.dir, '../../../..')

/** The meaning line of a `**Term**:` entry in the glossary, or `null`. */
const entryOf = (glossary: string, term: string): string | null =>
    glossary.match(new RegExp(`^\\*\\*${term}\\*\\*:\\n(.+)$`, 'm'))?.[1] ??
    null

describe('the docs on test slots (#544)', () => {
    test('the glossary has Test slots, naming test_concurrency', async () => {
        const glossary = await Bun.file(join(ROOT, 'GLOSSARY.md')).text()

        expect(entryOf(glossary, 'Test slots')).toContain('test_concurrency')
    })

    test('an engine docs page documents test_concurrency and wait_ms', async () => {
        const docs = join(ROOT, 'packages', 'engine', 'docs')
        const pages = await Promise.all(
            [...new Bun.Glob('*.md').scanSync({ cwd: docs })].map((page) =>
                Bun.file(join(docs, page)).text()
            )
        )

        expect(
            pages.some(
                (text) =>
                    text.includes('test_concurrency') &&
                    text.includes('wait_ms')
            )
        ).toBe(true)
    })
})
