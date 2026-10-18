/**
 * The texts for stuck work and the replies to it: a skipped ticket's comment
 * and answers to replies that can't be used. The stuck comments live in the
 * modules it re-exports.
 */
import { reasonLine } from './ticket-stuck-text'

import type { ReplyProblem } from '../journal/journal-record'
import type { ReplayedStuck } from '../journal/replay'

export { finalStuckComment } from './final-stuck-text'
export {
    pullRequestStuckComment,
    runBudgetDetail,
    runStuckComment,
} from './run-stuck-text'
export {
    badTestDetail,
    badTestTwiceText,
    setupChangeDetail,
} from './stuck-detail-text'
export {
    reasonLine,
    retrySection,
    stuckComment,
    triedText,
} from './ticket-stuck-text'

/** The comment a skipped ticket gets on its own issue. */
export const skipComment = ({
    spec_number,
    because,
    stuck,
}: {
    spec_number: number
    because: number | null
    stuck: ReplayedStuck | null
}): string =>
    because === null
        ? `Luca left this ticket out of the run for spec #${spec_number}: it got stuck (${stuck === null ? 'no reason recorded' : reasonLine({ reason: stuck.reason })}) and the spec's owner replied \`skip\`. It stays open for a later run.`
        : `Luca left this ticket out of the run for spec #${spec_number}: it waits on #${because}, which was skipped. It stays open for a later run.`

/** What the engine answers a reply it can't use. */
export const replyAnswer = ({
    problem,
    named,
    stuck,
}: {
    problem: ReplyProblem
    /** The ticket the reply named, if any. */
    named: number | null
    /** The tickets waiting for a reply now. */
    stuck: number[]
}): string => {
    const list = stuck.map((number) => `#${number}`).join(', ')
    switch (problem) {
        case 'no_ticket_named':
            return `More than one ticket is stuck (${list}), so name the one you mean, such as \`retry #${stuck[0]}\` or \`skip #${stuck[0]}\`.`
        case 'not_stuck':
            return `#${named} is not stuck, so there is nothing to retry or skip. Stuck now: ${list || 'nothing'}.`
        case 'nothing_stuck':
            return 'Nothing is stuck right now, so there is nothing to retry or skip.'
        case 'ship_needs_final_review':
            return '`ship` is only for a stuck final review. For a stuck ticket, reply `retry #n`, `skip #n`, or `stop`.'
        case 'skip_not_for_final_review':
            return "The final review can't be skipped. Reply `retry`, `stop`, or `ship` (opens the PR with the open findings listed at the top)."
    }
}
