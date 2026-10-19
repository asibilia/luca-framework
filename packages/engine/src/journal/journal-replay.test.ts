import { describe, expect, test } from 'bun:test'

import { JournalEntrySchema } from './journal-record'
import { replayRun } from './replay'

import {
    gatesRun,
    implemented,
    intakePassed,
    practiceTicket,
    redCheck,
    testsWritten,
    ticketRetried,
    ticketStuck,
    ticketWorktreeCreated,
    worktreeReset,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * A ticket's `red_tests` (#513): the new tests its latest passing red check
 * proved fail first, from the test-writer's criteria, one per file and
 * name. The PR's Evidence section lists them.
 */
describe("replay: a ticket's red tests", () => {
    const CRITERIA = [
        {
            criterion_id: 'AC1',
            tests: [
                { file: 'src/sum.test.ts', name: 'sum > adds' },
                { file: 'src/sum.test.ts', name: 'sum > subtracts' },
            ],
        },
        {
            criterion_id: 'AC2',
            tests: [
                { file: 'src/sum.test.ts', name: 'sum > adds' },
                { file: 'src/menu.test.ts', name: 'sum > adds' },
            ],
        },
    ]

    const redTestsAfter = (
        entries: Parameters<typeof recordsFrom>[0]['entries']
    ) =>
        replayRun({
            records: recordsFrom({
                entries: [
                    ...intakePassed({
                        tickets: [practiceTicket({ number: 11 })],
                    }),
                    ticketWorktreeCreated({ ticket: 11 }),
                    ...entries,
                ],
            }),
        }).tickets[11]?.red_tests

    test("a passing red check sets them from the test-writer's criteria, each test once", () => {
        expect(
            redTestsAfter([
                testsWritten({ ticket: 11, criteria: CRITERIA }),
                redCheck({ ticket: 11, ok: true }),
            ])
        ).toEqual([
            { file: 'src/sum.test.ts', name: 'sum > adds' },
            { file: 'src/sum.test.ts', name: 'sum > subtracts' },
            { file: 'src/menu.test.ts', name: 'sum > adds' },
        ])
    })

    test('a failed red check leaves them as they were', () => {
        expect(
            redTestsAfter([
                testsWritten({ ticket: 11, criteria: CRITERIA }),
                redCheck({ ticket: 11, ok: false }),
            ])
        ).toEqual([])
        expect(
            redTestsAfter([
                testsWritten({ ticket: 11 }),
                redCheck({ ticket: 11, ok: true }),
                testsWritten({ ticket: 11, criteria: CRITERIA }),
                redCheck({ ticket: 11, ok: false }),
            ])
        ).toEqual([{ file: 'src/sum.test.ts', name: 'sum adds two numbers' }])
    })

    test('a worktree reset clears them', () => {
        expect(
            redTestsAfter([
                testsWritten({ ticket: 11 }),
                redCheck({ ticket: 11, ok: true }),
                worktreeReset({ ticket: 11 }),
            ])
        ).toEqual([])
    })
})

/**
 * A mapped test the engine found checks nothing (#581): the reset it causes
 * is journaled with the `bad_test`, which replay keeps for the fresh
 * test-writer, counts toward the bad-test cap, and names as the engine's.
 */
describe('replay: a bad test the engine found (#581)', () => {
    const BAD_TEST = {
        file: 'src/sum.test.ts',
        name: 'sum adds two numbers',
        reason: 'It passes but runs no expect(), so it checks nothing (#581).',
    }

    const progressAfter = (
        entries: Parameters<typeof recordsFrom>[0]['entries']
    ) =>
        replayRun({
            records: recordsFrom({
                entries: [
                    ...intakePassed({
                        tickets: [practiceTicket({ number: 11 })],
                    }),
                    ticketWorktreeCreated({ ticket: 11 }),
                    ...entries,
                ],
            }),
        }).tickets[11]

    test('a reset with a bad_test sets it, adds the engine to the bounce sources, and adds one to the bounces', () => {
        const progress = progressAfter([
            worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
        ])

        expect(progress?.bad_test).toEqual(BAD_TEST)
        expect(progress?.bad_test_sources).toEqual(['engine'])
        expect(progress?.bad_test_bounces).toBe(1)
        // The rest of the reset is as for any reset.
        expect(progress?.implementer).toBeNull()
        expect(progress?.gates).toBeNull()
    })

    test('a reset without one changes none of the three', () => {
        const fresh = progressAfter([worktreeReset({ ticket: 11 })])

        expect(fresh?.bad_test).toBeNull()
        expect(fresh?.bad_test_sources).toEqual([])
        expect(fresh?.bad_test_bounces).toBe(0)

        // The implementer's bounce was counted when it answered; the reset
        // that follows adds nothing.
        const bounced = progressAfter([
            implemented({ ticket: 11, outcome: 'bad_test' }),
            worktreeReset({ ticket: 11 }),
        ])
        expect(bounced?.bad_test?.reason).toBe('Wrong sum.')
        expect(bounced?.bad_test_sources).toEqual(['implementer'])
        expect(bounced?.bad_test_bounces).toBe(1)
    })

    test('each bounce keeps its source, oldest first, whichever sent it back', () => {
        const sourcesAfter = (
            entries: Parameters<typeof recordsFrom>[0]['entries']
        ) => progressAfter(entries)?.bad_test_sources

        expect(
            sourcesAfter([
                worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
                implemented({ ticket: 11, outcome: 'bad_test' }),
            ])
        ).toEqual(['engine', 'implementer'])
        expect(
            sourcesAfter([
                implemented({ ticket: 11, outcome: 'bad_test' }),
                worktreeReset({ ticket: 11 }),
                worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
            ])
        ).toEqual(['implementer', 'engine'])
        expect(
            sourcesAfter([
                worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
                worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
            ])
        ).toEqual(['engine', 'engine'])
        // The bounce count and the sources go together.
        expect(
            progressAfter([
                worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
                implemented({ ticket: 11, outcome: 'bad_test' }),
            ])?.bad_test_bounces
        ).toBe(2)
    })

    test('a retry starts the bounces over, and their sources with them', () => {
        const progress = progressAfter([
            worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
            ticketStuck({ ticket: 11, reason: 'bad_test' }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])

        expect(progress?.bad_test_bounces).toBe(0)
        expect(progress?.bad_test_sources).toEqual([])
        // The bad test stays for the fresh test-writer, and so does who sent it.
        expect(progress?.bad_test).toEqual(BAD_TEST)
        expect(progress?.bad_test_source).toBe('engine')
    })

    test('the latest source stays beside the bad test: none at first, the implementer, then the engine', () => {
        const sourceAfter = (
            entries: Parameters<typeof recordsFrom>[0]['entries']
        ) => progressAfter(entries)?.bad_test_source

        expect(sourceAfter([])).toBeNull()
        expect(
            sourceAfter([implemented({ ticket: 11, outcome: 'bad_test' })])
        ).toBe('implementer')
        expect(
            sourceAfter([
                implemented({ ticket: 11, outcome: 'bad_test' }),
                worktreeReset({ ticket: 11, bad_test: BAD_TEST }),
            ])
        ).toBe('engine')
    })

    test("a ticket's gates keep the cases they journal; join gates and older records have none", () => {
        const cases = [
            {
                file: 'src/sum.test.ts',
                full_name: 'sum adds two numbers',
                status: 'passed' as const,
                assertions: 2,
            },
        ]
        const ticket = progressAfter([
            gatesRun({ ticket: 11, target: 'ticket', ok: true, cases }),
        ])
        expect(ticket?.gates?.cases).toEqual(cases)

        const older = progressAfter([
            gatesRun({ ticket: 11, target: 'ticket', ok: true }),
        ])
        expect(older?.gates?.ok).toBe(true)
        expect(older?.gates?.cases).toBeUndefined()

        const join = progressAfter([
            gatesRun({ ticket: 11, target: 'run_branch', ok: true, cases }),
        ])
        expect(join?.join_gates?.cases).toBeUndefined()
    })

    test('records from an older engine still read: gates_run without cases, worktree_reset without bad_test', () => {
        const read = (record: unknown) => JournalEntrySchema.safeParse(record)

        expect(
            read({
                kind: 'gates_run',
                ticket: 11,
                role: null,
                content: { target: 'ticket', ok: true, checks: [] },
            }).success
        ).toBe(true)
        expect(
            read({
                kind: 'worktree_reset',
                ticket: 11,
                role: null,
                content: { sha: 'red-sha' },
            }).success
        ).toBe(true)
        expect(
            read({
                kind: 'worktree_reset',
                ticket: 11,
                role: null,
                content: { sha: 'red-sha', bad_test: BAD_TEST },
            }).success
        ).toBe(true)
    })
})
