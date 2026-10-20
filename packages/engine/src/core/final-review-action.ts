/**
 * The final review's decision step, as types: its actions
 * (`FinalReviewAction`, `isFinalReviewAction`), where it stands
 * (`FinalReviewDecision`), what it reads (`DecideArgs`), and the stuck step
 * (`stuck`).
 */
import type { FinalFixerRole } from './final-review-text'

import type { PromptRunNote } from '../agents/role-prompts'
import type { LensName, LensRole } from '../agents/role-results'
import type { StuckReason } from '../journal/journal-record'
import type {
    FinalReviewState,
    ReplayedGates,
    ReplayedSnapshot,
    ReplayedWorktree,
} from '../journal/replay'
import type { CrashCounts } from '../journal/step-records'

/** The final review's steps, once every ticket pushed and before the PR. */
export type FinalReviewAction =
    /**
     * Start a final review round: read the run branch's HEAD, the files
     * since `from_sha`, and the config's rule files, then journal
     * `final_review_started`. `fresh`: the fresh pass (#548).
     */
    | {
          type: 'start_final_review'
          round: number
          from_sha: string
          lenses: LensName[]
          fresh?: boolean
      }
    /** Start a fresh, read-only lens reviewer on the run branch. */
    | { type: 'launch_lens'; lens: LensName; role: LensRole; prompt: string }
    /** Run the config's slow tests on the run branch (#563), once round 1's lenses are in. */
    | { type: 'run_final_slow_tests' }
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
    'run_final_slow_tests',
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

/** What the final review's decision step reads from the run. */
export type DecideArgs = {
    review: FinalReviewState
    /** Crashes in a row per scheduler key; the final review's are its own. */
    crashes: CrashCounts
    snapshot: ReplayedSnapshot
    run_branch: ReplayedWorktree
    /** The latest gates on the run branch. */
    run_branch_gates: ReplayedGates | null
    /** The run notes a fresh agent gets (`newestRunNotes`). */
    run_notes: PromptRunNote[]
    /** The config's test setup files; none if left out. */
    setup_files?: string[]
}

/** The step that marks the final review stuck, with its reason. */
export const stuck = ({
    reason,
    detail,
}: {
    reason: StuckReason
    detail: string
}): FinalReviewAction => ({ type: 'mark_final_review_stuck', reason, detail })
