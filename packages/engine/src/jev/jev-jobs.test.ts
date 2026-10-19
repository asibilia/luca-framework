import { describe, expect, test } from 'bun:test'

import { JEV_FAILURE_TEXT_CHARS, jevAsksAfter, jevAsksBefore } from './jev-jobs'

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

describe('jevAsksBefore', () => {
    test('asks no ticket order when only one ticket is in the run', () => {
        const asks = jevAsksBefore({
            action: createWorktree(11),
            state: runWith({ tickets: [11] }),
        })

        expect(asks.map(({ job }) => job)).toEqual(['ticket_model'])
    })

    test('asks no ticket order when the other tickets have started', () => {
        const asks = jevAsksBefore({
            action: createWorktree(13),
            state: runWith({ tickets: [11, 12, 13], started: [11, 12] }),
        })

        expect(asks.map(({ job }) => job)).toEqual(['ticket_model'])
    })

    test('the model ask offers opus, sonnet and haiku, and its fixed choice is opus', () => {
        const asks = jevAsksBefore({
            action: createWorktree(11),
            state: runWith({ tickets: [11] }),
        })
        const model = asks.find(({ request }) => 'model' in request.questions)

        expect(
            Object.keys(
                model?.request.questions.model?.type === 'choice'
                    ? model.request.questions.model.criteria
                    : {}
            )
        ).toEqual(['opus', 'sonnet', 'haiku'])
        expect(model?.fixed).toEqual({ model: 'opus' })
    })

    test('asks the ticket order as before when two tickets are left', () => {
        const asks = jevAsksBefore({
            action: createWorktree(12),
            state: runWith({ tickets: [11, 12, 13], started: [11] }),
        })

        expect(asks.map(({ job }) => job)).toEqual([
            'ticket_order',
            'ticket_model',
        ])
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
