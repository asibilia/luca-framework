import { describe, expect, test } from 'bun:test'

import {
    AGY_MODEL_NAMES,
    DEFAULT_PROVIDER,
    isProviderModel,
    mapFloorToProvider,
    ProviderIdSchema,
    ProviderModelSchema,
    providerOf,
    PROVIDERS,
} from './provider'

describe('provider registry (#778 AC1)', () => {
    test('exports schemas, defaults, and profiles for claude and agy', () => {
        expect(ProviderIdSchema.parse('claude')).toBe('claude')
        expect(ProviderIdSchema.parse('agy')).toBe('agy')
        expect(ProviderIdSchema.safeParse('openai').success).toBe(false)
        expect(ProviderIdSchema.safeParse('').success).toBe(false)

        expect(DEFAULT_PROVIDER).toBe('claude')
        expect(AGY_MODEL_NAMES).toEqual([
            'gemini-4-neon-high',
            'gemini-4-argon-high',
            'gemini-3.8-flash-high',
        ])

        for (const model of [
            'opus',
            'sonnet',
            'haiku',
            ...AGY_MODEL_NAMES,
        ] as const) {
            expect(ProviderModelSchema.parse(model)).toBe(model)
        }
        expect(ProviderModelSchema.safeParse('gpt-5').success).toBe(false)
        expect(
            ProviderModelSchema.safeParse('gemini-3.8-flash-low').success
        ).toBe(false)

        expect(providerOf()).toEqual(PROVIDERS.claude)
        expect(providerOf('claude')).toEqual({
            id: 'claude',
            tiers: ['opus', 'sonnet', 'haiku'],
            strongest: 'opus',
        })
        expect(providerOf('agy')).toEqual(PROVIDERS.agy)
    })

    test('isProviderModel accepts each provider own tiers and rejects cross-provider or unknown names', () => {
        for (const model of ['opus', 'sonnet', 'haiku']) {
            expect(isProviderModel({ provider: 'claude', model })).toBe(true)
            expect(isProviderModel({ provider: 'agy', model })).toBe(false)
        }
        for (const model of AGY_MODEL_NAMES) {
            expect(isProviderModel({ provider: 'agy', model })).toBe(true)
            expect(isProviderModel({ provider: 'claude', model })).toBe(false)
        }
        expect(isProviderModel({ provider: 'claude', model: 'Opus' })).toBe(
            false
        )
        expect(isProviderModel({ provider: 'agy', model: 'gpt-5' })).toBe(false)
        expect(isProviderModel({ provider: 'agy', model: '' })).toBe(false)
    })
})

describe('provider tiers and floor mapping (#778 AC2)', () => {
    test('PROVIDERS.agy tiers and mapFloorToProvider symmetric index mapping', () => {
        expect(PROVIDERS.agy).toEqual({
            id: 'agy',
            tiers: [
                'gemini-4-neon-high',
                'gemini-4-argon-high',
                'gemini-3.8-flash-high',
            ],
            strongest: 'gemini-4-neon-high',
        })

        const pairs = [
            ['opus', 'gemini-4-neon-high'],
            ['sonnet', 'gemini-4-argon-high'],
            ['haiku', 'gemini-3.8-flash-high'],
        ] as const

        for (const [claudeModel, agyModel] of pairs) {
            expect(
                mapFloorToProvider({
                    floor: claudeModel,
                    from: 'claude',
                    to: 'agy',
                })
            ).toBe(agyModel)
            expect(
                mapFloorToProvider({
                    floor: agyModel,
                    from: 'agy',
                    to: 'claude',
                })
            ).toBe(claudeModel)
            expect(
                mapFloorToProvider({
                    floor: claudeModel,
                    from: 'claude',
                    to: 'claude',
                })
            ).toBe(claudeModel)
            expect(
                mapFloorToProvider({ floor: agyModel, from: 'agy', to: 'agy' })
            ).toBe(agyModel)
        }
    })

    test('mapFloorToProvider falls back to target strongest when floor is not in source tiers', () => {
        expect(
            mapFloorToProvider({
                floor: 'gemini-4-argon-high',
                from: 'claude',
                to: 'agy',
            })
        ).toBe('gemini-4-neon-high')
        expect(
            mapFloorToProvider({
                floor: 'sonnet',
                from: 'agy',
                to: 'claude',
            })
        ).toBe('opus')
    })
})
