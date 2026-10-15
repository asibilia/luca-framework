import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    EngineConfigSchema,
    featureMapPath,
    loadEngineConfig,
} from './engine-config'

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

    test('a leftover_allow list of glob patterns is kept (#520)', async () => {
        await writeConfig({
            text: JSON.stringify({
                checks: { test: 'bun test' },
                leftover_allow: ['handbook/**/*.md', 'design/*.md'],
            }),
        })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok && result.config.leftover_allow).toEqual([
            'handbook/**/*.md',
            'design/*.md',
        ])
    })

    test('a leftover_allow that is not a list of patterns is an error naming the field (#520)', async () => {
        for (const leftover_allow of ['handbook/**', [42], { docs: true }]) {
            await writeConfig({
                text: JSON.stringify({
                    checks: { test: 'bun test' },
                    leftover_allow,
                }),
            })

            const result = await loadEngineConfig({ repo_root: repoRoot })

            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error).toContain('leftover_allow')
        }
    })

    test('a config with the wrong shape is an error naming the field', async () => {
        await writeConfig({ text: JSON.stringify({ checks: { test: 42 } }) })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain('checks.test')
    })
})

describe('the feature map path (#583)', () => {
    const configWith = (feature_map?: string) =>
        EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            ...(feature_map === undefined ? {} : { feature_map }),
        })

    test('is the path as written when it is already clean', () => {
        expect(
            featureMapPath({ config: configWith('docs/feature-map.md') })
        ).toBe('docs/feature-map.md')
    })

    test.each([
        ['./docs/feature-map.md'],
        ['docs//feature-map.md'],
        ['docs/../docs/feature-map.md'],
        ['./docs/./feature-map.md'],
    ])('%s is docs/feature-map.md', (spelled) => {
        expect(featureMapPath({ config: configWith(spelled) })).toBe(
            'docs/feature-map.md'
        )
    })

    test('is null with no feature map', () => {
        expect(featureMapPath({ config: configWith() })).toBeNull()
    })

    test('the config keeps the path as written', async () => {
        await writeConfig({
            text: JSON.stringify({
                checks: { test: 'bun test' },
                feature_map: './docs/feature-map.md',
            }),
        })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok && result.config.feature_map).toBe(
            './docs/feature-map.md'
        )
    })
})
