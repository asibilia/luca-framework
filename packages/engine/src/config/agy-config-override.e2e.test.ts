import { describe, expect, test } from 'bun:test'

import { FROZEN_FIELDS, configChanges } from './config-reload'
import {
    EngineConfigSchema,
    modelsOf,
    overrideConfigProvider,
} from './engine-config'

import { makeAgyConfig } from '../testing/agy-e2e-helpers'

/**
 * E2E contract tests for Spec #777 Feature F3:
 * `overrideConfigProvider` & frozen `models` on resume.
 */

describe('F3: overrideConfigProvider & frozen models — Tier 1 equivalence classes', () => {
    test('overrideConfigProvider maps claude routed floors to matching agy tier indices', () => {
        const claudeConfig = makeAgyConfig({
            provider: 'claude',
            floors: {
                'test-writer': 'sonnet',
                implementer: 'opus',
                learner: 'haiku',
            },
        })

        const agyConfig = overrideConfigProvider({
            config: claudeConfig,
            provider: 'agy',
        })

        expect(agyConfig.models?.provider).toBe('agy')
        expect(agyConfig.models?.floors).toEqual({
            'test-writer': 'gemini-4-argon-high',
            implementer: 'gemini-4-neon-high',
            learner: 'gemini-3.8-flash-high',
        })
    })

    test('overrideConfigProvider maps agy routed floors back to matching claude tier indices', () => {
        const agyConfig = makeAgyConfig({
            provider: 'agy',
            floors: {
                'test-writer': 'gemini-3.8-flash-high',
                implementer: 'gemini-4-argon-high',
                learner: 'gemini-4-neon-high',
            },
        })

        const claudeConfig = overrideConfigProvider({
            config: agyConfig,
            provider: 'claude',
        })

        expect(claudeConfig.models?.provider).toBe('claude')
        expect(claudeConfig.models?.floors).toEqual({
            'test-writer': 'haiku',
            implementer: 'sonnet',
            learner: 'opus',
        })
    })

    test('overrideConfigProvider materializes agy models with strongest floors when models was omitted', () => {
        const bare = EngineConfigSchema.parse({
            checks: { test: 'bun test' },
        })

        const overridden = overrideConfigProvider({
            config: bare,
            provider: 'agy',
        })

        expect(overridden.models).toEqual({
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

    test('overrideConfigProvider preserves effort, confidence_bar, trial_share, and other config fields', () => {
        const original = makeAgyConfig({
            provider: 'claude',
            floors: { 'test-writer': 'sonnet' },
            effort: {
                'test-writer': 'high',
                implementer: 'xhigh',
                learner: 'low',
            },
            confidence_bar: 0.8,
            trial_share: 0.25,
            checks: { test: 'bun test', lint: 'bun run lint' },
            rule_files: ['AGENTS.md'],
            auto_retry: false,
        })

        const overridden = overrideConfigProvider({
            config: original,
            provider: 'agy',
        })

        expect(overridden.checks).toEqual(original.checks)
        expect(overridden.rule_files).toEqual(['AGENTS.md'])
        expect(overridden.auto_retry).toBe(false)
        expect(overridden.models?.effort).toEqual({
            'test-writer': 'high',
            implementer: 'xhigh',
            learner: 'low',
        })
        expect(overridden.models?.confidence_bar).toBe(0.8)
        expect(overridden.models?.trial_share).toBe(0.25)
    })

    test('overrideConfigProvider returns the exact same reference when provider already matches', () => {
        const agyConfig = makeAgyConfig({ provider: 'agy' })

        expect(
            overrideConfigProvider({ config: agyConfig, provider: 'agy' })
        ).toBe(agyConfig)
    })
})

describe('F3: overrideConfigProvider & frozen models — Tier 2 boundaries & negatives', () => {
    test('overrideConfigProvider to claude on config without models returns exact reference without injecting models', () => {
        const bare = EngineConfigSchema.parse({ checks: { test: 'bun test' } })

        const result = overrideConfigProvider({
            config: bare,
            provider: 'claude',
        })

        expect(result).toBe(bare)
        expect(result.models).toBeUndefined()
    })

    test('overrideConfigProvider does not mutate the input config or its nested models objects', () => {
        const input = makeAgyConfig({
            provider: 'claude',
            floors: { 'test-writer': 'sonnet', learner: 'haiku' },
        })
        const snapshot = structuredClone(input)

        const output = overrideConfigProvider({
            config: input,
            provider: 'agy',
        })

        expect(output).not.toBe(input)
        expect(input).toEqual(snapshot)
    })

    test('round-trip claude -> agy -> claude reproduces identical models block to modelsOf(original)', () => {
        const original = makeAgyConfig({
            provider: 'claude',
            floors: {
                'test-writer': 'sonnet',
                implementer: 'opus',
                learner: 'haiku',
            },
            effort: {
                'test-writer': 'high',
                implementer: 'medium',
                learner: 'max',
            },
            confidence_bar: 0.65,
            trial_share: 0.15,
        })

        const agy = overrideConfigProvider({
            config: original,
            provider: 'agy',
        })
        const back = overrideConfigProvider({ config: agy, provider: 'claude' })

        expect(back.models).toEqual(modelsOf({ config: original }))
    })

    test('overrideConfigProvider output passes EngineConfigSchema.safeParse in both directions', () => {
        const claude = makeAgyConfig({
            provider: 'claude',
            floors: { 'test-writer': 'haiku' },
        })
        const agy = overrideConfigProvider({ config: claude, provider: 'agy' })
        const back = overrideConfigProvider({ config: agy, provider: 'claude' })

        expect(EngineConfigSchema.safeParse(agy).success).toBe(true)
        expect(EngineConfigSchema.safeParse(back).success).toBe(true)
    })

    test('FROZEN_FIELDS includes models and configChanges ignores provider and floor differences on resume', () => {
        const claude = makeAgyConfig({
            provider: 'claude',
            floors: { 'test-writer': 'sonnet' },
        })
        const agy = overrideConfigProvider({ config: claude, provider: 'agy' })

        expect(FROZEN_FIELDS).toContain('models')
        expect(configChanges({ current: agy, next: claude })).toEqual([])
        expect(configChanges({ current: claude, next: agy })).toEqual([])
    })
})
