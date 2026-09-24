import {
    finalFixerPrompt,
    lensPrompt,
    openFinalFindingsText,
    type FinalFixerRole,
} from './final-review-text'
import { failedChecks, failedTryMessage, gateFixMessage } from './fix-loop-text'
import { MAX_ENGINE_FAILURES, MAX_FIX_ROUNDS } from './loop-caps'

import type { PromptRunNote } from '../agents/role-prompts'
import {
    LENS_NAMES,
    lensRole,
    type AgentRole,
    type LensName,
    type LensRole,
} from '../agents/role-results'
import type { StuckReason } from '../journal/journal-record'
import type {
    FinalReviewState,
    ReplayedAgentFailure,
    ReplayedGates,
    ReplayedSnapshot,
    ReplayedWorktree,
} from '../journal/replay'

/** The final review's steps, once every ticket pushed and before the PR. */
export type FinalReviewAction =
    /**
     * Start a final review round: read the run branch's HEAD, the files
     * since `from_sha`, and the config's rule files, then journal
     * `final_review_started`.
     */
    | {
          type: 'start_final_review'
          round: number
          from_sha: string
          lenses: LensName[]
      }
    /** Start a fresh, read-only lens reviewer on the run branch. */
    | { type: 'launch_lens'; lens: LensName; role: LensRole; prompt: string }
    /** Every lens due this round approved. */
    | { type: 'pass_final_review' }
    /** A fix round on the lenses' findings starts. */
    | { type: 'start_final_fix'; round: number }
    /** Start a fresh fixer on the run branch's worktree. */
    | {
          type: 'launch_final_fixer'
          role: FinalFixerRole
          prompt: string
          may_edit_tests: boolean
      }
    /** Send a follow-up to a fixer's open session (failed gates, a failed try). */
    | {
          type: 'follow_up_final_fixer'
          role: FinalFixerRole
          session_id: string
          message: string
      }
    /** Run the engine config's gates on the run branch's worktree. */
    | { type: 'run_final_gates' }
    /** Scan for leftovers, then commit the fixes on the run branch. */
    | { type: 'commit_final_fix'; round: number; message: string }
    /** Push the run branch with the fixes to `origin`. */
    | { type: 'push_final_fixes'; branch: string }
    /** The engine can't safely pick the final review's next step by itself. */
    | { type: 'mark_final_review_stuck'; reason: StuckReason; detail: string }

const FINAL_REVIEW_ACTION_TYPES: ReadonlySet<string> = new Set<
    FinalReviewAction['type']
>([
    'start_final_review',
    'launch_lens',
    'pass_final_review',
    'start_final_fix',
    'launch_final_fixer',
    'follow_up_final_fixer',
    'run_final_gates',
    'commit_final_fix',
    'push_final_fixes',
    'mark_final_review_stuck',
])

/**
 * Whether an action is one of the final review's.
 *
 * @example
 * isFinalReviewAction({ type: 'run_final_gates' }) // true
 */
export const isFinalReviewAction = <Action extends { type: string }>(
    action: Action
): action is Extract<Action, FinalReviewAction> =>
    FINAL_REVIEW_ACTION_TYPES.has(action.type)

/**
 * Where the final review stands for the build half of the decision step:
 * still working (these actions can run now), passed or shipped (open the
 * PR), or stuck (end the run until a reply).
 */
export type FinalReviewDecision =
    | { status: 'working'; actions: FinalReviewAction[] }
    | { status: 'passed' }
    | { status: 'shipped' }
    | { status: 'stuck'; reason: StuckReason; detail: string }

type DecideArgs = {
    review: FinalReviewState
    snapshot: ReplayedSnapshot
    run_branch: ReplayedWorktree
    /** The latest gates on the run branch. */
    run_branch_gates: ReplayedGates | null
    /** The run notes a fresh agent gets (`newestRunNotes`). */
    run_notes: PromptRunNote[]
}

const stuck = ({
    reason,
    detail,
}: {
    reason: StuckReason
    detail: string
}): FinalReviewAction => ({ type: 'mark_final_review_stuck', reason, detail })

/** A fresh lens, or the step after its failed try. */
const lensStep = ({
    lens,
    review,
    snapshot,
    run_branch_gates,
    run_notes,
}: DecideArgs & { lens: LensName }): FinalReviewAction => {
    const role = lensRole({ lens })
    const failed = review.agent_failures[role]
    const launch: FinalReviewAction = {
        type: 'launch_lens',
        lens,
        role,
        prompt: lensPrompt({
            lens,
            snapshot,
            review,
            gates: run_branch_gates,
            run_notes,
        }),
    }
    if (failed === undefined) return launch
    return failureCap({ review, failed }) ?? launch
}

/**
 * The stuck step when a failed turn used up its role's tries (or engine
 * failures in a row), else `null`: the role gets another go.
 */
const failureCap = ({
    review,
    failed,
}: {
    review: FinalReviewState
    failed: ReplayedAgentFailure
}): FinalReviewAction | null => {
    const { role, error, failure } = failed
    if (failure === 'engine') {
        const count = review.engine_failures[role] ?? 0
        return count >= MAX_ENGINE_FAILURES
            ? stuck({
                  reason: 'agent_failed',
                  detail: `The engine failed to run the ${role} ${count} times in a row: ${error}`,
              })
            : null
    }
    const tries = review.failed_tries[role] ?? 0
    return tries >= MAX_FIX_ROUNDS
        ? stuck({
              reason: 'agent_failed',
              detail: `The ${role} failed ${tries} tries in the final review; the last one: ${error}`,
          })
        : null
}

/** A fresh fixer of this role, told its findings (or the failed gates). */
const launchFixer = ({
    role,
    review,
    snapshot,
    run_notes,
}: DecideArgs & { role: FinalFixerRole }): FinalReviewAction => {
    const { fix } = review
    if (fix === null) throw new Error('No final review fix round is open.')
    // An implementer with no code findings left is here for failed gates.
    const gates =
        role === 'implementer' && fix.code_answered ? review.gates : null
    return {
        type: 'launch_final_fixer',
        role,
        prompt: finalFixerPrompt({ role, snapshot, fix, gates, run_notes }),
        may_edit_tests: role === 'test-writer',
    }
}

const isFixer = (role: AgentRole): role is FinalFixerRole =>
    role === 'test-writer' || role === 'implementer'

/**
 * The next step after a fixer's failed turn: an engine failure starts a
 * fresh fixer, any other a follow-up in its session (fresh with none), until
 * its tries run out.
 */
const failedFixerStep = ({
    failed,
    ...args
}: DecideArgs & { failed: ReplayedAgentFailure }): FinalReviewAction => {
    const cap = failureCap({ review: args.review, failed })
    if (cap !== null) return cap
    const { role, error, failure, session_id } = failed
    if (!isFixer(role)) throw new Error(`${role} is no final review fixer.`)
    if (failure === 'engine' || session_id === null) {
        return launchFixer({ ...args, role })
    }
    return {
        type: 'follow_up_final_fixer',
        role,
        session_id,
        message: failedTryMessage({ failure, error }),
    }
}

/**
 * A final review fix round, once every due lens finished and some finding
 * blocks: start the round, a fresh test-writer for the test findings, then
 * a fresh implementer for the code findings, the gates (and their fix loop
 * in the implementer's session), the fix commit, and the push. `null` once
 * the fixes are pushed.
 */
const fixStep = (args: DecideArgs): FinalReviewAction | null => {
    const { review, run_branch, snapshot } = args
    const { fix } = review
    if (fix === null) return null
    if (fix.round > MAX_FIX_ROUNDS) {
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
    if (!fix.tests_answered)
        return launchFixer({ ...args, role: 'test-writer' })
    if (!fix.code_answered) return launchFixer({ ...args, role: 'implementer' })
    if (fix.bad_test !== null) {
        const { file, name, reason } = fix.bad_test
        const where = [file, name].filter(Boolean).join(' > ')
        return stuck({
            reason: 'bad_test',
            detail: `While fixing the final review's findings, the implementer sent a test back as bad: ${where === '' ? reason : `${where}: ${reason}`}`,
        })
    }
    const { gates } = review
    if (gates === null) return { type: 'run_final_gates' }
    if (!gates.ok) {
        if (review.gate_fix_rounds >= MAX_FIX_ROUNDS) {
            return stuck({
                reason: 'gates_failed',
                detail: `The gates still fail after the final review's fixes, after ${MAX_FIX_ROUNDS} fix rounds:\n${failedChecks({ gates })}`,
            })
        }
        const session_id = review.sessions.implementer
        if (session_id === undefined) {
            return launchFixer({ ...args, role: 'implementer' })
        }
        return {
            type: 'follow_up_final_fixer',
            role: 'implementer',
            session_id,
            message: gateFixMessage({ gates }),
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

/**
 * The final review: the decision step's part between the last ticket's push
 * and the PR. Pure. It always runs, even for a one-ticket spec.
 *
 * Round 1 reviews the whole run branch (from where it started) through all
 * five lenses at once, each a fresh, read-only reviewer. Once every due
 * lens finished, their blocking findings (namespaced `<lens>-<id>`) open a
 * fix round, like the ticket review's: a fresh test-writer for test
 * findings first, then a fresh implementer for code findings (always fresh
 * at the start of a round), the gates with their fix loop, one fix commit on
 * the run branch, and a push. Then only the lenses that had blocking
 * findings re-review only the new changes (from the last round's HEAD),
 * with their earlier findings and the fixers' answers, and rule on each
 * "won't fix". A review still asking for changes after `MAX_FIX_ROUNDS` fix
 * rounds is stuck, and so is a failed fix loop, a bad test, or a leftover.
 * Failed tries are capped per role like a ticket's. A stuck final review
 * waits for a reply; `ship` opens the PR anyway.
 *
 * @example
 * decideFinalReview({ review: state.final_review, snapshot, run_branch, run_branch_gates })
 * // { status: 'working', actions: [{ type: 'start_final_review', round: 1, ... }] }
 */
export const decideFinalReview = (args: DecideArgs): FinalReviewDecision => {
    const { review, run_branch } = args
    if (review.stuck !== null) {
        return review.shipped
            ? { status: 'shipped' }
            : { status: 'stuck', ...review.stuck }
    }
    if (review.passed) return { status: 'passed' }
    const working = (actions: FinalReviewAction[]): FinalReviewDecision => ({
        status: 'working',
        actions,
    })
    if (review.round === 0) {
        return working([
            {
                type: 'start_final_review',
                round: 1,
                from_sha: run_branch.base_sha,
                lenses: [...LENS_NAMES],
            },
        ])
    }
    const pending = review.lenses_due.filter(
        (lens) => review.results[lens] === undefined
    )
    if (pending.length > 0) {
        const steps = pending.map((lens) => lensStep({ ...args, lens }))
        const stop = steps.find(
            (step) => step.type === 'mark_final_review_stuck'
        )
        return working(stop === undefined ? steps : [stop])
    }
    if (review.fix === null) return working([{ type: 'pass_final_review' }])
    const step = fixStep(args)
    if (step !== null) return working([step])
    // The fixes are pushed: the lenses with blocking findings look again.
    return working([
        {
            type: 'start_final_review',
            round: review.round + 1,
            from_sha: review.head_sha ?? run_branch.base_sha,
            lenses: LENS_NAMES.filter((lens) =>
                review.fix?.findings.some((finding) => finding.lens === lens)
            ),
        },
    ])
}
