import { describe, expect, test } from 'bun:test'

import { JEV_FIXED_MODEL, jevAsksBefore, type JevAsk } from './jev-jobs'

import type { EngineAction } from '../core/decide'
import {
    JournalRecordSchema,
    type JournalEntry,
    type JournalRecord,
} from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    intakePassed,
    practiceTicket,
    ticketWorktreeCreated,
} from '../testing/build-fixtures'

/**
 * Provider-aware `agent_model` ask generation (#778 AC5): ensures
 * `agentModelAsk` offers the active provider's tiers, sets `fixed.model` to
 * that provider's strongest model, and sets `acted` from that strongest model,
 * while keeping `JEV_FIXED_MODEL` exported for Claude backward compatibility.
 */

const stamp = (entries: JournalEntry[]): JournalRecord[] =>
    entries.map((entry, index) =>
        JournalRecordSchema.parse({
            ...entry,
            seq: index + 1,
            time: new Date(0).toISOString(),
        })
    )

const modelOptions = (ask: JevAsk | undefined): string[] => {
    const model = ask?.request.questions.model
    return model?.type === 'choice' ? Object.keys(model.criteria) : []
}

const agyState = ({ models }: { models: object }) => {
    const [runStarted, ...rest] = intakePassed({
        tickets: [practiceTicket({ number: 11 })],
    })
    if (runStarted?.kind !== 'run_started') throw new Error('no start')
    return replayRun({
        records: stamp([
            {
                ...runStarted,
                content: {
                    ...runStarted.content,
                    config: {
                        ...runStarted.content.config,
                        models,
                    },
                },
            },
            ...rest,
            ticketWorktreeCreated({ ticket: 11 }),
        ]),
    })
}

const launchAgent = (
    ticket: number,
    role: 'test-writer' | 'implementer'
): EngineAction => ({
    type: 'launch_agent',
    ticket,
    role,
    prompt: `You are the ${role}.`,
    may_edit_tests: role === 'test-writer',
})

describe('provider-aware agentModelAsk (#778 AC5)', () => {
    test('keeps JEV_FIXED_MODEL exported as opus for backward compatibility', () => {
        expect(JEV_FIXED_MODEL).toBe('opus')
    })

    test('under agy with an argon floor and omitted floors, offers agy tiers, fixes gemini-4-neon-high, and sets acted from the floor', () => {
        const state = agyState({
            models: {
                provider: 'agy',
                floors: { 'test-writer': 'gemini-4-argon-high' },
            },
        })
        const askFor = (action: EngineAction) =>
            jevAsksBefore({ action, state }).find(
                ({ job }) => job === 'agent_model'
            )

        const writer = askFor(launchAgent(11, 'test-writer'))
        expect(modelOptions(writer)).toEqual([
            'gemini-4-neon-high',
            'gemini-4-argon-high',
        ])
        expect(writer?.fixed).toEqual({ model: 'gemini-4-neon-high' })
        expect(writer?.acted).toBe(true)

        const implementer = askFor(launchAgent(11, 'implementer'))
        expect(modelOptions(implementer)).toEqual([
            'gemini-4-neon-high',
            'gemini-4-argon-high',
            'gemini-3.8-flash-high',
        ])
        expect(implementer?.fixed).toEqual({ model: 'gemini-4-neon-high' })
        expect(implementer?.acted).toBe(false)

        const learner = askFor({ type: 'launch_learner', prompt: 'Learn.' })
        expect(modelOptions(learner)).toEqual([
            'gemini-4-neon-high',
            'gemini-4-argon-high',
            'gemini-3.8-flash-high',
        ])
        expect(learner?.fixed).toEqual({ model: 'gemini-4-neon-high' })
        expect(learner?.acted).toBe(false)
    })
})
