/**
 * Where an agent's answer goes in its ticket's progress: a finished agent's
 * result (fix rounds, bad tests, ticket reviews), the test setup change it
 * asked for, and the engine's check of `already_done` evidence.
 */
import {
    badTestOf,
    declinedBy,
    fixerAnswered,
    handoffAnswered,
    handoffRole,
    ranCheaper,
    type FinishedContent,
} from './agent-turn-replay'
import type { JournalRecord } from './journal-record'
import type { TicketProgress } from './ticket-progress'

import {
    isBlocking,
    type AgentRole,
    type BadTestSource,
    type TicketReviewResult,
} from '../agents/role-results'

/**
 * A failed try for `role` on its ticket: one more of its tries used up,
 * and, if its agent ran on a model cheaper than Opus, its later fresh
 * agents on the ticket step up to Opus (#604). Engine failures are no try.
 */
export const failedTryChange = ({
    progress,
    role,
}: {
    progress: TicketProgress
    role: AgentRole
}): Pick<TicketProgress, 'failed_tries' | 'failed_cheaper'> => ({
    failed_tries: {
        ...progress.failed_tries,
        [role]: (progress.failed_tries[role] ?? 0) + 1,
    },
    failed_cheaper:
        ranCheaper(progress.launched_on[role]) &&
        !progress.failed_cheaper.includes(role)
            ? [...progress.failed_cheaper, role]
            : progress.failed_cheaper,
})

/**
 * The bounce sources once `by` sends one more test back as bad (#581), each
 * kept in order so a stuck detail can name who sent the first and who the
 * second. They go together with `bad_test_bounces`.
 */
export const bouncedBy = ({
    progress,
    by,
}: {
    progress: TicketProgress
    by: BadTestSource
}): BadTestSource[] => [...progress.bad_test_sources, by]

/**
 * Where a finished agent's result goes in its ticket's progress. A result
 * that answers a fix-loop follow-up counts a round and clears the failed
 * check, so it runs again.
 */
export const resultChange = ({
    progress,
    finished,
    seq,
}: {
    progress: TicketProgress
    finished: FinishedContent
    seq: number
}): Partial<TicketProgress> => {
    const fix = progress.review_fix
    const { rejoin, test_update, refactor_update } = progress
    switch (finished.role) {
        case 'test-writer':
            // The test-writer's answer to a refactor test update (#686): no
            // red check, and its mapping is not checked.
            if (refactor_update !== null && refactor_update.result === null) {
                return {
                    refactor_update: {
                        ...refactor_update,
                        result: finished.result,
                    },
                }
            }
            // The test-writer's answer to a test update after a rebase: the
            // red check stands, as for clashed tests (#489).
            if (test_update !== null && test_update.result === null) {
                return {
                    test_update: { ...test_update, result: finished.result },
                }
            }
            // The fresh test-writer after a rebase fixed the clashed tests:
            // no fix round, and the red check stands.
            if (rejoin?.tests_pending) {
                return { rejoin: { ...rejoin, tests_pending: false } }
            }
            if (fix !== null && !fix.tests_answered) {
                return {
                    review_fix: {
                        ...fix,
                        tests_answered: true,
                        ...fixerAnswered({
                            fix,
                            role: 'test-writer',
                            responses: finished.result.finding_responses,
                        }),
                    },
                }
            }
            if (fix !== null && handoffRole({ fix }) === 'test-writer') {
                return {
                    review_fix: {
                        ...fix,
                        ...handoffAnswered({
                            fix,
                            role: 'test-writer',
                            responses: finished.result.finding_responses,
                        }),
                    },
                }
            }
            // An `environment` answer to a failed red check reruns it with
            // the earlier tests, using no fix round (#613).
            if (
                finished.result.outcome === 'environment' &&
                progress.red_check !== null &&
                !progress.red_check.ok
            ) {
                return {
                    red_check: null,
                    environment_reruns: progress.environment_reruns + 1,
                    environment: {
                        role: 'test-writer',
                        evidence: finished.result.environment?.evidence ?? '',
                        check: 'red_check',
                        failed: progress.red_check,
                    },
                }
            }
            // A new answer is checked afresh if it is `already_done` (#495).
            return progress.red_check === null
                ? { test_writer: finished.result, already_done_check: null }
                : {
                      test_writer: finished.result,
                      already_done_check: null,
                      red_check: null,
                      red_fix_rounds: progress.red_fix_rounds + 1,
                  }
        case 'implementer': {
            const { result } = finished
            const bad_test = badTestOf(result)
            // Its answer after a refactor test update closes the update
            // (#686), keeping the fixed file for the reviewer and the PR; a
            // second bad test is kept for the stuck text.
            if (refactor_update !== null && refactor_update.result !== null) {
                const { file, reason } = refactor_update
                return {
                    implementer: result,
                    refactor_update: null,
                    refactor_fixed: [
                        ...progress.refactor_fixed,
                        { file, reason },
                    ],
                    ...(bad_test === null
                        ? {}
                        : {
                              bad_test,
                              bad_test_source: 'implementer',
                              bad_test_sources: bouncedBy({
                                  progress,
                                  by: 'implementer',
                              }),
                              bad_test_bounces: progress.bad_test_bounces + 1,
                          }),
                }
            }
            // Its answer after the test-writer updated the tests closes the
            // update; a done answer settles the bad test (#489).
            if (test_update !== null && test_update.result !== null) {
                return {
                    implementer: result,
                    test_update: null,
                    ...(bad_test === null
                        ? { bad_test: null, bad_test_source: null }
                        : {
                              bad_test,
                              bad_test_source: 'implementer',
                              bad_test_sources: bouncedBy({
                                  progress,
                                  by: 'implementer',
                              }),
                              bad_test_bounces: progress.bad_test_bounces + 1,
                          }),
                }
            }
            // The implementer's answer to the clash message is no fix round.
            // A bad test is kept, for the test update or the stuck text.
            if (rejoin?.code_pending) {
                return {
                    implementer: result,
                    rejoin: { ...rejoin, code_pending: false },
                    ...(bad_test === null
                        ? {}
                        : {
                              bad_test,
                              bad_test_source: 'implementer',
                              bad_test_sources: bouncedBy({
                                  progress,
                                  by: 'implementer',
                              }),
                              bad_test_bounces: progress.bad_test_bounces + 1,
                          }),
                }
            }
            if (fix !== null && fix.tests_answered && !fix.code_answered) {
                return {
                    review_fix: {
                        ...fix,
                        code_answered: true,
                        ...fixerAnswered({
                            fix,
                            role: 'implementer',
                            responses: result.finding_responses,
                        }),
                        bad_test,
                    },
                }
            }
            if (fix !== null && handoffRole({ fix }) === 'implementer') {
                return {
                    review_fix: {
                        ...fix,
                        ...handoffAnswered({
                            fix,
                            role: 'implementer',
                            responses: result.finding_responses,
                        }),
                        bad_test,
                    },
                }
            }
            // An `environment` answer to failed gates reruns them, using no
            // fix round (#613).
            if (
                result.outcome === 'environment' &&
                progress.gates !== null &&
                !progress.gates.ok
            ) {
                return {
                    gates: null,
                    environment_reruns: progress.environment_reruns + 1,
                    environment: {
                        role: 'implementer',
                        evidence: result.environment?.evidence ?? '',
                        check: 'gates',
                        failed: progress.gates,
                    },
                }
            }
            const bounce: Partial<TicketProgress> =
                bad_test === null
                    ? {}
                    : {
                          bad_test_bounces: progress.bad_test_bounces + 1,
                          bad_test,
                          bad_test_source: 'implementer',
                          bad_test_sources: bouncedBy({
                              progress,
                              by: 'implementer',
                          }),
                      }
            const round: Partial<TicketProgress> =
                progress.gates === null
                    ? {}
                    : {
                          gates: null,
                          gate_fix_rounds: progress.gate_fix_rounds + 1,
                      }
            return { implementer: result, ...round, ...bounce }
        }
        case 'ticket-reviewer':
            return reviewChange({ progress, review: finished.result, seq })
        // Lenses review the run branch, never a ticket.
        default:
            return {}
    }
}

/**
 * A finished ticket review: counts the round, settles the last round's
 * "won't fix" answers, keeps its nits, and opens a fix round when a finding
 * is a blocker or a should-fix. A new fix round starts its gates, gate fix
 * rounds, and fix commit afresh.
 */
const reviewChange = ({
    progress,
    review,
    seq,
}: {
    progress: TicketProgress
    review: TicketReviewResult
    /** The review's record, for the join queue's order once it approves. */
    seq: number
}): Partial<TicketProgress> => {
    const review_rounds = progress.review_rounds + 1
    const blocking = review.findings.filter(isBlocking)
    const newNits = review.findings.filter(
        (finding) =>
            !isBlocking(finding) &&
            !progress.nits.some(({ id }) => id === finding.id)
    )
    const settled: Partial<TicketProgress> = {
        review,
        review_rounds,
        reviewed_sha: progress.commits.fix ?? progress.commits.green,
        nits: [...progress.nits, ...newNits],
        declined: [
            ...progress.declined,
            ...declinedBy({ fix: progress.review_fix, review }),
        ],
    }
    if (blocking.length === 0) {
        return { ...settled, review_fix: null, approved_seq: seq }
    }
    return {
        ...settled,
        approved_seq: null,
        review_fix: {
            round: review_rounds,
            findings: blocking,
            tests_answered: !blocking.some(({ kind }) => kind === 'test'),
            code_answered: !blocking.some(({ kind }) => kind === 'code'),
            responses: [],
            handed_off: {},
            bad_test: null,
        },
        gates: null,
        gate_fix_rounds: 0,
        leftovers: { ...progress.leftovers, fix: null },
        commits: { ...progress.commits, fix: null },
        commit_files: { ...progress.commit_files, fix: [] },
    }
}

/** The test setup change an agent asked for in its result, if any. */
export const setupChangeOf = ({
    finished,
}: {
    finished: FinishedContent
}): TicketProgress['setup_change'] => {
    if (finished.role !== 'test-writer' && finished.role !== 'implementer') {
        return null
    }
    const { outcome, setup_change } = finished.result
    if (outcome !== 'needs_setup_change') return null
    return {
        role: finished.role,
        file: setup_change?.file ?? '',
        reason: setup_change?.reason ?? finished.result.summary,
    }
}

type AlreadyDoneCheckedContent = Extract<
    JournalRecord,
    { kind: 'already_done_checked' }
>['content']

/**
 * The engine's check of a test-writer's `already_done` evidence (#495). A
 * failed one is a failed try for the test-writer, in the session that gave
 * the evidence, as if its turn had failed: the decision step sends it what
 * did not check out, or makes the ticket stuck once its tries run out.
 */
export const alreadyDoneCheckedChange = ({
    progress,
    checked,
}: {
    progress: TicketProgress
    checked: AlreadyDoneCheckedContent
}): Partial<TicketProgress> => {
    const { ok, problems } = checked
    if (ok) return { already_done_check: { ok, problems } }
    const role = 'test-writer'
    return {
        already_done_check: { ok, problems },
        agent_failure: {
            role,
            error: problems.map((problem) => `- ${problem}`).join('\n'),
            failure: 'evidence',
            session_id: progress.sessions[role] ?? null,
        },
        engine_failures: 0,
        ...failedTryChange({ progress, role }),
    }
}
