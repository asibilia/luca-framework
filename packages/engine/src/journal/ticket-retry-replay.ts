/**
 * A stuck ticket's `retry` in replay: refused, restarted from scratch, or
 * resumed where it stopped with a fresh agent and fresh counts.
 */
import type { JournalRecord } from './journal-record'
import { EMPTY_TICKET_PROGRESS, type TicketProgress } from './ticket-progress'

type RetriedContent = Extract<
    JournalRecord,
    { kind: 'ticket_retried' }
>['content']

/**
 * A `retry` of a stuck ticket. `refused` leaves it stuck, waiting for the
 * next reply. `restart` starts it over from scratch (its new snapshot was
 * journaled just before), in its worktree reset to the run branch's tip.
 * `resume` picks up where it stopped (see `resumedProgress`).
 */
export const retriedChange = ({
    progress,
    retried,
}: {
    progress: TicketProgress
    retried: RetriedContent
}): Partial<TicketProgress> => {
    switch (retried.mode) {
        case 'refused':
            return { reply: null }
        case 'restart':
            return {
                ...EMPTY_TICKET_PROGRESS,
                worktree:
                    progress.worktree === null || retried.base_sha === null
                        ? progress.worktree
                        : { ...progress.worktree, base_sha: retried.base_sha },
            }
        case 'resume':
            return resumedProgress({ progress })
    }
}

/**
 * A stuck ticket resumed by `retry`: it picks up where it stopped, with a
 * fresh agent (no session is kept) and fresh counts (fix rounds, failed
 * tries, bad-test bounces, rebases, test updates), and keeps whatever the
 * user changed in its worktree. An open test update is dropped. The step that got stuck runs again:
 * - before the red commit, a fresh test-writer writes the tests;
 * - before the green commit, a fresh implementer builds (on top of the run
 *   branch after a rebase), then the gates;
 * - in a review fix round, the round starts over as round 1 with fresh
 *   fixers, so the user's changes are gated, committed, and re-reviewed;
 * - a leftover scan, a failed install, a failed prepare command at the
 *   baseline, a reviewer's failed tries, a failed join, a refused undo of
 *   its join (#519), or a step crashes cut off just run again.
 */
const resumedProgress = ({
    progress,
}: {
    progress: TicketProgress
}): Partial<TicketProgress> => {
    const { stuck, commits, review_fix, rejoin } = progress
    const base: Partial<TicketProgress> = {
        stuck: null,
        stuck_report: null,
        reply: null,
        retried: stuck,
        setup_change: null,
        agent_failure: null,
        failed_tries: {},
        engine_failures: 0,
        sessions: {},
        red_fix_rounds: 0,
        gate_fix_rounds: 0,
        bad_test_bounces: 0,
        bad_test_sources: [],
        rejoins: 0,
        test_updates: 0,
        test_update: null,
        install:
            progress.install?.check?.ok === false ? null : progress.install,
        prepare: progress.prepare?.ok === false ? null : progress.prepare,
        leftovers: {
            red: commits.red === null ? null : progress.leftovers.red,
            green: commits.green === null ? null : progress.leftovers.green,
            fix: commits.fix === null ? null : progress.leftovers.fix,
        },
    }
    const reason = stuck?.reason
    const reviewerFailed = progress.agent_failure?.role === 'ticket-reviewer'
    if (
        reason === 'leftovers_found' ||
        reason === 'install_failed' ||
        reason === 'prepare_failed' ||
        reason === 'join_failed' ||
        reason === 'join_gates_failed' ||
        reason === 'undo_refused' ||
        reason === 'crashed' ||
        reviewerFailed
    ) {
        return base
    }
    if (commits.green === null) {
        if (
            rejoin === null &&
            commits.red === null &&
            progress.test_writer !== null
        ) {
            return {
                ...base,
                test_writer: null,
                red_check: null,
                red_tests: [],
                already_done_check: null,
            }
        }
        return { ...base, implementer: null, gates: null }
    }
    if (review_fix === null) return base
    return {
        ...base,
        review_rounds: 1,
        review_fix: {
            ...review_fix,
            round: 1,
            tests_answered: !review_fix.findings.some(
                ({ kind }) => kind === 'test'
            ),
            code_answered: !review_fix.findings.some(
                ({ kind }) => kind === 'code'
            ),
            responses: [],
            bad_test: null,
        },
        gates: null,
        leftovers: { ...base.leftovers!, fix: null },
        commits: { ...commits, fix: null },
        commit_files: { ...progress.commit_files, fix: [] },
    }
}
