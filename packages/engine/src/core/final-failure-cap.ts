/**
 * The cap on a final review role's failed tries (`failureCap`): the stuck step
 * once a failed turn used up the role's tries in a row, or its engine
 * failures in a row. A finished turn of the role gives its tries back.
 */
import { stuck, type FinalReviewAction } from './final-review-action'
import { MAX_ENGINE_FAILURES, MAX_FIX_ROUNDS } from './loop-caps'

import type { FinalReviewState, ReplayedAgentFailure } from '../journal/replay'

/**
 * The stuck step when a failed turn used up its role's tries in a row (or
 * engine failures in a row), else `null`: the role gets another go.
 *
 * @example
 * failureCap({ review, failed }) // null while the role has tries left
 */
export const failureCap = ({
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
              detail: `The ${role} failed ${tries} tries in a row in the final review; the last one: ${error}`,
          })
        : null
}
