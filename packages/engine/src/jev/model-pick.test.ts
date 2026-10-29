import { describe, expect, test } from 'bun:test'

import { pickModel, trialGroupOf, type ModelAnswer } from './model-pick'

import type { AgentRole } from '../agents/role-results'
import { ModelsConfigSchema } from '../config/engine-config'

/**
 * The model pick (#603) and its model trial (#698), called with a config's
 * `models` block and Clef's `agent_model` answer.
 */

const KEY = 'luca-20261028-202119-k6q1:697:test-writer'

/** The pick for `role` with these `models` settings and this answer. */
const pickOf = ({
    role = 'test-writer',
    models,
    answer,
    trial_key = KEY,
}: {
    role?: AgentRole
    models: object
    answer: ModelAnswer | null
    trial_key?: string | null
}) =>
    pickModel({
        role,
        models: ModelsConfigSchema.parse(models),
        failed_cheaper: false,
        answer,
        trial_key,
    })

/** Clef picked `pick` from `offered` at `confidence`. */
const answer = (
    pick: string,
    confidence: number | null,
    offered = ['opus', 'sonnet']
): ModelAnswer => ({ offered, pick, confidence })

const SONNET_FLOOR = { 'test-writer': 'sonnet' }

describe('trialGroupOf (#698)', () => {
    test('a share of 1 puts every key in the trial group, and a share of 0.5 gives the same group for the same key every time', () => {
        const keys = [
            KEY,
            'luca-20261028-202119-k6q1:698:implementer',
            'run-a:1:test-writer',
            'run-b:42:implementer',
            '',
        ]
        for (const key of keys) {
            expect(trialGroupOf({ key, share: 1 })).toBe('trial')
        }
        for (const key of keys) {
            const first = trialGroupOf({ key, share: 0.5 })
            for (let again = 0; again < 5; again += 1) {
                expect(trialGroupOf({ key, share: 0.5 })).toBe(first)
            }
        }
    })

    test('at a share of 0.5, the key hashing to 0.0289 is in the trial group and the key hashing to 0.6432 is in the control group, every time', () => {
        for (let again = 0; again < 3; again += 1) {
            expect(trialGroupOf({ key: KEY, share: 0.5 })).toBe('trial')
            expect(
                trialGroupOf({
                    key: 'luca-20261028-202119-k6q1:698:implementer',
                    share: 0.5,
                })
            ).toBe('control')
        }
    })
})

describe('the model pick with a model trial (#698)', () => {
    test('with a sonnet floor and a trial share of 1, an offered sonnet pick at 0.2 runs on sonnet in the trial group', () => {
        expect(
            pickOf({
                models: { floors: SONNET_FLOOR, trial_share: 1 },
                answer: answer('sonnet', 0.2),
            })
        ).toEqual({
            model: 'sonnet',
            model_reason: 'trial',
            trial_group: 'trial',
        })
    })

    test('with a trial share of 0, the same answer stays on opus as unsure, in no group', () => {
        expect(
            pickOf({
                models: { floors: SONNET_FLOOR, trial_share: 0 },
                answer: answer('sonnet', 0.2),
            })
        ).toEqual({ model: 'opus', model_reason: 'unsure', trial_group: null })
    })

    test('an opus floor, a pick the ask did not offer, a null confidence, or the learner is in no group, even with a trial share of 1', () => {
        const cases = [
            pickOf({
                models: { trial_share: 1 },
                answer: answer('sonnet', 0.2, ['opus', 'sonnet', 'haiku']),
            }),
            pickOf({
                models: { floors: SONNET_FLOOR, trial_share: 1 },
                answer: answer('haiku', 0.2),
            }),
            pickOf({
                models: { floors: SONNET_FLOOR, trial_share: 1 },
                answer: answer('sonnet', null),
            }),
            pickOf({
                role: 'learner',
                models: { floors: { learner: 'sonnet' }, trial_share: 1 },
                answer: answer('sonnet', 0.2),
                trial_key: null,
            }),
        ]
        expect(cases).toEqual([
            { model: 'opus', model_reason: 'floor', trial_group: null },
            { model: 'opus', model_reason: 'unsure', trial_group: null },
            { model: 'opus', model_reason: 'unsure', trial_group: null },
            { model: 'opus', model_reason: 'unsure', trial_group: null },
        ])
    })

    test("at the default 0.5 bar, an answer at 0.6 runs on Clef's sonnet as decision_model, in no group, whatever the trial share", () => {
        for (const trial_share of [0, 0.5, 1]) {
            expect(
                pickOf({
                    models: { floors: SONNET_FLOOR, trial_share },
                    answer: answer('sonnet', 0.6),
                })
            ).toEqual({
                model: 'sonnet',
                model_reason: 'decision_model',
                trial_group: null,
            })
        }
    })
})
