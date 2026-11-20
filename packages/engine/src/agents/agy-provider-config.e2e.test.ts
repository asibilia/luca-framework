import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    AGY_MODEL_NAMES,
    DEFAULT_PROVIDER,
    PROVIDERS,
    ProviderIdSchema,
    ProviderModelSchema,
    isProviderModel,
    mapFloorToProvider,
    providerOf,
    type ProviderId,
    type ProviderModel,
} from './provider'

import {
    DEFAULT_MODEL,
    DEFAULT_PROVIDER as ConfigDefaultProvider,
    EngineConfigSchema,
    ModelNameSchema,
    ModelsConfigSchema,
    ProviderIdSchema as ConfigProviderIdSchema,
    ProviderModelSchema as ConfigProviderModelSchema,
    ROUTED_ROLES,
    loadEngineConfig,
    modelsOf,
    overrideConfigProvider,
} from '../config/engine-config'
import { cleanupDir, createTempRoot } from '../testing/agy-e2e-helpers'

/**
 * E2E contract tests for Spec #777 Features F1–F2:
 * - F1: `agents/provider.ts` leaf registry
 * - F2: `ModelsConfigSchema` & `engine-config.ts` provider/floors validation
 * (F3 is covered in `../config/agy-config-override.e2e.test.ts`.)
 */

const roots: string[] = []

afterEach(() => {
    while (roots.length > 0) {
        const dir = roots.pop()
        if (dir !== undefined) cleanupDir({ dir })
    }
})

const writeRepoConfig = async ({ raw }: { raw: unknown }): Promise<string> => {
    const root = createTempRoot({ prefix: 'luca-agy-cfg-' })
    roots.push(root)
    await mkdir(join(root, '.luca'), { recursive: true })
    await writeFile(join(root, '.luca', 'config.json'), JSON.stringify(raw))
    return root
}

describe('F1: provider.ts leaf registry — Tier 1 equivalence classes', () => {
    test('DEFAULT_PROVIDER is claude and ProviderIdSchema accepts claude and agy', () => {
        expect(DEFAULT_PROVIDER).toBe('claude')
        expect(ProviderIdSchema.parse('claude')).toBe('claude')
        expect(ProviderIdSchema.parse('agy')).toBe('agy')
        expect(ProviderIdSchema.options).toEqual(['claude', 'agy'])
    })

    test('providerOf returns claude profile by default and for claude, with strongest at tiers[0]', () => {
        const implicit = providerOf()
        const explicit = providerOf('claude')

        expect(implicit).toEqual({
            id: 'claude',
            tiers: ['opus', 'sonnet', 'haiku'],
            strongest: 'opus',
        })
        expect(explicit).toEqual(implicit)
        expect(implicit.strongest).toBe(implicit.tiers[0])
    })

    test('providerOf("agy") returns ordered Gemini tiers and strongest equal to tiers[0]', () => {
        const agy = providerOf('agy')

        expect(AGY_MODEL_NAMES).toEqual([
            'gemini-4-neon-high',
            'gemini-4-argon-high',
            'gemini-3.8-flash-high',
        ])
        expect(agy).toEqual({
            id: 'agy',
            tiers: [
                'gemini-4-neon-high',
                'gemini-4-argon-high',
                'gemini-3.8-flash-high',
            ],
            strongest: 'gemini-4-neon-high',
        })
        expect(agy.strongest).toBe(agy.tiers[0])
    })

    test('isProviderModel returns true for every tier belonging to its own provider', () => {
        for (const model of PROVIDERS.claude.tiers) {
            expect(isProviderModel({ provider: 'claude', model })).toBe(true)
        }
        for (const model of PROVIDERS.agy.tiers) {
            expect(isProviderModel({ provider: 'agy', model })).toBe(true)
        }
    })

    test('mapFloorToProvider maps all three tiers claude <-> agy by tier index', () => {
        const pairs: [ProviderModel, ProviderModel][] = [
            ['opus', 'gemini-4-neon-high'],
            ['sonnet', 'gemini-4-argon-high'],
            ['haiku', 'gemini-3.8-flash-high'],
        ]
        for (const [claudeTier, agyTier] of pairs) {
            expect(
                mapFloorToProvider({
                    floor: claudeTier,
                    from: 'claude',
                    to: 'agy',
                })
            ).toBe(agyTier)
            expect(
                mapFloorToProvider({
                    floor: agyTier,
                    from: 'agy',
                    to: 'claude',
                })
            ).toBe(claudeTier)
        }
    })

    test('mapFloorToProvider with identical from and to returns floor unchanged', () => {
        const providers: ProviderId[] = ['claude', 'agy']
        for (const provider of providers) {
            for (const floor of PROVIDERS[provider].tiers) {
                expect(
                    mapFloorToProvider({ floor, from: provider, to: provider })
                ).toBe(floor)
            }
        }
    })
})

describe('F1: provider.ts leaf registry — Tier 2 boundaries & negatives', () => {
    test('ProviderIdSchema rejects unknown providers, wrong case, and non-strings', () => {
        for (const bad of ['openai', 'gemini', 'AGY', 'Claude', '', null, 1]) {
            expect(ProviderIdSchema.safeParse(bad).success).toBe(false)
        }
    })

    test('ProviderModelSchema rejects unknown, unrouted Gemini, and wrong-case models', () => {
        for (const bad of [
            'gpt-4o',
            'claude-opus-5',
            'gemini-4-hydrogen-high',
            'gemini-3.8-flash-low',
            'Opus',
            '',
        ]) {
            expect(ProviderModelSchema.safeParse(bad).success).toBe(false)
        }
    })

    test('isProviderModel rejects cross-provider models in both directions', () => {
        for (const model of PROVIDERS.agy.tiers) {
            expect(isProviderModel({ provider: 'claude', model })).toBe(false)
        }
        for (const model of PROVIDERS.claude.tiers) {
            expect(isProviderModel({ provider: 'agy', model })).toBe(false)
        }
    })

    test('isProviderModel rejects wrong-case and whitespace-padded model names', () => {
        for (const bad of [
            'GEMINI-4-NEON-HIGH',
            ' gemini-4-neon-high ',
            'gemini-4-argon-high\n',
        ]) {
            expect(isProviderModel({ provider: 'agy', model: bad })).toBe(false)
        }
        for (const bad of ['Opus', ' sonnet', 'HAIKU']) {
            expect(isProviderModel({ provider: 'claude', model: bad })).toBe(
                false
            )
        }
    })

    test('mapFloorToProvider falls back to target strongest when floor is not in source tiers', () => {
        expect(
            mapFloorToProvider({ floor: 'sonnet', from: 'agy', to: 'claude' })
        ).toBe('opus')
        expect(
            mapFloorToProvider({
                floor: 'gemini-3.8-flash-high',
                from: 'claude',
                to: 'agy',
            })
        ).toBe('gemini-4-neon-high')
        expect(
            mapFloorToProvider({
                floor: 'haiku',
                from: 'agy',
                to: 'agy',
            })
        ).toBe('gemini-4-neon-high')
    })
})

describe('F2: ModelsConfigSchema & engine-config.ts — Tier 1 equivalence classes', () => {
    test('omitted models block stays optional and modelsOf defaults to claude opus', () => {
        const config = EngineConfigSchema.parse({})

        expect(config.models).toBeUndefined()
        expect(DEFAULT_MODEL).toBe('opus')
        expect(ModelNameSchema.options).toEqual(['opus', 'sonnet', 'haiku'])
        expect(modelsOf({ config })).toEqual({
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
    })

    test('models block without provider defaults to claude and fills omitted floors with opus', async () => {
        const root = await writeRepoConfig({
            raw: {
                checks: { test: 'bun test' },
                models: { floors: { 'test-writer': 'sonnet' } },
            },
        })

        const loaded = await loadEngineConfig({ repo_root: root })

        expect(loaded.ok).toBe(true)
        if (loaded.ok) {
            expect(loaded.config.models?.provider).toBe('claude')
            expect(loaded.config.models?.floors).toEqual({
                'test-writer': 'sonnet',
                implementer: 'opus',
                learner: 'opus',
            })
        }
    })

    test('models block with provider agy and omitted floors defaults all routed roles to gemini-4-neon-high', () => {
        const parsed = ModelsConfigSchema.parse({ provider: 'agy' })

        expect(parsed).toEqual({
            provider: 'agy',
            floors: {
                'test-writer': 'gemini-4-neon-high',
                implementer: 'gemini-4-neon-high',
                learner: 'gemini-4-neon-high',
            },
            effort: {
                'test-writer': 'medium',
                implementer: 'medium',
                learner: 'medium',
            },
            confidence_bar: 0.5,
            trial_share: 0,
        })
    })

    test('loadEngineConfig with agy keeps specified floors and defaults omitted implementer to gemini-4-neon-high', async () => {
        const root = await writeRepoConfig({
            raw: {
                checks: { test: 'bun test' },
                models: {
                    provider: 'agy',
                    floors: {
                        'test-writer': 'gemini-4-argon-high',
                        learner: 'gemini-3.8-flash-high',
                    },
                    confidence_bar: 0.75,
                    trial_share: 0.2,
                },
            },
        })

        const loaded = await loadEngineConfig({ repo_root: root })

        expect(loaded.ok).toBe(true)
        if (loaded.ok) {
            expect(loaded.config.models?.provider).toBe('agy')
            expect(loaded.config.models?.floors).toEqual({
                'test-writer': 'gemini-4-argon-high',
                implementer: 'gemini-4-neon-high',
                learner: 'gemini-3.8-flash-high',
            })
            expect(loaded.config.models?.confidence_bar).toBe(0.75)
            expect(loaded.config.models?.trial_share).toBe(0.2)
        }
    })

    test('engine-config.ts re-exports provider registry symbols and overrideConfigProvider', () => {
        expect(ConfigProviderIdSchema).toBe(ProviderIdSchema)
        expect(ConfigProviderModelSchema).toBe(ProviderModelSchema)
        expect(ConfigDefaultProvider).toBe(DEFAULT_PROVIDER)
        expect(typeof overrideConfigProvider).toBe('function')
        expect(ROUTED_ROLES).toEqual(['test-writer', 'implementer', 'learner'])
    })
})

describe('F2: ModelsConfigSchema & engine-config.ts — Tier 2 boundaries & negatives', () => {
    test('cross-provider claude model on agy fails at ["floors", "implementer"] with exact message', () => {
        const result = ModelsConfigSchema.safeParse({
            provider: 'agy',
            floors: { implementer: 'sonnet' },
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues[0]
            expect(issue?.path).toEqual(['floors', 'implementer'])
            expect(issue?.message).toBe(
                'models.floors.implementer: "sonnet" is not a valid model for provider "agy". Allowed: gemini-4-neon-high, gemini-4-argon-high, gemini-3.8-flash-high.'
            )
        }
    })

    test('cross-provider agy model on claude fails at ["floors", "test-writer"] with exact message', () => {
        const result = ModelsConfigSchema.safeParse({
            provider: 'claude',
            floors: { 'test-writer': 'gemini-4-neon-high' },
        })

        expect(result.success).toBe(false)
        if (!result.success) {
            const issue = result.error.issues[0]
            expect(issue?.path).toEqual(['floors', 'test-writer'])
            expect(issue?.message).toBe(
                'models.floors.test-writer: "gemini-4-neon-high" is not a valid model for provider "claude". Allowed: opus, sonnet, haiku.'
            )
        }
    })

    test('OpenAI, non-routable Gemini, and empty strings fail agy floor validation with exact message', () => {
        for (const bad of ['gpt-5', 'gemini-4-hydrogen-high', '']) {
            const result = ModelsConfigSchema.safeParse({
                provider: 'agy',
                floors: { learner: bad },
            })

            expect(result.success).toBe(false)
            if (!result.success) {
                const issue = result.error.issues[0]
                expect(issue?.path).toEqual(['floors', 'learner'])
                expect(issue?.message).toBe(
                    `models.floors.learner: "${bad}" is not a valid model for provider "agy". Allowed: gemini-4-neon-high, gemini-4-argon-high, gemini-3.8-flash-high.`
                )
            }
        }
    })

    test('non-string floor values fail Zod validation cleanly', () => {
        for (const bad of [123, null, true, ['gemini-4-neon-high']]) {
            const result = ModelsConfigSchema.safeParse({
                provider: 'agy',
                floors: { 'test-writer': bad },
            })

            expect(result.success).toBe(false)
        }
    })

    test('unrecognized role keys in floors fail under both claude and agy with strongest-model message', async () => {
        const providers: ProviderId[] = ['claude', 'agy']
        for (const provider of providers) {
            for (const role of [
                'ticket-reviewer',
                'security-lens',
                'rules-lens',
                'story-writer',
            ]) {
                const root = await writeRepoConfig({
                    raw: {
                        checks: { test: 'bun test' },
                        models: { provider, floors: { [role]: 'sonnet' } },
                    },
                })
                const loaded = await loadEngineConfig({ repo_root: root })

                expect(loaded.ok).toBe(false)
                if (!loaded.ok) {
                    expect(loaded.error).toContain(role)
                    expect(loaded.error).toContain(
                        "can't have a model floor: reviewers always run the strongest model. Only test-writer, implementer, learner have floors."
                    )
                }
            }
        }
    })

    test('invalid provider value in models.provider fails Zod validation and loadEngineConfig', async () => {
        for (const bad of ['openai', 'gemini', 'AGY', '']) {
            const root = await writeRepoConfig({
                raw: {
                    checks: { test: 'bun test' },
                    models: { provider: bad },
                },
            })
            const loaded = await loadEngineConfig({ repo_root: root })

            expect(loaded.ok).toBe(false)
            if (!loaded.ok) expect(loaded.error).toContain('provider')
        }
    })
})
