/**
 * A ticket's own records in replay: its progress after each one, a rebase
 * onto the run branch, and a baseline reused from another ticket.
 */
import omit from 'lodash/omit'
import uniqBy from 'lodash/uniqBy'

import { assumptionsOf, sessionsAfter } from './agent-turn-replay'
import type { JournalRecord } from './journal-record'
import type { RunState } from './run-state'
import { EMPTY_TICKET_PROGRESS, type TicketProgress } from './ticket-progress'
import {
    alreadyDoneCheckedChange,
    bouncedBy,
    failedTryChange,
    resultChange,
    setupChangeOf,
} from './ticket-result-replay'
import { retriedChange } from './ticket-retry-replay'

type TicketRecord = Exclude<
    JournalRecord,
    {
        kind:
            | 'run_started'
            | 'intake_read'
            | 'intake_refused'
            | 'nothing_to_do'
            | 'spec_snapshot'
            | 'ticket_snapshot'
            | 'run_branch_created'
            | 'worktrees_removed'
            | 'changeset_written'
            | 'pull_request_opened'
            | 'jev_asked'
            | 'jev_answered'
            | 'jev_failed'
            | 'decision_model_off'
            | 'agent_session'
            | 'agent_session_closed'
            | 'run_stopped'
            | 'limit_wait_started'
            | 'limit_wait_ended'
            | 'usage_line_wait_started'
            | 'usage_line_wait_ended'
            | 'repo_wait_started'
            | 'repo_wait_ended'
            | 'repo_wait_skipped'
            | 'usage_recorded'
            | 'agent_message'
            | 'agent_message_delivered'
            | 'shared_git_changed'
            | 'chores_done'
            | 'changeset_dropped'
            | 'final_review_started'
            | 'lens_started'
            | 'lens_finished'
            | 'final_review_fixing'
            | 'final_review_stuck'
            | 'final_review_passed'
            | 'final_review_shipped'
            | 'comment_read'
            | 'run_stuck'
            | 'reply_ignored'
            | 'final_review_retried'
            | 'memory_recalled'
            | 'memories_saved'
            | 'learning_skipped'
            | 'memories_reported'
            | 'step_started'
            | 'step_ended'
            | 'run_resumed'
            | 'engine_resumed'
            | 'config_reloaded'
            | 'config_reload_refused'
            | 'join_started'
            | 'memory_write_started'
            | 'memory_write_done'
            | 'baseline_reused'
            | 'prepare_made'
    }
>

const progressChange = ({
    progress,
    record,
}: {
    progress: TicketProgress
    record: TicketRecord
}): Partial<TicketProgress> => {
    switch (record.kind) {
        case 'ticket_worktree_created':
            return { worktree: record.content }
        case 'dependencies_installed':
            return { install: { check: record.content.check } }
        case 'baseline_prepared':
            return { prepare: record.content.check }
        case 'baseline_tests':
            return {
                baseline: record.content,
                baseline_sha: progress.worktree?.base_sha ?? null,
            }
        case 'agent_started':
            return {
                retried: null,
                crashed_turn: null,
                launched_on: {
                    ...progress.launched_on,
                    [record.content.role]: record.content.model,
                },
            }
        case 'agent_finished': {
            const finished = record.content
            return {
                setup_change: setupChangeOf({ finished }),
                agent_failure: null,
                engine_failures: 0,
                sessions: sessionsAfter({
                    sessions: progress.sessions,
                    role: finished.role,
                    session_id: finished.session_id,
                }),
                assumptions: [
                    ...progress.assumptions,
                    ...assumptionsOf(finished),
                ],
                // Only a new `environment` answer opens another rerun.
                environment: null,
                ...resultChange({ progress, finished, seq: record.seq }),
            }
        }
        case 'agent_failed': {
            const { role, error, failure, session_id } = record.content
            const agent_failure = { role, error, failure, session_id }
            if (failure === 'engine') {
                return {
                    agent_failure,
                    engine_failures: progress.engine_failures + 1,
                }
            }
            // The engine's side worked this time, so the run of engine
            // failures is over.
            return {
                agent_failure,
                engine_failures: 0,
                ...failedTryChange({ progress, role }),
            }
        }
        case 'red_check': {
            const { ok, problems, notes, tests } = record.content
            const red_check = { ok, problems, notes, output: tests.output }
            if (!ok) return { red_check }
            // The tests it proved fail first, for the PR's Evidence (#513).
            const red_tests = uniqBy(
                (progress.test_writer?.criteria ?? []).flatMap(
                    (criterion) => criterion.tests
                ),
                ({ file, name }) => `${file}\u0000${name}`
            )
            return { red_check, red_tests }
        }
        case 'already_done_checked':
            return alreadyDoneCheckedChange({
                progress,
                checked: record.content,
            })
        case 'worktree_reset':
            // A fresh test-writer and implementer start over on a clean
            // worktree; the bad test and its count stay. A reset that carries
            // a bad test is the engine's own finding (#581): it sets the bad
            // test and counts as a bounce, with the engine as its source.
            return {
                ...(record.content.bad_test === undefined
                    ? {}
                    : {
                          bad_test: record.content.bad_test,
                          bad_test_source: 'engine',
                          bad_test_sources: bouncedBy({
                              progress,
                              by: 'engine',
                          }),
                          bad_test_bounces: progress.bad_test_bounces + 1,
                      }),
                test_writer: null,
                red_check: null,
                red_tests: [],
                red_fix_rounds: 0,
                implementer: null,
                gates: null,
                gate_fix_rounds: 0,
                environment: null,
                leftovers: { red: null, green: null, fix: null },
                commits: { ...progress.commits, red: null },
                sessions: omit(progress.sessions, [
                    'test-writer',
                    'implementer',
                ]),
            }
        case 'leftover_scan':
            return {
                leftovers: {
                    ...progress.leftovers,
                    [record.content.stage]: record.content.hits,
                },
            }
        case 'commit_made':
            return {
                commits: {
                    ...progress.commits,
                    [record.content.stage]: record.content.sha,
                },
                commit_files: {
                    ...progress.commit_files,
                    [record.content.stage]: record.content.files,
                },
            }
        case 'gates_run': {
            const { ok, checks, cases } = record.content
            // Only a ticket's own gates keep their cases (#581).
            return record.content.target === 'ticket'
                ? {
                      gates: {
                          ok,
                          checks,
                          ...(cases === undefined ? {} : { cases }),
                      },
                  }
                : { join_gates: { ok, checks } }
        }
        case 'ticket_joined':
            return { joined: record.content }
        case 'ticket_rebased':
            return rebasedChange({ progress, rebased: record.content })
        case 'tests_sent_back':
            return {
                test_updates: progress.test_updates + 1,
                test_update: { ...record.content, result: null },
            }
        case 'run_branch_pushed':
            return { pushed: record.content.sha }
        case 'ticket_stuck':
            return { stuck: record.content, stuck_report: null, reply: null }
        case 'stuck_reported':
            return { stuck_report: { comment_id: record.content.comment_id } }
        case 'reply_received': {
            const { word, comment_id } = record.content
            // `stop` is the run's, and `ship` the final review's.
            return word === 'retry' || word === 'skip'
                ? { reply: { word, comment_id } }
                : {}
        }
        case 'ticket_retried':
            return retriedChange({ progress, retried: record.content })
        case 'ticket_skipped':
            return {
                skipped: { because: record.content.because },
                reply: null,
            }
        case 'ticket_already_done':
            return { already_done: { shas: record.content.shas } }
        case 'ticket_closed':
            return { closed: true }
        case 'join_undone':
            return { joined: null, join_gates: null }
    }
}

type RebasedContent = Extract<
    JournalRecord,
    { kind: 'ticket_rebased' }
>['content']

/**
 * A ticket sent back onto the run branch: its change now sits uncommitted on
 * the run branch's tip. Its tests and code are fixed there, then the gates,
 * one green commit, a fresh review of the new changes (with its own fix
 * rounds), and a new join. The review loop starts over, but its nits and
 * declined findings stay for the PR. The implementer keeps its session; the
 * test-writer and reviewer start fresh. A worktree whose dependencies moved
 * under it is installed again.
 */
const rebasedChange = ({
    progress,
    rebased,
}: {
    progress: TicketProgress
    rebased: RebasedContent
}): Partial<TicketProgress> => {
    const { cause, base_sha, tests, code, reinstall } = rebased
    return {
        worktree:
            progress.worktree === null
                ? null
                : { ...progress.worktree, base_sha },
        install: reinstall ? null : progress.install,
        rejoins: progress.rejoins + 1,
        rejoin: {
            cause,
            base_sha,
            tests,
            code,
            tests_pending: tests.length > 0,
            code_pending: code.length > 0,
            from_sha: progress.worktree?.base_sha ?? base_sha,
            earlier_findings: [
                ...(progress.review?.findings ?? []),
                ...progress.declined.map(({ finding }) => finding),
            ],
        },
        gates: null,
        gate_fix_rounds: 0,
        leftovers: { ...progress.leftovers, green: null, fix: null },
        commits: { ...progress.commits, green: null, fix: null },
        commit_files: { ...progress.commit_files, green: [], fix: [] },
        review: null,
        review_rounds: 0,
        reviewed_sha: null,
        review_fix: null,
        approved_seq: null,
        joined: null,
        join_gates: null,
        pushed: null,
        agent_failure: null,
        engine_failures: 0,
        sessions: omit(progress.sessions, ['test-writer', 'ticket-reviewer']),
    }
}

export const applyTicketRecord = ({
    state,
    record,
}: {
    state: RunState
    record: TicketRecord
}): RunState => {
    if (record.ticket === null) return state
    const progress = state.tickets[record.ticket] ?? EMPTY_TICKET_PROGRESS
    return {
        ...state,
        tickets: {
            ...state.tickets,
            [record.ticket]: {
                ...progress,
                ...progressChange({ progress, record }),
            },
        },
    }
}

/**
 * A ticket took another ticket's baseline, as it stood when the reuse was
 * journaled, so a replay gives it the same one.
 */
export const reusedBaselineAfter = ({
    state,
    record,
}: {
    state: RunState
    record: Extract<JournalRecord, { kind: 'baseline_reused' }>
}): RunState => {
    if (record.ticket === null) return state
    const { from_ticket, base_sha } = record.content
    const baseline = state.tickets[from_ticket]?.baseline ?? null
    if (baseline === null) return state
    const progress = state.tickets[record.ticket] ?? EMPTY_TICKET_PROGRESS
    return {
        ...state,
        tickets: {
            ...state.tickets,
            [record.ticket]: { ...progress, baseline, baseline_sha: base_sha },
        },
    }
}
