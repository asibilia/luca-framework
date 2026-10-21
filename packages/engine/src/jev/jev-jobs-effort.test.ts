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
 * The decision model's `agent_effort` job (#661): asked before each fresh
 * test-writer and implementer on a ticket, in shadow mode only.
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

/** A one-ticket run whose ticket has its worktree, after these records. */
const startedRun = (records: JournalEntry[] = []) =>
    replayRun({
        records: stamp([
            ...intakePassed({
                tickets: [practiceTicket({ number: 11, title: 'Ticket 11' })],
            }),
            ticketWorktreeCreated({ ticket: 11 }),
            ...records,
        ]),
    })

const jobsOf = (asks: JevAsk[], job: string): JevAsk[] =>
    asks.filter((ask) => ask.job === job)

const launchAgent = (
    role: 'test-writer' | 'implementer' | 'ticket-reviewer'
): EngineAction => ({
    type: 'launch_agent',
    ticket: 11,
    role,
    prompt: `You are the ${role}.`,
    may_edit_tests: role === 'test-writer',
})

describe('the agent_effort ask', () => {
    test('is asked once before each fresh test-writer and implementer, with the same facts as its agent_model ask', () => {
        const writerAsks = jevAsksBefore({
            action: launchAgent('test-writer'),
            state: startedRun(),
        })
        const writer = jobsOf(writerAsks, 'agent_effort')

        expect(writer).toHaveLength(1)
        expect(writer[0]?.ticket).toBe(11)
        expect(writer[0]?.role).toBe('test-writer')
        expect(writer[0]?.request.state).toEqual(
            jobsOf(writerAsks, 'agent_model')[0]?.request.state ?? {}
        )
        expect(writer[0]?.request.state).toMatchObject({
            spec: 'Practice spec',
            ticket: '#11 Ticket 11',
            role: 'test-writer',
            try: '1',
        })

        // After the implementer's first try failed, its next fresh one is
        // asked as its second try.
        const implementerAsks = jevAsksBefore({
            action: launchAgent('implementer'),
            state: startedRun([
                {
                    kind: 'agent_failed',
                    ticket: 11,
                    role: 'implementer',
                    content: { role: 'implementer', error: 'No result.' },
                },
            ]),
        })
        const implementer = jobsOf(implementerAsks, 'agent_effort')
        expect(implementer).toHaveLength(1)
        expect(implementer[0]?.role).toBe('implementer')
        expect(implementer[0]?.request.state).toEqual(
            jobsOf(implementerAsks, 'agent_model')[0]?.request.state ?? {}
        )
        expect(implementer[0]?.request.state).toMatchObject({
            role: 'implementer',
            try: '2',
        })
    })

    test("offers medium, high and xhigh, asks for the lowest that will get it right, and is fixed at the role's effort, never acted on", () => {
        const state = startedRun()

        for (const role of ['test-writer', 'implementer'] as const) {
            const [ask] = jobsOf(
                jevAsksBefore({ action: launchAgent(role), state }),
                'agent_effort'
            )
            const effort = ask?.request.questions.effort

            expect(effort).toEqual({
                type: 'choice',
                instructions:
                    'Which effort should this agent use? Pick the lowest that will get it right.',
                criteria: { medium: null, high: null, xhigh: null },
            })
            expect(
                effort?.type === 'choice' ? Object.keys(effort.criteria) : []
            ).toEqual(['medium', 'high', 'xhigh'])
            // No effort set in the config: each writer's role effort is medium.
            expect(ask?.fixed).toEqual({ effort: 'medium' })
            expect(ask?.acted ?? false).toBe(false)
        }
    })

    test('is never asked before a follow-up, a final-review fixer, the ticket reviewer, a lens, or the learner', () => {
        const state = startedRun()
        const effortAsks = (action: EngineAction) =>
            jobsOf(jevAsksBefore({ action, state }), 'agent_effort')

        expect(effortAsks(launchAgent('implementer'))).toHaveLength(1)
        const unasked: EngineAction[] = [
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
            launchAgent('ticket-reviewer'),
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
            ...LENS_NAMES.map(
                (lens): EngineAction => ({
                    type: 'launch_lens',
                    lens,
                    role: lensRole({ lens }),
                    prompt: `Review as the ${lens} lens.`,
                })
            ),
            { type: 'launch_learner', prompt: 'Learn.' },
        ]
        expect(unasked.flatMap(effortAsks)).toEqual([])
    })
})
