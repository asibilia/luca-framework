/**
 * The final review's records in replay: which records are the final
 * review's, its state after each, its stuck report and reply, and its
 * `retry`.
 */
import omit from 'lodash/omit'

import { assumptionsOf, isFixerRole, sessionsAfter } from './agent-turn-replay'
import { finalResultChange, roundDone, settleRound } from './final-review-round'
import type { FinalReviewState } from './final-review-state'
import type { JournalRecord } from './journal-record'
import type { RunState } from './run-state'
import type { CrashCounts } from './step-records'

/** The final review's own kinds, and the kinds it shares with tickets. */
type FinalRecord = Extract<
    JournalRecord,
    {
        kind:
            | 'final_review_started'
            | 'lens_started'
            | 'lens_finished'
            | 'final_review_fixing'
            | 'final_review_stuck'
            | 'final_review_passed'
            | 'final_review_shipped'
            | 'agent_started'
            | 'agent_finished'
            | 'agent_failed'
            | 'agent_session'
            | 'gates_run'
            | 'leftover_scan'
            | 'commit_made'
            | 'run_branch_pushed'
    }
>

const FINAL_KINDS = new Set<JournalRecord['kind']>([
    'final_review_started',
    'lens_started',
    'lens_finished',
    'final_review_fixing',
    'final_review_stuck',
    'final_review_passed',
    'final_review_shipped',
])

/** Kinds tickets journal too; ticket-less ones are the final review's once it started. */
const SHARED_KINDS = new Set<JournalRecord['kind']>([
    'agent_started',
    'agent_finished',
    'agent_failed',
    'agent_session',
    'gates_run',
    'leftover_scan',
    'commit_made',
    'run_branch_pushed',
])

/**
 * The record if it is the final review's, else `null`: one of its own
 * kinds, or a ticket-less agent, gate, scan, commit, or push record once
 * the final review started. Before that, ticket-less records keep their old
 * meaning (such as the run branch's gates after a join).
 */
export const finalRecordOf = ({
    state,
    record,
}: {
    state: RunState
    record: JournalRecord
}): FinalRecord | null => {
    const mine =
        FINAL_KINDS.has(record.kind) ||
        (record.ticket === null &&
            state.final_review.round > 0 &&
            SHARED_KINDS.has(record.kind))
    return mine ? (record as FinalRecord) : null
}

/** The final review after one of its records. */
export const finalReviewAfter = ({
    review,
    record,
}: {
    review: FinalReviewState
    record: FinalRecord
}): FinalReviewState => {
    switch (record.kind) {
        case 'final_review_started': {
            const { round, from_sha, head_sha, lenses, files, rules } =
                record.content
            return {
                ...review,
                round,
                from_sha,
                head_sha,
                files,
                lenses_due: lenses,
                rules,
                results: {},
                slow_due: record.content.slow_due ?? false,
                slow_tests: null,
            }
        }
        case 'agent_started':
            return isFixerRole(record.content.role)
                ? { ...review, crashed_turn: null }
                : review
        case 'lens_started':
        case 'lens_finished':
        case 'agent_session':
            return review
        case 'final_review_fixing':
            return review.fix !== null &&
                record.content.round === review.fix.round
                ? { ...review, fixing_started: true }
                : review
        case 'final_review_stuck':
            return { ...review, stuck: record.content }
        case 'final_review_passed':
            return { ...review, passed: true }
        case 'final_review_shipped':
            return review.stuck === null
                ? review
                : {
                      ...review,
                      shipped: true,
                      shipped_edits: record.content.commit ?? null,
                  }
        case 'agent_finished': {
            const finished = record.content
            const { role } = finished
            return finalResultChange({
                review: {
                    ...review,
                    agent_failures: omit(review.agent_failures, role),
                    engine_failures: omit(review.engine_failures, role),
                    sessions: sessionsAfter({
                        sessions: review.sessions,
                        role,
                        session_id: finished.session_id,
                    }),
                    assumptions: [
                        ...review.assumptions,
                        ...assumptionsOf(finished),
                    ],
                    // Only a new `environment` answer opens another rerun.
                    environment: null,
                },
                finished,
            })
        }
        case 'agent_failed': {
            const { role, error, failure, session_id } = record.content
            const agent_failures = {
                ...review.agent_failures,
                [role]: { role, error, failure, session_id },
            }
            if (failure === 'engine') {
                return {
                    ...review,
                    agent_failures,
                    engine_failures: {
                        ...review.engine_failures,
                        [role]: (review.engine_failures[role] ?? 0) + 1,
                    },
                }
            }
            return {
                ...review,
                agent_failures,
                engine_failures: omit(review.engine_failures, role),
                failed_tries: {
                    ...review.failed_tries,
                    [role]: (review.failed_tries[role] ?? 0) + 1,
                },
            }
        }
        case 'gates_run': {
            const { ok, checks, target } = record.content
            // Round 1's slow tests (#563): not the fix round's gates.
            if (target === 'final_slow') {
                const next = { ...review, slow_tests: { ok, checks } }
                // They run once the lenses are in, so they settle the round;
                // a run no round was waiting for settles none.
                const awaited = review.slow_due && review.slow_tests === null
                return awaited && roundDone({ review: next })
                    ? settleRound({ review: next })
                    : next
            }
            return { ...review, gates: { ok, checks } }
        }
        case 'leftover_scan':
            return { ...review, leftovers: record.content.hits }
        case 'commit_made':
            return {
                ...review,
                commit: {
                    sha: record.content.sha,
                    files: record.content.files,
                },
            }
        case 'run_branch_pushed':
            return { ...review, pushed: record.content.sha }
    }
}

/**
 * The final review's report and reply after one of its records: a new
 * stuck is told afresh, and a ship settles the reply.
 */
export const finalRepliesAfter = ({
    state,
    record,
}: {
    state: RunState
    record: JournalRecord
}): Pick<RunState, 'final_stuck_report' | 'final_reply'> => {
    switch (record.kind) {
        case 'final_review_stuck':
            return { final_stuck_report: null, final_reply: null }
        case 'final_review_shipped':
            return {
                final_stuck_report: state.final_stuck_report,
                final_reply: null,
            }
        default:
            return {
                final_stuck_report: state.final_stuck_report,
                final_reply: state.final_reply,
            }
    }
}

/**
 * The stuck final review resumed by `retry`, like a resumed ticket: fresh
 * fixers (no session kept) and fresh counts, and the owner's edits in the
 * run branch's worktree kept. A leftover scan, failed gates (or gates an
 * `environment` answer blamed), or a step crashes cut off just run again; a failed lens gets a fresh one; otherwise the open fix round
 * starts over as round 1, so the fixes (and the owner's edits) are gated,
 * committed, pushed, and re-reviewed.
 */
export const resumedFinalReview = ({
    review,
}: {
    review: FinalReviewState
}): FinalReviewState => {
    const base: FinalReviewState = {
        ...review,
        stuck: null,
        shipped: false,
        sessions: {},
        agent_failures: {},
        failed_tries: {},
        engine_failures: {},
        gate_fix_rounds: 0,
        setup_change: null,
        environment_reruns: 0,
        environment: null,
        gates: review.commit === null ? null : review.gates,
        leftovers: review.commit === null ? null : review.leftovers,
    }
    const { fix, stuck } = review
    if (
        fix === null ||
        stuck?.reason === 'leftovers_found' ||
        stuck?.reason === 'gates_failed' ||
        stuck?.reason === 'environment_failed' ||
        stuck?.reason === 'agent_failed' ||
        stuck?.reason === 'crashed'
    ) {
        return base
    }
    return {
        ...base,
        round: 1,
        fix: {
            ...fix,
            round: 1,
            tests_answered: !fix.findings.some(({ kind }) => kind === 'test'),
            code_answered: !fix.findings.some(({ kind }) => kind === 'code'),
            responses: [],
            bad_test: null,
        },
        fixing_started: false,
        commit: null,
        pushed: null,
    }
}

/** The final review's scheduler keys: `final`, and `lens:<lens>`. */
export const isFinalKey = (key: string): boolean =>
    key === 'final' || key.startsWith('lens:')

/** The crash counts without the final review's keys, for its `retry`. */
export const omitFinalKeys = ({
    crashes,
}: {
    crashes: CrashCounts
}): CrashCounts =>
    Object.fromEntries(
        Object.entries(crashes).filter(([key]) => !isFinalKey(key))
    )
