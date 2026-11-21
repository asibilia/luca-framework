import { describe, expect, test } from 'bun:test'

import { JEV_FIXED_MODEL, jevAsksBefore } from './jev-jobs'
import {
    LOCKED_PICK,
    asksModel,
    launchPick,
    lockedPick,
    offeredModels,
    pickModel,
    redonePick,
    trialGroupOf,
    type ModelAnswer,
} from './model-pick'

import type { EngineConfig } from '../config/engine-config'
import type { JournalEntry, JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import { makeAgyConfig } from '../testing/agy-e2e-helpers'
import { recordsFrom } from '../testing/intake-fixtures'
import { practiceTicket } from '../testing/run-fixtures'

/**
 * E2E contract tests for Spec #777 Feature F4:
 * `model-pick.ts` & `jev-jobs.ts` provider generalization.
 * (F5 is in `../core/agy-core-threading.e2e.test.ts` and F6 is in
 * `../journal/agy-replay-provider.e2e.test.ts`.)
 */

const TRIAL_KEY = 'luca-20261028-202119-k6q1:697:test-writer'
const CONTROL_KEY = 'luca-20261028-202119-k6q1:698:implementer'

const startedEntry = ({
    ticket,
    role,
    model,
    model_reason = 'decision_model',
    effort = 'medium',
    trial_group = null,
    follow_up_of = null,
}: {
    ticket: number | null
    role: JournalEntry extends infer E
        ? E extends { kind: 'agent_started'; content: { role: infer R } }
            ? R
            : never
        : never
    model: string | null
    model_reason?:
        | 'locked'
        | 'after_failure'
        | 'floor'
        | 'no_answer'
        | 'unsure'
        | 'decision_model'
        | 'trial'
        | null
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
    trial_group?: 'trial' | 'control' | null
    follow_up_of?: string | null
}): JournalEntry => ({
    kind: 'agent_started',
    ticket,
    role,
    content: {
        role,
        prompt: 'p',
        follow_up_of,
        model,
        model_reason,
        effort,
        trial_group,
    },
})

const agyState = ({
    floors,
    extra = [],
}: {
    floors?: Record<string, string>
    extra?: JournalEntry[]
} = {}) => {
    const config = makeAgyConfig({ provider: 'agy', floors })
    const records = recordsFrom({
        entries: [
            {
                kind: 'run_started',
                ticket: null,
                role: null,
                content: { spec_number: 10, config, base_branch: 'main' },
            },
            {
                kind: 'spec_snapshot',
                ticket: 10,
                role: null,
                content: {
                    spec: {
                        number: 10,
                        title: 'Agy spec',
                        body: 'Body',
                        labels: ['ready-for-agent'],
                        url: 'https://github.com/acme/app/issues/10',
                        author: 'spec-owner',
                    },
                    ticket_order: [11],
                    closed_tickets: [],
                },
            },
            {
                kind: 'ticket_snapshot',
                ticket: 11,
                role: null,
                content: practiceTicket({ number: 11 }),
            },
            ...extra,
        ],
    })
    return { config, records, state: replayRun({ records }) }
}

const jevRecords = ({
    config,
    pick,
    confidence,
    offered,
    role = 'test-writer',
    ticket = 11,
    extra = [],
}: {
    config: EngineConfig
    pick: string
    confidence: number | null
    offered: string[]
    role?: 'test-writer' | 'implementer'
    ticket?: number
    extra?: JournalEntry[]
}): JournalRecord[] =>
    recordsFrom({
        entries: [
            {
                kind: 'run_started',
                ticket: null,
                role: null,
                content: { spec_number: 10, config, base_branch: 'main' },
            },
            ...extra,
            {
                kind: 'jev_asked',
                ticket,
                role,
                content: {
                    job: 'agent_model',
                    request: {
                        state: { role },
                        questions: {
                            model: {
                                type: 'choice',
                                instructions: 'Pick model',
                                criteria: Object.fromEntries(
                                    offered.map((name) => [name, null])
                                ),
                            },
                        },
                    },
                    fixed: { model: 'gemini-4-neon-high' },
                    acted: true,
                },
            },
            {
                kind: 'jev_answered',
                ticket,
                role,
                content: {
                    job: 'agent_model',
                    asked_seq: 2 + extra.length,
                    answers: {
                        model: {
                            value: pick,
                            confidence,
                            raw: { choice: pick },
                        },
                    },
                    ms: 10,
                },
            },
        ],
    })

describe('F4: model-pick.ts & jev-jobs.ts — Tier 1 equivalence classes', () => {
    test('lockedPick returns gemini-4-neon-high for agy and opus by default matching LOCKED_PICK', () => {
        expect(lockedPick({ provider: 'agy' })).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'locked',
            trial_group: null,
        })
        expect(lockedPick()).toEqual({
            model: 'opus',
            model_reason: 'locked',
            trial_group: null,
        })
        expect(LOCKED_PICK).toEqual(lockedPick({ provider: 'claude' }))
    })

    test('offeredModels returns active provider slice down to floor, or all 3 when strongest', () => {
        expect(
            offeredModels({ floor: 'gemini-4-argon-high', provider: 'agy' })
        ).toEqual(['gemini-4-neon-high', 'gemini-4-argon-high'])
        expect(
            offeredModels({ floor: 'gemini-3.8-flash-high', provider: 'agy' })
        ).toEqual([
            'gemini-4-neon-high',
            'gemini-4-argon-high',
            'gemini-3.8-flash-high',
        ])
        expect(
            offeredModels({ floor: 'gemini-4-neon-high', provider: 'agy' })
        ).toEqual([
            'gemini-4-neon-high',
            'gemini-4-argon-high',
            'gemini-3.8-flash-high',
        ])
        expect(offeredModels({ floor: 'sonnet', provider: 'claude' })).toEqual([
            'opus',
            'sonnet',
        ])
    })

    test('pickModel selects agy decision_model pick when confidence meets bar', () => {
        const models = makeAgyConfig({
            provider: 'agy',
            floors: { 'test-writer': 'gemini-4-argon-high' },
            confidence_bar: 0.5,
        }).models
        if (models === undefined) throw new Error('expected models')
        const answer: ModelAnswer = {
            offered: ['gemini-4-neon-high', 'gemini-4-argon-high'],
            pick: 'gemini-4-argon-high',
            confidence: 0.9,
        }

        expect(
            pickModel({
                role: 'test-writer',
                models,
                failed_cheaper: false,
                answer,
                trial_key: TRIAL_KEY,
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'decision_model',
            trial_group: null,
        })
    })

    test('pickModel runs agy trial pick in trial group and strongest in control group', () => {
        const models = makeAgyConfig({
            provider: 'agy',
            floors: { 'test-writer': 'gemini-3.8-flash-high' },
            trial_share: 0.5,
        }).models
        if (models === undefined) throw new Error('expected models')
        const answer: ModelAnswer = {
            offered: [
                'gemini-4-neon-high',
                'gemini-4-argon-high',
                'gemini-3.8-flash-high',
            ],
            pick: 'gemini-4-argon-high',
            confidence: 0.2,
        }

        expect(trialGroupOf({ key: TRIAL_KEY, share: 0.5 })).toBe('trial')
        expect(trialGroupOf({ key: CONTROL_KEY, share: 0.5 })).toBe('control')
        expect(
            pickModel({
                role: 'test-writer',
                models,
                failed_cheaper: false,
                answer,
                trial_key: TRIAL_KEY,
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'trial',
            trial_group: 'trial',
        })
        expect(
            pickModel({
                role: 'test-writer',
                models,
                failed_cheaper: false,
                answer,
                trial_key: CONTROL_KEY,
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'unsure',
            trial_group: 'control',
        })
    })

    test('jevAsksBefore emits agent_model ask with agy criteria, fixed strongest, and acted flag', () => {
        const routed = agyState({
            floors: {
                'test-writer': 'gemini-4-argon-high',
                learner: 'gemini-3.8-flash-high',
            },
        })
        const shadow = agyState()

        const ticketAsks = jevAsksBefore({
            action: {
                type: 'launch_agent',
                ticket: 11,
                role: 'test-writer',
                prompt: 'p',
                may_edit_tests: true,
            },
            state: routed.state,
        })
        const modelAsk = ticketAsks.find(({ job }) => job === 'agent_model')
        const learnerAsks = jevAsksBefore({
            action: { type: 'launch_learner', prompt: 'p' },
            state: routed.state,
        })
        const shadowAsks = jevAsksBefore({
            action: {
                type: 'launch_agent',
                ticket: 11,
                role: 'test-writer',
                prompt: 'p',
                may_edit_tests: true,
            },
            state: shadow.state,
        }).find(({ job }) => job === 'agent_model')

        expect(modelAsk?.acted).toBe(true)
        expect(modelAsk?.fixed).toEqual({ model: 'gemini-4-neon-high' })
        expect(modelAsk?.request.questions.model).toMatchObject({
            type: 'choice',
            criteria: {
                'gemini-4-neon-high': null,
                'gemini-4-argon-high': null,
            },
        })
        expect(learnerAsks[0]?.acted).toBe(true)
        expect(learnerAsks[0]?.fixed).toEqual({ model: 'gemini-4-neon-high' })
        expect(shadowAsks?.acted).toBe(false)
        expect(shadowAsks?.request.questions.model).toMatchObject({
            criteria: {
                'gemini-4-neon-high': null,
                'gemini-4-argon-high': null,
                'gemini-3.8-flash-high': null,
            },
        })
    })

    test('launchPick and asksModel reuse prior agy model on step.redo via redonePick', () => {
        const { config, state } = agyState({
            floors: { 'test-writer': 'gemini-4-argon-high' },
        })
        const records = jevRecords({
            config,
            pick: 'gemini-4-neon-high',
            confidence: 0.9,
            offered: ['gemini-4-neon-high', 'gemini-4-argon-high'],
            extra: [
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                    model_reason: 'trial',
                    trial_group: 'trial',
                }),
            ],
        })

        expect(
            asksModel({
                records,
                state,
                ticket: 11,
                role: 'test-writer',
                step: { first_seq: 2, redo: true },
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
                step: { first_seq: 2, redo: true },
            })
        ).toEqual({
            model: 'gemini-4-argon-high',
            model_reason: 'trial',
            trial_group: 'trial',
        })
    })
})

describe('F4: model-pick.ts & jev-jobs.ts — Tier 2 boundaries & negatives', () => {
    test('pickModel rejects cross-provider answer pick as unsure and falls back to strongest', () => {
        const models = makeAgyConfig({
            provider: 'agy',
            floors: { 'test-writer': 'gemini-4-argon-high' },
        }).models
        if (models === undefined) throw new Error('expected models')

        expect(
            pickModel({
                role: 'test-writer',
                models,
                failed_cheaper: false,
                answer: {
                    offered: ['gemini-4-neon-high', 'gemini-4-argon-high'],
                    pick: 'sonnet',
                    confidence: 0.99,
                },
                trial_key: TRIAL_KEY,
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'unsure',
            trial_group: null,
        })
    })

    test('pickModel with failed_cheaper returns after_failure on gemini-4-neon-high', () => {
        const models = makeAgyConfig({
            provider: 'agy',
            floors: { implementer: 'gemini-3.8-flash-high' },
        }).models
        if (models === undefined) throw new Error('expected models')

        expect(
            pickModel({
                role: 'implementer',
                models,
                failed_cheaper: true,
                answer: {
                    offered: ['gemini-4-neon-high', 'gemini-3.8-flash-high'],
                    pick: 'gemini-3.8-flash-high',
                    confidence: 0.99,
                },
                trial_key: TRIAL_KEY,
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'after_failure',
            trial_group: null,
        })
    })

    test('pickModel for non-routed roles under agy returns lockedPick', () => {
        const models = makeAgyConfig({
            provider: 'agy',
            floors: { 'test-writer': 'gemini-3.8-flash-high' },
        }).models
        if (models === undefined) throw new Error('expected models')

        for (const role of [
            'ticket-reviewer',
            'security-lens',
            'story-writer',
        ] as const) {
            expect(
                pickModel({
                    role,
                    models,
                    failed_cheaper: false,
                    answer: null,
                    trial_key: null,
                })
            ).toEqual(lockedPick({ provider: 'agy' }))
        }
    })

    test('pickModel in trial rejects picks weaker than floor or equal to strongest', () => {
        const models = makeAgyConfig({
            provider: 'agy',
            floors: { 'test-writer': 'gemini-4-argon-high' },
            trial_share: 1,
        }).models
        if (models === undefined) throw new Error('expected models')

        for (const pick of ['gemini-3.8-flash-high', 'gemini-4-neon-high']) {
            expect(
                pickModel({
                    role: 'test-writer',
                    models,
                    failed_cheaper: false,
                    answer: {
                        offered: [
                            'gemini-4-neon-high',
                            'gemini-4-argon-high',
                            'gemini-3.8-flash-high',
                        ],
                        pick,
                        confidence: 0.2,
                    },
                    trial_key: TRIAL_KEY,
                })
            ).toEqual({
                model: 'gemini-4-neon-high',
                model_reason: 'unsure',
                trial_group: null,
            })
        }
    })

    test('redonePick returns null for wrong-provider model, null model_reason, or seq < first_seq', () => {
        const wrongProvider = recordsFrom({
            entries: [
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'opus',
                }),
            ],
        })
        const nullReason = recordsFrom({
            entries: [
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                    model_reason: null,
                }),
            ],
        })
        const valid = recordsFrom({
            entries: [
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                    model_reason: 'decision_model',
                }),
            ],
        })

        expect(
            redonePick({
                records: wrongProvider,
                first_seq: 1,
                ticket: 11,
                role: 'test-writer',
                provider: 'agy',
            })
        ).toBeNull()
        expect(
            redonePick({
                records: nullReason,
                first_seq: 1,
                ticket: 11,
                role: 'test-writer',
                provider: 'agy',
            })
        ).toBeNull()
        expect(
            redonePick({
                records: valid,
                first_seq: 2,
                ticket: 11,
                role: 'test-writer',
                provider: 'agy',
            })
        ).toBeNull()
    })

    test('asksModel and jevAsksBefore default cleanly to claude and JEV_FIXED_MODEL when config is null', () => {
        const state = replayRun({ records: [] })
        const asks = jevAsksBefore({
            action: {
                type: 'launch_agent',
                ticket: 11,
                role: 'test-writer',
                prompt: 'p',
                may_edit_tests: true,
            },
            state,
        })
        const modelAsk = asks.find(({ job }) => job === 'agent_model')

        expect(JEV_FIXED_MODEL).toBe('opus')
        expect(
            asksModel({
                records: [],
                state,
                ticket: 11,
                role: 'test-writer',
                step: undefined,
            })
        ).toBe(true)
        expect(modelAsk?.fixed).toEqual({ model: 'opus' })
        expect(modelAsk?.acted).toBe(false)
    })
})
