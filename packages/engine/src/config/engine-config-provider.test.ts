import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    DEFAULT_PROVIDER,
    EngineConfigSchema,
    loadEngineConfig,
    ModelsConfigSchema,
    overrideConfigProvider,
    providerOfConfig,
    ProviderIdSchema,
    ProviderModelSchema,
} from './engine-config'

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-engine-config-provider-'))
})

afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
})

const writeModels = async (models: unknown) => {
    await mkdir(join(repoRoot, '.luca'), { recursive: true })
    await writeFile(
        join(repoRoot, '.luca', 'config.json'),
        JSON.stringify({ checks: { test: 'bun test' }, models })
    )
    return loadEngineConfig({ repo_root: repoRoot })
}

describe('ModelsConfigSchema provider and floors (#778 AC3)', () => {
    test('defaults to claude with opus floors, and agy defaults omitted floors to gemini-4-neon-high', async () => {
        expect(ModelsConfigSchema.parse({})).toEqual({
            provider: 'claude',
            floors: {
                'test-writer': 'opus',
                implementer: 'opus',
                learner: 'opus',
            },
            effort: {
                'test-writer': 'medium',
                implementer: 'medium',
                learner: 'medium',
            },
            confidence_bar: 0.5,
            trial_share: 0,
        })

        const agyDefault = await writeModels({ provider: 'agy' })
        expect(agyDefault).toMatchObject({
            ok: true,
            config: {
                models: {
                    provider: 'agy',
                    floors: {
                        'test-writer': 'gemini-4-neon-high',
                        implementer: 'gemini-4-neon-high',
                        learner: 'gemini-4-neon-high',
                    },
                },
            },
        })

        const agyPartial = await writeModels({
            provider: 'agy',
            floors: {
                'test-writer': 'gemini-4-argon-high',
                learner: 'gemini-3.8-flash-high',
            },
        })
        expect(agyPartial).toMatchObject({
            ok: true,
            config: {
                models: {
                    provider: 'agy',
                    floors: {
                        'test-writer': 'gemini-4-argon-high',
                        implementer: 'gemini-4-neon-high',
                        learner: 'gemini-3.8-flash-high',
                    },
                },
            },
        })
    })

    test('rejects cross-provider and non-Gemini floors with exact path and message', async () => {
        const cases = [
            {
                provider: 'agy',
                role: 'test-writer',
                floor: 'opus',
                allowed:
                    'gemini-4-neon-high, gemini-4-argon-high, gemini-3.8-flash-high',
            },
            {
                provider: 'agy',
                role: 'implementer',
                floor: 'gpt-5',
                allowed:
                    'gemini-4-neon-high, gemini-4-argon-high, gemini-3.8-flash-high',
            },
            {
                provider: 'agy',
                role: 'learner',
                floor: 'gemini-2.5-pro',
                allowed:
                    'gemini-4-neon-high, gemini-4-argon-high, gemini-3.8-flash-high',
            },
            {
                provider: 'claude',
                role: 'test-writer',
                floor: 'gemini-4-neon-high',
                allowed: 'opus, sonnet, haiku',
            },
        ] as const

        for (const { provider, role, floor, allowed } of cases) {
            const expectedMessage = `models.floors.${role}: "${floor}" is not a valid model for provider "${provider}". Allowed: ${allowed}.`
            const schemaResult = ModelsConfigSchema.safeParse({
                provider,
                floors: { [role]: floor },
            })
            expect(schemaResult.success).toBe(false)
            if (!schemaResult.success) {
                expect(schemaResult.error.issues[0]).toMatchObject({
                    path: ['floors', role],
                    message: expectedMessage,
                })
            }

            const loaded = await writeModels({
                provider,
                floors: { [role]: floor },
            })
            expect(loaded.ok).toBe(false)
            if (!loaded.ok) {
                expect(loaded.error).toContain(expectedMessage)
            }
        }
    })

    test('reports one superRefine issue per invalid floor role and rejects uppercase Gemini floor', () => {
        const multi = ModelsConfigSchema.safeParse({
            provider: 'agy',
            floors: {
                'test-writer': 'opus',
                implementer: 'GEMINI-4-NEON-HIGH',
                learner: 'sonnet',
            },
        })
        expect(multi.success).toBe(false)
        if (!multi.success) {
            expect(multi.error.issues).toHaveLength(3)
            expect(multi.error.issues.map((i) => i.path)).toEqual([
                ['floors', 'test-writer'],
                ['floors', 'implementer'],
                ['floors', 'learner'],
            ])
            expect(multi.error.issues[1]?.message).toContain(
                'models.floors.implementer: "GEMINI-4-NEON-HIGH" is not a valid model for provider "agy".'
            )
        }
    })

    test('rejects unrecognized floor roles under agy with strongest-model message', async () => {
        for (const role of ['ticket-reviewer', 'security-lens']) {
            const loaded = await writeModels({
                provider: 'agy',
                floors: {
                    'test-writer': 'gemini-4-argon-high',
                    [role]: 'gemini-4-neon-high',
                },
            })
            expect(loaded.ok).toBe(false)
            if (!loaded.ok) {
                expect(loaded.error).toContain(role)
                expect(loaded.error).toContain(
                    'reviewers always run the strongest model'
                )
                expect(loaded.error).toContain(
                    'test-writer, implementer, learner'
                )
            }
        }
    })
})

describe('overrideConfigProvider and engine-config re-exports (#778 AC4)', () => {
    test('re-exports provider symbols and returns same config reference when provider already matches', () => {
        expect(DEFAULT_PROVIDER).toBe('claude')
        expect(ProviderIdSchema.parse('agy')).toBe('agy')
        expect(ProviderModelSchema.parse('gemini-4-neon-high')).toBe(
            'gemini-4-neon-high'
        )

        const withoutModels = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
        })
        expect(
            overrideConfigProvider({
                config: withoutModels,
                provider: 'claude',
            })
        ).toBe(withoutModels)

        const agyConfig = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            models: {
                provider: 'agy',
                floors: { 'test-writer': 'gemini-4-argon-high' },
            },
        })
        expect(
            overrideConfigProvider({ config: agyConfig, provider: 'agy' })
        ).toBe(agyConfig)
    })

    test('maps routed floors by tier index while preserving effort, confidence_bar, trial_share, and other fields', () => {
        const claudeCustom = EngineConfigSchema.parse({
            checks: { test: 'bun test', lint: 'bun run lint' },
            muninn: { vault: 'test-vault' },
            models: {
                provider: 'claude',
                floors: {
                    'test-writer': 'sonnet',
                    implementer: 'haiku',
                    learner: 'opus',
                },
                effort: {
                    'test-writer': 'high',
                    implementer: 'xhigh',
                    learner: 'low',
                },
                confidence_bar: 0.75,
                trial_share: 0.25,
            },
        })

        const overriddenToAgy = overrideConfigProvider({
            config: claudeCustom,
            provider: 'agy',
        })
        expect(overriddenToAgy).toEqual({
            ...claudeCustom,
            models: {
                provider: 'agy',
                floors: {
                    'test-writer': 'gemini-4-argon-high',
                    implementer: 'gemini-3.8-flash-high',
                    learner: 'gemini-4-neon-high',
                },
                effort: {
                    'test-writer': 'high',
                    implementer: 'xhigh',
                    learner: 'low',
                },
                confidence_bar: 0.75,
                trial_share: 0.25,
            },
        })

        const backToClaude = overrideConfigProvider({
            config: overriddenToAgy,
            provider: 'claude',
        })
        expect(backToClaude).toEqual(claudeCustom)

        const bareConfig = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
        })
        expect(
            overrideConfigProvider({ config: bareConfig, provider: 'agy' })
                .models
        ).toMatchObject({
            provider: 'agy',
            floors: {
                'test-writer': 'gemini-4-neon-high',
                implementer: 'gemini-4-neon-high',
                learner: 'gemini-4-neon-high',
            },
        })
    })
})

describe('providerOfConfig (#777)', () => {
    test('gives what modelsOf gives, without parsing defaults', () => {
        const bare = EngineConfigSchema.parse({ checks: { test: 'bun test' } })
        expect(bare.models).toBeUndefined()
        expect(providerOfConfig({ config: bare })).toBe(
            ModelsConfigSchema.parse({}).provider
        )
        expect(providerOfConfig({ config: null })).toBe(DEFAULT_PROVIDER)
        expect(
            providerOfConfig({
                config: overrideConfigProvider({
                    config: bare,
                    provider: 'agy',
                }),
            })
        ).toBe('agy')
    })
})
