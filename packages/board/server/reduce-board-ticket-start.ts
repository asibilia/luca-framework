/**
 * A ticket's start: its snapshot, its worktree, the install, the baseline
 * tests, and a start over after a bad test.
 */
import type { BoardRecord } from './board-vocabulary'
import { newTicket } from './reduce-board-create'
import { testCounts, updateTicket, withTried } from './reduce-board-update'

import type { BoardState } from '../shared/board-state'

/** The record kinds of a ticket's start. */
export const TICKET_START_KINDS = [
    'ticket_snapshot',
    'ticket_worktree_created',
    'dependencies_installed',
    'baseline_tests',
    'baseline_reused',
    'worktree_reset',
] as const

type TicketStartRecord = Extract<
    BoardRecord,
    { kind: (typeof TICKET_START_KINDS)[number] }
>

/** Applies one record of TICKET_START_KINDS to the board. */
export const applyTicketStartKind = ({
    state,
    record,
}: {
    state: BoardState
    record: TicketStartRecord
}): BoardState => {
    const { ticket } = record
    switch (record.kind) {
        case 'ticket_snapshot': {
            const { number, title, labels, blockers } = record.content
            const refactor = labels.includes('refactor')
            const known = state.tickets.some((card) => card.number === number)
            if (known) {
                return updateTicket({
                    state,
                    number,
                    update: (card) => ({ ...card, title, refactor, blockers }),
                })
            }
            return {
                ...state,
                tickets: [
                    ...state.tickets,
                    newTicket({ number, title, refactor, blockers }),
                ],
            }
        }
        case 'ticket_worktree_created':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    started: true,
                    stage: 'building',
                    activity: 'starting',
                }),
            })
        case 'dependencies_installed': {
            const { check } = record.content
            if (check === null || check.ok || ticket === null) return state
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    activity: 'install failed',
                    tried: withTried({
                        tried: card.tried,
                        line: `The install failed: \`${check.command}\``,
                    }),
                }),
            })
        }
        case 'baseline_tests': {
            const tests = testCounts({ cases: record.content.cases })
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    started: true,
                    activity: 'baseline tests',
                    tests,
                    baseline_tests: tests,
                }),
            })
        }
        case 'baseline_reused': {
            // Another ticket's baseline from the same run-branch commit (#404).
            const { from_ticket } = record.content
            const tests =
                state.tickets.find((card) => card.number === from_ticket)
                    ?.baseline_tests ?? null
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    started: true,
                    activity: `baseline tests (reused from #${from_ticket})`,
                    tests,
                    baseline_tests: tests,
                }),
            })
        }
        case 'worktree_reset':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    stage: 'building',
                    step: 0,
                    fix_round: 0,
                    open_check: null,
                    activity: 'starting over',
                    tried: withTried({
                        tried: card.tried,
                        line: 'Started over from the tests after a bad test',
                    }),
                }),
            })
    }
}
