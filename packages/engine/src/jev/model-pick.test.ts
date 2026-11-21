import { describe, expect, test } from 'bun:test'

import {
    asksModel,
    launchPick,
    LOCKED_PICK,
    lockedPick,
    offeredModels,
    pickModel,
    redonePick,
    trialGroupOf,
    type ModelAnswer,
    type ModelPick,
    type ModelReason,
} from './model-pick'

import { AGY_MODEL_NAMES } from '../agents/provider'
import type { AgentRole } from '../agents/role-results'
import { EngineConfigSchema, ModelsConfigSchema } from '../config/engine-config'
import {
    JournalRecordSchema,
    type JournalEntry,
    type JournalRecord,
} from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { intakePassed, practiceTicket } from '../testing/build-fixtures'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

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

const stamp = (entries: JournalEntry[]): JournalRecord[] =>
    entries.map((entry, index) =>
        JournalRecordSchema.parse({
            ...entry,
            seq: index + 1,
            time: new Date(0).toISOString(),
        })
    )

const agyConfig = ({ floors = {} }: { floors?: object } = {}) =>
    EngineConfigSchema.parse({
        ...PRACTICE_ENGINE_CONFIG,
        models: { provider: 'agy', floors },
    })

describe('provider-aware model routing (#778 AC5–AC6)', () => {
    test('lockedPick defaults to opus, returns gemini-4-neon-high for agy, and keeps LOCKED_PICK on opus', () => {
        expect(LOCKED_PICK).toEqual({
            model: 'opus',
            model_reason: 'locked',
            trial_group: null,
        })
        expect(lockedPick()).toEqual(LOCKED_PICK)
        expect(lockedPick({ provider: 'agy' })).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'locked',
            trial_group: null,
        })
    })

    test('offeredModels returns provider-ordered tiers at or above the floor', () => {
        expect(offeredModels({ floor: 'sonnet' })).toEqual(['opus', 'sonnet'])
        expect(
            offeredModels({
                floor: 'gemini-4-argon-high',
                provider: 'agy',
            })
        ).toEqual(['gemini-4-neon-high', 'gemini-4-argon-high'])
        expect(
            offeredModels({
                floor: 'gemini-4-neon-high',
                provider: 'agy',
            })
        ).toEqual([...AGY_MODEL_NAMES])
        expect(
            offeredModels({
                floor: 'gemini-3.8-flash-high',
                provider: 'agy',
            })
        ).toEqual([...AGY_MODEL_NAMES])
    })

    test('pickModel routes agy roles onto agy tiers and rejects cross-provider picks', () => {
        const argonFloor = {
            provider: 'agy',
            floors: { 'test-writer': 'gemini-4-argon-high' },
            trial_share: 1,
        }
        const neonPick = (model_reason: ModelReason): ModelPick => ({
            model: 'gemini-4-neon-high',
            model_reason,
            trial_group: null,
        })

        expect(
            pickOf({
                role: 'ticket-reviewer',
                models: argonFloor,
                answer: answer('gemini-4-argon-high', 0.9, [
                    'gemini-4-neon-high',
                    'gemini-4-argon-high',
                ]),
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'locked',
            trial_group: null,
        })
        expect(
            pickModel({
                role: 'test-writer',
                models: ModelsConfigSchema.parse(argonFloor),
                failed_cheaper: true,
                answer: answer('gemini-4-argon-high', 0.9, [
                    'gemini-4-neon-high',
                    'gemini-4-argon-high',
                ]),
                trial_key: KEY,
            })
        ).toEqual(neonPick('after_failure'))
        expect(
            pickOf({
                models: { provider: 'agy' },
                answer: answer('gemini-4-argon-high', 0.9, [
                    ...AGY_MODEL_NAMES,
                ]),
            })
        ).toEqual(neonPick('floor'))
        expect(
            pickOf({
                models: argonFloor,
                answer: null,
            })
        ).toEqual(neonPick('no_answer'))
        expect(
            pickOf({
                models: argonFloor,
                answer: answer('sonnet', 0.9, [
                    'gemini-4-neon-high',
                    'gemini-4-argon-high',
                ]),
            })
        ).toEqual(neonPick('unsure'))
        expect(
            pickOf({
                models: argonFloor,
                answer: answer('gemini-4-argon-high', 0.9, [
                    'gemini-4-neon-high',
                    'gemini-4-argon-high',
                ]),
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            trial_group: null,
        })
        expect(
            pickOf({
                models: argonFloor,
                answer: answer('gemini-4-argon-high', 0.2, [
                    'gemini-4-neon-high',
                    'gemini-4-argon-high',
                ]),
                trial_key: KEY,
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'trial',
            trial_group: 'trial',
        })
        expect(
            pickOf({
                models: {
                    provider: 'agy',
                    floors: { 'test-writer': 'gemini-4-argon-high' },
                    confidence_bar: 0.5,
                    trial_share: 1,
                },
                answer: answer('gemini-4-argon-high', 0.5, [
                    'gemini-4-neon-high',
                    'gemini-4-argon-high',
                ]),
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            trial_group: null,
        })
        expect(
            pickOf({
                models: argonFloor,
                answer: answer('gemini-3.8-flash-high', 0.9, [
                    'gemini-4-neon-high',
                    'gemini-4-argon-high',
                ]),
            })
        ).toEqual(neonPick('unsure'))
        expect(
            pickOf({
                models: {
                    provider: 'agy',
                    floors: { 'test-writer': 'gemini-3.8-flash-high' },
                },
                answer: answer('gemini-3.8-flash-high', 0.8, [
                    ...AGY_MODEL_NAMES,
                ]),
            })
        ).toEqual({
            model: 'gemini-3.8-flash-high',
            model_reason: 'decision_model',
            trial_group: null,
        })
    })

    test('redonePick, asksModel, and launchPick reuse agy models and reject cross-provider models', () => {
        const config = agyConfig({
            floors: { 'test-writer': 'gemini-4-argon-high' },
        })
        const [runStarted, ...rest] = intakePassed({
            tickets: [practiceTicket({ number: 11 })],
        })
        if (runStarted?.kind !== 'run_started') throw new Error('no start')
        const records = stamp([
            {
                ...runStarted,
                content: { ...runStarted.content, config },
            },
            ...rest,
            {
                kind: 'agent_started',
                ticket: 11,
                role: 'test-writer',
                content: {
                    role: 'test-writer',
                    prompt: 'Write tests.',
                    follow_up_of: null,
                    model: 'gemini-4-argon-high',
                    model_reason: 'decision_model',
                    effort: 'medium',
                    trial_group: null,
                },
            },
        ])
        const state = replayRun({ records })
        const step = { first_seq: records.length, redo: true }

        expect(
            redonePick({
                records,
                first_seq: step.first_seq,
                ticket: 11,
                role: 'test-writer',
                provider: 'agy',
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            trial_group: null,
        })
        expect(
            redonePick({
                records,
                first_seq: step.first_seq,
                ticket: 11,
                role: 'test-writer',
                provider: 'claude',
            })
        ).toBeNull()
        expect(
            asksModel({
                records,
                state,
                ticket: 11,
                role: 'test-writer',
                step,
            })
        ).toBe(false)
        expect(
            launchPick({
                records,
                state,
                config,
                run_id: 'run-1',
                ticket: 11,
                role: 'test-writer',
                step,
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            trial_group: null,
        })
    })

    test('launchPick with redo: false reads modelAnswerOf and learner failed_cheaper escalates to gemini-4-neon-high', () => {
        const config = agyConfig({
            floors: {
                'test-writer': 'gemini-4-argon-high',
                learner: 'gemini-3.8-flash-high',
            },
        })
        const [runStarted, ...rest] = intakePassed({
            tickets: [practiceTicket({ number: 11 })],
        })
        if (runStarted?.kind !== 'run_started') throw new Error('no start')

        const baseEntries: JournalEntry[] = [
            {
                ...runStarted,
                content: { ...runStarted.content, config },
            },
            ...rest,
            {
                kind: 'jev_asked',
                ticket: 11,
                role: 'test-writer',
                content: {
                    job: 'agent_model',
                    model: '@cf/cloudflare/clef',
                    request: {
                        state: {},
                        questions: {
                            model: {
                                type: 'choice',
                                instructions: 'Which model?',
                                criteria: {
                                    'gemini-4-neon-high': null,
                                    'gemini-4-argon-high': null,
                                },
                            },
                        },
                    },
                    fixed: { model: 'gemini-4-neon-high' },
                },
            },
        ]
        const askedSeq = baseEntries.length
        const nonRedoRecords = stamp([
            ...baseEntries,
            {
                kind: 'jev_answered',
                ticket: 11,
                role: 'test-writer',
                content: {
                    job: 'agent_model',
                    asked_seq: askedSeq,
                    model: '@cf/cloudflare/clef',
                    ms: 10,
                    answers: {
                        model: {
                            value: 'gemini-4-argon-high',
                            confidence: 0.9,
                            raw: {},
                        },
                    },
                },
            },
        ])
        const nonRedoState = replayRun({ records: nonRedoRecords })
        expect(
            launchPick({
                records: nonRedoRecords,
                state: nonRedoState,
                config,
                run_id: 'run-1',
                ticket: 11,
                role: 'test-writer',
                step: { first_seq: nonRedoRecords.length + 1, redo: false },
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            trial_group: null,
        })

        const learnerFailedRecords = stamp([
            ...baseEntries.slice(0, 1 + rest.length),
            {
                kind: 'agent_started',
                ticket: null,
                role: 'learner',
                content: {
                    role: 'learner',
                    prompt: 'Learn.',
                    follow_up_of: null,
                    model: 'gemini-3.8-flash-high',
                    model_reason: 'decision_model',
                    effort: 'medium',
                    trial_group: null,
                },
            },
            {
                kind: 'agent_failed',
                ticket: null,
                role: 'learner',
                content: {
                    role: 'learner',
                    failure: 'agent',
                    error: 'Learner failed.',
                    session_id: 'learn-1',
                },
            },
        ])
        const learnerFailedState = replayRun({ records: learnerFailedRecords })
        expect(learnerFailedState.memory.learner.failed_cheaper).toBe(true)
        expect(
            asksModel({
                records: learnerFailedRecords,
                state: learnerFailedState,
                ticket: null,
                role: 'learner',
                step: undefined,
            })
        ).toBe(false)
        expect(
            launchPick({
                records: learnerFailedRecords,
                state: learnerFailedState,
                config,
                run_id: 'run-1',
                ticket: null,
                role: 'learner',
                step: {
                    first_seq: learnerFailedRecords.length + 1,
                    redo: false,
                },
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'after_failure',
            trial_group: null,
        })
    })
})
