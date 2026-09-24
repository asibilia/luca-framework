import max from 'lodash/max'

import {
    finalStuckComment,
    replyAnswer,
    skipComment,
    stuckComment,
} from './stuck-text'

import type { TicketSnapshot } from '../intake/intake-schemas'
import type { ReplyProblem, ReplyWord } from '../journal/journal-record'
import type {
    ReplayedWorktree,
    RunState,
    TicketProgress,
} from '../journal/replay'

/** The steps of stuck work: telling the owner, reading replies, acting on them. */
export type StuckAction =
    /** A stuck ticket's join is still on the run branch: undo it (never pushed). */
    | { type: 'undo_join'; ticket: number; first_sha: string }
    /** Tell the spec issue that a ticket is stuck. */
    | {
          type: 'report_stuck'
          ticket: number
          spec_number: number
          body: string
      }
    /**
     * Wait a while, then read the spec issue's comments with an id above
     * `since_id`. The run waits this way, with no time limit, while stuck
     * work waits for a reply; other tickets keep building meanwhile.
     */
    | { type: 'wait_for_reply'; spec_number: number; since_id: number }
    /** The owner's comment is a reply: journal it. */
    | {
          type: 'take_reply'
          comment_id: number
          word: ReplyWord
          ticket: number | null
      }
    /** The owner's comment looks like a reply but can't be used: say why. */
    | {
          type: 'ignore_reply'
          comment_id: number
          spec_number: number
          reason: ReplyProblem
          answer: string
      }
    /**
     * `retry`: re-read the ticket, then start it over if its text or labels
     * changed, or resume it with a fresh agent and fresh counts.
     */
    | { type: 'retry_ticket'; ticket: number; spec_number: number }
    /** Tell the spec issue that the final review is stuck. */
    | { type: 'report_final_review_stuck'; spec_number: number; body: string }
    /** `ship`: open the PR anyway, with the open findings at the top. */
    | { type: 'ship_final_review' }
    /** `retry`: start the stuck final review's fix round over, fresh. */
    | { type: 'retry_final_review' }
    /**
     * Leave a ticket out of the run, with `body` as a comment on it: the
     * stuck ticket the owner skipped (`because` is `null`), or one that waits
     * on a skipped ticket.
     */
    | {
          type: 'skip_ticket'
          ticket: number
          because: number | null
          body: string
      }

/** A reply word, and the ticket it names if any, from a comment's text. */
type ParsedReply = { word: ReplyWord | 'ship'; ticket: number | null }

const REPLY_PATTERN = /^(retry|skip|stop|ship)(?:\s+#?(\d+))?[\s.!]*$/i

/**
 * Reads a one-word reply: `retry`, `skip`, `stop`, or `ship`, optionally
 * naming a ticket (`retry #12`, `skip 12`). Anything else is not a reply.
 *
 * @example
 * parseReply({ body: 'Retry #12' }) // { word: 'retry', ticket: 12 }
 * parseReply({ body: 'Looking at it.' }) // null
 */
export const parseReply = ({ body }: { body: string }): ParsedReply | null => {
    const match = REPLY_PATTERN.exec(body.trim())
    if (match === null) return null
    const word = match[1]?.toLowerCase() as ParsedReply['word']
    return { word, ticket: match[2] === undefined ? null : Number(match[2]) }
}

/** Whether a ticket is stuck, told, and waiting for the owner's reply. */
const awaitingReply = (progress: TicketProgress): boolean =>
    progress.stuck !== null &&
    progress.stuck_report !== null &&
    progress.reply === null &&
    progress.skipped === null

/**
 * The next steps of one stuck ticket: undo a join its stuck left on the run
 * branch (so no other ticket builds on it), tell the spec issue, then act
 * on the owner's reply. Nothing while it waits for one.
 */
export const stuckTicketSteps = ({
    spec_number,
    ticket,
    progress,
}: {
    spec_number: number
    ticket: TicketSnapshot
    progress: TicketProgress
}): StuckAction[] => {
    const { stuck, joined } = progress
    if (stuck === null) return []
    const number = ticket.number
    if (joined?.ok === true && progress.pushed === null) {
        const first_sha = joined.shas[0]
        if (first_sha !== undefined) {
            return [{ type: 'undo_join', ticket: number, first_sha }]
        }
    }
    if (progress.stuck_report === null) {
        return [
            {
                type: 'report_stuck',
                ticket: number,
                spec_number,
                body: stuckComment({
                    ticket: number,
                    title: ticket.title,
                    progress,
                    stuck,
                    worktree: progress.worktree,
                }),
            },
        ]
    }
    switch (progress.reply?.word) {
        case 'retry':
            return [{ type: 'retry_ticket', ticket: number, spec_number }]
        case 'skip':
            return [
                {
                    type: 'skip_ticket',
                    ticket: number,
                    because: null,
                    body: skipComment({ spec_number, because: null, stuck }),
                },
            ]
        default:
            return []
    }
}

/** Whether the final review is stuck, told, and waiting for a reply. */
const finalAwaitingReply = (state: RunState): boolean =>
    state.final_review.stuck !== null &&
    !state.final_review.shipped &&
    state.final_stuck_report !== null &&
    state.final_reply === null

/**
 * The next steps of a stuck final review: tell the spec issue, then act on
 * the owner's `retry` or `ship` (`stop` is the whole run's). Nothing while
 * it waits for one.
 */
export const finalStuckSteps = ({
    state,
    spec_number,
    run_branch,
}: {
    state: RunState
    spec_number: number
    run_branch: ReplayedWorktree
}): StuckAction[] => {
    if (state.final_stuck_report === null) {
        return [
            {
                type: 'report_final_review_stuck',
                spec_number,
                body: finalStuckComment({
                    review: state.final_review,
                    run_branch,
                }),
            },
        ]
    }
    switch (state.final_reply?.word) {
        case 'ship':
            return [{ type: 'ship_final_review' }]
        case 'retry':
            return [{ type: 'retry_final_review' }]
        default:
            return []
    }
}

/** Skip a ticket that waits on a skipped ticket. */
export const skipDependent = ({
    ticket,
    because,
    spec_number,
}: {
    ticket: number
    because: number
    spec_number: number
}): StuckAction => ({
    type: 'skip_ticket',
    ticket,
    because,
    body: skipComment({ spec_number, because, stuck: null }),
})

/**
 * The replies half of the decision step. Pure. The first comment from the
 * spec's owner that reads as a reply and hasn't been handled is taken, or
 * sent back with a reason (it names no ticket while several are stuck,
 * names one that isn't stuck, is `ship` while the final review isn't
 * stuck, or is `skip` for the final review). With the final review stuck,
 * a bare `retry` or `ship` is its reply. Comments from anyone else,
 * and the owner's other comments, are never replies. With nothing to
 * handle and a ticket waiting for a reply, the run waits for one.
 *
 * @example
 * replySteps({ state, spec_number: 10 })
 * // [{ type: 'take_reply', comment_id: 120, word: 'retry', ticket: 11 }]
 */
export const replySteps = ({
    state,
    spec_number,
    numbers,
}: {
    state: RunState
    spec_number: number
    /** The run's tickets. */
    numbers: number[]
}): StuckAction[] => {
    const owner = (state.snapshot?.spec.author ?? '').toLowerCase()
    const waiting = numbers.filter((number) => {
        const progress = state.tickets[number]
        return progress !== undefined && awaitingReply(progress)
    })
    const pending = state.comments.flatMap(({ comment_id, author, body }) => {
        if (owner === '' || author.toLowerCase() !== owner) return []
        if (state.handled_comments.includes(comment_id)) return []
        if (state.engine_comments.includes(comment_id)) return []
        const reply = parseReply({ body })
        return reply === null ? [] : [{ comment_id, ...reply }]
    })
    const next = pending[0]
    if (next !== undefined) {
        const ignore = (reason: ReplyProblem): StuckAction[] => [
            {
                type: 'ignore_reply',
                comment_id: next.comment_id,
                spec_number,
                reason,
                answer: replyAnswer({
                    problem: reason,
                    named: next.ticket,
                    stuck: waiting,
                }),
            },
        ]
        const final = finalAwaitingReply(state)
        if (next.word === 'ship') {
            return final
                ? [
                      {
                          type: 'take_reply',
                          comment_id: next.comment_id,
                          word: 'ship',
                          ticket: null,
                      },
                  ]
                : ignore('ship_needs_final_review')
        }
        if (next.word === 'stop') {
            return [
                {
                    type: 'take_reply',
                    comment_id: next.comment_id,
                    word: 'stop',
                    ticket: null,
                },
            ]
        }
        if (next.ticket !== null && !waiting.includes(next.ticket)) {
            return ignore('not_stuck')
        }
        if (next.ticket === null && waiting.length === 0) {
            if (!final) return ignore('nothing_stuck')
            if (next.word === 'skip') return ignore('skip_not_for_final_review')
            return [
                {
                    type: 'take_reply',
                    comment_id: next.comment_id,
                    word: 'retry',
                    ticket: null,
                },
            ]
        }
        if (next.ticket === null && waiting.length > 1) {
            return ignore('no_ticket_named')
        }
        return [
            {
                type: 'take_reply',
                comment_id: next.comment_id,
                word: next.word,
                ticket: next.ticket ?? waiting[0] ?? null,
            },
        ]
    }
    if (waiting.length === 0 && !finalAwaitingReply(state)) return []
    const since_id =
        max([
            ...state.comments.map(({ comment_id }) => comment_id),
            ...state.engine_comments,
        ]) ?? 0
    return [{ type: 'wait_for_reply', spec_number, since_id }]
}
