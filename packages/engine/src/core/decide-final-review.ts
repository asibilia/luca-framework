import { crashDetail, crashedOut } from './decide-crashes'
import { fixStep } from './decide-final-fix'
import { failureCap } from './final-failure-cap'
import {
    stuck,
    type DecideArgs,
    type FinalReviewAction,
    type FinalReviewDecision,
} from './final-review-action'
import { lensPrompt } from './final-review-text'

import { LENS_NAMES, lensRole, type LensName } from '../agents/role-results'
import { isFinalKey } from '../journal/replay'

export {
    isFinalReviewAction,
    type FinalReviewAction,
    type FinalReviewDecision,
} from './final-review-action'

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
 * "won't fix". With a slow test command (#563), round 1 also runs the slow
 * tests once every lens finished, and settles only once they ran; failing
 * ones open the fix round (or join it). A fix round with no finding, opened only
 * by them, is just its gates (which run the slow tests again) with their
 * fix loop, the commit, and the push, with no lens re-review.
 * A review still asking for changes after `MAX_FIX_ROUNDS` fix
 * rounds is stuck, and so is a failed fix loop, a bad test, or a leftover.
 * Once a fix commit was pushed and no blocking finding is left, the fresh
 * pass (#548) has all five lenses read the whole branch again, without
 * earlier findings; its blocking findings get one fix round (past the round
 * cap, too) and one re-review, and what is still open then tops the PR
 * instead of getting the review stuck.
 * Failed tries are capped per role like a ticket's. A stuck final review
 * waits for a reply; `ship` opens the PR anyway. A final review step cut
 * off by a crash `MAX_CRASHES` times in a row is stuck too.
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
    // The same step cut off by crashes too often is not taken again.
    const crash = crashedOut({ crashes: args.crashes, keys: isFinalKey })
    if (crash !== null) {
        return working([
            stuck({ reason: 'crashed', detail: crashDetail({ crash }) }),
        ])
    }
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
    // Round 1's slow tests run once its lenses are in, never beside them:
    // a lens's after-turn guard judges the run branch's worktree, so nothing
    // else may write there while a lens runs. The round waits for them (#563).
    if (review.slow_due && review.slow_tests === null) {
        return working([{ type: 'run_final_slow_tests' }])
    }
    // Clean after a fix commit: every lens reads the whole branch once more,
    // fresh, before the PR opens (#548). Once per final review; with no fix
    // commit, round 1 was already a full fresh read.
    const ending: FinalReviewAction =
        review.fix_pushed && !review.fresh_started
            ? {
                  type: 'start_final_review',
                  round: review.round + 1,
                  from_sha: run_branch.base_sha,
                  lenses: [...LENS_NAMES],
                  fresh: true,
              }
            : { type: 'pass_final_review' }
    if (review.fix === null) return working([ending])
    // The fresh pass's fix was re-checked: what is still open tops the PR,
    // and the final review never gets stuck on it (#548).
    if (review.fresh_started && !review.fresh) {
        return working([{ type: 'pass_final_review' }])
    }
    const step = fixStep(args)
    if (step !== null) return working([step])
    // A fix round opened only by failing slow tests ends at its push: its
    // gates ran the slow tests on what was pushed, and no lens had a finding
    // to look at again (#563), so the fresh pass comes next.
    if (review.fix.findings.length === 0) return working([ending])
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
