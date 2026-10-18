/**
 * A ticket's review step: a fresh reviewer after the green commit, and the
 * review's fix rounds, each re-reviewed.
 */

import { stuck, type BuildAction, type StepArgs } from './build-action'
import { launch } from './build-launch'
import { commitStep, gateStep } from './decide-red-green'
import { MAX_FIX_ROUNDS } from './loop-caps'
import { openFindingsText, reviewFixMessage } from './review-text'
import { badTestDetail } from './stuck-text'

/**
 * The ticket review and its fix loop, after the green commit. A fresh
 * reviewer checks the committed diff. Blockers and should-fixes open a fix
 * round: test findings go to a fresh test-writer first, then code findings
 * to the same implementer session (a fresh one if it is gone). The fixes
 * pass the gates, get their own commit, and a fresh reviewer checks only
 * the new changes. A review that still asks for changes after
 * `MAX_FIX_ROUNDS` fix rounds is stuck. `null` once a review approves.
 */
export const reviewStep = ({
    snapshot,
    ticket,
    progress,
    run_notes,
}: StepArgs): BuildAction | null => {
    const number = ticket.number
    const reviewer = () =>
        launch({
            role: 'ticket-reviewer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    if (progress.review === null) return reviewer()
    const fix = progress.review_fix
    if (fix === null) return null
    if (fix.round > MAX_FIX_ROUNDS) {
        return stuck({
            ticket: number,
            reason: 'changes_requested',
            detail: `The ticket review still asks for changes after ${MAX_FIX_ROUNDS} fix rounds:\n${openFindingsText({ findings: fix.findings })}`,
        })
    }
    if (!fix.tests_answered) {
        return launch({
            role: 'test-writer',
            snapshot,
            ticket,
            progress,
            run_notes,
        })
    }
    if (!fix.code_answered) {
        const session_id = progress.sessions.implementer
        if (session_id === undefined) {
            return launch({
                role: 'implementer',
                snapshot,
                ticket,
                progress,
                run_notes,
            })
        }
        return {
            type: 'follow_up_agent',
            ticket: number,
            role: 'implementer',
            session_id,
            message: reviewFixMessage({ fix }),
        }
    }
    if (fix.bad_test !== null) {
        return stuck({
            ticket: number,
            reason: 'bad_test',
            detail: `While fixing review findings, the implementer sent a test back as bad: ${badTestDetail({ bad_test: fix.bad_test })}`,
        })
    }
    return (
        gateStep({ snapshot, ticket, progress, run_notes }) ??
        commitStep({ stage: 'fix', ticket, progress }) ??
        reviewer()
    )
}
