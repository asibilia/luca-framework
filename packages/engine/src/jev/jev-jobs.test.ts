import { describe, expect, test } from 'bun:test'

import { JEV_FAILURE_TEXT_CHARS, jevAsksAfter } from './jev-jobs'

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
