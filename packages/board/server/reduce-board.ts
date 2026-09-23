import {
    ALL_STEPS_DONE,
    LENS_NAMES,
    LOOP_CAP,
    usageLevel,
    type BoardState,
    type EngineEnded,
    type FinalReview,
    type FindingCounts,
    type LensCard,
    type NeedsYou,
    type RunStatus,
    type TicketCard,
} from '../shared/board-state'

import type { BoardRecord } from './board-vocabulary'

/**
 * The board's reducer: pure functions that turn journal records into board
 * state. The same records in the same order always give the same state, so
 * a replayed journal rebuilds the board exactly.
 */

/** How many "tried" lines a ticket or the final review keeps. */
const TRIED_KEPT = 6

/** Longest single "tried" line or stuck detail kept in state. */
const LINE_MAX = 240
const DETAIL_MAX = 2000

const STUCK_REASONS: Record<string, string> = {
    agent_failed: 'An agent failed.',
    red_check_failed: 'The red check failed.',
    leftovers_found: 'The leftover scan found files that must not be committed.',
    gates_failed: 'The checks failed.',
    bad_test: 'The implementer sent back a bad test.',
    changes_requested: 'The ticket review asked for changes.',
    join_failed: "The ticket couldn't join the run branch.",
    join_gates_failed: 'The checks failed after the ticket joined.',
}

const clip = ({ text, max }: { text: string; max: number }): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text

const firstLine = ({ text }: { text: string }): string =>
    clip({ text: text.split('\n')[0] ?? '', max: LINE_MAX })

/** A stuck reason code in words. */
export const reasonText = ({ reason }: { reason: string }): string =>
    STUCK_REASONS[reason] ?? `${reason.replaceAll('_', ' ')}.`

const noFindings = (): FindingCounts => ({ blocker: 0, should_fix: 0, nit: 0 })

const freshLenses = (): LensCard[] =>
    LENS_NAMES.map((name) => ({
        name,
        state: 'waiting',
        findings: noFindings(),
    }))

/**
 * A new run's board, before any record.
 *
 * @example
 * const state = createBoardState({
 *     run_id: 'luca-20260923-123042-ab12',
 *     spec_number: 10,
 *     demo: false,
 *     started_at: '2026-09-23T12:30:42.000Z',
 *     log_path: '/tmp/luca-20260923-123042-ab12.log',
 * })
 */
export const createBoardState = ({
    run_id,
    spec_number,
    demo,
    started_at,
    log_path,
}: {
    run_id: string
    spec_number: number | null
    demo: boolean
    started_at: string
    log_path: string | null
}): BoardState => ({
    run: {
        run_id,
        spec_number,
        spec_title: null,
        demo,
        branch: null,
        phase: 'starting',
        status: 'starting',
        pr_url: null,
        pr_number: null,
        refusal: [],
        started_at,
        last_time: null,
        engine_ended: null,
        log_path,
    },
    usage: null,
    limit_wait: null,
    needs_you: [],
    tickets: [],
    final_review: {
        state: 'waiting',
        active: false,
        round: 0,
        fix_round: 0,
        lenses: freshLenses(),
        tried: [],
    },
    event_count: 0,
    latest: null,
})

const newTicket = ({
    number,
    title,
    refactor,
    blockers,
}: {
    number: number
    title: string
    refactor: boolean
    blockers: number[]
}): TicketCard => ({
    number,
    title,
    refactor,
    blockers,
    started: false,
    stage: 'building',
    step: -1,
    activity: 'queued',
    role: null,
    fix_round: 0,
    review_round: 0,
    tests: null,
    findings: null,
    tokens: 0,
    tried: [],
})

const withTried = ({
    tried,
    line,
}: {
    tried: string[]
    line: string
}): string[] => [...tried, firstLine({ text: line })].slice(-TRIED_KEPT)

const updateTicket = ({
    state,
    number,
    update,
}: {
    state: BoardState
    number: number | null
    update: (ticket: TicketCard) => TicketCard
}): BoardState => {
    if (number === null) return state
    return {
        ...state,
        tickets: state.tickets.map((ticket) =>
            ticket.number === number ? update(ticket) : ticket
        ),
    }
}

const updateFinal = ({
    state,
    update,
}: {
    state: BoardState
    update: (review: FinalReview) => FinalReview
}): BoardState => ({ ...state, final_review: update(state.final_review) })

const updateLens = ({
    state,
    lens,
    update,
}: {
    state: BoardState
    lens: string
    update: (card: LensCard) => LensCard
}): BoardState =>
    updateFinal({
        state,
        update: (review) => ({
            ...review,
            lenses: review.lenses.map((card) =>
                card.name === lens ? update(card) : card
            ),
        }),
    })

const addNeedsYou = ({
    state,
    item,
}: {
    state: BoardState
    item: NeedsYou
}): BoardState => ({
    ...state,
    needs_you: [
        ...state.needs_you.filter((entry) => entry.key !== item.key),
        item,
    ],
})

const resolveNeedsYou = ({
    state,
    key,
}: {
    state: BoardState
    key: string | null
}): BoardState => ({
    ...state,
    needs_you:
        key === null
            ? []
            : state.needs_you.filter((entry) => entry.key !== key),
})

/** The key of a ticket's "Needs you" item. */
export const ticketKey = ({ ticket }: { ticket: number }): string =>
    `ticket-${ticket}`

/** The key of the final review's "Needs you" item. */
export const FINAL_KEY = 'final'

const testCounts = ({
    cases,
}: {
    cases: { status: string }[]
}): { failing: number; total: number } => ({
    failing: cases.filter((entry) => entry.status === 'failed').length,
    total: cases.length,
})

const countFindings = ({
    findings,
}: {
    findings: { severity: 'blocker' | 'should_fix' | 'nit' }[]
}): FindingCounts => ({
    blocker: findings.filter((finding) => finding.severity === 'blocker')
        .length,
    should_fix: findings.filter((finding) => finding.severity === 'should_fix')
        .length,
    nit: findings.filter((finding) => finding.severity === 'nit').length,
})

const tokensOf = ({
    content,
}: {
    content: Extract<BoardRecord, { kind: 'agent_finished' }>['content']
}): number => {
    const usage = content.usage
    if (usage?.total_tokens !== undefined) return usage.total_tokens
    if (usage?.input_tokens !== undefined || usage?.output_tokens !== undefined)
        return (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
    return content.total_tokens ?? 0
}

/**
 * Applies one journal record to the board. Pure: returns a new state.
 *
 * @example
 * const next = applyRecord({ state, record })
 */
export const applyRecord = ({
    state,
    record,
}: {
    state: BoardState
    record: BoardRecord
}): BoardState => {
    const next = applyKind({ state, record })
    return settle({
        state: {
            ...next,
            run: { ...next.run, last_time: record.time },
            event_count: state.event_count + 1,
        },
    })
}

/** Marks the engine as finished, ok or failed. */
export const applyEnded = ({
    state,
    ended,
}: {
    state: BoardState
    ended: EngineEnded
}): BoardState =>
    settle({ state: { ...state, run: { ...state.run, engine_ended: ended } } })

const applyKind = ({
    state,
    record,
}: {
    state: BoardState
    record: BoardRecord
}): BoardState => {
    const { ticket } = record
    switch (record.kind) {
        case 'run_started':
            return {
                ...state,
                run: {
                    ...state.run,
                    spec_number: record.content.spec_number,
                    phase: 'intake',
                },
            }
        case 'intake_read':
            return {
                ...state,
                run: {
                    ...state.run,
                    spec_title:
                        state.run.spec_title ?? record.content.spec.title,
                    phase: 'intake',
                },
            }
        case 'intake_refused':
            return {
                ...state,
                run: {
                    ...state.run,
                    phase: 'refused',
                    refusal: record.content.problems.map(
                        (problem) =>
                            `${problem.ticket === null ? 'The run' : `#${problem.ticket}`}: missing ${problem.missing.join(', ')}`
                    ),
                },
            }
        case 'nothing_to_do':
            return { ...state, run: { ...state.run, phase: 'nothing_to_do' } }
        case 'spec_snapshot':
            return {
                ...state,
                run: {
                    ...state.run,
                    spec_number: record.content.spec.number,
                    spec_title: record.content.spec.title,
                    phase: 'building',
                },
            }
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
        case 'run_branch_created':
            return {
                ...state,
                run: { ...state.run, branch: record.content.branch },
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
        case 'baseline_tests':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    started: true,
                    activity: 'baseline tests',
                    tests: testCounts({ cases: record.content.cases }),
                }),
            })
        case 'agent_started':
            return agentStarted({ state, ticket, role: record.content.role })
        case 'agent_finished':
            return agentFinished({ state, record })
        case 'agent_failed':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    role: null,
                    activity: `${record.content.role} failed`,
                    tried: withTried({
                        tried: card.tried,
                        line: `The ${record.content.role} failed: ${record.content.error}`,
                    }),
                }),
            })
        case 'red_check':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    step: record.content.ok ? 2 : 1,
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
                update: (card) =>
                    record.content.stage === 'green'
                        ? { ...card, step: 4, activity: 'code committed' }
                        : { ...card, activity: 'tests committed' },
            })
        case 'gates_run':
            return gatesRun({ state, record })
        case 'ticket_joined':
            return updateTicket({
                state,
                number: ticket,
                update: (card) =>
                    record.content.ok
                        ? {
                              ...card,
                              stage: 'done',
                              step: ALL_STEPS_DONE,
                              role: null,
                              activity: 'joined',
                          }
                        : {
                              ...card,
                              activity: 'join failed',
                              tried: withTried({
                                  tried: card.tried,
                                  line: `Joining the run branch failed: ${record.content.error ?? 'no detail'}`,
                              }),
                          },
            })
        case 'run_branch_pushed':
            return updateTicket({
                state,
                number: ticket,
                update: (card) =>
                    card.stage === 'done' ? { ...card, activity: 'pushed' } : card,
            })
        case 'ticket_stuck': {
            if (ticket === null) return state
            const card = state.tickets.find((entry) => entry.number === ticket)
            const stuck = updateTicket({
                state,
                number: ticket,
                update: (entry) => ({
                    ...entry,
                    stage: 'stuck',
                    role: null,
                    activity: 'stuck',
                }),
            })
            return addNeedsYou({
                state: stuck,
                item: {
                    key: ticketKey({ ticket }),
                    ticket,
                    subject: `Ticket #${ticket} is stuck${card ? `: ${card.title}` : ''}`,
                    reason: reasonText({ reason: record.content.reason }),
                    detail: clip({
                        text: record.content.detail,
                        max: DETAIL_MAX,
                    }),
                    tried: card?.tried ?? [],
                    replies: [`retry #${ticket}`, `skip #${ticket}`, 'stop'],
                    since: record.time,
                },
            })
        }
        case 'pull_request_opened':
            return {
                ...state,
                run: {
                    ...state.run,
                    phase: 'done',
                    pr_url: record.content.url,
                    pr_number: record.content.number,
                },
            }
        case 'usage_reading': {
            const { five_hour_percent, weekly_percent, resets_at } =
                record.content
            return {
                ...state,
                usage: {
                    five_hour_percent,
                    weekly_percent,
                    five_hour_level: usageLevel({ percent: five_hour_percent }),
                    weekly_level: usageLevel({ percent: weekly_percent }),
                    resets_at: resets_at ?? null,
                    read_at: record.time,
                },
            }
        }
        case 'limit_wait_started':
            return {
                ...state,
                limit_wait: {
                    resets_at: record.content.resets_at ?? null,
                    since: record.time,
                },
            }
        case 'limit_wait_ended':
            return { ...state, limit_wait: null }
        case 'fix_round':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    fix_round: record.content.round,
                    activity: 'fixing',
                    tried: withTried({
                        tried: card.tried,
                        line: `Fix round ${record.content.round}/${LOOP_CAP} after the ${record.content.loop.replaceAll('_', ' ')}`,
                    }),
                }),
            })
        case 'review_finished':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    review_round: record.content.round,
                    findings: {
                        blocker: record.content.findings.blocker,
                        should_fix: record.content.findings.should_fix,
                        nit: record.content.findings.nit,
                    },
                }),
            })
        case 'reply_received':
            return replyReceived({ state, record })
        case 'ticket_skipped':
            return skipTicket({ state, ticket })
        case 'final_review_started':
            return {
                ...updateFinal({
                    state,
                    update: (review) => ({
                        ...review,
                        state: 'reviewing',
                        round: review.round + 1,
                        lenses: review.lenses.map((lens) =>
                            lens.state === 'clean'
                                ? lens
                                : { ...lens, state: 'waiting' }
                        ),
                    }),
                }),
                run: { ...state.run, phase: 'final_review' },
            }
        case 'lens_started':
            return updateLens({
                state,
                lens: record.content.lens,
                update: (lens) => ({ ...lens, state: 'reviewing' }),
            })
        case 'lens_finished': {
            const { findings } = record.content
            const counts = {
                blocker: findings.blocker,
                should_fix: findings.should_fix,
                nit: findings.nit,
            }
            return updateLens({
                state,
                lens: record.content.lens,
                update: (lens) => ({
                    ...lens,
                    findings: counts,
                    state:
                        counts.blocker + counts.should_fix > 0
                            ? 'fixing'
                            : 'clean',
                }),
            })
        }
        case 'final_review_fixing':
            return updateFinal({
                state,
                update: (review) => ({
                    ...review,
                    state: 'fixing',
                    fix_round: record.content.round,
                    tried: withTried({
                        tried: review.tried,
                        line: `Fix round ${record.content.round}/${LOOP_CAP} on the lenses' findings`,
                    }),
                }),
            })
        case 'final_review_stuck':
            return addNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({ ...review, state: 'stuck' }),
                }),
                item: {
                    key: FINAL_KEY,
                    ticket: null,
                    subject: 'The final review is stuck',
                    reason: reasonText({ reason: record.content.reason }),
                    detail: clip({
                        text: record.content.detail,
                        max: DETAIL_MAX,
                    }),
                    tried: state.final_review.tried,
                    replies: ['retry', 'stop', 'ship'],
                    since: record.time,
                },
            })
        case 'final_review_passed':
            return resolveNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({
                        ...review,
                        state: 'passed',
                        lenses: review.lenses.map((lens) => ({
                            ...lens,
                            state: 'clean',
                        })),
                    }),
                }),
                key: FINAL_KEY,
            })
    }
}

const agentStarted = ({
    state,
    ticket,
    role,
}: {
    state: BoardState
    ticket: number | null
    role: string
}): BoardState =>
    updateTicket({
        state,
        number: ticket,
        update: (card) => {
            const started = { ...card, started: true, role }
            if (role === 'test-writer') {
                return {
                    ...started,
                    stage: 'building',
                    step: 0,
                    activity:
                        card.fix_round > 0 ? 'fixing tests' : 'writing tests',
                }
            }
            if (role === 'implementer') {
                return {
                    ...started,
                    stage: card.stage === 'reviewing' ? 'reviewing' : 'building',
                    step: 2,
                    activity: card.fix_round > 0 ? 'fixing' : 'coding',
                }
            }
            if (role === 'ticket-reviewer') {
                return {
                    ...started,
                    stage: 'reviewing',
                    step: 4,
                    review_round: card.review_round + 1,
                    activity: 'reviewing',
                }
            }
            return { ...started, activity: role }
        },
    })

const agentFinished = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'agent_finished' }>
}): BoardState => {
    const { role, result } = record.content
    const tokens = tokensOf({ content: record.content })
    return updateTicket({
        state,
        number: record.ticket,
        update: (card) => {
            const done = { ...card, role: null, tokens: card.tokens + tokens }
            if (role === 'test-writer') {
                return result.outcome === 'nothing_new_to_test'
                    ? { ...done, step: 2, activity: 'nothing new to test' }
                    : { ...done, step: 1, activity: 'red check' }
            }
            if (role === 'implementer') {
                return result.outcome === 'bad_test'
                    ? { ...done, activity: 'bad test' }
                    : { ...done, step: 3, activity: 'checks' }
            }
            if (role === 'ticket-reviewer') {
                const findings = result.findings
                    ? countFindings({ findings: result.findings })
                    : card.findings
                return result.verdict === 'approve'
                    ? {
                          ...done,
                          step: ALL_STEPS_DONE,
                          findings,
                          activity: 'approved',
                      }
                    : { ...done, findings, activity: 'changes requested' }
            }
            return done
        },
    })
}

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
    return updateTicket({
        state,
        number: record.ticket,
        update: (card) => {
            if (ok) {
                return afterJoin
                    ? { ...card, activity: 'checks passed after joining' }
                    : { ...card, step: 4, activity: 'checks passed' }
            }
            return {
                ...card,
                step: afterJoin ? card.step : 3,
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

const skipTicket = ({
    state,
    ticket,
}: {
    state: BoardState
    ticket: number | null
}): BoardState => {
    if (ticket === null) return state
    return resolveNeedsYou({
        state: updateTicket({
            state,
            number: ticket,
            update: (card) => ({
                ...card,
                stage: 'skipped',
                role: null,
                activity: 'skipped',
            }),
        }),
        key: ticketKey({ ticket }),
    })
}

const replyReceived = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'reply_received' }>
}): BoardState => {
    const { word } = record.content
    const ticket = record.content.ticket ?? record.ticket
    switch (word) {
        case 'retry':
            if (ticket !== null) {
                return resolveNeedsYou({
                    state: updateTicket({
                        state,
                        number: ticket,
                        update: (card) => ({
                            ...card,
                            stage: 'building',
                            activity: 'retrying',
                        }),
                    }),
                    key: ticketKey({ ticket }),
                })
            }
            return resolveNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({ ...review, state: 'reviewing' }),
                }),
                key: FINAL_KEY,
            })
        case 'skip':
            return skipTicket({ state, ticket })
        case 'ship':
            return resolveNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({ ...review, state: 'passed' }),
                }),
                key: FINAL_KEY,
            })
        case 'stop':
            return resolveNeedsYou({ state, key: null })
    }
}

/** A ticket's blockers inside this run that aren't done yet. */
export const unfinishedBlockers = ({
    state,
    ticket,
}: {
    state: BoardState
    ticket: TicketCard
}): number[] =>
    ticket.blockers.filter((number) => {
        const blocker = state.tickets.find((card) => card.number === number)
        return blocker !== undefined && blocker.stage !== 'done'
    })

const isActive = ({ state }: { state: BoardState }): boolean =>
    state.tickets.some(
        (ticket) =>
            ticket.started &&
            (ticket.stage === 'building' || ticket.stage === 'reviewing')
    ) ||
    state.final_review.state === 'reviewing' ||
    state.final_review.state === 'fixing'

const runStatus = ({ state }: { state: BoardState }): RunStatus => {
    const { phase, engine_ended } = state.run
    if (phase === 'done' || phase === 'refused' || phase === 'nothing_to_do')
        return phase
    if (engine_ended && !engine_ended.ok) return 'ended_with_error'
    if (state.limit_wait) return 'limit_wait'
    if (state.needs_you.length > 0 && !isActive({ state })) return 'stuck'
    return phase
}

/**
 * Recomputes what depends on the whole board: which unstarted tickets are
 * blocked, whether the final review is active, and the run's status.
 */
const settle = ({ state }: { state: BoardState }): BoardState => {
    const tickets = state.tickets.map((ticket): TicketCard => {
        if (ticket.started) return ticket
        if (ticket.stage !== 'blocked' && ticket.stage !== 'building')
            return ticket
        const waiting = unfinishedBlockers({ state, ticket })
        return waiting.length > 0
            ? {
                  ...ticket,
                  stage: 'blocked',
                  activity: `waits on ${waiting.map((number) => `#${number}`).join(', ')}`,
              }
            : { ...ticket, stage: 'building', activity: 'queued' }
    })
    const settledTickets = { ...state, tickets }
    const active =
        tickets.length > 0 &&
        tickets.every(
            (ticket) => ticket.stage === 'done' || ticket.stage === 'skipped'
        )
    const withReview = {
        ...settledTickets,
        final_review: { ...state.final_review, active },
    }
    return {
        ...withReview,
        run: { ...withReview.run, status: runStatus({ state: withReview }) },
    }
}
