import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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

const writeConfig = async ({ text }: { text: string }) => {
    await mkdir(join(repoRoot, '.luca'), { recursive: true })
    await writeFile(join(repoRoot, '.luca', 'config.json'), text)
}

describe('engine config', () => {
    test('a config with only a test command gets the defaults', async () => {
        await writeConfig({
            text: JSON.stringify({ checks: { test: 'bun test' } }),
        })

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
        await writeConfig({
            text: JSON.stringify({
                checks: { test: 'bun test', types: 'tsc', lint: 'eslint .' },
                test_file_patterns: ['**/*.spec.ts'],
                test_setup_files: ['test/setup.ts'],
                rule_files: ['docs/rules.md'],
                muninn: { vault: 'my-project' },
            }),
        })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result).toEqual({
            ok: true,
            config: {
                checks: { test: 'bun test', types: 'tsc', lint: 'eslint .' },
                test_file_patterns: ['**/*.spec.ts'],
                test_setup_files: ['test/setup.ts'],
                rule_files: ['docs/rules.md'],
                muninn: { vault: 'my-project' },
            },
        })
    })

    test("old Luca's keys are dropped and muninn.vault is kept", async () => {
        await writeConfig({
            text: JSON.stringify({
                lucaVersion: '13.1.0-alpha.0',
                oversight: 'full-auto',
                preferences: { schemaVersion: 1 },
                muninn: {
                    vault: 'luca-monorepo',
                    todoBacklog: { vault: 'luca-monorepo', rootId: 'x' },
                },
                checks: { test: 'bun test' },
            }),
        })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result).toEqual({
            ok: true,
            config: {
                checks: { test: 'bun test' },
                test_file_patterns: ['**/*.test.ts'],
                test_setup_files: [],
                rule_files: [],
                muninn: { vault: 'luca-monorepo' },
            },
        })
    })

    test('a config without a test command still loads', async () => {
        await writeConfig({ text: '{}' })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(true)
    })

    test('a missing config file is an error', async () => {
        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('.luca/config.json')
    })

    test('a config that is not JSON is an error', async () => {
        await writeConfig({ text: '{ nope' })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
    })

    test('a config with the wrong shape is an error naming the field', async () => {
        await writeConfig({ text: JSON.stringify({ checks: { test: 42 } }) })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('checks.test')
    })
})
