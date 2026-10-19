/**
 * The final review: its rounds, its lenses, the fix rounds, and how it ends
 * (passed, shipped by a person, or stuck).
 */
import type { BoardRecord } from './board-vocabulary'
import { finalReasonText } from './reduce-board-reasons'
import { clip } from './reduce-board-text'
import {
    DETAIL_MAX,
    addNeedsYou,
    resolveNeedsYou,
    updateFinal,
    withTried,
} from './reduce-board-update'

import { LOOP_CAP, type BoardState, type LensCard } from '../shared/board-state'
import { FINAL_KEY, allowedReplies } from '../shared/reply-actions'

const updateLens = ({
    state,
    lens,
    update,
}: {
    state: BoardState
    lens: string
    update: (card: LensCard) => LensCard
}): BoardState =>
    updateFinal({
        state,
        update: (review) => ({
            ...review,
            lenses: review.lenses.map((card) =>
                card.name === lens ? update(card) : card
            ),
        }),
    })

/** The record kinds of the final review. */
export const FINAL_REVIEW_KINDS = [
    'final_review_started',
    'lens_started',
    'lens_finished',
    'final_review_fixing',
    'final_review_stuck',
    'final_review_shipped',
    'final_review_passed',
] as const

type FinalReviewRecord = Extract<
    BoardRecord,
    { kind: (typeof FINAL_REVIEW_KINDS)[number] }
>

/** Applies one record of FINAL_REVIEW_KINDS to the board. */
export const applyFinalReviewKind = ({
    state,
    record,
}: {
    state: BoardState
    record: FinalReviewRecord
}): BoardState => {
    switch (record.kind) {
        case 'final_review_started':
            return {
                ...updateFinal({
                    state,
                    update: (review) => ({
                        ...review,
                        state: 'reviewing',
                        round: review.round + 1,
                        lenses: review.lenses.map((lens) =>
                            lens.state === 'clean'
                                ? lens
                                : { ...lens, state: 'waiting' }
                        ),
                    }),
                }),
                run: { ...state.run, phase: 'final_review' },
            }
        case 'lens_started':
            return updateLens({
                state,
                lens: record.content.lens,
                update: (lens) => ({ ...lens, state: 'reviewing' }),
            })
        case 'lens_finished': {
            const { findings } = record.content
            const counts = {
                blocker: findings.blocker,
                should_fix: findings.should_fix,
                nit: findings.nit,
            }
            return updateLens({
                state,
                lens: record.content.lens,
                update: (lens) => ({
                    ...lens,
                    findings: counts,
                    state:
                        counts.blocker + counts.should_fix > 0
                            ? 'fixing'
                            : 'clean',
                }),
            })
        }
        case 'final_review_fixing':
            return updateFinal({
                state,
                update: (review) => ({
                    ...review,
                    state: 'fixing',
                    fix_round: record.content.round,
                    tried: withTried({
                        tried: review.tried,
                        // Every lens finished clean: only failed slow tests
                        // open a fix round then (#563).
                        line: `Fix round ${record.content.round}/${LOOP_CAP} on ${
                            review.lenses.length > 0 &&
                            review.lenses.every(
                                (lens) => lens.state === 'clean'
                            )
                                ? 'the failed slow tests'
                                : "the lenses' findings"
                        }`,
                    }),
                }),
            })
        case 'final_review_stuck':
            return addNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({ ...review, state: 'stuck' }),
                }),
                item: {
                    key: FINAL_KEY,
                    ticket: null,
                    subject: 'The final review is stuck',
                    reason: finalReasonText({ reason: record.content.reason }),
                    detail: clip({
                        text: record.content.detail,
                        max: DETAIL_MAX,
                    }),
                    tried: state.final_review.tried,
                    replies: allowedReplies({ key: FINAL_KEY, ticket: null }),
                    since: record.time,
                },
            })
        // A `ship` reply to the stuck final review, as the engine journals
        // it: the same as the reply itself.
        case 'final_review_shipped':
            return resolveNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({ ...review, state: 'passed' }),
                }),
                key: FINAL_KEY,
            })
        case 'final_review_passed':
            return resolveNeedsYou({
                state: updateFinal({
                    state,
                    update: (review) => ({
                        ...review,
                        state: 'passed',
                        lenses: review.lenses.map((lens) => ({
                            ...lens,
                            state: 'clean',
                        })),
                    }),
                }),
                key: FINAL_KEY,
            })
    }
}
