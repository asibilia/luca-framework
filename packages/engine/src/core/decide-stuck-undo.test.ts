import { describe, expect, test } from 'bun:test'

import { SUM, PRODUCT, twoSteps } from './decide-stuck-helpers'

import type { JournalEntry } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    commentRead,
    gatesRun,
    intakePassed,
    replyReceived,
    runBranchCreated,
    stuckReported,
    ticketBuilt,
    ticketRetried,
    ticketStuck,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/** Seam 1 for stuck work (#366): an undo that takes later joins with it. */

describe('an undo that takes later joins with it (#519)', () => {
    /** A join of `ticket` with these commits on the run branch. */
    const joinedWith = ({
        ticket,
        shas,
    }: {
        ticket: number
        shas: string[]
    }): JournalEntry => ({
        kind: 'ticket_joined',
        ticket,
        role: null,
        content: { ok: true, shas },
    })

    /** #11 and #12 both built and approved, #11 first. */
    const bothApproved = (): JournalEntry[] => [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 11 }).slice(0, 11),
        ...ticketBuilt({ ticket: 12 }).slice(0, 11),
    ]

    /** #11 joined, its join gates failed, and it is stuck. */
    const sumStuckOnRunBranch = (): JournalEntry[] => [
        ...bothApproved(),
        joinedWith({ ticket: 11, shas: ['r1'] }),
        gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
        ticketStuck({ ticket: 11, reason: 'join_gates_failed' }),
    ]

    /** #11's undo, which took #12's join on top of it too. */
    const sumUndone = (): JournalEntry => ({
        kind: 'join_undone',
        ticket: 11,
        role: null,
        content: { shas: ['r1', 'r2'] },
    })

    /** #12 joined on top of stuck #11 and got stuck too; then #11's undo. */
    const bothStuckThenUndone = (): JournalEntry[] => [
        ...sumStuckOnRunBranch(),
        joinedWith({ ticket: 12, shas: ['r2'] }),
        gatesRun({ ticket: 12, target: 'run_branch', ok: false }),
        ticketStuck({ ticket: 12, reason: 'join_gates_failed' }),
        sumUndone(),
    ]

    const kinds = (steps: ReturnType<typeof twoSteps>) =>
        steps.map(({ type, ...rest }) => [
            type,
            'ticket' in rest ? rest.ticket : null,
        ])

    test("while a stuck ticket's join is on the run branch, no other ticket joins: only its undo runs", () => {
        expect(twoSteps(sumStuckOnRunBranch())).toEqual([
            { type: 'undo_join', ticket: 11, first_sha: 'r1' },
        ])
    })

    test('a join undone with an earlier one is cleared too, so it is reported, never undone again', () => {
        const state = replayRun({
            records: recordsFrom({
                entries: [
                    ...intakePassed({ tickets: [SUM, PRODUCT] }),
                    ...withInstalls({ entries: bothStuckThenUndone() }),
                ],
            }),
        })
        expect(state.tickets[12]?.joined).toBeNull()
        expect(state.tickets[12]?.join_gates).toBeNull()
        expect(state.tickets[12]?.stuck?.reason).toBe('join_gates_failed')
        expect(state.tickets[11]?.joined).toBeNull()

        const steps = twoSteps(bothStuckThenUndone())
        expect(steps.some(({ type }) => type === 'undo_join')).toBe(false)
        expect(kinds(steps)).toEqual([
            ['report_stuck', 11],
            ['report_stuck', 12],
        ])
    })

    test('retried, the ticket whose join was undone joins again on the run branch as it is now', () => {
        // #11 is still stuck (not in the join queue), so #12 is first.
        const steps = twoSteps([
            ...bothStuckThenUndone(),
            stuckReported({ ticket: 11, comment_id: 111 }),
            stuckReported({ ticket: 12, comment_id: 112 }),
            commentRead({ comment_id: 120, body: 'retry #12' }),
            replyReceived({ word: 'retry', ticket: 12, comment_id: 120 }),
            ticketRetried({ ticket: 12, mode: 'resume' }),
        ])
        expect(steps.some(({ type }) => type === 'undo_join')).toBe(false)
        expect(kinds(steps)).toEqual([
            ['join_run_branch', 12],
            ['wait_for_reply', null],
        ])
    })

    test('a ticket that joined on top and passed its join gates joins again after the undo, never pushes the undone commits', () => {
        const steps = twoSteps([
            ...sumStuckOnRunBranch(),
            joinedWith({ ticket: 12, shas: ['r2'] }),
            gatesRun({ ticket: 12, target: 'run_branch', ok: true }),
            sumUndone(),
        ])
        expect(kinds(steps)).toEqual([
            ['report_stuck', 11],
            ['join_run_branch', 12],
        ])
    })

    test('a ticket stuck because its undo was refused is reported, never undone', () => {
        const entries = [
            ...bothApproved(),
            joinedWith({ ticket: 11, shas: ['r1'] }),
            gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
            ticketStuck({ ticket: 11, reason: 'undo_refused' }),
        ]
        // Its join is still on the run branch, so #12 doesn't join on it.
        expect(kinds(twoSteps(entries))).toEqual([['report_stuck', 11]])
        expect(
            twoSteps([
                ...entries,
                stuckReported({ ticket: 11, comment_id: 111 }),
            ])
        ).toEqual([{ type: 'wait_for_reply', spec_number: 10, since_id: 111 }])
    })

    test('retried after a refused undo, the ticket tries its undo again as part of its rebase', () => {
        expect(
            twoSteps([
                ...bothApproved(),
                joinedWith({ ticket: 11, shas: ['r1'] }),
                gatesRun({ ticket: 11, target: 'run_branch', ok: false }),
                ticketStuck({ ticket: 11, reason: 'undo_refused' }),
                stuckReported({ ticket: 11, comment_id: 111 }),
                commentRead({ comment_id: 120, body: 'retry #11' }),
                replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
                ticketRetried({ ticket: 11, mode: 'resume' }),
            ])
        ).toEqual([
            {
                type: 'rebase_ticket',
                ticket: 11,
                cause: 'join_gates',
                undo_first_sha: 'r1',
            },
        ])
    })

    test('retried, a ticket approved earlier waits for the one already joining, never joins on top of it', () => {
        const steps = twoSteps([
            ...sumStuckOnRunBranch(),
            {
                kind: 'join_undone',
                ticket: 11,
                role: null,
                content: { shas: ['r1'] },
            },
            joinedWith({ ticket: 12, shas: ['r2'] }),
            stuckReported({ ticket: 11, comment_id: 111 }),
            commentRead({ comment_id: 120, body: 'retry #11' }),
            replyReceived({ word: 'retry', ticket: 11, comment_id: 120 }),
            ticketRetried({ ticket: 11, mode: 'resume' }),
        ])
        expect(kinds(steps)).toEqual([['run_gates', 12]])
    })
})
