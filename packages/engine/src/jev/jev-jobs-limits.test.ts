import { describe, expect, test } from 'bun:test'

import { jevAsksAfter, jevAsksBefore, type JevAsk } from './jev-jobs'
import { ClefRequestSchema } from './jev-schemas'

import type { EngineAction } from '../core/decide'
import {
    JournalRecordSchema,
    type JournalEntry,
    type JournalRecord,
} from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    finding,
    gatesRun,
    intakePassed,
    practiceTicket,
    redCheck,
    reviewed,
    ticketWorktreeCreated,
} from '../testing/build-fixtures'

/**
 * Every decision-model job's built request, checked against Clef's limits
 * (#546): Clef refuses anything else.
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

const state = runWith({ tickets: [11] })

const createWorktree = (ticket: number): EngineAction => ({
    type: 'create_ticket_worktree',
    ticket,
    run_branch: 'luca/spec-10-run',
})

const launchAgent = (ticket: number): EngineAction => ({
    type: 'launch_agent',
    ticket,
    role: 'test-writer',
    prompt: 'Write the tests.',
    may_edit_tests: true,
})

/** Whether Clef would take the ask's request. */
const fitsClef = (ask: JevAsk): boolean =>
    ClefRequestSchema.safeParse(ask.request).success

const reviewWith = (count: number): JournalEntry =>
    reviewed({
        ticket: 11,
        findings: Array.from({ length: count }, (_, index) =>
            finding({ id: `F${index + 1}`, severity: 'nit' })
        ),
    })

describe("decision-model jobs and Clef's limits", () => {
    test('builds ticket order, model, and skills asks only within the limits', () => {
        const asks = [
            ...jevAsksBefore({
                action: createWorktree(11),
                state: runWith({ tickets: [11] }),
            }),
            ...jevAsksBefore({
                action: createWorktree(11),
                state: runWith({ tickets: [11, 12] }),
            }),
            ...jevAsksBefore({
                action: createWorktree(11),
                state: runWith({ tickets: [11, 12, 13, 14, 15] }),
            }),
            ...jevAsksBefore({
                action: launchAgent(11),
                state: runWith({ tickets: [11], started: [11] }),
            }),
        ]

        expect(asks.map(({ job }) => job)).toEqual(
            expect.arrayContaining(['ticket_order', 'agent_skills'])
        )
        expect(asks.filter((ask) => !fitsClef(ask))).toEqual([])
    })

    test('builds the agent_model asks before each fresh build agent within the limits', () => {
        const started = runWith({ tickets: [11], started: [11] })
        const asks = [
            ...jevAsksBefore({ action: launchAgent(11), state: started }),
            ...jevAsksBefore({
                action: {
                    type: 'launch_agent',
                    ticket: 11,
                    role: 'implementer',
                    prompt: 'Write the code.',
                    may_edit_tests: false,
                },
                state: started,
            }),
            ...jevAsksBefore({
                action: { type: 'launch_learner', prompt: 'Learn.' },
                state: started,
            }),
        ].filter(({ job }) => job === 'agent_model')

        expect(asks.map(({ role }) => role)).toEqual([
            'test-writer',
            'implementer',
            'learner',
        ])
        expect(asks.filter((ask) => !fitsClef(ask))).toEqual([])
    })

    test('builds a failure-kind ask within the limits', () => {
        const asks = jevAsksAfter({
            records: stamp([
                gatesRun({ ticket: 11, target: 'ticket', ok: false }),
                redCheck({ ticket: 11, ok: false }),
            ]),
            state,
        })

        expect(asks.map(({ job }) => job)).toEqual([
            'failure_kind',
            'failure_kind',
        ])
        expect(asks.filter((ask) => !fitsClef(ask))).toEqual([])
    })

    test('asks the severity of one finding as one question within the limits', () => {
        const asks = jevAsksAfter({ records: stamp([reviewWith(1)]), state })

        expect(asks.map(({ job }) => job)).toEqual(['finding_severity'])
        expect(Object.keys(asks[0]?.request.questions ?? {})).toEqual([
            'finding_F1',
        ])
        expect(asks.filter((ask) => !fitsClef(ask))).toEqual([])
    })

    test('asks the severity of 64 findings in one ask, as before', () => {
        const asks = jevAsksAfter({ records: stamp([reviewWith(64)]), state })

        expect(asks.map(({ job }) => job)).toEqual(['finding_severity'])
        expect(Object.keys(asks[0]?.request.questions ?? {})).toHaveLength(64)
        expect(asks.filter((ask) => !fitsClef(ask))).toEqual([])
    })

    test("never builds a severity ask past Clef's limits for many findings", () => {
        const asks = jevAsksAfter({ records: stamp([reviewWith(150)]), state })

        expect(asks.every(({ job }) => job === 'finding_severity')).toBe(true)
        expect(asks.filter((ask) => !fitsClef(ask))).toEqual([])
    })
})
