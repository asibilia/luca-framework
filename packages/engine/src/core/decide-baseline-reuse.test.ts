import { describe, expect, test } from 'bun:test'

import { decideSteps } from './decide'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import {
    baselineTests,
    commitMade,
    gatesRun,
    implemented,
    intakePassed,
    joinClashed,
    joined,
    leftoverScan,
    practiceTicket,
    redCheck,
    reviewed,
    RUN_BRANCH,
    runBranchCreated,
    testsWritten,
    ticketApproved,
    ticketBuilt,
    ticketPath,
    ticketRebased,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1 for sharing a baseline test run: every ticket whose worktree starts
 * from the same run-branch commit shares one baseline, and the reuse is
 * journaled. A ticket from another commit runs a fresh one.
 */

const SUM = practiceTicket({ number: 11, title: 'Add sum' })
const PRODUCT = practiceTicket({ number: 12, title: 'Add product' })

/** A ticket's worktree, made from the run branch at `base_sha`. */
const worktreeAt = ({
    ticket,
    base_sha,
}: {
    ticket: number
    base_sha: string
}): JournalEntry => ({
    kind: 'ticket_worktree_created',
    ticket,
    role: null,
    content: {
        branch: `${RUN_BRANCH}--ticket-${ticket}`,
        path: ticketPath(ticket),
        base_sha,
    },
})

/** `ticket` took `from_ticket`'s baseline, both made at `base_sha`. */
const baselineReused = ({
    ticket,
    from_ticket,
    base_sha,
}: {
    ticket: number
    from_ticket: number
    base_sha: string
}): JournalEntry => ({
    kind: 'baseline_reused',
    ticket,
    role: null,
    content: { from_ticket, base_sha },
})

/** Every action that can run now, on a run with these tickets and entries. */
const stepsAfter = ({
    tickets,
    entries,
}: {
    tickets: TicketSnapshot[]
    entries: JournalEntry[]
}) =>
    decideSteps({
        records: recordsFrom({
            entries: [
                ...intakePassed({ tickets }),
                ...withInstalls({ entries }),
            ],
        }),
    })

/** The same, on a run with #11 and #12. */
const twoSteps = (entries: JournalEntry[]) =>
    stepsAfter({ tickets: [SUM, PRODUCT], entries })

const ofTicket = (steps: ReturnType<typeof twoSteps>, ticket: number) =>
    steps.filter((step) => 'ticket' in step && step.ticket === ticket)

/** #11 and #12 both made from the run branch's first commit, `b0`. */
const bothAtB0 = (): JournalEntry[] => [
    runBranchCreated(),
    worktreeAt({ ticket: 11, base_sha: 'b0' }),
    worktreeAt({ ticket: 12, base_sha: 'b0' }),
]

describe('decision step: sharing a baseline test run', () => {
    test('two tickets whose worktrees start from the same run-branch commit run the baseline tests only once', () => {
        const steps = twoSteps(bothAtB0())

        expect(
            steps.filter(({ type }) => type === 'run_baseline_tests')
        ).toHaveLength(1)
    })

    test('a ticket from the same commit reuses the baseline another ticket already ran, instead of running the tests again', () => {
        const steps = twoSteps([...bothAtB0(), baselineTests({ ticket: 11 })])

        expect(ofTicket(steps, 12)).toMatchObject([
            { type: 'reuse_baseline_tests', ticket: 12, from_ticket: 11 },
        ])
        expect(
            steps.filter(({ type }) => type === 'run_baseline_tests')
        ).toEqual([])
        expect(ofTicket(steps, 11)).toMatchObject([
            { type: 'launch_agent', ticket: 11, role: 'test-writer' },
        ])
    })

    test('once the reuse is journaled, the ticket moves on to its test-writer', () => {
        const steps = twoSteps([
            ...bothAtB0(),
            baselineTests({ ticket: 11 }),
            baselineReused({ ticket: 12, from_ticket: 11, base_sha: 'b0' }),
        ])

        expect(ofTicket(steps, 12)).toMatchObject([
            { type: 'launch_agent', ticket: 12, role: 'test-writer' },
        ])
    })

    test('a ticket whose worktree starts from a changed run-branch commit runs a fresh baseline', () => {
        const average = practiceTicket({ number: 13, title: 'Add average' })
        const steps = stepsAfter({
            tickets: [SUM, PRODUCT, average],
            entries: [
                runBranchCreated(),
                worktreeAt({ ticket: 11, base_sha: 'b0' }),
                baselineTests({ ticket: 11 }),
                worktreeAt({ ticket: 12, base_sha: 'b0' }),
                worktreeAt({ ticket: 13, base_sha: 'b1' }),
            ],
        })

        // Same commit: reused. Changed commit: run again.
        expect(ofTicket(steps, 12)).toMatchObject([
            { type: 'reuse_baseline_tests', ticket: 12, from_ticket: 11 },
        ])
        expect(ofTicket(steps, 13)).toEqual([
            { type: 'run_baseline_tests', ticket: 13 },
        ])
    })

    test('a ticket rebased onto a newer commit does not lend its old baseline to a ticket starting from that commit', () => {
        const average = practiceTicket({
            number: 13,
            title: 'Add average',
            blockers: [12],
        })
        const double = practiceTicket({ number: 14, title: 'Add double' })
        const steps = stepsAfter({
            tickets: [SUM, PRODUCT, average, double],
            entries: [
                runBranchCreated(),
                ...ticketBuilt({ ticket: 12 }),
                ...ticketApproved({ ticket: 11 }),
                joinClashed({ ticket: 11 }),
                // #11's worktree now stands on `onto-sha`; its baseline is from `b0`.
                ticketRebased({
                    ticket: 11,
                    cause: 'clash',
                    code: ['src/index.ts'],
                }),
                worktreeAt({ ticket: 13, base_sha: 'onto-sha' }),
                worktreeAt({ ticket: 14, base_sha: 'b0' }),
            ],
        })

        expect(ofTicket(steps, 13)).toEqual([
            { type: 'run_baseline_tests', ticket: 13 },
        ])
        // A ticket from `b0`, where both baselines were taken, still reuses one.
        expect(ofTicket(steps, 14)).toMatchObject([
            { type: 'reuse_baseline_tests', ticket: 14 },
        ])
    })

    test('a ticket with a reused baseline still gets the full red check, its gates before the green commit, and the gates after its join', () => {
        const reused = [
            ...bothAtB0(),
            baselineTests({ ticket: 11 }),
            baselineReused({ ticket: 12, from_ticket: 11, base_sha: 'b0' }),
            testsWritten({ ticket: 12 }),
        ]
        expect(ofTicket(twoSteps(reused), 12)).toEqual([
            {
                type: 'run_red_check',
                ticket: 12,
                criteria_ids: ['AC1'],
                mapping: expect.any(Array),
            },
        ])

        const implementedOnReuse = [
            ...reused,
            redCheck({ ticket: 12, ok: true }),
            leftoverScan({ ticket: 12, stage: 'red' }),
            commitMade({ ticket: 12, stage: 'red' }),
            implemented({ ticket: 12 }),
        ]
        expect(ofTicket(twoSteps(implementedOnReuse), 12)).toEqual([
            { type: 'run_gates', ticket: 12, target: 'ticket' },
        ])

        const joinedOnReuse = [
            ...implementedOnReuse,
            gatesRun({ ticket: 12, target: 'ticket', ok: true }),
            leftoverScan({ ticket: 12, stage: 'green' }),
            commitMade({ ticket: 12, stage: 'green' }),
            reviewed({ ticket: 12 }),
            joined({ ticket: 12 }),
        ]
        expect(ofTicket(twoSteps(joinedOnReuse), 12)).toEqual([
            { type: 'run_gates', ticket: 12, target: 'run_branch' },
        ])
    })
})
