/**
 * A ticket's checks while it builds: the red check, commits, the leftover
 * scan, and the checks (the final review's too).
 */
import type { BoardRecord } from './board-vocabulary'
import {
    finalTried,
    testCounts,
    updateTicket,
    withTried,
} from './reduce-board-update'

import type { BoardState } from '../shared/board-state'

const gatesRun = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'gates_run' }>
}): BoardState => {
    const { ok, target, checks } = record.content
    const failed = checks
        .filter((check) => !check.ok)
        .map((check) => check.name)
        .join(', ')
    const afterJoin = target === 'run_branch'
    // The final review's slow tests, after round 1's lenses (#563).
    if (target === 'final_slow') {
        return ok
            ? state
            : finalTried({
                  state,
                  line: `The final review's slow tests failed: ${failed || 'no detail'}`,
              })
    }
    // The final review's fixes are checked on the run branch, with no ticket.
    if (record.ticket === null) {
        return ok
            ? state
            : finalTried({
                  state,
                  line: `The checks failed on the final review's fixes: ${failed || 'no detail'}`,
              })
    }
    return updateTicket({
        state,
        number: record.ticket,
        update: (card) => {
            if (ok) {
                return afterJoin
                    ? { ...card, activity: 'checks passed after joining' }
                    : {
                          ...card,
                          step: 4,
                          open_check: null,
                          fix_round: 0,
                          activity: 'checks passed',
                      }
            }
            return {
                ...card,
                step: afterJoin ? card.step : 3,
                open_check: afterJoin ? card.open_check : 'gates',
                activity: afterJoin
                    ? 'checks failed after joining'
                    : 'checks failed',
                tried: withTried({
                    tried: card.tried,
                    line: `${afterJoin ? 'After joining, the' : 'The'} checks failed: ${failed || 'no detail'}`,
                }),
            }
        },
    })
}

/** The record kinds of a ticket's checks. */
export const TICKET_CHECKS_KINDS = [
    'red_check',
    'leftover_scan',
    'commit_made',
    'gates_run',
] as const

type TicketChecksRecord = Extract<
    BoardRecord,
    { kind: (typeof TICKET_CHECKS_KINDS)[number] }
>

/** Applies one record of TICKET_CHECKS_KINDS to the board. */
export const applyTicketChecksKind = ({
    state,
    record,
}: {
    state: BoardState
    record: TicketChecksRecord
}): BoardState => {
    const { ticket } = record
    switch (record.kind) {
        case 'red_check':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    step: record.content.ok ? 2 : 1,
                    open_check: record.content.ok ? null : 'red_check',
                    fix_round: record.content.ok ? 0 : card.fix_round,
                    activity: record.content.ok
                        ? 'red check passed'
                        : 'red check failed',
                    tests: record.content.tests
                        ? testCounts({ cases: record.content.tests.cases })
                        : card.tests,
                    tried: record.content.ok
                        ? card.tried
                        : withTried({
                              tried: card.tried,
                              line: `The red check failed: ${record.content.problems[0] ?? 'no detail'}`,
                          }),
                }),
            })
        case 'leftover_scan':
            if (record.content.hits.length === 0) return state
            if (ticket === null) {
                return finalTried({
                    state,
                    line: `The leftover scan found ${record.content.hits.map((hit) => hit.path).join(', ')} in the final review's fixes`,
                })
            }
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    activity: 'leftovers found',
                    tried: withTried({
                        tried: card.tried,
                        line: `The leftover scan found ${record.content.hits.map((hit) => hit.path).join(', ')}`,
                    }),
                }),
            })
        case 'commit_made':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => {
                    switch (record.content.stage) {
                        case 'green':
                            return {
                                ...card,
                                step: 4,
                                activity: 'code committed',
                            }
                        case 'fix':
                            return {
                                ...card,
                                activity: 'review fixes committed',
                            }
                        default:
                            return { ...card, activity: 'tests committed' }
                    }
                },
            })
        case 'gates_run':
            return gatesRun({ state, record })
    }
}
