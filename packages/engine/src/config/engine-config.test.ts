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

describe('the models block (#603)', () => {
    const loadModels = async (models: unknown) => {
        await writeConfig({
            text: JSON.stringify({ checks: { test: 'bun test' }, models }),
        })
        return loadEngineConfig({ repo_root: repoRoot })
    }

    test('floors and the bar parse, a role left out is opus, and the bar defaults to 0.8', async () => {
        expect(await loadModels({})).toMatchObject({
            ok: true,
            config: {
                models: {
                    floors: {
                        'test-writer': 'opus',
                        implementer: 'opus',
                        learner: 'opus',
                    },
                    confidence_bar: 0.8,
                },
            },
        })
        expect(
            await loadModels({
                floors: { 'test-writer': 'sonnet', learner: 'haiku' },
                confidence_bar: 0.9,
            })
        ).toMatchObject({
            ok: true,
            config: {
                models: {
                    floors: {
                        'test-writer': 'sonnet',
                        implementer: 'opus',
                        learner: 'haiku',
                    },
                    confidence_bar: 0.9,
                },
            },
        })
    })

    test('a floor that is not opus, sonnet or haiku, or a bar outside 0 to 1, is an error naming the field', async () => {
        for (const model of ['fable', 'best', 'claude-sonnet-5', 'Opus']) {
            const result = await loadModels({
                floors: { 'test-writer': model },
            })

            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error).toContain('models')
        }
        for (const confidence_bar of [1.5, -0.1, 'high']) {
            const result = await loadModels({ confidence_bar })

            expect(result.ok).toBe(false)
            if (!result.ok) expect(result.error).toContain('confidence_bar')
        }
    })

    test('a floor for the ticket reviewer or a lens is an error naming the role and saying reviewers always run Opus', async () => {
        for (const role of ['ticket-reviewer', 'security-lens', 'rules-lens']) {
            const result = await loadModels({
                floors: { 'test-writer': 'sonnet', [role]: 'sonnet' },
            })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error).toContain(role)
                expect(result.error).toContain('reviewers always run Opus')
            }
        }
    })
})

describe("the models block's effort (#660)", () => {
    const loadEffort = async (effort: unknown) => {
        await writeConfig({
            text: JSON.stringify({
                checks: { test: 'bun test' },
                models: { effort },
            }),
        })
        return loadEngineConfig({ repo_root: repoRoot })
    }

    test('effort takes the test-writer, the implementer and the learner at any of low, medium, high, xhigh or max, and a role left out is medium', async () => {
        expect(await loadEffort({})).toMatchObject({
            ok: true,
            config: {
                models: {
                    effort: {
                        'test-writer': 'medium',
                        implementer: 'medium',
                        learner: 'medium',
                    },
                },
            },
        })
        for (const level of ['low', 'medium', 'high', 'xhigh', 'max']) {
            expect(
                await loadEffort({ 'test-writer': 'high', learner: level })
            ).toMatchObject({
                ok: true,
                config: {
                    models: {
                        effort: {
                            'test-writer': 'high',
                            implementer: 'medium',
                            learner: level,
                        },
                    },
                },
            })
        }
    })

    test('the effort defaults live in the schema: a models block with no effort, parsed alone, is medium for each writer', () => {
        const config = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            models: {},
        })

        expect(config.models?.effort).toEqual({
            'test-writer': 'medium',
            implementer: 'medium',
            learner: 'medium',
        })
    })

    test("an effort for the ticket reviewer, a lens or any other role is refused, saying reviewers and the final review's fixers always run at xhigh", async () => {
        const reviewer = await loadEffort({
            implementer: 'high',
            'ticket-reviewer': 'low',
        })

        expect(reviewer.ok).toBe(false)
        if (!reviewer.ok) {
            expect(reviewer.error).toContain(
                "models.effort can't set ticket-reviewer: reviewers and the final review's fixers always run at xhigh."
            )
        }
        for (const role of ['security-lens', 'rules-lens', 'searcher']) {
            const result = await loadEffort({ [role]: 'medium' })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error).toContain(
                    `models.effort can't set ${role}:`
                )
                expect(result.error).toContain('always run at xhigh')
            }
        }
    })

    test('an unknown effort level, such as extreme, is an error naming the field', async () => {
        for (const level of ['extreme', 'High', 'none', 3]) {
            const result = await loadEffort({ implementer: level })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error).toContain('effort')
                expect(result.error).toContain('implementer')
            }
        }
    })
})

describe("this repo's models block (#604)", () => {
    const ROOT = join(import.meta.dir, '../../../..')

    test("sets only the test-writer's floor, to sonnet", async () => {
        const raw: unknown = await Bun.file(
            join(ROOT, '.luca', 'config.json')
        ).json()

        expect(raw).toHaveProperty('models', {
            floors: { 'test-writer': 'sonnet' },
        })
        expect(await loadEngineConfig({ repo_root: ROOT })).toMatchObject({
            ok: true,
            config: {
                models: {
                    floors: {
                        'test-writer': 'sonnet',
                        implementer: 'opus',
                        learner: 'opus',
                    },
                    confidence_bar: 0.8,
                },
            },
        })
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

    test.each([
        ['../feature-map.md'],
        ['docs/../../feature-map.md'],
        ['./../feature-map.md'],
        ['/etc/feature-map.md'],
        ['docs/'],
        ['./'],
        ['..'],
        ['.'],
    ])(
        'a feature_map of %s is an error naming the field: it is not a file inside the repo',
        async (feature_map) => {
            await writeConfig({
                text: JSON.stringify({
                    checks: { test: 'bun test' },
                    feature_map,
                }),
            })

            const result = await loadEngineConfig({ repo_root: repoRoot })

            expect(result.ok).toBe(false)
            if (!result.ok) {
                expect(result.error).toContain('feature_map')
                expect(result.error).toContain('a file inside the repo')
            }
        }
    )

    test.each([
        ['docs/feature-map.md'],
        ['./docs/feature-map.md'],
        ['docs/../docs/feature-map.md'],
        ['FEATURES.md'],
    ])('a feature_map of %s is accepted', async (feature_map) => {
        await writeConfig({
            text: JSON.stringify({ checks: { test: 'bun test' }, feature_map }),
        })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(true)
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

describe('a feature map file must end in .md (#597)', () => {
    const writeMapConfig = async ({ feature_map }: { feature_map: string }) =>
        writeConfig({
            text: JSON.stringify({ checks: { test: 'bun test' }, feature_map }),
        })

    test('a feature_map of FEATURES that is a file is an error naming the field and the path', async () => {
        await writeFile(join(repoRoot, 'FEATURES'), '# Features\n')
        await writeMapConfig({ feature_map: 'FEATURES' })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error).toContain('feature_map')
            expect(result.error).toContain('FEATURES')
        }
    })

    test('a feature_map of docs/map.txt that is a file is an error', async () => {
        await mkdir(join(repoRoot, 'docs'), { recursive: true })
        await writeFile(join(repoRoot, 'docs', 'map.txt'), '# Features\n')
        await writeMapConfig({ feature_map: 'docs/map.txt' })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(false)
    })

    test('a feature_map naming a folder of pages is accepted', async () => {
        await mkdir(join(repoRoot, 'docs', 'feature-map'), { recursive: true })
        await writeFile(
            join(repoRoot, 'docs', 'feature-map', 'index.md'),
            '# Features\n'
        )
        await writeMapConfig({ feature_map: 'docs/feature-map' })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(true)
    })

    test('a feature_map folder that is not on disk is accepted, so the red check names it', async () => {
        await writeMapConfig({ feature_map: 'docs/feature-map' })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(true)
    })

    test('a feature_map of docs/feature-map.md that is a file is accepted', async () => {
        await mkdir(join(repoRoot, 'docs'), { recursive: true })
        await writeFile(
            join(repoRoot, 'docs', 'feature-map.md'),
            '# Features\n'
        )
        await writeMapConfig({ feature_map: 'docs/feature-map.md' })

        const result = await loadEngineConfig({ repo_root: repoRoot })

        expect(result.ok).toBe(true)
    })
})
