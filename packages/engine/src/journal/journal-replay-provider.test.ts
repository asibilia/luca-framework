import { describe, expect, test } from 'bun:test'

import { ranCheaper } from './agent-turn-replay'
import type { JournalEntry } from './journal-record'
import { EMPTY_MEMORY, learnerAfter, learnerRecordOf } from './memory-replay'
import { replayRun } from './replay'
import { EMPTY_TICKET_PROGRESS } from './ticket-progress'
import {
    alreadyDoneCheckedChange,
    failedTryChange,
} from './ticket-result-replay'

import type { AgentRole } from '../agents/role-results'
import { EngineConfigSchema, type ProviderId } from '../config/engine-config'
import {
    agentFailed,
    alreadyDoneChecked,
    BUILD_CONFIG,
    intakePassed,
    practiceTicket,
    ticketWorktreeCreated,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Provider-aware journal replay (#778 AC8): `ranCheaper`, ticket failed-try
 * & already-done checks, and learner replay measure models against the run's
 * active provider's strongest model (`opus` for `claude`, `gemini-4-neon-high`
 * for `agy`), defaulting to `claude` when omitted or `state.config === null`.
 */

const startedAgent = ({
    ticket,
    role,
    model,
}: {
    ticket: number | null
    role: AgentRole
    model: string | null
}): JournalEntry => ({
    kind: 'agent_started',
    ticket,
    role,
    content: {
        role,
        prompt: 'Go.',
        follow_up_of: null,
        model,
        model_reason: null,
        effort: null,
        trial_group: null,
    },
})

const agyIntake = (): JournalEntry[] => {
    const entries = intakePassed({
        tickets: [practiceTicket({ number: 11 })],
    })
    const first = entries[0]
    if (first?.kind !== 'run_started') {
        throw new Error('Expected run_started first')
    }
    return [
        {
            ...first,
            content: {
                ...first.content,
                config: EngineConfigSchema.parse({
                    ...BUILD_CONFIG,
                    models: { provider: 'agy' },
                }),
            },
        },
        ...entries.slice(1),
    ]
}

const replayWithConfig = ({
    provider,
    entries,
}: {
    provider: ProviderId | null
    entries: JournalEntry[]
}) => {
    const prefix =
        provider === 'agy'
            ? [...agyIntake(), ticketWorktreeCreated({ ticket: 11 })]
            : provider === 'claude'
              ? [
                    ...intakePassed({
                        tickets: [practiceTicket({ number: 11 })],
                    }),
                    ticketWorktreeCreated({ ticket: 11 }),
                ]
              : [ticketWorktreeCreated({ ticket: 11 })]
    return replayRun({
        records: recordsFrom({ entries: [...prefix, ...entries] }),
    })
}

describe('provider-aware journal replay (#778 AC8)', () => {
    test('ranCheaper compares models against the active provider strongest tier', () => {
        expect(ranCheaper('gemini-4-argon-high', 'agy')).toBe(true)
        expect(ranCheaper('gemini-3.8-flash-high', 'agy')).toBe(true)
        expect(ranCheaper('gemini-4-neon-high', 'agy')).toBe(false)

        expect(ranCheaper('opus')).toBe(false)
        expect(ranCheaper('sonnet')).toBe(true)
        expect(ranCheaper('haiku')).toBe(true)
        expect(ranCheaper('opus', 'claude')).toBe(false)
        expect(ranCheaper('sonnet', 'claude')).toBe(true)
        expect(ranCheaper('haiku', 'claude')).toBe(true)

        expect(ranCheaper(null)).toBe(false)
        expect(ranCheaper(undefined)).toBe(false)
        expect(ranCheaper(null, 'agy')).toBe(false)
        expect(ranCheaper(undefined, 'agy')).toBe(false)
    })

    test('ticket failed-try and already_done_checked record failed_cheaper for agy and default claude', () => {
        const agyArgonProgress = {
            ...EMPTY_TICKET_PROGRESS,
            launched_on: {
                implementer: 'gemini-4-argon-high',
                'test-writer': 'gemini-4-argon-high',
            },
        }
        const agyNeonProgress = {
            ...EMPTY_TICKET_PROGRESS,
            launched_on: {
                implementer: 'gemini-4-neon-high',
                'test-writer': 'gemini-4-neon-high',
            },
        }
        expect(
            failedTryChange({
                progress: agyArgonProgress,
                role: 'implementer',
                failure: 'agent',
                provider: 'agy',
            }).failed_cheaper
        ).toEqual(['implementer'])
        expect(
            failedTryChange({
                progress: agyNeonProgress,
                role: 'implementer',
                failure: 'agent',
                provider: 'agy',
            }).failed_cheaper
        ).toEqual([])
        expect(
            alreadyDoneCheckedChange({
                progress: agyArgonProgress,
                checked: {
                    ok: false,
                    problems: ['No match.'],
                    base_sha: 'b0',
                    tests: null,
                },
                provider: 'agy',
            }).failed_cheaper
        ).toEqual(['test-writer'])
        expect(
            alreadyDoneCheckedChange({
                progress: agyNeonProgress,
                checked: {
                    ok: false,
                    problems: ['No match.'],
                    base_sha: 'b0',
                    tests: null,
                },
                provider: 'agy',
            }).failed_cheaper
        ).toEqual([])

        const agyArgonFailed = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: 11,
                    role: 'implementer',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                }),
            ],
        })
        expect(agyArgonFailed.tickets[11]?.failed_cheaper).toEqual([
            'implementer',
        ])

        const agyNeonFailed = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: 11,
                    role: 'implementer',
                    model: 'gemini-4-neon-high',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                }),
            ],
        })
        expect(agyNeonFailed.tickets[11]?.failed_cheaper).toEqual([])

        const agyEngineFailed = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: 11,
                    role: 'implementer',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'engine',
                }),
            ],
        })
        expect(agyEngineFailed.tickets[11]?.failed_cheaper).toEqual([])

        const agyAlreadyDoneArgon = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-argon-high',
                }),
                alreadyDoneChecked({
                    ticket: 11,
                    problems: ['Test failed.'],
                }),
            ],
        })
        expect(agyAlreadyDoneArgon.tickets[11]?.failed_cheaper).toEqual([
            'test-writer',
        ])

        const agyAlreadyDoneNeon = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: 11,
                    role: 'test-writer',
                    model: 'gemini-4-neon-high',
                }),
                alreadyDoneChecked({
                    ticket: 11,
                    problems: ['Test failed.'],
                }),
            ],
        })
        expect(agyAlreadyDoneNeon.tickets[11]?.failed_cheaper).toEqual([])

        const claudeSonnetFailed = replayWithConfig({
            provider: 'claude',
            entries: [
                startedAgent({
                    ticket: 11,
                    role: 'implementer',
                    model: 'sonnet',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                }),
            ],
        })
        expect(claudeSonnetFailed.tickets[11]?.failed_cheaper).toEqual([
            'implementer',
        ])

        const nullConfigSonnetFailed = replayWithConfig({
            provider: null,
            entries: [
                startedAgent({
                    ticket: 11,
                    role: 'implementer',
                    model: 'sonnet',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                }),
            ],
        })
        expect(nullConfigSonnetFailed.config).toBeNull()
        expect(nullConfigSonnetFailed.tickets[11]?.failed_cheaper).toEqual([
            'implementer',
        ])

        const nullConfigOpusFailed = replayWithConfig({
            provider: null,
            entries: [
                startedAgent({
                    ticket: 11,
                    role: 'implementer',
                    model: 'opus',
                }),
                agentFailed({
                    ticket: 11,
                    role: 'implementer',
                    failure: 'agent',
                }),
            ],
        })
        expect(nullConfigOpusFailed.tickets[11]?.failed_cheaper).toEqual([])
    })

    test('learner replay records failed_cheaper for agy and defaults to claude', () => {
        const directRecords = recordsFrom({
            entries: [
                startedAgent({
                    ticket: null,
                    role: 'learner',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'agent',
                }),
            ],
        })
        const [firstDirect, secondDirect] = directRecords
        if (firstDirect === undefined || secondDirect === undefined) {
            throw new Error('Expected two direct records')
        }
        const startedRec = learnerRecordOf({ record: firstDirect })
        const failedRec = learnerRecordOf({ record: secondDirect })
        if (startedRec === null || failedRec === null) {
            throw new Error('Expected learner records')
        }
        const directArgon = learnerAfter({
            learner: learnerAfter({
                learner: EMPTY_MEMORY.learner,
                record: startedRec,
                provider: 'agy',
            }),
            record: failedRec,
            provider: 'agy',
        })
        expect(directArgon.failed_cheaper).toBe(true)

        const directNeon = learnerAfter({
            learner: {
                ...EMPTY_MEMORY.learner,
                launched_on: 'gemini-4-neon-high',
            },
            record: failedRec,
            provider: 'agy',
        })
        expect(directNeon.failed_cheaper).toBe(false)

        const directClaudeSonnet = learnerAfter({
            learner: {
                ...EMPTY_MEMORY.learner,
                launched_on: 'sonnet',
            },
            record: failedRec,
        })
        expect(directClaudeSonnet.failed_cheaper).toBe(true)

        const agyLearnerArgon = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: null,
                    role: 'learner',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'agent',
                }),
            ],
        })
        expect(agyLearnerArgon.memory.learner.failed_cheaper).toBe(true)

        const agyLearnerNeon = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: null,
                    role: 'learner',
                    model: 'gemini-4-neon-high',
                }),
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'agent',
                }),
            ],
        })
        expect(agyLearnerNeon.memory.learner.failed_cheaper).toBe(false)

        const agyLearnerEngine = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: null,
                    role: 'learner',
                    model: 'gemini-4-argon-high',
                }),
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'engine',
                }),
            ],
        })
        expect(agyLearnerEngine.memory.learner.failed_cheaper).toBe(false)

        const claudeLearnerSonnet = replayWithConfig({
            provider: 'claude',
            entries: [
                startedAgent({
                    ticket: null,
                    role: 'learner',
                    model: 'sonnet',
                }),
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'agent',
                }),
            ],
        })
        expect(claudeLearnerSonnet.memory.learner.failed_cheaper).toBe(true)

        const directEngineRecords = recordsFrom({
            entries: [
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'engine',
                }),
            ],
        })
        const engineRec = directEngineRecords[0]
            ? learnerRecordOf({ record: directEngineRecords[0] })
            : null
        if (engineRec === null) {
            throw new Error('Expected learner engine record')
        }
        expect(
            learnerAfter({
                learner: {
                    ...EMPTY_MEMORY.learner,
                    launched_on: 'gemini-4-argon-high',
                },
                record: engineRec,
                provider: 'agy',
            }).failed_cheaper
        ).toBe(false)

        const agyLearnerFlash = replayWithConfig({
            provider: 'agy',
            entries: [
                startedAgent({
                    ticket: null,
                    role: 'learner',
                    model: 'gemini-3.8-flash-high',
                }),
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'agent',
                }),
            ],
        })
        expect(agyLearnerFlash.memory.learner.failed_cheaper).toBe(true)

        const nullConfigLearnerSonnet = replayWithConfig({
            provider: null,
            entries: [
                startedAgent({
                    ticket: null,
                    role: 'learner',
                    model: 'sonnet',
                }),
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'agent',
                }),
            ],
        })
        expect(nullConfigLearnerSonnet.config).toBeNull()
        expect(nullConfigLearnerSonnet.memory.learner.failed_cheaper).toBe(true)

        const claudeLearnerOpus = replayWithConfig({
            provider: 'claude',
            entries: [
                startedAgent({
                    ticket: null,
                    role: 'learner',
                    model: 'opus',
                }),
                agentFailed({
                    ticket: null,
                    role: 'learner',
                    failure: 'agent',
                }),
            ],
        })
        expect(claudeLearnerOpus.memory.learner.failed_cheaper).toBe(false)
    })
})
