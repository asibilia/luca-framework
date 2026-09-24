import { describe, expect, test } from 'bun:test'

import { createInMemoryTracker } from './in-memory-tracker'
import {
    commentMarker,
    hasLucaMarker,
    postCommentOnce,
} from './post-comment-once'

import { specIssue } from '../testing/intake-fixtures'

const tracker = () =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10 })],
        sub_tickets: {},
    })

describe('postCommentOnce', () => {
    test('a first try posts the body with its invisible marker', async () => {
        const board = tracker()

        const { id } = await postCommentOnce({
            tracker: board,
            number: 10,
            body: 'Ticket #11 is stuck.',
            step: { run_id: 'run-1', first_seq: 42, redo: false },
            n: 0,
        })

        expect(board.commentsOn({ number: 10 })).toEqual([
            'Ticket #11 is stuck.\n\n<!-- luca:run-1:42:0 -->',
        ])
        expect(id).toBe(1)
    })

    test('a redo adopts the comment its first try posted instead of posting again', async () => {
        const board = tracker()
        const first = await postCommentOnce({
            tracker: board,
            number: 10,
            body: 'Ticket #11 is stuck.',
            step: { run_id: 'run-1', first_seq: 42, redo: false },
            n: 0,
        })
        board.addComment({ number: 10, author: 'someone', body: 'hi' })

        const again = await postCommentOnce({
            tracker: board,
            number: 10,
            body: 'Ticket #11 is stuck.',
            step: { run_id: 'run-1', first_seq: 42, redo: true },
            n: 0,
        })

        expect(again).toEqual(first)
        expect(board.commentsOn({ number: 10 })).toHaveLength(2)
    })

    test("a redo posts when its first try's comment never got posted", async () => {
        const board = tracker()
        // Another step's comment, and another comment of the same step.
        await postCommentOnce({
            tracker: board,
            number: 10,
            body: 'Other.',
            step: { run_id: 'run-1', first_seq: 7, redo: false },
            n: 0,
        })
        await postCommentOnce({
            tracker: board,
            number: 10,
            body: 'Other.',
            step: { run_id: 'run-1', first_seq: 42, redo: false },
            n: 1,
        })

        await postCommentOnce({
            tracker: board,
            number: 10,
            body: 'Ticket #11 is stuck.',
            step: { run_id: 'run-1', first_seq: 42, redo: true },
            n: 0,
        })

        expect(board.commentsOn({ number: 10 })).toHaveLength(3)
    })
})

describe('hasLucaMarker', () => {
    test("knows the engine's comments of any run, and nobody else's", () => {
        expect(
            hasLucaMarker(
                `Stuck.\n\n${commentMarker({ run_id: 'other-run', first_seq: 3, n: 2 })}`
            )
        ).toBe(true)
        expect(hasLucaMarker('retry #11')).toBe(false)
        expect(hasLucaMarker('<!-- a note -->')).toBe(false)
    })
})
