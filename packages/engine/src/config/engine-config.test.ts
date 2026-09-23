import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { loadEngineConfig } from './engine-config'

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-engine-config-'))
})

afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
})

describe('engine config', () => {
    test('a config with only a test command gets the defaults', async () => {
        await writeFile(
            join(repoRoot, 'luca.config.json'),
            JSON.stringify({ checks: { test: 'bun test' } })
        )

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result).toEqual({
            ok: true,
            config: {
                checks: { test: 'bun test' },
                test_file_patterns: ['**/*.test.ts'],
                test_setup_files: [],
                rule_files: [],
            },
        })
    })

    test('a full config keeps every field', async () => {
        await writeFile(
            join(repoRoot, 'luca.config.json'),
            JSON.stringify({
                checks: { test: 'bun test', types: 'tsc', lint: 'eslint .' },
                test_file_patterns: ['**/*.spec.ts'],
                test_setup_files: ['test/setup.ts'],
                rule_files: ['docs/rules.md'],
                memory_vault: 'my-project',
            })
        )

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result).toEqual({
            ok: true,
            config: {
                checks: { test: 'bun test', types: 'tsc', lint: 'eslint .' },
                test_file_patterns: ['**/*.spec.ts'],
                test_setup_files: ['test/setup.ts'],
                rule_files: ['docs/rules.md'],
                memory_vault: 'my-project',
            },
        })
    })

    test('a config without a test command still loads', async () => {
        await writeFile(join(repoRoot, 'luca.config.json'), '{}')

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(true)
    })

    test('a missing config file is an error', async () => {
        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('luca.config.json')
    })

    test('a config that is not JSON is an error', async () => {
        await writeFile(join(repoRoot, 'luca.config.json'), '{ nope')

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
    })

    test('a config with the wrong shape is an error naming the field', async () => {
        await writeFile(
            join(repoRoot, 'luca.config.json'),
            JSON.stringify({ checks: { test: 42 } })
        )

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('checks.test')
    })
})
