/**
 * The final review's fix round (`fixStep`): the fixers, the gates and their
 * fix loop, the fix commit, and the push, after the lenses found blocking
 * findings. Pure.
 */
import { environmentFailedDetail } from './environment-rerun'
import { failureCap } from './final-failure-cap'
import {
    stuck,
    type DecideArgs,
    type FinalReviewAction,
} from './final-review-action'
import {
    finalFixerPrompt,
    openFinalFindingsText,
    type FinalFixerRole,
} from './final-review-text'
import {
    CRASH_SECTION,
    failedChecks,
    failedTryMessage,
    followUpSection,
    gateFixMessage,
} from './fix-loop-text'
import { MAX_FIX_ROUNDS } from './loop-caps'
import { badTestDetail, setupChangeDetail } from './stuck-text'

import type { AgentRole } from '../agents/role-results'
import { handoffRole, type ReplayedAgentFailure } from '../journal/replay'

/**
 * A fresh fixer of this role, told its findings (or the failed gates). The
 * implementer that starts a round whose slow tests failed is told of them
 * too (#563). With `follow_up`, it stands in for a follow-up whose session
 * is gone, and its prompt carries the message. A fixer taking a turn a
 * crash cut off is told of the crash.
 */
const launchFixer = ({
    role,
    review,
    snapshot,
    run_notes,
    follow_up,
}: DecideArgs & {
    role: FinalFixerRole
    follow_up?: string
}): FinalReviewAction => {
    const { fix } = review
    if (fix === null) throw new Error('No final review fix round is open.')
    // An implementer with no code findings left is here for failed gates.
    const gates =
        role === 'implementer' && fix.code_answered ? review.gates : null
    // The implementer with code findings also fixes the round's slow tests.
    const slow_tests =
        role === 'implementer' && !fix.code_answered && review.slow_due
            ? review.slow_tests
            : null
    const sections = [
        ...(follow_up === undefined
            ? []
            : [followUpSection({ message: follow_up })]),
        ...(review.crashed_turn === role ? [CRASH_SECTION] : []),
    ]
    return {
        type: 'launch_final_fixer',
        role,
        prompt: finalFixerPrompt({
            role,
            snapshot,
            fix,
            gates,
            slow_tests,
            run_notes,
            sections,
        }),
        may_edit_tests: role === 'test-writer',
    }
}

const isFixer = (role: AgentRole): role is FinalFixerRole =>
    role === 'test-writer' || role === 'implementer'

/**
 * The next step after a fixer's failed turn: an engine failure starts a
 * fresh fixer, any other a follow-up in its session (a fresh fixer with the
 * same message with none), until its tries run out.
 */
const failedFixerStep = ({
    failed,
    ...args
}: DecideArgs & { failed: ReplayedAgentFailure }): FinalReviewAction => {
    const cap = failureCap({ review: args.review, failed })
    if (cap !== null) return cap
    const { role, error, failure, session_id } = failed
    if (!isFixer(role)) throw new Error(`${role} is no final review fixer.`)
    if (failure === 'engine') return launchFixer({ ...args, role })
    const message = failedTryMessage({ failure, error })
    if (session_id === null) {
        return launchFixer({ ...args, role, follow_up: message })
    }
    return {
        type: 'follow_up_final_fixer',
        role,
        session_id,
        message,
    }
}

/**
 * A final review fix round, once every due lens finished and some finding
 * blocks: start the round, a fresh test-writer for the test findings, then
 * a fresh implementer for the code findings, then a fresh agent of the
 * other writer role for findings a fixer answered `other_role` (#616), the
 * gates (and their fix loop in the implementer's session, or a rerun when
 * it answers `environment`, #613), the fix commit, and the push. `null` once
 * the fixes are pushed.
 */
export const fixStep = (args: DecideArgs): FinalReviewAction | null => {
    const { review, run_branch, snapshot } = args
    const { fix } = review
    if (fix === null) return null
    // The fresh pass's one fix round runs past the cap (#548).
    if (fix.round > MAX_FIX_ROUNDS && !review.fresh) {
        return stuck({
            reason: 'changes_requested',
            detail: `The final review still asks for changes after ${MAX_FIX_ROUNDS} fix rounds:\n${openFinalFindingsText({ findings: fix.findings })}`,
        })
    }
    if (!review.fixing_started) {
        return { type: 'start_final_fix', round: fix.round }
    }
    const failed = [
        review.agent_failures['test-writer'],
        review.agent_failures.implementer,
    ].find((entry) => entry !== undefined)
    if (failed !== undefined) return failedFixerStep({ ...args, failed })
    if (review.setup_change !== null) {
        return stuck({
            reason: 'setup_change_needed',
            detail: setupChangeDetail({
                ...review.setup_change,
                setup_files: args.setup_files ?? [],
            }),
        })
    }
    if (!fix.tests_answered)
        return launchFixer({ ...args, role: 'test-writer' })
    if (!fix.code_answered) return launchFixer({ ...args, role: 'implementer' })
    if (fix.bad_test !== null) {
        return stuck({
            reason: 'bad_test',
            detail: `While fixing the final review's findings, the implementer sent a test back as bad: ${badTestDetail({ bad_test: fix.bad_test })}`,
        })
    }
    const handoff = handoffRole({ fix })
    if (handoff !== null) return launchFixer({ ...args, role: handoff })
    const { gates } = review
    const blamed = environmentFailedDetail({
        environment: review.environment,
        reruns: review.environment_reruns,
        latest: gates,
    })
    if (blamed !== null) {
        return stuck({ reason: 'environment_failed', detail: blamed })
    }
    if (gates === null) return { type: 'run_final_gates' }
    if (!gates.ok) {
        if (review.gate_fix_rounds >= MAX_FIX_ROUNDS) {
            return stuck({
                reason: 'gates_failed',
                detail: `The gates still fail after the final review's fixes, after ${MAX_FIX_ROUNDS} fix rounds:\n${failedChecks({ gates })}`,
            })
        }
        const session_id = review.sessions.implementer
        const message = gateFixMessage({ gates })
        if (session_id === undefined) {
            return launchFixer({
                ...args,
                role: 'implementer',
                follow_up: message,
            })
        }
        return {
            type: 'follow_up_final_fixer',
            role: 'implementer',
            session_id,
            message,
        }
    }
    if (review.commit === null) {
        const hits = review.leftovers
        if (hits !== null && hits.length > 0) {
            return stuck({
                reason: 'leftovers_found',
                detail: hits
                    .map(({ path, reason }) => `${path}: ${reason}`)
                    .join('\n'),
            })
        }
        return {
            type: 'commit_final_fix',
            round: fix.round,
            message: `fix: final review round ${fix.round} for spec #${snapshot.spec.number}`,
        }
    }
    if (review.pushed === null) {
        return { type: 'push_final_fixes', branch: run_branch.branch }
    }
    return null
}
