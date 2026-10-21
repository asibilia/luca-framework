import { describe, expect, test } from 'bun:test'

import { jevAsksBefore, type JevAsk } from './jev-jobs'

import { LENS_NAMES, lensRole } from '../agents/role-results'
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
 * The decision model's effort ask (#661): before each fresh test-writer and
 * implementer on a ticket, Clef is asked which effort the agent should use,
 * in shadow mode only. Split from `jev-jobs.test.ts` for its size.
 */

/** Stamps entries as the journal would, without a file. */
const stamp = (entries: JournalEntry[]): JournalRecord[] =>
    entries.map((entry, index) =>
        JournalRecordSchema.parse({
            ...entry,
            seq: index + 1,
            time: new Date(0).toISOString(),
        })
    )

/** A one-ticket run whose ticket #11 has its worktree, and these records after. */
const startedRun = (after: JournalEntry[] = []) =>
    replayRun({
        records: stamp([
            ...intakePassed({ tickets: [practiceTicket({ number: 11 })] }),
            ticketWorktreeCreated({ ticket: 11 }),
            ...after,
        ]),
    })

const launchAgent = (
    role: 'test-writer' | 'implementer' | 'ticket-reviewer'
): EngineAction => ({
    type: 'launch_agent',
    ticket: 11,
    role,
    prompt: `You are the ${role}.`,
    may_edit_tests: role === 'test-writer',
})

/** The asks of one job; the job is read as text, since it is new. */
const ofJob = (asks: JevAsk[], name: string): JevAsk[] =>
    asks.filter((ask) => {
        const job: string = ask.job
        return job === name
    })

/** The one question of an ask, by its id. */
const onlyQuestion = (ask: JevAsk | undefined) => {
    const [entry] = Object.entries(ask?.request.questions ?? {})
    return entry === undefined ? undefined : { id: entry[0], ...entry[1] }
}

describe('the agent_effort ask', () => {
    test('is asked once before each fresh test-writer and implementer, with the same facts as the agent_model ask: the ticket, the role, and the try', () => {
        const afterFailure = startedRun([
            {
                kind: 'agent_failed',
                ticket: 11,
                role: 'implementer',
                content: { role: 'implementer', error: 'No result.' },
            },
        ])
        const cases = [
            { role: 'test-writer' as const, try: '1' },
            { role: 'implementer' as const, try: '2' },
        ]

        for (const each of cases) {
            const asks = jevAsksBefore({
                action: launchAgent(each.role),
                state: afterFailure,
            })
            const efforts = ofJob(asks, 'agent_effort')
            const [model] = ofJob(asks, 'agent_model')

            expect(efforts).toHaveLength(1)
            const [effort] = efforts
            expect(effort?.ticket).toBe(11)
            expect(effort?.role).toBe(each.role)
            expect(effort?.request.state).toEqual({
                spec: 'Practice spec',
                ticket: '#11 Add sum',
                body: expect.any(String),
                role: each.role,
                try: each.try,
            })
            expect(effort?.request.state).toEqual(model?.request.state ?? {})
        }
    })

    test("asks which effort to use, offering medium, high and xhigh, fixed at the role's effort and never acted on", () => {
        const state = startedRun()

        for (const role of ['test-writer', 'implementer'] as const) {
            const [ask] = ofJob(
                jevAsksBefore({ action: launchAgent(role), state }),
                'agent_effort'
            )
            const question = onlyQuestion(ask)

            expect(Object.keys(ask?.request.questions ?? {})).toHaveLength(1)
            expect(question).toMatchObject({
                type: 'choice',
                instructions:
                    'Which effort should this agent use? Pick the lowest that will get it right.',
            })
            expect(
                question?.type === 'choice'
                    ? Object.keys(question.criteria)
                    : []
            ).toEqual(['medium', 'high', 'xhigh'])
            expect(ask?.fixed).toEqual({ [question?.id ?? '']: 'medium' })
            expect(ask?.acted).toBe(false)
        }
    })

    test("its fixed choice is the role's configured effort when models.effort sets it", () => {
        const [runStarted, ...rest] = intakePassed({
            tickets: [practiceTicket({ number: 11 })],
        })
        if (runStarted?.kind !== 'run_started') throw new Error('no start')
        const configured = replayRun({
            records: stamp([
                {
                    ...runStarted,
                    content: {
                        ...runStarted.content,
                        config: {
                            ...runStarted.content.config,
                            models: {
                                effort: {
                                    'test-writer': 'high',
                                    implementer: 'xhigh',
                                },
                            },
                        },
                    },
                },
                ...rest,
                ticketWorktreeCreated({ ticket: 11 }),
            ]),
        })
        const fixedEffort = (role: 'test-writer' | 'implementer') =>
            ofJob(
                jevAsksBefore({ action: launchAgent(role), state: configured }),
                'agent_effort'
            )[0]?.fixed

        expect(fixedEffort('test-writer')).toEqual({ effort: 'high' })
        expect(fixedEffort('implementer')).toEqual({ effort: 'xhigh' })
    })

    test('is never asked for the ticket reviewer, a lens, a final-review fixer, the learner, or a follow-up', () => {
        const state = startedRun()
        const effortAsks = (action: EngineAction) =>
            ofJob(jevAsksBefore({ action, state }), 'agent_effort')
        const unasked: EngineAction[] = [
            launchAgent('ticket-reviewer'),
            ...LENS_NAMES.map(
                (lens): EngineAction => ({
                    type: 'launch_lens',
                    lens,
                    role: lensRole({ lens }),
                    prompt: `Review as the ${lens} lens.`,
                })
            ),
            {
                type: 'launch_final_fixer',
                role: 'test-writer',
                prompt: 'Fix the tests.',
                may_edit_tests: true,
            },
            {
                type: 'launch_final_fixer',
                role: 'implementer',
                prompt: 'Fix the code.',
                may_edit_tests: false,
            },
            {
                type: 'follow_up_final_fixer',
                role: 'implementer',
                session_id: 'session-3',
                message: 'The gates failed.',
            },
            { type: 'launch_learner', prompt: 'Learn.' },
            {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'test-writer',
                session_id: 'session-1',
                message: 'The red check failed.',
            },
            {
                type: 'follow_up_agent',
                ticket: 11,
                role: 'implementer',
                session_id: 'session-2',
                message: 'The gates failed.',
            },
        ]

        expect(effortAsks(launchAgent('test-writer'))).toHaveLength(1)
        expect(unasked.flatMap(effortAsks)).toEqual([])
    })
})
