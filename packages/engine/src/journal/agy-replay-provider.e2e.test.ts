import { describe, expect, test } from 'bun:test'

import { ranCheaper } from './agent-turn-replay'
import type { JournalEntry } from './journal-record'
import { EMPTY_MEMORY, learnerAfter } from './memory-replay'
import { replayRun } from './replay'
import { EMPTY_TICKET_PROGRESS } from './ticket-progress'
import {
    alreadyDoneCheckedChange,
    failedTryChange,
} from './ticket-result-replay'

import { launchPick } from '../jev/model-pick'
import { SESSIONS, agentFailed } from '../testing/agent-turn-fixtures'
import { makeAgyConfig } from '../testing/agy-e2e-helpers'
import {
    alreadyDone,
    alreadyDoneChecked,
} from '../testing/already-done-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'
import {
    intakePassedWithMemory,
    learnerFailed,
} from '../testing/memory-fixtures'
import {
    BUILD_CONFIG,
    intakePassed,
    practiceTicket,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/run-fixtures'

/**
 * E2E contract tests for Spec #777 Feature F6:
 * Journal replay `ranCheaper` & provider threading.
 */

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

describe('F6: Journal replay ranCheaper & threading — Tier 1 & Tier 2', () => {
    test('T1.1: ranCheaper classifies agy non-strongest tiers as true and strongest as false', () => {
        expect(ranCheaper('gemini-4-argon-high', 'agy')).toBe(true)
        expect(ranCheaper('gemini-3.8-flash-high', 'agy')).toBe(true)
        expect(ranCheaper('gemini-4-neon-high', 'agy')).toBe(false)
    })

    test('T1.2: ranCheaper defaults to claude when provider is omitted', () => {
        expect(ranCheaper('sonnet')).toBe(true)
        expect(ranCheaper('haiku')).toBe(true)
        expect(ranCheaper('opus')).toBe(false)
        expect(ranCheaper('opus', 'claude')).toBe(false)
    })

    test('T1.3: replayRun sets ticket failed_cheaper on agy cheaper failure and launchPick escalates', () => {
        const { config, records } = agyState({
            floors: { 'test-writer': 'gemini-4-argon-high' },
            extra: [
                ...withInstalls({
                    entries: [ticketWorktreeCreated({ ticket: 11 })],
                }),
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'agent',
                }),
            ],
        })
        const state = replayRun({ records })

        expect(state.tickets[11]?.failed_cheaper).toEqual(['test-writer'])
        expect(
            launchPick({
                records,
                state,
                config,
                run_id: 'run-1',
                ticket: 11,
                role: 'test-writer',
                step: { first_seq: 10, redo: false },
            })
        ).toEqual({
            model: 'gemini-4-neon-high',
            model_reason: 'after_failure',
            trial_group: null,
        })
    })

    test('T1.4: replayRun leaves failed_cheaper empty after failure on agy strongest gemini-4-neon-high', () => {
        const { state } = agyState({
            extra: [
                ...withInstalls({
                    entries: [ticketWorktreeCreated({ ticket: 11 })],
                }),
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-neon-high',
                    model_reason: 'floor',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'agent',
                }),
            ],
        })

        expect(state.tickets[11]?.failed_cheaper).toEqual([])
    })

    test('T1.5: replayRun sets failed_cheaper on failed already_done_checked after cheaper agy launch', () => {
        const { state } = agyState({
            extra: [
                ...withInstalls({
                    entries: [ticketWorktreeCreated({ ticket: 11 })],
                }),
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                }),
                alreadyDone({ ticket: 11 }),
                alreadyDoneChecked({
                    ticket: 11,
                    problems: ['Commit did not implement AC1.'],
                }),
            ],
        })

        expect(state.tickets[11]?.failed_cheaper).toEqual(['test-writer'])
        expect(
            alreadyDoneCheckedChange({
                progress: {
                    ...EMPTY_TICKET_PROGRESS,
                    launched_on: { 'test-writer': 'gemini-4-argon-high' },
                },
                checked: {
                    ok: false,
                    problems: ['missing'],
                    base_sha: 'b0',
                    tests: null,
                },
                provider: 'agy',
            }).failed_cheaper
        ).toEqual(['test-writer'])
    })

    test('T1.6: replayRun sets learner failed_cheaper on agy cheaper tier failure and false on strongest', () => {
        const config = makeAgyConfig({
            provider: 'agy',
            floors: { learner: 'gemini-3.8-flash-high' },
        })
        const cheaperRecords = recordsFrom({
            entries: intakePassedWithMemory({
                tickets: [practiceTicket({ number: 11 })],
            }).map((entry) =>
                entry.kind === 'run_started'
                    ? { ...entry, content: { ...entry.content, config } }
                    : entry
            ),
        }).concat(
            recordsFrom({
                entries: [
                    startedEntry({
                        ticket: null,
                        role: 'learner',
                        model: 'gemini-3.8-flash-high',
                    }),
                    learnerFailed({ failure: 'result' }),
                ],
            }).map((record, index) => ({ ...record, seq: 10 + index }))
        )

        const failedRecord = recordsFrom({
            entries: [learnerFailed({ failure: 'agent' })],
        }).find((r) => r.kind === 'agent_failed')
        if (failedRecord === undefined) throw new Error('expected agent_failed')

        const strongestState = learnerAfter({
            learner: {
                ...EMPTY_MEMORY.learner,
                launched_on: 'gemini-4-neon-high',
            },
            record: failedRecord,
            provider: 'agy',
        })

        expect(
            replayRun({ records: cheaperRecords }).memory.learner.failed_cheaper
        ).toBe(true)
        expect(strongestState.failed_cheaper).toBe(false)
    })

    test('T2.1: ranCheaper returns false for null and undefined under agy', () => {
        expect(ranCheaper(null, 'agy')).toBe(false)
        expect(ranCheaper(undefined, 'agy')).toBe(false)
    })

    test('T2.2: replayRun defaults provider to claude when run_started omits models.provider or config is null', () => {
        const records = recordsFrom({
            entries: [
                ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
                ...withInstalls({
                    entries: [ticketWorktreeCreated({ ticket: 11 })],
                }),
                startedEntry({
                    ticket: 11,
                    role: 'implementer',
                    model: 'opus',
                    model_reason: 'floor',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                }),
            ],
        })
        const noConfig = recordsFrom({
            entries: [
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'sonnet',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'guard',
                }),
            ],
        })

        expect(BUILD_CONFIG.models).toBeUndefined()
        expect(replayRun({ records }).tickets[11]?.failed_cheaper).toEqual([])
        expect(
            replayRun({ records: noConfig }).tickets[11]?.failed_cheaper
        ).toEqual(['test-writer'])
    })

    test('T2.3: engine failure does not set failed_cheaper for ticket roles or learner', () => {
        const { state } = agyState({
            extra: [
                ...withInstalls({
                    entries: [ticketWorktreeCreated({ ticket: 11 })],
                }),
                startedEntry({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'test-writer',
                    failure: 'engine',
                }),
                startedEntry({
                    ticket: null,
                    role: 'learner',
                    model: 'gemini-3.8-flash-high',
                }),
                learnerFailed({ failure: 'engine' }),
            ],
        })

        expect(state.tickets[11]?.failed_cheaper).toEqual([])
        expect(state.memory.learner.failed_cheaper).toBe(false)
    })

    test('T2.4: failedTryChange and replayRun do not duplicate role in failed_cheaper on repeated failures', () => {
        const { state } = agyState({
            extra: [
                ...withInstalls({
                    entries: [ticketWorktreeCreated({ ticket: 11 })],
                }),
                startedEntry({
                    ticket: 11,
                    role: 'implementer',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'result',
                }),
            ],
        })
        const direct = failedTryChange({
            progress: {
                ...EMPTY_TICKET_PROGRESS,
                launched_on: { implementer: 'gemini-4-argon-high' },
                failed_cheaper: ['implementer'],
            },
            role: 'implementer',
            failure: 'guard',
            provider: 'agy',
        })

        expect(state.tickets[11]?.failed_cheaper).toEqual(['implementer'])
        expect(direct.failed_cheaper).toEqual(['implementer'])
        expect(SESSIONS.implementer).toBe('impl-1')
    })

    test('T2.5: ranCheaper treats opus under agy as true because opus !== gemini-4-neon-high', () => {
        expect(ranCheaper('opus', 'agy')).toBe(true)
        expect(ranCheaper('gemini-4-neon-high', 'claude')).toBe(true)
    })
})
