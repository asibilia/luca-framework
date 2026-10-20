import uniq from 'lodash/uniq'

import {
    closedSessionAfter,
    resumedAfter,
    undoneJoinsAfter,
} from './cross-ticket-replay'
import {
    finalRecordOf,
    finalRepliesAfter,
    finalReviewAfter,
    omitFinalKeys,
    resumedFinalReview,
} from './final-review-replay'
import type { JournalRecord } from './journal-record'
import { EMPTY_MEMORY, learnerAfter, learnerRecordOf } from './memory-replay'
import { planAfter } from './plan-replay'
import {
    replyReceivedAfter,
    stuckReportedAfter,
    ticketRetriedAfter,
} from './reply-replay'
import {
    EMPTY_STATE,
    engineCommentsAfter,
    notesAfter,
    snapshotPhase,
    type RunState,
} from './run-state'
import { sharedFailuresAfter } from './shared-failure-replay'
import { crashesAfter } from './step-records'
import { applyTicketRecord, reusedBaselineAfter } from './ticket-replay'

import { withConfigChanges } from '../config/config-reload'

export type {
    OldTestFailure,
    RunBudgetState,
    ReplayedComment,
    ReplayedPullRequest,
    ReplayedRunNote,
    ReplayedSnapshot,
    RunPhase,
    RunState,
} from './run-state'
export type {
    DeclinedFinding,
    EnvironmentRerun,
    ReplayedGates,
    ReplayedInstall,
    ReplayedRedCheck,
    ReplayedRejoin,
    ReplayedStuck,
    ReplayedWorktree,
    ReviewFix,
    TestUpdate,
    TicketProgress,
    WriterRole,
} from './ticket-progress'
export { EMPTY_TICKET_PROGRESS } from './ticket-progress'
export type {
    FinalDeclined,
    FinalFinding,
    FinalReviewFix,
    FinalReviewState,
    ReplayedAgentFailure,
    RuleFile,
} from './final-review-state'
export { EMPTY_FINAL_REVIEW } from './final-review-state'
export type { PlanState } from './plan-replay'
export type { LearnerState, MemoryState } from './memory-replay'
export { EMPTY_MEMORY } from './memory-replay'
export { namespacedId } from './final-review-round'
export { isFinalKey } from './final-review-replay'
export { handoffRole } from './agent-turn-replay'

const applyRecord = ({
    state,
    record,
}: {
    state: RunState
    record: JournalRecord
}): RunState => {
    const base = {
        ...state,
        last_seq: record.seq,
        crashes: crashesAfter({ crashes: state.crashes, record }),
    }
    const next =
        record.kind === 'gates_run' && record.content.target === 'run_branch'
            ? {
                  ...base,
                  run_branch_gates: {
                      ok: record.content.ok,
                      checks: record.content.checks,
                  },
              }
            : base
    const learnerRecord = learnerRecordOf({ record })
    if (learnerRecord !== null) {
        const memory = {
            ...state.memory,
            learner: learnerAfter({
                learner: state.memory.learner,
                record: learnerRecord,
            }),
        }
        // A session's readings still count for the plan.
        return learnerRecord.kind === 'agent_session'
            ? {
                  ...next,
                  memory,
                  plan: planAfter({ plan: state.plan, record: learnerRecord }),
              }
            : { ...next, memory }
    }
    const finalRecord = finalRecordOf({ state, record })
    if (finalRecord !== null) {
        const replies = finalRepliesAfter({ state, record })
        const final_review = finalReviewAfter({
            review: state.final_review,
            record: finalRecord,
        })
        // A session's readings still count for the plan.
        return record.kind === 'agent_session'
            ? {
                  ...next,
                  ...replies,
                  final_review,
                  plan: planAfter({ plan: state.plan, record }),
              }
            : { ...next, ...replies, final_review }
    }
    switch (record.kind) {
        case 'run_started': {
            const { memory } = record.content
            return {
                ...next,
                phase: 'started',
                spec_number: record.content.spec_number,
                config: record.content.config,
                base_branch: record.content.base_branch,
                memory: {
                    ...EMPTY_MEMORY,
                    on: memory !== null,
                    project_vault: memory?.project_vault ?? null,
                },
            }
        }
        case 'memory_recalled': {
            const { point, key, memories } = record.content
            return {
                ...next,
                memory: {
                    ...state.memory,
                    recalls: {
                        ...state.memory.recalls,
                        [key]: { point, memories },
                    },
                    shown: [...state.memory.shown, ...memories],
                },
            }
        }
        case 'memories_saved':
            return {
                ...next,
                memory: { ...state.memory, saved: record.content },
            }
        case 'learning_skipped':
            return {
                ...next,
                memory: {
                    ...state.memory,
                    learner: {
                        ...state.memory.learner,
                        skipped: record.content.reason,
                    },
                },
            }
        case 'memories_reported':
            return {
                ...next,
                memory: { ...state.memory, reported: true },
                engine_comments: engineCommentsAfter({
                    state,
                    comment_id: record.content.comment_id,
                }),
            }
        case 'intake_read':
            return { ...next, phase: 'intake_read', intake: record.content }
        case 'intake_refused':
            return {
                ...next,
                phase: 'refused',
                problems: record.content.problems,
            }
        case 'nothing_to_do':
            return { ...next, phase: 'nothing_to_do' }
        case 'spec_snapshot': {
            const snapshot = {
                spec: record.content.spec,
                ticket_order: record.content.ticket_order,
                closed_tickets: record.content.closed_tickets,
                tickets: {},
                left_out: record.content.left_out,
            }
            return { ...next, snapshot, phase: snapshotPhase({ snapshot }) }
        }
        case 'ticket_snapshot': {
            if (state.snapshot === null) return next
            const snapshot = {
                ...state.snapshot,
                tickets: {
                    ...state.snapshot.tickets,
                    [record.content.number]: record.content,
                },
            }
            return { ...next, snapshot, phase: snapshotPhase({ snapshot }) }
        }
        case 'run_branch_created': {
            const { branch, path, base_sha, changesets } = record.content
            return {
                ...next,
                run_branch: { branch, path, base_sha },
                changesets,
            }
        }
        case 'changeset_written':
            return {
                ...next,
                changeset: {
                    path: record.content.path,
                    sha: record.content.sha,
                },
            }
        case 'baseline_reused':
            return reusedBaselineAfter({ state: next, record })
        case 'dependencies_installed':
            if (record.content.target === 'run_branch') {
                return {
                    ...next,
                    run_branch_install: { check: record.content.check },
                }
            }
            return applyTicketRecord({ state: next, record })
        case 'worktrees_removed':
            return {
                ...next,
                removed_worktrees: uniq([
                    ...state.removed_worktrees,
                    ...record.content.paths,
                ]),
            }
        case 'pull_request_opened':
            return {
                ...next,
                pull_request: {
                    number: record.content.number,
                    url: record.content.url,
                },
            }
        // The decision model's shadow-mode records change nothing: the
        // engine ignores them.
        case 'jev_asked':
        case 'jev_answered':
        case 'jev_failed':
        case 'decision_model_off':
            return next
        // A session's readings and the stops and limit waits change no
        // ticket: the step they cut off is picked up again afterwards.
        case 'agent_session':
        case 'limit_wait_started':
        case 'limit_wait_ended':
        case 'usage_line_wait_started':
        case 'usage_line_wait_ended':
            return { ...next, plan: planAfter({ plan: state.plan, record }) }
        case 'repo_wait_started':
            return {
                ...next,
                repo_wait: { status: 'waiting', since: record.time },
            }
        case 'repo_wait_ended':
            return {
                ...next,
                repo_wait: { ...state.repo_wait, status: 'ended' },
            }
        case 'repo_wait_skipped':
            return {
                ...next,
                repo_wait: { ...state.repo_wait, status: 'skipped' },
            }
        case 'run_stopped':
            return {
                ...next,
                plan: planAfter({ plan: state.plan, record }),
                crash_stopped: record.content.crashed
                    ? { reason: record.content.reason }
                    : state.crash_stopped,
            }
        // The crash counts (see `crashesAfter`) are all a step record changes.
        case 'step_started':
        case 'step_ended':
            return next
        // A wait between steps changes no step: only the board reads it.
        case 'ticket_waiting':
            return next
        // Only a join's redo reads it (see `openJoin`).
        case 'join_started':
            return next
        // Only a redo of `save_memories` reads them (see `execute-memory.ts`).
        case 'memory_write_started':
        case 'memory_write_done':
            return next
        case 'run_resumed':
            return resumedAfter({ state: next, record })
        // Luca's version on a resume changes no step: only the board reads it.
        case 'engine_resumed':
            return next
        // A resume's new build fields (#516): every later step uses them.
        case 'config_reloaded':
            return {
                ...next,
                config:
                    state.config === null
                        ? null
                        : withConfigChanges({
                              config: state.config,
                              changes: record.content.changes,
                          }),
            }
        // The run kept its config; only the board and the log read why.
        case 'config_reload_refused':
            return next
        // A failing `ps` changes no step: the wait goes on (#624).
        case 'repo_wait_ps_failed':
            return next
        case 'comment_read':
            return { ...next, comments: [...state.comments, record.content] }
        case 'run_stuck':
            return {
                ...next,
                run_budget: {
                    ...state.run_budget,
                    stuck: record.content,
                    report: null,
                },
            }
        case 'reply_ignored': {
            const { comment_id, answer_id } = record.content
            return {
                ...next,
                handled_comments: [...state.handled_comments, comment_id],
                engine_comments: engineCommentsAfter({
                    state,
                    comment_id: answer_id,
                }),
            }
        }
        case 'final_review_retried':
            return {
                ...next,
                crashes: omitFinalKeys({ crashes: next.crashes }),
                final_stuck_report: null,
                final_reply: null,
                final_review: resumedFinalReview({
                    review: state.final_review,
                }),
            }
        case 'reply_received':
            return replyReceivedAfter({ state, next, record })
        case 'stuck_reported':
            return stuckReportedAfter({ state, next, record })
        // Its note on the spec issue is the engine's own, never a reply.
        case 'ticket_already_done':
            return applyTicketRecord({
                state: {
                    ...next,
                    engine_comments: engineCommentsAfter({
                        state,
                        comment_id: record.content.comment_id,
                    }),
                },
                record,
            })
        case 'ticket_retried':
            return ticketRetriedAfter({ state, next, record })
        case 'usage_recorded': {
            const { scope, ticket } = record.content
            const { tickets, run } = state.usage_recorded
            return {
                ...next,
                usage_recorded:
                    scope === 'run' || ticket === null
                        ? { tickets, run: true }
                        : {
                              tickets: { ...tickets, [ticket]: record.seq },
                              run,
                          },
            }
        }
        // Agent messages change no ticket's progress; the message rules
        // read them from the records themselves.
        case 'agent_message':
        case 'agent_message_delivered':
            return next
        // Others' changes to the shared .git: noted, never acted on.
        case 'shared_git_changed':
            return next
        // A writer's chores (#618): noted; one the engine could not do is
        // the `agent_failed` after it.
        case 'chores_done':
            return next
        // An agent's changeset the engine removed: noted, never acted on.
        case 'changeset_dropped':
            return next
        case 'prepare_made':
            return {
                ...next,
                prepare_made: uniq([
                    ...state.prepare_made,
                    ...record.content.paths,
                ]),
            }
        case 'agent_session_closed':
            return closedSessionAfter({
                state: next,
                session_id: record.content.session_id,
            })
        case 'agent_finished':
            return applyTicketRecord({
                state: { ...next, run_notes: notesAfter({ state, record }) },
                record,
            })
        // A ticket's checks also keep the run's old-test failures (#544).
        case 'red_check':
        case 'gates_run':
            return sharedFailuresAfter({
                state: applyTicketRecord({ state: next, record }),
                record,
            })
        case 'join_undone':
            return undoneJoinsAfter({
                state: applyTicketRecord({ state: next, record }),
                ticket: record.ticket,
                shas: record.content.shas,
            })
        case 'ticket_rebased':
            return undoneJoinsAfter({
                state: applyTicketRecord({ state: next, record }),
                ticket: record.ticket,
                shas: record.content.undone,
            })
        // Always the final review's (see `finalRecordOf`).
        case 'final_review_started':
        case 'lens_started':
        case 'lens_finished':
        case 'final_review_fixing':
        case 'final_review_stuck':
        case 'final_review_passed':
        case 'final_review_shipped':
            return next
        default:
            return applyTicketRecord({ state: next, record })
    }
}

/**
 * Rebuilds a run's state purely from its journal records, in order.
 *
 * @example
 * const state = replayRun({ records: journal.read() })
 * if (state.phase === 'refused') console.log(state.problems)
 */
export const replayRun = ({
    records,
}: {
    records: JournalRecord[]
}): RunState =>
    records.reduce(
        (state, record) => applyRecord({ state, record }),
        EMPTY_STATE
    )
