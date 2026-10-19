import { describe, expect, test } from 'bun:test'

import {
    JEV_FAILURE_TEXT_CHARS,
    jevAsksAfter,
    jevAsksBefore,
    type JevAsk,
} from './jev-jobs'

import { LENS_NAMES, lensRole } from '../agents/role-results'
import type { EngineAction } from '../core/decide'
import {
    JournalRecordSchema,
    type JournalEntry,
    type JournalRecord,
} from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    gatesRun,
    intakePassed,
    practiceTicket,
    redCheck,
    ticketWorktreeCreated,
} from '../testing/build-fixtures'

/** Stamps entries as the journal would, without a file. */
const stamp = (entries: JournalEntry[]): JournalRecord[] =>
    entries.map((entry, index) =>
        JournalRecordSchema.parse({
            ...entry,
            seq: index + 1,
            time: new Date(0).toISOString(),
        })
    )

const state = replayRun({
    records: stamp(intakePassed({ tickets: [practiceTicket({ number: 11 })] })),
})

const fixedKinds = (entries: JournalEntry[]) =>
    jevAsksAfter({ records: stamp(entries), state }).map((ask) => ({
        job: ask.job,
        fixed: ask.fixed,
    }))

describe('jevAsksAfter', () => {
    test('asks the kind of each failure, fixed at where the engine routes it', () => {
        expect(
            fixedKinds([
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
                redCheck({ ticket: 11, ok: false }),
                {
                    kind: 'agent_failed',
                    ticket: 11,
                    role: 'implementer',
                    content: { role: 'implementer', error: 'No result.' },
                },
                {
                    kind: 'ticket_joined',
                    ticket: 11,
                    role: null,
                    content: { ok: false, error: 'Cherry-pick conflict.' },
                },
            ])
        ).toEqual(
            ['code', 'clash', 'test', 'agent', 'clash'].map((kind) => ({
                job: 'failure_kind',
                fixed: { kind },
            }))
        )
    })

    test('asks nothing about steps that passed or about its own records', () => {
        expect(
            fixedKinds([
                gatesRun({ ticket: 11, target: 'ticket', ok: true }),
                redCheck({ ticket: 11, ok: true }),
                {
                    kind: 'jev_failed',
                    ticket: 11,
                    role: null,
                    content: {
                        job: 'failure_kind',
                        asked_seq: 1,
                        reason: 'timeout',
                        error: 'slow',
                        ms: 50,
                    },
                },
            ])
        ).toEqual([])
    })

    test('gives Jev only the end of a long failure', () => {
        const [ask] = jevAsksAfter({
            records: stamp([
                {
                    kind: 'agent_failed',
                    ticket: 11,
                    role: 'implementer',
                    content: {
                        role: 'implementer',
                        error: `${'x'.repeat(20_000)}THE END`,
                    },
                },
            ]),
            state,
        })

        expect(ask?.request.state.failure).toHaveLength(JEV_FAILURE_TEXT_CHARS)
        expect(ask?.request.state.failure?.endsWith('THE END')).toBe(true)
        expect(ask?.request.state.ticket).toBe('#11 Add sum')
    })
})

/** A run with these tickets, and worktrees already made for `started`. */
const runWith = ({
    tickets,
    started,
}: {
    tickets: number[]
    started?: number[]
}) =>
    replayRun({
        records: stamp([
            ...intakePassed({
                tickets: tickets.map((number) =>
                    practiceTicket({ number, title: `Ticket ${number}` })
                ),
            }),
            ...(started ?? []).map((ticket) =>
                ticketWorktreeCreated({ ticket })
            ),
        ]),
    })

const createWorktree = (ticket: number): EngineAction => ({
    type: 'create_ticket_worktree',
    ticket,
    run_branch: 'luca/spec-10-run',
})

const jobsOf = (asks: JevAsk[], job: JevAsk['job']): JevAsk[] =>
    asks.filter((ask) => ask.job === job)

/** The options of an ask's `model` question, in order. */
const modelOptions = (ask: JevAsk | undefined): string[] => {
    const model = ask?.request.questions.model
    return model?.type === 'choice' ? Object.keys(model.criteria) : []
}

const launchAgent = (
    ticket: number,
    role: 'test-writer' | 'implementer' | 'ticket-reviewer'
): EngineAction => ({
    type: 'launch_agent',
    ticket,
    role,
    prompt: `You are the ${role}.`,
    may_edit_tests: role === 'test-writer',
})

describe('jevAsksBefore', () => {
    test('asks no ticket order when only one ticket is in the run', () => {
        const asks = jevAsksBefore({
            action: createWorktree(11),
            state: runWith({ tickets: [11] }),
        })

        expect(jobsOf(asks, 'ticket_order')).toEqual([])
    })

    test('asks no ticket order when the other tickets have started', () => {
        const asks = jevAsksBefore({
            action: createWorktree(13),
            state: runWith({ tickets: [11, 12, 13], started: [11, 12] }),
        })

        expect(jobsOf(asks, 'ticket_order')).toEqual([])
    })

    test('asks no ticket_model before a ticket worktree: with one ticket, nothing at all', () => {
        expect(
            jevAsksBefore({
                action: createWorktree(11),
                state: runWith({ tickets: [11] }),
            })
        ).toEqual([])
        const asks = jevAsksBefore({
            action: createWorktree(12),
            state: runWith({ tickets: [11, 12, 13], started: [11] }),
        })
        expect(asks.map(({ job }) => job)).toEqual(['ticket_order'])
    })

    test('the model ask offers opus, sonnet and haiku, and its fixed choice is opus', () => {
        // Asked before the ticket's worktree (ticket_model) or before its
        // test-writer (agent_model): either way, the same options and choice.
        const asks = [
            ...jevAsksBefore({
                action: createWorktree(11),
                state: runWith({ tickets: [11] }),
            }),
            ...jevAsksBefore({
                action: launchAgent(11, 'test-writer'),
                state: runWith({ tickets: [11], started: [11] }),
            }),
        ]
        const model = asks.find(({ request }) => 'model' in request.questions)

        expect(modelOptions(model)).toEqual(['opus', 'sonnet', 'haiku'])
        expect(model?.fixed).toEqual({ model: 'opus' })
    })

    test('asks agent_model once before each fresh test-writer and implementer, with the role and the try in its facts', () => {
        const started = runWith({ tickets: [11], started: [11] })
        const writer = jobsOf(
            jevAsksBefore({
                action: launchAgent(11, 'test-writer'),
                state: started,
            }),
            'agent_model'
        )

        expect(writer).toHaveLength(1)
        const [ask] = writer
        expect(ask?.ticket).toBe(11)
        expect(ask?.role).toBe('test-writer')
        expect(ask?.request.state).toMatchObject({
            spec: 'Practice spec',
            ticket: '#11 Ticket 11',
            role: 'test-writer',
            try: '1',
        })
        expect(modelOptions(ask)).toEqual(['opus', 'sonnet', 'haiku'])
        expect(
            ask?.request.questions.model?.instructions.toLowerCase()
        ).toContain('cheapest')
        expect(ask?.fixed).toEqual({ model: 'opus' })

        // After the implementer's first try failed, the next fresh one is
        // its second try.
        const afterFailure = replayRun({
            records: stamp([
                ...intakePassed({
                    tickets: [practiceTicket({ number: 11 })],
                }),
                ticketWorktreeCreated({ ticket: 11 }),
                {
                    kind: 'agent_failed',
                    ticket: 11,
                    role: 'implementer',
                    content: { role: 'implementer', error: 'No result.' },
                },
            ]),
        })
        const implementer = jobsOf(
            jevAsksBefore({
                action: launchAgent(11, 'implementer'),
                state: afterFailure,
            }),
            'agent_model'
        )
        expect(implementer).toHaveLength(1)
        expect(implementer[0]?.role).toBe('implementer')
        expect(implementer[0]?.request.state).toMatchObject({
            role: 'implementer',
            try: '2',
        })
        expect(modelOptions(implementer[0])).toEqual([
            'opus',
            'sonnet',
            'haiku',
        ])
    })

    test('asks agent_model once before the learner, for the whole run', () => {
        const asks = jobsOf(
            jevAsksBefore({
                action: { type: 'launch_learner', prompt: 'Learn.' },
                state: runWith({ tickets: [11], started: [11] }),
            }),
            'agent_model'
        )

        expect(asks).toHaveLength(1)
        expect(asks[0]?.ticket).toBeNull()
        expect(asks[0]?.role).toBe('learner')
        expect(asks[0]?.request.state).toMatchObject({ role: 'learner' })
        expect(modelOptions(asks[0])).toEqual(['opus', 'sonnet', 'haiku'])
        expect(asks[0]?.fixed).toEqual({ model: 'opus' })
    })

    test('asks agent_model only before a fresh test-writer or implementer: never a follow-up, a final-review fixer, the ticket reviewer, or a lens', () => {
        const state = runWith({ tickets: [11], started: [11] })
        const modelAsks = (action: EngineAction) =>
            jobsOf(jevAsksBefore({ action, state }), 'agent_model')

        expect(modelAsks(launchAgent(11, 'test-writer'))).toHaveLength(1)
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
            launchAgent(11, 'ticket-reviewer'),
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
        ]
        expect(unasked.flatMap(modelAsks)).toEqual([])
    })

    test('asks the ticket order as before when two tickets are left', () => {
        const asks = jobsOf(
            jevAsksBefore({
                action: createWorktree(12),
                state: runWith({ tickets: [11, 12, 13], started: [11] }),
            }),
            'ticket_order'
        )

        expect(asks).toHaveLength(1)
        const [order] = asks
        expect(order?.ticket).toBe(12)
        expect(order?.request.questions).toEqual({
            next: {
                type: 'choice',
                instructions: 'Which of these tickets should be built next?',
                criteria: { ticket_12: null, ticket_13: null },
            },
        })
        expect(order?.request.state.candidates).toBe(
            [
                'ticket_12: #12 Ticket 12 (blocked by: none)',
                'ticket_13: #13 Ticket 13 (blocked by: none)',
            ].join('\n')
        )
        expect(order?.fixed).toEqual({ next: 'ticket_12' })
    })
})
