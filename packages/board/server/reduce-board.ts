import type { BoardRecord } from './board-vocabulary'

import {
    ALL_STEPS_DONE,
    LENS_NAMES,
    LOOP_CAP,
    usageLevel,
    windowRank,
    windowWords,
    type BoardState,
    type EngineEnded,
    type FinalReview,
    type FindingCounts,
    type LensCard,
    type NeedsYou,
    type PlanUsed,
    type RunStatus,
    type TicketCard,
    type Usage,
} from '../shared/board-state'

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
    agent_failed: 'An agent failed on its last try.',
    red_check_failed: 'The red check failed.',
    nothing_new_to_test:
        'The test-writer found nothing new to test. If the ticket changes no behavior, label it refactor and start the run again.',
    leftovers_found:
        'The leftover scan found files that must not be committed.',
    gates_failed: 'The checks failed.',
    bad_test: 'The implementer sent back a bad test.',
    changes_requested: 'The ticket review asked for changes.',
    join_failed: "The ticket couldn't join the run branch.",
    join_gates_failed: 'The checks failed after the ticket joined.',
    install_failed: 'Installing the dependencies failed.',
}

const clip = ({ text, max }: { text: string; max: number }): string =>
    text.length > max ? `${text.slice(0, max - 1)}…` : text

const firstLine = ({ text }: { text: string }): string =>
    clip({ text: text.split('\n')[0] ?? '', max: LINE_MAX })

/** How an agent turn failed, in words: `agent_failed`'s `failure`. */
const FAILURES: Record<string, string> = {
    agent: 'failed',
    result: 'gave no usable result',
    guard: "broke its role's rules (the changes were undone)",
    engine: 'could not run (an engine-side failure; a fresh agent starts)',
}

/** An `agent_failed` failure kind in words. */
export const failureText = ({ failure }: { failure: string }): string =>
    FAILURES[failure] ?? `failed (${failure})`

/** Record kinds that don't mean the engine moved on after a stop. */
const QUIET_KINDS = new Set([
    'run_stopped',
    'agent_session',
    'usage_recorded',
    'jev_asked',
    'jev_answered',
    'jev_failed',
])

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
        stopped: null,
        log_path,
    },
    usage: null,
    limit_wait: null,
    run_plan_used: [],
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
    jev: { asked: 0, answered: 0, failed: 0 },
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
    review_fix_round: 0,
    open_check: null,
    failed_turn: null,
    tests: null,
    findings: null,
    tokens: 0,
    agent_tokens: {},
    tried: [],
    plan_used: [],
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

/** A ticket review's findings counted by severity. */
export const countFindings = ({
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

type SessionContent = Extract<BoardRecord, { kind: 'agent_session' }>['content']

/** Every token a session read or wrote, cache reads included. */
const sessionTokens = ({ session }: SessionContent): number =>
    session.usage.input_tokens +
    session.usage.output_tokens +
    session.usage.cache_read_input_tokens +
    session.usage.cache_creation_input_tokens

/** A 0-to-1 utilization as a whole percent from 0 to 100. */
const percentOf = ({ utilization }: { utilization: number }): number =>
    Math.min(100, Math.max(0, Math.round(utilization * 100)))

/** Epoch seconds as an ISO time. */
const isoOf = ({ seconds }: { seconds: number }): string =>
    new Date(seconds * 1000).toISOString()

type Reading = SessionContent['session']['rate_limit_events'][number]

/**
 * One reading's windows as `{ type, utilization, resetsAt }`: its top-level
 * `rateLimitType` form, then each of its `unifiedWindows`.
 */
const windowsOf = ({
    reading,
}: {
    reading: Reading
}): { type: string; utilization: number; resetsAt: number | undefined }[] => {
    const { rateLimitType, utilization, resetsAt, unifiedWindows } = reading
    const top =
        rateLimitType !== undefined && utilization !== undefined
            ? [{ type: rateLimitType, utilization, resetsAt }]
            : []
    const unified = Object.entries(unifiedWindows ?? {}).flatMap(
        ([type, window]) =>
            window.utilization === undefined
                ? []
                : [
                      {
                          type,
                          utilization: window.utilization,
                          resetsAt: window.resetsAt,
                      },
                  ]
    )
    return [...top, ...unified]
}

/**
 * The plan usage after a session's rate-limit readings. The latest
 * `five_hour` reading sets the five-hour window (and when it resets); the
 * latest reading of any `seven_day*` type sets the weekly one, and inside
 * one reading the highest `seven_day*` window wins, since the tightest
 * weekly cap is the one that binds. A window with no reading keeps what it
 * had. `null` while no window has a reading.
 */
const usageAfter = ({
    usage,
    session,
    time,
}: {
    usage: Usage | null
    session: SessionContent['session']
    time: string
}): Usage | null => {
    let five_hour = usage?.five_hour_percent ?? null
    let weekly = usage?.weekly_percent ?? null
    let resets_at = usage?.resets_at ?? null
    let read = false
    for (const reading of session.rate_limit_events) {
        const windows = windowsOf({ reading })
        const fiveHour = windows.filter(({ type }) => type === 'five_hour')
        const latest = fiveHour.at(-1)
        if (latest) {
            five_hour = percentOf({ utilization: latest.utilization })
            resets_at =
                latest.resetsAt === undefined
                    ? resets_at
                    : isoOf({ seconds: latest.resetsAt })
            read = true
        }
        const weeklies = windows
            .filter(({ type }) => type.startsWith('seven_day'))
            .map(({ utilization }) => percentOf({ utilization }))
        if (weeklies.length > 0) {
            weekly = Math.max(...weeklies)
            read = true
        }
    }
    if (!read) return usage
    return {
        five_hour_percent: five_hour,
        weekly_percent: weekly,
        five_hour_level:
            five_hour === null ? null : usageLevel({ percent: five_hour }),
        weekly_level: weekly === null ? null : usageLevel({ percent: weekly }),
        resets_at,
        read_at: time,
    }
}

/** The roles that fix a ticket review's findings. */
const REVIEW_FIXERS = new Set(['test-writer', 'implementer'])

const plural = ({ count, word }: { count: number; word: string }) =>
    `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * A ticket review's finding counts in words, such as "1 blocker, 2
 * should-fix, 2 nits". Nits are left out unless `nits` is set; `null` when
 * nothing is left to say.
 *
 * @example
 * reviewCountsText({ findings: { blocker: 2, should_fix: 1, nit: 1 }, nits: false })
 * // '2 blockers, 1 should-fix'
 */
export const reviewCountsText = ({
    findings,
    nits,
}: {
    findings: FindingCounts
    nits: boolean
}): string | null => {
    const parts = [
        findings.blocker > 0
            ? plural({ count: findings.blocker, word: 'blocker' })
            : null,
        findings.should_fix > 0 ? `${findings.should_fix} should-fix` : null,
        nits && findings.nit > 0
            ? plural({ count: findings.nit, word: 'nit' })
            : null,
    ].filter((part) => part !== null)
    return parts.length > 0 ? parts.join(', ') : null
}

/**
 * A usage record's windows as whole percents in words: five-hour first,
 * then the weekly ones, then the rest, each group in the record's order.
 */
const planUsedOf = ({
    windows,
}: {
    windows: Record<string, { used: number }>
}): PlanUsed[] =>
    Object.entries(windows)
        .map(([window, { used }], index) => ({ window, used, index }))
        .toSorted(
            (left, right) =>
                windowRank({ window: left.window }) -
                    windowRank({ window: right.window }) ||
                left.index - right.index
        )
        .map(({ window, used }) => ({
            window: windowWords({ window }),
            percent: Math.round(used),
        }))

/**
 * What an `agent_started` is, from the ticket's card before it:
 * - `retry`: a new try after the role's (or any) turn failed;
 * - `review_fix`: a test-writer (always fresh) or the implementer (a
 *   follow-up, or fresh if its session was lost) sent a ticket review's
 *   findings, in a review fix round;
 * - `fix`: a follow-up answering a failed red check or gates, a new round;
 * - `resent`: the same fix sent again (its turn never ended, such as after
 *   a crash);
 * - `fresh`: anything else.
 */
export const startKind = ({
    card,
    role,
    follow_up_of,
}: {
    card: TicketCard | undefined
    role: string
    follow_up_of: string | null
}): 'retry' | 'review_fix' | 'fix' | 'resent' | 'fresh' => {
    if (card === undefined) return 'fresh'
    if (card.failed_turn !== null) return 'retry'
    if (card.open_check === 'review' && REVIEW_FIXERS.has(role)) {
        return card.role === null ? 'review_fix' : 'resent'
    }
    if (follow_up_of === null || card.open_check === null) return 'fresh'
    return card.role === null ? 'fix' : 'resent'
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
    // Any real step after a stop means the run was started again.
    const stopped = QUIET_KINDS.has(record.kind) ? next.run.stopped : null
    return settle({
        state: {
            ...next,
            run: { ...next.run, last_time: record.time, stopped },
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
            return agentStarted({ state, record })
        case 'agent_finished':
            return agentFinished({ state, record })
        case 'agent_failed': {
            const { role, error, failure } = record.content
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    role: null,
                    failed_turn: role,
                    activity: `${role} ${failure === 'engine' ? 'could not run' : 'failed'}`,
                    tried: withTried({
                        tried: card.tried,
                        line: `The ${role} ${failureText({ failure })}: ${error}`,
                    }),
                }),
            })
        }
        case 'agent_session': {
            const tokens = sessionTokens(record.content)
            const { role } = record.content
            const withTokens = updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    tokens: card.tokens + tokens,
                    agent_tokens: {
                        ...card.agent_tokens,
                        [role]: (card.agent_tokens[role] ?? 0) + tokens,
                    },
                }),
            })
            return {
                ...withTokens,
                usage: usageAfter({
                    usage: state.usage,
                    session: record.content.session,
                    time: record.time,
                }),
            }
        }
        case 'run_stopped': {
            const { reason, role, billing } = record.content
            const stopped = updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
                    role: null,
                    activity: 'run stopped',
                    tried: withTried({
                        tried: card.tried,
                        line: `${billing ? 'Stopped for billing' : 'The run stopped'}: ${reason}`,
                    }),
                }),
            })
            return {
                ...stopped,
                run: {
                    ...stopped.run,
                    stopped: {
                        reason,
                        role,
                        ticket,
                        billing,
                        since: record.time,
                    },
                },
            }
        }
        case 'worktree_reset':
            return updateTicket({
                state,
                number: ticket,
                update: (card) => ({
                    ...card,
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
        case 'ticket_rebased':
            return ticketRebased({ state, record })
        case 'run_branch_pushed':
            return updateTicket({
                state,
                number: ticket,
                update: (card) =>
                    card.stage === 'done'
                        ? { ...card, activity: 'pushed' }
                        : card,
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
        // Removing the worktrees at the end changes nothing on the board.
        case 'worktrees_removed':
            return state
        case 'jev_asked':
            return {
                ...state,
                jev: { ...state.jev, asked: state.jev.asked + 1 },
            }
        case 'jev_answered':
            return {
                ...state,
                jev: { ...state.jev, answered: state.jev.answered + 1 },
            }
        case 'jev_failed':
            return {
                ...state,
                jev: { ...state.jev, failed: state.jev.failed + 1 },
            }
        case 'limit_wait_started': {
            const { resets_at, until, rate_limit_type } = record.content
            return {
                ...state,
                limit_wait: {
                    resets_at: resets_at ?? until,
                    window:
                        rate_limit_type === null
                            ? null
                            : windowWords({ window: rate_limit_type }),
                    since: record.time,
                },
            }
        }
        case 'limit_wait_ended':
            return { ...state, limit_wait: null }
        case 'usage_recorded': {
            const plan_used = planUsedOf({ windows: record.content.windows })
            if (record.content.scope === 'run') {
                return { ...state, run_plan_used: plan_used }
            }
            return updateTicket({
                state,
                number: record.content.ticket ?? ticket,
                update: (card) => ({ ...card, plan_used }),
            })
        }
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

const OPEN_CHECK_TEXT = {
    red_check: 'red check',
    gates: 'checks',
    review: 'ticket review',
} as const

/**
 * A fixer's start in a review fix round. The round is the review's round (a
 * round follows each review that asked for changes); only the round's first
 * fixer adds its "tried" line. The card stays in Reviewing at its step.
 */
const reviewFixStarted = ({
    card,
    role,
}: {
    card: TicketCard
    role: string
}): TicketCard => {
    const round = Math.max(card.review_round, 1)
    const counts = card.findings
        ? reviewCountsText({ findings: card.findings, nits: false })
        : null
    return {
        ...card,
        started: true,
        role,
        stage: 'reviewing',
        review_fix_round: round,
        activity: `fixing the review's findings (${round}/${LOOP_CAP})`,
        tried:
            card.review_fix_round < round
                ? withTried({
                      tried: card.tried,
                      line: `Review fix round ${round}/${LOOP_CAP}${counts ? `: ${counts}` : ''}`,
                  })
                : card.tried,
    }
}

const agentStarted = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'agent_started' }>
}): BoardState => {
    const { role, follow_up_of } = record.content
    return updateTicket({
        state,
        number: record.ticket,
        update: (card) => {
            const kind = startKind({ card, role, follow_up_of })
            if (
                kind === 'review_fix' ||
                (kind === 'resent' && card.open_check === 'review')
            ) {
                return reviewFixStarted({ card, role })
            }
            const fix_round =
                kind === 'fix' ? card.fix_round + 1 : card.fix_round
            const started = { ...card, started: true, role, fix_round }
            const tried =
                kind === 'fix' && card.open_check !== null
                    ? withTried({
                          tried: card.tried,
                          line: `Fix round ${fix_round}/${LOOP_CAP} after the ${OPEN_CHECK_TEXT[card.open_check]}`,
                      })
                    : card.tried
            const fixing = kind === 'fix' || kind === 'resent'
            if (role === 'test-writer') {
                // During a ticket review (a retried review fixer) the card
                // stays in Reviewing at its step.
                const reviewing = card.stage === 'reviewing'
                return {
                    ...started,
                    tried,
                    stage: reviewing ? 'reviewing' : 'building',
                    step: reviewing ? card.step : 0,
                    activity: fixing
                        ? `fixing tests (${fix_round}/${LOOP_CAP})`
                        : kind === 'retry'
                          ? 'writing tests again'
                          : 'writing tests',
                }
            }
            if (role === 'implementer') {
                return {
                    ...started,
                    tried,
                    stage:
                        card.stage === 'reviewing' ? 'reviewing' : 'building',
                    step: 2,
                    activity: fixing
                        ? `fixing (${fix_round}/${LOOP_CAP})`
                        : kind === 'retry'
                          ? 'coding again'
                          : 'coding',
                }
            }
            if (role === 'ticket-reviewer') {
                const retry = kind === 'retry'
                return {
                    ...started,
                    stage: 'reviewing',
                    step: 4,
                    open_check: retry ? card.open_check : null,
                    review_round: retry
                        ? Math.max(card.review_round, 1)
                        : card.review_round + 1,
                    activity: retry
                        ? 'reviewing again'
                        : card.review_fix_round > 0
                          ? 're-reviewing'
                          : 'reviewing',
                }
            }
            return { ...started, activity: role }
        },
    })
}

const agentFinished = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'agent_finished' }>
}): BoardState => {
    const { role, result } = record.content
    return updateTicket({
        state,
        number: record.ticket,
        update: (card) => {
            const wontFix = result.finding_responses.filter(
                ({ response }) => response === 'wont_fix'
            )
            const done = {
                ...card,
                role: null,
                failed_turn: null,
                tried: wontFix.reduce(
                    (tried, { finding_id, reason }) =>
                        withTried({
                            tried,
                            line: `Won't fix ${finding_id}: ${reason}`,
                        }),
                    card.tried
                ),
            }
            if (role === 'test-writer') {
                if (card.open_check === 'review') {
                    return { ...done, activity: 'test findings answered' }
                }
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
                const ruled = result.rulings.reduce(
                    (tried, { finding_id, ruling, reason }) =>
                        withTried({
                            tried,
                            line:
                                ruling === 'accepted'
                                    ? `Declined ${finding_id} accepted: ${reason}`
                                    : `${finding_id} still stands: ${reason}`,
                        }),
                    done.tried
                )
                return result.verdict === 'approve'
                    ? {
                          ...done,
                          step: ALL_STEPS_DONE,
                          findings,
                          open_check: null,
                          tried: ruled,
                          activity: 'approved',
                      }
                    : {
                          ...done,
                          findings,
                          open_check: 'review',
                          tried: ruled,
                          activity: 'changes requested',
                      }
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

/** What happened when a ticket was sent back onto the run branch, in words. */
export const rebasedText = ({
    content,
}: {
    content: Extract<BoardRecord, { kind: 'ticket_rebased' }>['content']
}): string => {
    if (content.cause === 'join_gates') {
        return 'The checks failed after joining; fixing on top of the run branch'
    }
    const files = [...content.tests, ...content.code]
    return files.length === 0
        ? 'Clashed with the run branch; fixing on top of it'
        : `Clashed with the run branch in ${files.join(', ')}`
}

/**
 * A ticket sent back onto the run branch builds again: its tests first if
 * test files clashed, else its code; then the checks and a fresh review,
 * whose fix rounds count from zero again.
 */
const ticketRebased = ({
    state,
    record,
}: {
    state: BoardState
    record: Extract<BoardRecord, { kind: 'ticket_rebased' }>
}): BoardState =>
    updateTicket({
        state,
        number: record.ticket,
        update: (card) => ({
            ...card,
            stage: 'building',
            step: record.content.tests.length > 0 ? 0 : 2,
            role: null,
            fix_round: 0,
            // The engine starts the ticket's review loop over on top of the
            // run branch: a fresh reviewer, fresh review fix rounds.
            review_fix_round: 0,
            findings: null,
            open_check: null,
            failed_turn: null,
            activity: 'fixing on the run branch',
            tried: withTried({
                tried: card.tried,
                line: rebasedText({ content: record.content }),
            }),
        }),
    })

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
    const { phase, engine_ended, stopped } = state.run
    if (phase === 'done' || phase === 'refused' || phase === 'nothing_to_do')
        return phase
    if (stopped) return 'stopped'
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
