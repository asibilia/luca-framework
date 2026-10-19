/**
 * A new board's starting shapes: the board before any record, and a ticket's
 * card when its snapshot first arrives.
 */
import {
    DEFAULT_RUN_BUDGET_TOKENS,
    LENS_NAMES,
    NO_MEMORY,
    USAGE_LABEL,
    type BoardState,
    type FindingCounts,
    type LensCard,
    type TicketCard,
} from '../shared/board-state'

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
        started_on: null,
        version_note: null,
        spec_author: null,
        spec_repo: null,
    },
    for_a_person: [],
    usage: null,
    usage_label: USAGE_LABEL,
    run_tokens: 0,
    run_budget_tokens: DEFAULT_RUN_BUDGET_TOKENS,
    run_budget_each: DEFAULT_RUN_BUDGET_TOKENS,
    limit_wait: null,
    usage_line_wait: null,
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
    messages: { sent: 0, refused: 0, delivered: 0 },
    memory: NO_MEMORY,
    shared_git_changed: 0,
    run_steps: [],
    current_step: null,
    event_count: 0,
    latest: null,
})

export const newTicket = ({
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
    current_step: null,
    fix_round: 0,
    review_round: 0,
    review_fix_round: 0,
    open_check: null,
    failed_turn: null,
    tests: null,
    baseline_tests: null,
    findings: null,
    tokens: 0,
    agent_tokens: {},
    tried: [],
    plan_used: [],
})
